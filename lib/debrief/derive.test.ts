import { describe, expect, it } from 'vitest';
import type { Event, ScheduleSnapshot, SnapshotKind } from '@/lib/domain/types';
import { deriveParticipant, deriveRoom, type PackFacts } from './derive';
import { toCsv } from './format';

const pack: PackFacts = {
  lockedActivityId: 'school',
  lockedMinimumWeekly: 20,
  flooredActivityId: 'sleep',
};

function snapshot(
  kind: SnapshotKind,
  hours: Record<string, [number, number]>,
  remainingWd = 0,
): ScheduleSnapshot {
  return {
    kind,
    t: 0,
    packVersion: 'test',
    activities: Object.entries(hours).map(([id, [wd, we]]) => ({
      id,
      wd: { mode: 'derived', hours: wd },
      we: { mode: 'derived', hours: we },
    })),
    total: { wd: 24 - remainingWd, we: 24 },
    remaining: { wd: remainingWd, we: 0 },
    fits: remainingWd >= 0,
  };
}

/** A breaching run: forced to the reveal, took 25 h/week, cut leisure then admin. */
function breachingEvents(): Event[] {
  return [
    { t: 1_000, type: 'stage.enter', stage: 's2' },
    { t: 2_000, type: 'forced.advance' },
    { t: 2_100, type: 'stage.enter', stage: 's3' },
    { t: 7_100, type: 'stage.enter', stage: 's6' },
    // The pace commit: 5 h a workday is 25 h a week.
    { t: 8_000, type: 'hours.change', activityId: 'school', from: 4, to: 5 },
    { t: 9_000, type: 'sheet.open', activityId: 'leisure' },
    { t: 9_500, type: 'hours.change', activityId: 'leisure', from: 4, to: 2 },
    { t: 9_900, type: 'sheet.close', activityId: 'leisure' },
    { t: 10_000, type: 'sheet.open', activityId: 'admin' },
    { t: 10_500, type: 'hours.change', activityId: 'admin', from: 2, to: 1 },
    { t: 10_900, type: 'sheet.close', activityId: 'admin' },
    { t: 11_000, type: 'fits' },
    { t: 12_000, type: 'complete' },
  ];
}

