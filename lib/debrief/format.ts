/**
 * The debrief table as files (step 10.5): a CSV of the scalar fields and a
 * JSON sidecar for the two that a cell cannot hold.
 *
 * The split is not a hedge. §10's table is mostly one number per participant —
 * first cut, slack at finish, both times to fit, no-squeeze — and those belong
 * in a spreadsheet a facilitator can sort by column in the twenty minutes
 * between the exercise and the discussion. Per-activity delta and cut order are
 * a list each, and flattening a list into a cell produces a column nobody can
 * sort, filter or read. So the CSV carries what a spreadsheet is good at and
 * the JSON carries everything, losing nothing either way.
 *
 * **First cut never ships without slack at finish.** §10 is explicit that a
 * debrief quoting one without the other is quoting a participant who may have
 * given up two hours silently (§7.8), so the two sit in adjacent columns with
 * the annotation column between them.
 */

import type { RoomDebrief } from './derive';

/** RFC 4180: quote when the value could otherwise break the row. */
function cell(value: string | number | boolean | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Milliseconds as seconds to one decimal — the resolution a room is read at. */
function seconds(ms: number | null): string {
  return ms === null ? '' : (ms / 1000).toFixed(1);
}

const COLUMNS = [
  'sessionId',
  'completed',
  'forced',
  'firstCut',
  'slackAtFinishWd',
  'firstCutFollowsSilentLoss',
  'cutCount',
  'paceAtReveal',
  'schoolWeeklyAtComplete',
  'schoolAboveMinimum',
  'sleepFloorHit',
  'noSqueeze',
  'timeToFitSeconds',
  'timeToFitRoomSeconds',
  'sheetOpensDuringRebalance',
] as const;

export function toCsv(debrief: RoomDebrief): string {
  const rows = debrief.participants.map((participant) =>
    [
      participant.sessionId,
      participant.completed,
      participant.forced,
      participant.firstCut,
      participant.slackAtFinishWd,
      participant.firstCutFollowsSilentLoss,
      participant.cutOrder.length,
      participant.paceAtReveal,
      participant.schoolWeeklyAtComplete,
      participant.schoolAboveMinimum,
      participant.sleepFloorHit,
      participant.noSqueeze,
      seconds(participant.timeToFitMs),
      seconds(participant.timeToFitRoomMs),
      // The one list in the CSV, because it is short and a facilitator scanning
      // for the activity a room kept reopening reads it faster than a sort.
      Object.entries(participant.sheetOpensDuringRebalance)
        .map(([activityId, count]) => `${activityId}:${count}`)
        .join(' '),
    ]
      .map(cell)
      .join(','),
  );

  return [COLUMNS.join(','), ...rows].join('\n') + '\n';
}

export function toJson(debrief: RoomDebrief): string {
  return JSON.stringify(debrief, null, 2) + '\n';
}
