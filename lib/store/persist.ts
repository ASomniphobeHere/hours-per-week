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

import type { AnswerMap, DayType, StageId } from '@/lib/domain/types';
import { STAGE_ORDER } from '@/lib/domain/types';
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
  answers: AnswerMap;
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
    answers: candidate.answers,
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
  };
  save(storage, state);
  return { state, packChanged: true, dropped };
}

/** Furthest stage reached, never decreasing (§11 "resume at furthest stage"). */
export function furthestStage(a: StageId, b: StageId): StageId {
  return STAGE_ORDER.indexOf(a) >= STAGE_ORDER.indexOf(b) ? a : b;
}
