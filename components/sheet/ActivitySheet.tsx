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

import { useEffect } from 'react';
import type { DayType } from '@/lib/domain/types';
import { isFullyDerived } from '@/lib/domain/derive';
import { useParticipant } from '@/lib/client/participant';
import { Sheet } from './Sheet';
import { ScreenList } from './ScreenList';
import { DirectEntry } from './DirectEntry';

export interface ActivitySheetProps {
  activityId: string;
  onClose: () => void;
}

export function ActivitySheet({ activityId, onClose }: ActivitySheetProps) {
  const { index, activities, answers, answer, setHours, takeDirect, revertToDerived, session, record } =
    useParticipant();

  const activity = activities.find(candidate => candidate.id === activityId);

  /*
   * §10's pair, emitted where the moment is. `record` is the queue's seam and
   * is stable, so this runs once per opening and once per dismissal however
   * many times the sheet re-renders in between.
   */
  useEffect(() => {
    record({ t: Date.now(), type: 'sheet.open', activityId });
    return () => record({ t: Date.now(), type: 'sheet.close', activityId });
  }, [activityId, record]);

  // An activity the pack does not define is not a state the editor can reach —
  // both entry points read from this same list — but a null here is a closed
  // sheet rather than a crashed one.
  if (activity === undefined) return null;

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
