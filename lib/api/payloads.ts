/**
 * Narrowing for the two shapes participants POST: `Event[]` (§10) and
 * `ScheduleSnapshot` (§10 snapshots).
 *
 * Malformed members are dropped, not rejected. Telemetry is fire-and-forget
 * (§6.1) and a batch that 400s is retried forever with the same bad member
 * inside it, taking the good events with it every time. The debrief would
 * rather have nine of ten events than none.
 */

import type { DayType, Event, EventType, ScheduleSnapshot, StageId } from '@/lib/domain/types';
import { DAY_TYPES, STAGE_ORDER } from '@/lib/domain/types';

const EVENT_TYPES: readonly EventType[] = [
  'screen.view',
  'field.answer',
  'field.revise',
  'stage.enter',
  'finish',
  'forced.advance',
  'sheet.open',
  'sheet.close',
  'hours.change',
  'mode.direct',
  'clamp.hit',
  'estimator.fallback',
  'fits',
  'complete',
] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}

function isStageId(value: unknown): value is StageId {
  return typeof value === 'string' && (STAGE_ORDER as readonly string[]).includes(value);
}

export function parseEvent(value: unknown): Event | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (!isFiniteNumber(candidate.t)) return null;
  if (typeof candidate.type !== 'string') return null;
  if (!(EVENT_TYPES as readonly string[]).includes(candidate.type)) return null;
  return {
    t: candidate.t,
    type: candidate.type as EventType,
    activityId: optionalString(candidate.activityId),
    fieldId: optionalString(candidate.fieldId),
    stage: isStageId(candidate.stage) ? candidate.stage : undefined,
    screenId: optionalString(candidate.screenId),
    from: optionalNumber(candidate.from),
    to: optionalNumber(candidate.to),
  };
}

/** Non-arrays yield an empty batch, so a junk body is an accepted no-op. */
export function parseEvents(value: unknown): Event[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseEvent).filter((event): event is Event => event !== null);
}

/**
 * The furthest `stage.enter` in a batch. `null` when the batch carries none,
 * which is the common case — most batches are field answers (§6.2.2).
 */
export function maxStageEnter(events: readonly Event[]): StageId | null {
  let furthest: StageId | null = null;
  for (const event of events) {
    if (event.type !== 'stage.enter' || event.stage === undefined) continue;
    const rank = STAGE_ORDER.indexOf(event.stage);
    if (furthest === null || rank > STAGE_ORDER.indexOf(furthest)) furthest = event.stage;
  }
  return furthest;
}

function isDayRecord(value: unknown): value is Record<DayType, number> {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return DAY_TYPES.every((day) => isFiniteNumber(record[day]));
}

/**
 * A snapshot is stored as JSON and read back by the debrief, so it is checked
 * for the fields the debrief derives from — per-activity hours, and
 * `remaining.wd`, which is *slack at finish* (§10) and must be recoverable
 * without replaying events.
 */
export function parseSnapshot(value: unknown): ScheduleSnapshot | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== 'finish' && candidate.kind !== 'complete') return null;
  if (!isFiniteNumber(candidate.t)) return null;
  if (typeof candidate.packVersion !== 'string') return null;
  if (!Array.isArray(candidate.activities)) return null;
  if (!isDayRecord(candidate.total)) return null;
  if (!isDayRecord(candidate.remaining)) return null;
  if (typeof candidate.fits !== 'boolean') return null;
  return candidate as unknown as ScheduleSnapshot;
}
