/**
 * §5 persistence — localStorage, keyed by session id.
 *
 * Two keys, deliberately. The record itself is keyed by session id as §5
 * requires; a pointer key names the current session, because on boot the
 * client does not yet know its own id. Without the pointer the record would be
 * unreachable and every refresh would mint a second session row, which is the
 * one thing §5 and AC 36 forbid: `total` on the console counts session rows
 * (§6.2.2), so a duplicate breaks `inStage` summing to it.
 */

import type {
  AnswerMap,
  DayType,
  DayValue,
  ScheduleSnapshot,
  SnapshotKind,
  StageId,
} from '@/lib/domain/types';
import { DAY_TYPES, STAGE_ORDER } from '@/lib/domain/types';
import type { ScheduleState } from '@/lib/domain/derive';
import { isAnswerMap, pruneToFields } from './answers';

export const CURRENT_KEY = 'hpw:current';

export function stateKey(sessionId: string): string {
  return `hpw:state:${sessionId}`;
}

/**
 * Everything a refresh must not cost the participant: the answers, the session
 * identity that stops a second `POST /session`, the selected day type (§7.1),
 * and the furthest stage reached (§11).
 */
export interface PersistedState {
  sessionId: string;
  token: string;
  packVersion: string;
  dayType: DayType;
  stage: StageId;
  /**
   * §13's multitasking statement is shown once, on its own page before the
   * first screen. Persisting the dismissal is what makes "once" survive a
   * refresh on screen one — §5 wants a refresh to be invisible, and re-reading
   * an instruction already read is a visible one.
   */
  introSeen: boolean;
  answers: AnswerMap;
  /**
   * What the participant set directly, per §4.3 rule 4 — the one part of the
   * schedule that is state rather than derivation.
   *
   * §5's own list does not name it because §5 predates the sheet, but its
   * reason covers it: a refresh must not cost the participant work they did.
   * Hours for a `derived` activity stay absent from storage exactly as §3.2
   * requires — they are recomputed from `answers` on every pass, and only a
   * value the participant typed is written here.
   */
  authored: ScheduleState;
  /**
   * The §10 snapshots this session has taken, by kind (step 10.6).
   *
   * S5 is the difference between the two, so a refresh at S5 that found them
   * missing would leave a participant on a screen with nothing on it — and
   * they are not re-derivable: the finish snapshot is a week that no longer
   * exists by the time the complete one is taken. Held here rather than
   * re-fetched because the server has no endpoint that reads a snapshot back
   * (§6.1), and because the screen is a record of the participant's own
   * decisions and has no business waiting on a network to show them.
   */
  snapshots: Partial<Record<SnapshotKind, ScheduleSnapshot>>;
}

/** The subset of the Storage API used here, so tests need no DOM. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function memoryStorage(seed: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

/** Returns null in a non-browser context rather than throwing (SSR, tests). */
export function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Storage can throw on access under private-mode and blocked-cookie settings.
    return null;
  }
}

function isDayValue(value: unknown): value is DayValue {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<DayValue>;
  if (typeof candidate.hours !== 'number' || !Number.isFinite(candidate.hours)) return false;
  return (
    candidate.mode === 'derived' || candidate.mode === 'direct' || candidate.mode === 'fallback'
  );
}

/**
 * Rejects a stored `authored` map that is not shaped like one, so a corrupt or
 * hand-edited record costs the participant their direct entries rather than
 * putting a `NaN` into every total in the system.
 */
function isScheduleState(value: unknown): value is ScheduleState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const activity = entry as Record<string, unknown>;
    return DAY_TYPES.every((dayType) => isDayValue(activity[dayType]));
  });
}

function isSnapshotMap(value: unknown): value is Partial<Record<SnapshotKind, ScheduleSnapshot>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      Array.isArray((entry as ScheduleSnapshot).activities),
  );
}

function isStageId(value: unknown): value is StageId {
  return typeof value === 'string' && (STAGE_ORDER as readonly string[]).includes(value);
}

