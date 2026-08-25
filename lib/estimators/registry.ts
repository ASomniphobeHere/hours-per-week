/**
 * §4.3 estimator registry — `Map<estimatorId, Estimator>`.
 *
 * `estimatorId` names the *implementation*, not the activity: eight v1
 * activities share `arith.freqDuration`. Implementations are bundled and
 * parameterised from the pack, so replacing a model is a pack release rather
 * than a client release.
 */

import type { Estimator, EstimatorDef, Field } from '@/lib/pack/types';
import { ARITH_ID, buildArith } from './arith';
import { buildHousehold, HOUSEHOLD_ID } from './household';

export type EstimatorFactory = (def: EstimatorDef, fieldById: Map<string, Field>) => Estimator;

/** Every implementation this client can evaluate. Bundled, never remote. */
export const implementations: ReadonlyMap<string, EstimatorFactory> = new Map<
  string,
  EstimatorFactory
>([
  [ARITH_ID, buildArith],
  [HOUSEHOLD_ID, buildHousehold],
]);

export function hasImplementation(estimatorId: string): boolean {
  return implementations.has(estimatorId);
}

/**
 * Binds each pack estimator to its implementation, keyed by activity id.
 *
 * A params error surfaces here, at build time, rather than inside a derivation
 * pass: a malformed pack is a validation failure (§4.6), not a per-participant
 * `fallback`. §4.3 rule 3 is for an estimator that throws on some *answer*.
 */
export function buildEstimators(
  defs: readonly EstimatorDef[],
  fieldById: Map<string, Field>,
): Map<string, Estimator> {
  const bound = new Map<string, Estimator>();
  for (const def of defs) {
    const factory = implementations.get(def.id);
    if (factory === undefined) {
      throw new Error(`${def.activityId}: no bundled implementation for estimator "${def.id}"`);
    }
    bound.set(def.activityId, factory(def, fieldById));
  }
  return bound;
}
