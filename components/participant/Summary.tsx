'use client';

/**
 * S7 — what it cost (step 10.6).
 *
 * §2.2 gives the done stage two em dashes and §12 names no criterion for it, so this
 * screen is not a spec section made concrete: it is §10's first derived field
 * — per-activity delta — turned around and shown to the person who produced
 * it. The debrief reads that field to learn what the room gave up; the
 * participant has at least as much claim on it, and has just spent five
 * minutes deciding it.
 *
 * **Built from the two snapshots, not from the event log.** The finish
 * snapshot against the complete one. A participant who cut leisure to 4 h,
 * thought better of it and settled at 5 h reads one row — `6 h → 5 h` — and
 * not two. The snapshot difference is the decision they arrived at; the route
 * they took to it is cut order, which stays in telemetry, where the sequence
 * is the whole value and on a summary screen would be noise.
 *
 * **Cuts only.** School is not a row: it went up, and it is the reason for the
 * list rather than a member of it, so it is named once in `s7.title` and
 * appears nowhere else. Nor are increases — a participant who nudged sleep up
 * while cutting elsewhere is not being asked what their week gained.
 *
 * **What the screen knowingly does not say.** A participant with 2 h of slack
 * and a 4 h pace cut 2 h and reads a short list, and that list understates what
 * school cost them by exactly the slack it ate first (§7.8). §10 has the
 * debrief read cut order against *slack at finish* for that reason. This screen
 * does not: annotating their list with what they gave up without deciding it is
 * the client telling them something about their week, which is what §7.6's
 * silence rule exists to prevent. The debrief gets the annotation; the
 * participant gets their decisions.
 *
 * **Rendering.** A list, not the instrument — no bands, no hues, no spines, no
 * stack. Partly because there is nothing left to edit at S7 and re-rendering
 * the stack invites the attempt, and partly because the stack is a picture of a
 * week and this is a record of a change to one. The only control is the
 * options tab (step 10.7).
 */

import { useMemo } from 'react';
import type { ScheduleSnapshot } from '@/lib/domain/types';
import { DAYS_PER_WEEK } from '@/lib/domain/types';
import { cuts } from '@/lib/domain/delta';
import { copyOf, formatCopy } from '@/lib/pack/copy';
import { useParticipant } from '@/lib/client/participant';
import { Options } from '@/components/stack/Options';
import { formatAmount } from './fields/format';
import styles from './participant.module.css';

/**
 * The weekly figure for the locked activity in the complete snapshot — the
 * one place a school number appears on this screen, and only in the no-cut
 * case, where there is otherwise nothing to show.
 */
function lockedWeekly(snapshot: ScheduleSnapshot, activityId: string): number {
  const activity = snapshot.activities.find((candidate) => candidate.id === activityId);
  if (activity === undefined) return 0;
  return activity.wd.hours * DAYS_PER_WEEK.wd + activity.we.hours * DAYS_PER_WEEK.we;
}

export function Summary() {
  const { index, session, activities, reset } = useParticipant();
  const pack = index.pack;
  const { finish, complete } = session.snapshots;

  const locked = useMemo(() => activities.find((activity) => activity.locked), [activities]);

  const rows = useMemo(
    () =>
      finish === undefined || complete === undefined
        ? []
        : cuts(finish, complete, { exclude: (id) => id === locked?.id }),
    [finish, complete, locked],
  );

  /*
   * §7.1's two words, and no private pair of this screen's own — §9's rule is
   * that no string is hardcoded, not that every surface owns a copy of one.
   *
   * Carried on the rows only when there is a weekend row to tell apart. The
   * common case is entirely workday (S6 forces `wd`, and school is
   * workday-only), and a repeated "Work day" down a list that is nothing else
   * is chrome rather than information.
   */
  const labelDays = rows.some((row) => row.dayType === 'we');

  return (
    <main className={`${styles.page} ${styles.centred}`} data-testid="summary">
      {/* Fixed to the right edge, and the only way off a terminal screen (§7.9, step 10.7). */}
      <Options pack={pack} onReset={reset} bodyKey="options.reset.body.complete" />

      <div className={styles.body}>
        <h1 className={styles.prompt}>{copyOf(pack, 's7.title')}</h1>

        {rows.length === 0 ? (
          <div data-testid="summary-no-cuts">
            <p className={styles.note}>{copyOf(pack, 's7.noCuts.title')}</p>
            <p className={styles.note}>
              {formatCopy(pack, 's7.noCuts.body', {
                hours:
                  complete === undefined || locked === undefined
                    ? 0
                    : formatAmount(lockedWeekly(complete, locked.id)),
              })}
            </p>
          </div>
        ) : (
          <ul className={styles.cuts} data-testid="summary-cuts">
            {rows.map((row) => (
              <li key={`${row.activityId}:${row.dayType}`} className={styles.cut}>
                <span className={styles.cutLabel}>
                  {copyOf(pack, index.activityById.get(row.activityId)?.label ?? row.activityId)}
                  {labelDays ? (
                    <span className={styles.cutDay}>{copyOf(pack, `toggle.${row.dayType}`)}</span>
                  ) : null}
                </span>
                <span className={styles.cutHours} data-testid={`cut-${row.activityId}-${row.dayType}`}>
                  {formatCopy(pack, 's7.cuts.row', {
                    from: formatAmount(row.from),
                    to: formatAmount(row.to),
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
