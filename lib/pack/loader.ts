/**
 * §4.6 pack loading: fail loudly in dev, fall back to the last-good pack in
 * production.
 *
 * The asymmetry is deliberate. In dev a broken pack is a bug to fix now; in a
 * room it is forty people looking at a phone, and a slightly stale pack is
 * strictly better than an error screen. The fetch-and-retry policy around this
 * lives in the client (§11) — this module decides only *which pack to trust*.
 */

import type { ContentPack } from './types';
import type { PackIssue } from './validate';
import { validatePack } from './validate';

export class PackValidationError extends Error {
  readonly issues: PackIssue[];

  constructor(issues: PackIssue[]) {
    super(`content pack failed validation:\n${formatIssues(issues)}`);
    this.name = 'PackValidationError';
    this.issues = issues;
  }
}

export function formatIssues(issues: readonly PackIssue[]): string {
  return issues.map((issue) => `  [${issue.rule}] ${issue.path}: ${issue.message}`).join('\n');
}

/** Structural check before the §4.6 rules, so a malformed JSON blob reports as one issue. */
export function isContentPack(value: unknown): value is ContentPack {
  if (typeof value !== 'object' || value === null) return false;
  const pack = value as Partial<ContentPack>;
  return (
    typeof pack.version === 'string' &&
    Array.isArray(pack.activities) &&
    Array.isArray(pack.screens) &&
    Array.isArray(pack.estimators) &&
    typeof pack.copy === 'object' &&
    pack.copy !== null
  );
}

export interface LoadOptions {
  /** Fail loudly when true; fall back to `lastGood` when false. */
  dev: boolean;
  /** The last pack that validated, cached by the client across sessions. */
  lastGood?: ContentPack | null;
}

export interface LoadResult {
  pack: ContentPack;
  issues: PackIssue[];
  /** True when `pack` is `lastGood` rather than the candidate. */
  usedFallback: boolean;
}

/**
 * Validates a candidate pack and decides what to hand the client.
 *
 * Throws in dev on any issue. In production, returns the candidate when it is
 * clean and the last-good pack when it is not; with neither available there is
 * nothing to render and the caller gets the throw either way (§11's hard error
 * screen with a reload control).
 */
export function loadPack(candidate: unknown, { dev, lastGood = null }: LoadOptions): LoadResult {
  if (!isContentPack(candidate)) {
    const issues: PackIssue[] = [
      {
        rule: 'section-resolves',
        path: 'pack',
        message: 'not a content pack: version, activities, screens, estimators and copy required',
      },
    ];
    if (dev || lastGood === null) throw new PackValidationError(issues);
    return { pack: lastGood, issues, usedFallback: true };
  }

  const issues = validatePack(candidate);
  if (issues.length === 0) return { pack: candidate, issues, usedFallback: false };
  if (dev || lastGood === null) throw new PackValidationError(issues);
  return { pack: lastGood, issues, usedFallback: true };
}

/** Throws unless the pack is clean. For build-time checks and tests. */
export function assertValidPack(candidate: unknown): ContentPack {
  return loadPack(candidate, { dev: true }).pack;
}
