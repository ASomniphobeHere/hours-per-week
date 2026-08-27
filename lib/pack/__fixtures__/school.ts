/**
 * `minimalPack` with the reveal's `locked` activity added — the fixture every
 * S4 test runs against.
 *
 * It is a separate fixture rather than a third activity in `minimalPack`
 * because the hue ring is computed from the activity count (§7.5): adding one
 * moves every hue in the pack, and two Stage 4 tests assert the ring the
 * minimal pack has. Three activities give a 120° step, so `school` takes 0,
 * `alpha` 120 and `beta` 240, and §4.6's `even-hue-ring` is satisfied here on
 * its own terms.
 *
 * The activity carries no screens and no estimator, exactly as school does:
 * `activity-covered` exempts a `locked` activity for that reason, and its
 * hours come from the pace screen alone. The ladder is the v1 one — 20 to 40
 * in fives — so a test asserting the ceiling is asserting the shape the real
 * pack has rather than a fixture's convenience.
 */

import type { ContentPack } from '../types';
import { minimalPack } from './minimal';

export const SCHOOL_ID = 'school';

export function schoolPack(): ContentPack {
  const pack = minimalPack();
  const step = 360 / (pack.activities.length + 1);

  return {
    ...pack,
    activities: [
      {
        id: SCHOOL_ID,
        label: 'act.school',
        hue: 0,
        order: 0,
        locked: true,
        constraint: {
          minWeekly: 20,
          maxWeekly: 40,
          stepWeekly: 5,
          weekendAllowed: false,
        },
        fallbackHours: { wd: 4, we: 0 },
        // Nobody rates school: it is revealed after the rating stage, so its
        // level is content (plan 25 §E.2).
        energy: 2,
      },
      // Shifted down one place, and re-hued onto the new ring.
      ...pack.activities.map((activity) => ({
        ...activity,
        order: activity.order + 1,
        hue: (activity.order + 1) * step,
      })),
    ],
    copy: {
      ...pack.copy,
      'act.school': 'StartSchool',
      's6.school.outcome.20': 'Outcome at twenty.',
      's6.school.outcome.25': 'Outcome at twenty-five.',
      's6.school.outcome.30': 'Outcome at thirty.',
      's6.school.outcome.35': 'Outcome at thirty-five.',
      's6.school.outcome.40': 'Outcome at forty.',
    },
  };
}
