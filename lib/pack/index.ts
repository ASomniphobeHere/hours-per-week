/**
 * Read-side indexes over a validated pack. Built once per pack and passed
 * around, so no hot path walks `pack.screens` looking for a field.
 */

import type { DayType } from '@/lib/domain/types';
import type { ActivityDef, ContentPack, EstimatorDef, Field, Screen } from './types';

export interface PackIndex {
  pack: ContentPack;
  activities: ActivityDef[];
  activityById: Map<string, ActivityDef>;
  fieldById: Map<string, Field>;
  /** Field id → the screen it sits on. */
  screenByFieldId: Map<string, Screen>;
  /** Activity id → its screens, in pack order. */
  screensBySection: Map<string, Screen[]>;
  /** Activity id → its estimator. One per activity, enforced at validation. */
  estimatorByActivity: Map<string, EstimatorDef>;
}

export function indexPack(pack: ContentPack): PackIndex {
  const activities = [...pack.activities].sort((a, b) => a.order - b.order);
  const activityById = new Map(pack.activities.map((activity) => [activity.id, activity]));
  const fieldById = new Map<string, Field>();
  const screenByFieldId = new Map<string, Screen>();
  const screensBySection = new Map<string, Screen[]>();

  for (const screen of pack.screens) {
    for (const field of screen.fields) {
      fieldById.set(field.id, field);
      screenByFieldId.set(field.id, screen);
    }
    const section = screensBySection.get(screen.sectionId);
    if (section === undefined) screensBySection.set(screen.sectionId, [screen]);
    else section.push(screen);
  }

  const estimatorByActivity = new Map(
    pack.estimators.map((estimator) => [estimator.activityId, estimator]),
  );

  return {
    pack,
    activities,
    activityById,
    fieldById,
    screenByFieldId,
    screensBySection,
    estimatorByActivity,
  };
}

export function fieldIds(pack: ContentPack): string[] {
  return pack.screens.flatMap((screen) => screen.fields.map((field) => field.id));
}

/** Per-day-type default hours used when an estimator throws (§4.3 rule 3). */
export function fallbackHours(activity: ActivityDef, dayType: DayType): number {
  return activity.fallbackHours?.[dayType] ?? 0;
}
