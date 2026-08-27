/**
 * Step 10.5's "Stage 10 done when" clause, through the real endpoints and the
 * real file: a simulated room produces a debrief in which cut order is
 * reconstructible for every completing participant, and both times to fit are
 * present and distinct.
 *
 * It goes through the routes rather than calling `deriveRoom` on hand-built
 * rows because that is where the claim could actually fail. The derivation is
 * unit-tested; what is not proved anywhere else is that the events survive the
 * round trip in the order the participant made them, that a `screen.view`
 * keeps its screen id across a column that only exists as of migration 3, and
 * that the room's `stage.open` and a participant's reveal entry are two clocks the
 * table can still tell apart afterwards.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, teardownDatabase } from '@/lib/db/testing';
import { getDatabase } from '@/lib/db/index';
import {
  findRoomByJoinCode,
  roomEvents,
  sessionEvents,
  sessionSnapshots,
  sessionsInRoom,
} from '@/lib/db/queries';
import { deriveRoom, type PackFacts } from '@/lib/debrief/derive';
import { toCsv } from '@/lib/debrief/format';
import type { Event, ScheduleSnapshot } from '@/lib/domain/types';
import { params, postJson } from '@/lib/api/testing';
import { POST as createRoom } from './room/route';
import { POST as openStage } from './room/[id]/stage/route';
import { POST as createSession } from './session/route';
import { POST as postReady } from './session/[id]/ready/route';
import { POST as postComplete } from './session/[id]/complete/route';
import { POST as postTelemetry } from './session/[id]/telemetry/route';

const pack: PackFacts = {
  lockedActivityId: 'school',
  lockedMinimumWeekly: 20,
  flooredActivityId: 'sleep',
};

interface Session {
  sessionId: string;
  token: string;
}

function snapshot(
  kind: ScheduleSnapshot['kind'],
  hours: Record<string, [number, number]>,
  remainingWd: number,
): ScheduleSnapshot {
  return {
    kind,
    t: Date.now(),
    packVersion: 'v1',
    activities: Object.entries(hours).map(([id, [wd, we]]) => ({
      id,
      wd: { mode: 'derived', hours: wd },
      we: { mode: 'derived', hours: we },
    })),
    total: { wd: 24 - remainingWd, we: 24 },
    remaining: { wd: remainingWd, we: 0 },
    fits: true,
  };
}

async function telemetry(session: Session, events: Event[]): Promise<void> {
  const response = await postTelemetry(
    postJson(`/api/session/${session.sessionId}/telemetry`, { events }, session.token),
    params({ id: session.sessionId }),
  );
  expect(response.status).toBe(200);
}

beforeEach(() => resetDatabase());
afterAll(() => teardownDatabase());

describe('a simulated room, end to end (§10, step 10.5)', () => {
  it('produces a debrief with cut order intact and two distinct times to fit', async () => {
    const room = (await (await createRoom()).json()) as { roomId: string; joinCode: string };

    const cutter = (await (
      await createSession(postJson('/api/session', { joinCode: room.joinCode }))
    ).json()) as Session;
    const slackRich = (await (
      await createSession(postJson('/api/session', { joinCode: room.joinCode }))
    ).json()) as Session;

    // S1 and S2, batched as the queue would send them.
    await telemetry(cutter, [
      { t: 1_000, type: 'stage.enter', stage: 's1' },
      { t: 1_100, type: 'screen.view', screenId: 'sleep.1', activityId: 'sleep' },
      { t: 1_200, type: 'field.answer', fieldId: 'sleep.wake.wd' },
      { t: 1_300, type: 'field.revise', fieldId: 'sleep.wake.wd' },
      { t: 2_000, type: 'stage.enter', stage: 's2' },
    ]);

    // Finish, with the snapshot slack at finish is read out of.
    const cutterFinish = snapshot(
      'finish',
      { school: [0, 0], sleep: [8, 9], leisure: [4, 6], admin: [2, 2] },
      0,
    );
    expect(
      (
        await postReady(
          postJson(
            `/api/session/${cutter.sessionId}/ready`,
            { schedule: cutterFinish },
            cutter.token,
          ),
          params({ id: cutter.sessionId }),
        )
      ).status,
    ).toBe(200);

    // The facilitator flips the flag. This is the room's t = 0 (§6.2.5).
    expect(
      (
        await openStage(
          postJson(`/api/room/${room.roomId}/stage`, { open: true }),
          params({ id: room.roomId }),
        )
      ).status,
    ).toBe(200);
    const stageOpenAt = roomEvents(room.roomId).find((event) => event.type === 'stage.open')!.t;

    // The rebalance: a 25 h pace, then leisure and admin, in that order.
    await telemetry(cutter, [
      { t: stageOpenAt + 6_000, type: 'stage.enter', stage: 's6' },
      { t: stageOpenAt + 7_000, type: 'hours.change', activityId: 'school', from: 4, to: 5 },
      { t: stageOpenAt + 8_000, type: 'sheet.open', activityId: 'leisure' },
      { t: stageOpenAt + 8_500, type: 'hours.change', activityId: 'leisure', from: 4, to: 2 },
      { t: stageOpenAt + 8_900, type: 'sheet.close', activityId: 'leisure' },
      { t: stageOpenAt + 9_000, type: 'sheet.open', activityId: 'admin' },
      { t: stageOpenAt + 9_500, type: 'hours.change', activityId: 'admin', from: 2, to: 1 },
    ]);

    // Confirm, carrying the trailing batch the queue had not flushed.
    expect(
      (
        await postComplete(
          postJson(
            `/api/session/${cutter.sessionId}/complete`,
            {
              schedule: snapshot(
                'complete',
                { school: [5, 0], sleep: [8, 9], leisure: [2, 6], admin: [1, 2] },
                0,
              ),
              events: [
                { t: stageOpenAt + 10_000, type: 'fits' },
                { t: stageOpenAt + 10_100, type: 'complete' },
              ],
            },
            cutter.token,
          ),
          params({ id: cutter.sessionId }),
        )
      ).status,
    ).toBe(200);

    // The second participant had room for the commitment and cut nothing.
    await postReady(
      postJson(
        `/api/session/${slackRich.sessionId}/ready`,
        { schedule: snapshot('finish', { school: [0, 0], leisure: [4, 6] }, 4) },
        slackRich.token,
      ),
      params({ id: slackRich.sessionId }),
    );
    await postComplete(
      postJson(
        `/api/session/${slackRich.sessionId}/complete`,
        {
          schedule: snapshot('complete', { school: [4, 0], leisure: [4, 6] }, 0),
          events: [
            { t: stageOpenAt + 5_000, type: 'stage.enter', stage: 's6' },
            { t: stageOpenAt + 5_100, type: 'fits' },
            { t: stageOpenAt + 5_200, type: 'complete' },
          ],
        },
        slackRich.token,
      ),
      params({ id: slackRich.sessionId }),
    );

    /* ── the debrief ──────────────────────────────────────────────────── */

    const found = findRoomByJoinCode(room.joinCode)!;
    const debrief = deriveRoom({
      roomId: found.id,
      joinCode: found.join_code,
      stageOpenAt,
      pack,
      participants: sessionsInRoom(found.id).map((session) => ({
        sessionId: session.id,
        events: sessionEvents(session.id),
        ...sessionSnapshots(session.id),
      })),
    });

    expect(debrief.participants).toHaveLength(2);
    const [first, second] = debrief.participants as [
      (typeof debrief.participants)[number],
      (typeof debrief.participants)[number],
    ];

    // Cut order survived three separate POSTs, in the order it was made.
    expect(first.cutOrder.map((cut) => cut.activityId)).toEqual(['leisure', 'admin']);
    expect(first.firstCut).toBe('leisure');
    expect(first.perActivityDelta).toContainEqual({
      activityId: 'leisure',
      dayType: 'wd',
      from: 4,
      to: 2,
    });

    // Both times to fit, present and not the same number (§10, step 10.4).
    expect(first.timeToFitMs).toBe(4_000);
    expect(first.timeToFitRoomMs).toBe(10_000);
    expect(first.timeToFitMs).not.toBe(first.timeToFitRoomMs);

    expect(first.sheetOpensDuringRebalance).toEqual({ leisure: 1, admin: 1 });
    expect(first.paceAtReveal).toBe(25);
    expect(first.slackAtFinishWd).toBe(0);

    // The other participant is a finding, not a failure (§11).
    expect(second.noSqueeze).toBe(true);
    expect(second.cutOrder).toEqual([]);
    expect(second.slackAtFinishWd).toBe(4);
    expect(second.completed).toBe(true);

    // Both are on the CSV, and first cut never ships without slack beside it.
    const csv = toCsv(debrief);
    expect(csv.trim().split('\n')).toHaveLength(3);
    expect(csv).toContain('firstCut,slackAtFinishWd,firstCutFollowsSilentLoss');
  });

  /** `screen.view` needs a column migration 3 added; a lost id is a silent gap. */
  it('round-trips a screen id through the events table', async () => {
    const room = (await (await createRoom()).json()) as { roomId: string; joinCode: string };
    const session = (await (
      await createSession(postJson('/api/session', { joinCode: room.joinCode }))
    ).json()) as Session;

    await telemetry(session, [
      { t: 1, type: 'screen.view', screenId: 'leisure.screen', activityId: 'leisure' },
    ]);

    expect(sessionEvents(session.sessionId)).toEqual([
      { t: 1, type: 'screen.view', activityId: 'leisure', screenId: 'leisure.screen' },
    ]);
  });

  /**
   * §11's retry can land the same snapshot twice. The read takes the last,
   * which is the one the phone finished with — not a second row in the table.
   */
  it('reads one snapshot per kind when a retry delivered two', async () => {
    const room = (await (await createRoom()).json()) as { roomId: string; joinCode: string };
    const session = (await (
      await createSession(postJson('/api/session', { joinCode: room.joinCode }))
    ).json()) as Session;

    for (const remaining of [3, 1]) {
      await postReady(
        postJson(
          `/api/session/${session.sessionId}/ready`,
          { schedule: snapshot('finish', { sleep: [8, 9] }, remaining) },
          session.token,
        ),
        params({ id: session.sessionId }),
      );
    }

    const rows = getDatabase()
      .prepare('SELECT COUNT(*) AS n FROM snapshots WHERE session_id = ?')
      .get(session.sessionId);
    expect(rows).toEqual({ n: 2 });
    expect(sessionSnapshots(session.sessionId).finish?.remaining.wd).toBe(1);
  });
});
