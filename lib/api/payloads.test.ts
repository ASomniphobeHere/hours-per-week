/**
 * Narrowing for what participants POST. Every case here is a client sending
 * something the server did not expect, which over forty phones on venue wifi is
 * a matter of when.
 */

import { describe, expect, it } from 'vitest';
import { maxStageEnter, parseEvent, parseEvents, parseSnapshot } from './payloads';
import type { Event, ScheduleSnapshot } from '@/lib/domain/types';

describe('parseEvent', () => {
  it('keeps a well-formed event with its optional fields', () => {
    expect(
      parseEvent({ t: 5, type: 'hours.change', activityId: 'leisure', from: 3, to: 1.5 }),
    ).toEqual({
      t: 5,
      type: 'hours.change',
      activityId: 'leisure',
      fieldId: undefined,
      stage: undefined,
      from: 3,
      to: 1.5,
    });
  });

  it('rejects an unknown type, a missing timestamp, and a non-object', () => {
    expect(parseEvent({ t: 1, type: 'not.a.type' })).toBeNull();
    expect(parseEvent({ type: 'fits' })).toBeNull();
    expect(parseEvent({ t: Number.NaN, type: 'fits' })).toBeNull();
    expect(parseEvent(null)).toBeNull();
    expect(parseEvent('fits')).toBeNull();
  });

  it('drops a stage that is not a stage id rather than storing it', () => {
    expect(parseEvent({ t: 1, type: 'stage.enter', stage: 's9' })?.stage).toBeUndefined();
    expect(parseEvent({ t: 1, type: 'stage.enter', stage: 's3' })?.stage).toBe('s3');
  });

  it('drops a hours field that is not a finite number', () => {
    const event = parseEvent({ t: 1, type: 'hours.change', from: 'three', to: Infinity });
    expect(event?.from).toBeUndefined();
    expect(event?.to).toBeUndefined();
  });
});

describe('parseEvents', () => {
  it('drops bad members and keeps the good ones in order', () => {
    const parsed = parseEvents([
      { t: 1, type: 'sheet.open', activityId: 'sleep' },
      { t: 2, type: 'garbage' },
      null,
      { t: 3, type: 'sheet.close', activityId: 'sleep' },
    ]);
    expect(parsed.map((event) => event.type)).toEqual(['sheet.open', 'sheet.close']);
  });

  it('treats a non-array body as an empty batch', () => {
    // Telemetry is fire-and-forget (§6.1): a junk body is an accepted no-op,
    // never a 400 the client retries with the same junk forever.
    expect(parseEvents(null)).toEqual([]);
    expect(parseEvents({ events: [] })).toEqual([]);
    expect(parseEvents('events')).toEqual([]);
  });
});

describe('maxStageEnter', () => {
  const enter = (stage: Event['stage'], t: number): Event => ({ t, type: 'stage.enter', stage });

  it('returns the furthest stage regardless of arrival order (§6.2.2)', () => {
    expect(maxStageEnter([enter('s2', 1), enter('s4', 2), enter('s3', 3)])).toBe('s4');
    expect(maxStageEnter([enter('s5', 1), enter('s1', 2)])).toBe('s5');
  });

  it('returns null for a batch with no stage.enter — the common case', () => {
    expect(maxStageEnter([{ t: 1, type: 'field.answer', fieldId: 'work.days' }])).toBeNull();
    expect(maxStageEnter([])).toBeNull();
  });

  it('ignores a stage.enter that carries no stage', () => {
    expect(maxStageEnter([{ t: 1, type: 'stage.enter' }])).toBeNull();
  });
});

describe('parseSnapshot', () => {
  const valid: ScheduleSnapshot = {
    kind: 'finish',
    t: 1,
    packVersion: 'v1',
    activities: [{ id: 'sleep', wd: { mode: 'derived', hours: 8 }, we: { mode: 'derived', hours: 9 } }],
    total: { wd: 22, we: 21 },
    remaining: { wd: 2, we: 3 },
    fits: true,
  };

  it('accepts a snapshot carrying what the debrief derives from', () => {
    expect(parseSnapshot(valid)).toEqual(valid);
  });

  it('rejects a snapshot missing the fields the debrief cannot recompute', () => {
    expect(parseSnapshot({ ...valid, kind: 's2' })).toBeNull();
    expect(parseSnapshot({ ...valid, activities: undefined })).toBeNull();
    // remaining.wd is slack at finish (§10) and has no second source.
    expect(parseSnapshot({ ...valid, remaining: { we: 3 } })).toBeNull();
    expect(parseSnapshot({ ...valid, total: { wd: 22 } })).toBeNull();
    expect(parseSnapshot({ ...valid, fits: 'yes' })).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
  });
});