describe('the debrief derivation (§10, steps 10.4–10.5)', () => {
  const participant = () =>
    deriveParticipant(
      {
        sessionId: 'sess-1',
        events: breachingEvents(),
        finish: snapshot('finish', { school: [0, 0], leisure: [4, 6], admin: [2, 2] }, 0),
        complete: snapshot('complete', { school: [5, 0], leisure: [2, 6], admin: [1, 2] }, 0),
      },
      { pack, stageOpenAt: 2_000 },
    );

  it('reconstructs cut order in the order the cuts were made', () => {
    expect(participant().cutOrder.map((cut) => cut.activityId)).toEqual(['leisure', 'admin']);
    expect(participant().firstCut).toBe('leisure');
  });

  /** The pace commit raised school; only reductions are cuts. */
  it('leaves the pace commit out of cut order', () => {
    expect(participant().cutOrder.some((cut) => cut.activityId === 'school')).toBe(false);
  });

  /**
   * §10 forbids one name for both. They differ here by the 5 s hold plus the
   * gap between the flag and this participant's own reveal entry.
   */
  it('reports both times to fit, and they are not the same number', () => {
    const derived = participant();
    expect(derived.timeToFitMs).toBe(11_000 - 7_100);
    expect(derived.timeToFitRoomMs).toBe(11_000 - 2_000);
    expect(derived.timeToFitMs).not.toBe(derived.timeToFitRoomMs);
  });

  it('counts sheet opens per activity during the rebalance only', () => {
    expect(participant().sheetOpensDuringRebalance).toEqual({ leisure: 1, admin: 1 });
  });

  it('reads the pace twice — at the reveal and at complete', () => {
    const derived = participant();
    expect(derived.paceAtReveal).toBe(25);
    expect(derived.schoolWeeklyAtComplete).toBe(25);
    expect(derived.schoolAboveMinimum).toBe(true);
  });

  /**
   * School is in here, unlike on S7 (step 10.6): the debrief wants what the
   * commitment *was* alongside what it cost, and the participant's screen
   * answers only the second question.
   */
  it('takes per-activity delta from the snapshots, not the events', () => {
    expect(participant().perActivityDelta).toEqual([
      { activityId: 'school', dayType: 'wd', from: 0, to: 5 },
      { activityId: 'leisure', dayType: 'wd', from: 4, to: 2 },
      { activityId: 'admin', dayType: 'wd', from: 2, to: 1 },
    ]);
  });

  it('records the force-advance that explains the gap between the two times', () => {
    expect(participant().forced).toBe(true);
  });

  /** §10: a debrief quoting first cut alone may be quoting a silent loss. */
  it('flags a first cut that follows slack Unallocated absorbed silently', () => {
    const withSlack = deriveParticipant(
      {
        sessionId: 'sess-2',
        events: breachingEvents(),
        finish: snapshot('finish', { school: [0, 0], leisure: [4, 6], admin: [2, 2] }, 2),
        complete: snapshot('complete', { school: [5, 0], leisure: [2, 6], admin: [1, 2] }, 0),
      },
      { pack, stageOpenAt: 2_000 },
    );
    expect(withSlack.slackAtFinishWd).toBe(2);
    expect(withSlack.firstCutFollowsSilentLoss).toBe(true);
    expect(participant().firstCutFollowsSilentLoss).toBe(false);
  });

  it('sees the sleep floor when a clamp hit it, and not otherwise', () => {
    const clamped = deriveParticipant(
      {
        sessionId: 'sess-3',
        events: [
          ...breachingEvents(),
          { t: 10_700, type: 'clamp.hit', activityId: 'sleep', from: 5, to: 6 },
        ],
        finish: snapshot('finish', { sleep: [7, 8] }),
        complete: snapshot('complete', { sleep: [6, 8] }),
      },
      { pack, stageOpenAt: 2_000 },
    );
    expect(clamped.sleepFloorHit).toBe(true);
    expect(participant().sleepFloorHit).toBe(false);
  });

  /** §11's "school fits inside existing slack": 4 h of slack, a 20 h pace. */
  it('marks a slack-rich participant no-squeeze, with cut order empty', () => {
    const slackRich = deriveParticipant(
      {
        sessionId: 'sess-4',
        events: [
          { t: 100, type: 'stage.enter', stage: 's6' },
          { t: 900, type: 'fits' },
          { t: 1_000, type: 'complete' },
        ],
        finish: snapshot('finish', { school: [0, 0], leisure: [4, 6] }, 4),
        complete: snapshot('complete', { school: [4, 0], leisure: [4, 6] }, 0),
      },
      { pack, stageOpenAt: 50 },
    );
    expect(slackRich.noSqueeze).toBe(true);
    expect(slackRich.cutOrder).toEqual([]);
    expect(slackRich.firstCut).toBeNull();
    // Nobody chose a pace: the default is the floor and logs nothing (§10).
    expect(slackRich.paceAtReveal).toBe(20);
  });

  it('reports an incomplete session rather than dropping it', () => {
    const abandoned = deriveParticipant(
      { sessionId: 'sess-5', events: [{ t: 1, type: 'stage.enter', stage: 's1' }] },
      { pack, stageOpenAt: null },
    );
    expect(abandoned.completed).toBe(false);
    expect(abandoned.perActivityDelta).toEqual([]);
    expect(abandoned.timeToFitMs).toBeNull();
    expect(abandoned.timeToFitRoomMs).toBeNull();
  });

  it('emits a CSV with both times to fit under distinct headings', () => {
    const csv = toCsv(
      deriveRoom({
        roomId: 'room-1',
        joinCode: '4821',
        stageOpenAt: 2_000,
        pack,
        participants: [
          {
            sessionId: 'sess-1',
            events: breachingEvents(),
            finish: snapshot('finish', { school: [0, 0], leisure: [4, 6] }, 0),
            complete: snapshot('complete', { school: [5, 0], leisure: [2, 6] }, 0),
          },
        ],
      }),
    );
    const [header, row] = csv.trim().split('\n');
    expect(header).toContain('timeToFitSeconds');
    expect(header).toContain('timeToFitRoomSeconds');
    // First cut never ships without slack at finish beside it (§10).
    expect(header).toContain('firstCut,slackAtFinishWd,firstCutFollowsSilentLoss');
    expect(row).toContain('sess-1');
    expect(row).toContain('3.9');
    expect(row).toContain('9.0');
  });
});