function parse(raw: string | null): PersistedState | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const candidate = parsed as Partial<PersistedState>;
  if (typeof candidate.sessionId !== 'string' || candidate.sessionId === '') return null;
  if (typeof candidate.token !== 'string' || candidate.token === '') return null;
  if (typeof candidate.packVersion !== 'string') return null;
  if (candidate.dayType !== 'wd' && candidate.dayType !== 'we') return null;
  if (!isStageId(candidate.stage)) return null;
  if (!isAnswerMap(candidate.answers)) return null;
  return {
    sessionId: candidate.sessionId,
    token: candidate.token,
    packVersion: candidate.packVersion,
    dayType: candidate.dayType,
    stage: candidate.stage,
    // Absent in a record written before the intro page existed. Treating that
    // as unseen costs a returning participant one tap; treating a corrupt
    // record as seen would skip the statement silently.
    introSeen: candidate.introSeen === true,
    answers: candidate.answers,
    // Absent in a record written before direct entry existed, and dropped
    // wholesale when it does not parse: an activity that loses its override
    // derives again, which is a defined state rather than a broken one.
    authored: isScheduleState(candidate.authored) ? candidate.authored : {},
    // Absent in a record written before S5 had a screen, and unvalidated
    // beyond its shape: `Summary` reads hours off it and renders no row for an
    // activity it cannot find on both sides, so a partial record costs rows
    // rather than the screen.
    snapshots: isSnapshotMap(candidate.snapshots) ? candidate.snapshots : {},
  };
}

/** Written on every field change (§5), so this is the hot path. */
export function save(storage: StorageLike, state: PersistedState): void {
  try {
    storage.setItem(stateKey(state.sessionId), JSON.stringify(state));
    storage.setItem(CURRENT_KEY, state.sessionId);
  } catch {
    // A full or blocked quota costs the participant a refresh, not the session.
  }
}

export function clear(storage: StorageLike, sessionId: string): void {
  storage.removeItem(stateKey(sessionId));
  storage.removeItem(CURRENT_KEY);
}

/** The stored record for the current session, or null if there is none. */
export function load(storage: StorageLike): PersistedState | null {
  const sessionId = storage.getItem(CURRENT_KEY);
  if (sessionId === null || sessionId === '') return null;
  return parse(storage.getItem(stateKey(sessionId)));
}

export interface RestoreResult {
  state: PersistedState;
  /** True when the stored pack version differs and answers were pruned (§5). */
  packChanged: boolean;
  /** Field ids dropped by the prune. Empty unless `packChanged`. */
  dropped: string[];
}

/**
 * §5's restore. On a pack-version mismatch the session identity survives — it
 * is room membership, not content, and re-minting it is exactly the duplicate
 * row AC 36 forbids — while answers are pruned to surviving field ids and the
 * participant resumes at S1's first unanswered screen.
 */
export function restore(
  storage: StorageLike,
  pack: { version: string; fieldIds: Iterable<string> },
): RestoreResult | null {
  const stored = load(storage);
  if (stored === null) return null;

  if (stored.packVersion === pack.version) {
    return { state: stored, packChanged: false, dropped: [] };
  }

  const answers = pruneToFields(stored.answers, pack.fieldIds);
  const dropped = Object.keys(stored.answers).filter((id) => !(id in answers));
  const state: PersistedState = {
    ...stored,
    packVersion: pack.version,
    stage: 's1',
    answers,
    // Cleared for the same reason answers are pruned: an override is keyed by
    // an activity id this pack may no longer define, and a direct value set
    // against different questions is not an answer to these ones.
    authored: {},
    // And with them the snapshots, which are keyed by the same activity ids
    // and were taken against a week the new pack no longer describes.
    snapshots: {},
  };
  save(storage, state);
  return { state, packChanged: true, dropped };
}

/** Furthest stage reached, never decreasing (§11 "resume at furthest stage"). */
export function furthestStage(a: StageId, b: StageId): StageId {
  return STAGE_ORDER.indexOf(a) >= STAGE_ORDER.indexOf(b) ? a : b;
}
