'use client';

/**
 * One activity's sheet, wired to the participant's live state.
 *
 * The split from `Sheet` is deliberate: `Sheet` owns §8.1's *behaviour* — the
 * height, the dim, the lock, the trap, the four ways out — and knows nothing
 * about answers. This owns what goes in it, and is the only place that reads
 * the store. A band tap and a Not-included row tap both arrive here with the
 * same one argument (§7.7: "exactly as a band tap does"), so there is no second
 * path to keep in step.
 */

import type { DayType } from '@/lib/domain/types';
import { isFullyDerived } from '@/lib/domain/derive';
import { weekly } from '@/lib/domain/totals';
import { useParticipant } from '@/lib/client/participant';
import { SchoolControl } from '@/components/school/SchoolControl';
import { Sheet } from './Sheet';
import { ScreenList } from './ScreenList';
import { DirectEntry } from './DirectEntry';

export interface ActivitySheetProps {
  activityId: string;
  onClose: () => void;
}

export function ActivitySheet({ activityId, onClose }: ActivitySheetProps) {
  const {
    index,
    activities,
    answers,
    answer,
    setHours,
    setWeekly,
    takeDirect,
    revertToDerived,
    session,
  } = useParticipant();

  const activity = activities.find(candidate => candidate.id === activityId);

  /*
   * §10's `sheet.open` and `sheet.close` are emitted by the editor, on the tap
   * that opens the sheet and the dismissal that closes it — not by a mount
   * effect here. Mounting is not the moment: the sheet mounts and unmounts for
   * reasons that are not a participant looking at an activity, and an effect
   * pair would report each of them as a visit. §10 counts *sheet opens per
   * activity during rebalance*, so a doubled count is a debrief that overstates
   * how hard someone worked at a band.
   */

  // An activity the pack does not define is not a state the editor can reach —
  // both entry points read from this same list — but a null here is a closed
  // sheet rather than a crashed one.
  if (activity === undefined) return null;

  /*
   * §8.3 and AC 40 — a `locked` activity's sheet is the three-part control and
   * nothing else. No questionnaire content, because it has none: `locked` is
   * the pack's own marker for an activity that carries no screens, which is
   * why nothing here names school. `ScreenList` would already render nothing
   * for it; direct entry would not, and a per-day hours box beside a weekly
   * stepper is two controls disagreeing about what the participant is setting.
   *
   * This writes through on every step, unlike the pace screen's Continue: the
   * band is already in the stack, and lowering the pace to fit is a legitimate
   * route to completion that belongs in cut order like any other reduction
   * (§8.3, step 7.7).
   */
  if (activity.locked) {
    const current = weekly(activity);
    return (
      <Sheet pack={index.pack} activity={activity} onClose={onClose}>
        <SchoolControl
          pack={index.pack}
          activity={activity}
          weekly={current}
          onChange={(next: number) => setWeekly(activityId, next, current)}
        />
      </Sheet>
    );
  }

  return (
    <Sheet pack={index.pack} activity={activity} onClose={onClose}>
      <ScreenList
        index={index}
        activityId={activityId}
        answers={answers}
        onAnswer={answer}
      />
      <DirectEntry
        pack={index.pack}
        activity={activity}
        direct={!isFullyDerived(session.authored, activityId)}
        onSet={(dayType: DayType, hours: number) => setHours(activityId, dayType, hours)}
        onTake={() => takeDirect(activityId)}
        onRevert={() => revertToDerived(activityId)}
      />
    </Sheet>
  );
}
