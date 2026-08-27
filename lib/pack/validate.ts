/**
 * §4.6 pack validation. Seventeen rules, each named, each independently
 * assertable — a pack is content and may be replaced without a client release,
 * so this is the only thing standing between a bad pack and a broken room.
 *
 * Three of the rules are §4.6's own additions and they exist to keep promises
 * made elsewhere in the spec:
 *
 *   default-in-gated-section — §4.2.1 rule 6 promises a force-advanced
 *     participant a full stack; §4.4's arithmetic branch delivers an empty one
 *     unless every field behind a gate carries a default.
 *   fallback-default        — §4.3 rule 3 hands the participant a number when
 *     an estimator throws. There has to be a number to hand them.
 *   even-hue-ring           — §7.5. At 12% opacity lightness collapses, so hue
 *     spacing is the only thing distinguishing two bands.
 *
 * Three more are plan 25 §E.2's, and they draw one line: the scale is the
 * instrument's and the levels are the participant's.
 *
 *   energy-scale             — five rungs, −2 … +2, each once. `netEnergy`
 *     multiplies hours by these, so a pack that re-shaped the scale would
 *     silently re-scale every net figure ever recorded against it.
 *   energy-locked-declared   — school is revealed after the rating stage, so
 *     nobody ever rates it. Its level is content, and there has to be one.
 *   energy-participant-owned — and nothing else's level is content. A pack
 *     that shipped one would overrule an answer without saying so.
 */

import { DAY_TYPES } from '@/lib/domain/types';
import { ENERGY_LEVELS } from '@/lib/domain/energy';
import { weeklyLevels } from '@/lib/domain/constraints';
import type { ActivityDef, ContentPack, EstimatorDef, Field, Screen } from './types';
import { ARITH_ID, arithTermInputs, isArithParams } from '@/lib/estimators/arith';
import { hasImplementation } from '@/lib/estimators/registry';
import { HOUSEHOLD_ID, householdTermInputs, isHouseholdParams } from '@/lib/estimators/household';

export type PackRule =
  | 'section-resolves'
  | 'field-id-unique'
  | 'estimator-inputs-resolve'
  | 'activity-covered'
  | 'copy-key-exists'
  | 'media-cap'
  | 'media-alt-and-aspect'
  | 'one-gate-per-section'
  | 'gate-field-on-gate-screen'
  | 'gate-field-required'
  | 'gated-input-has-default'
  | 'default-in-gated-section'
  | 'fallback-default'
  | 'even-hue-ring'
  | 'energy-scale'
  | 'energy-locked-declared'
  | 'energy-participant-owned';

export const PACK_RULES: readonly PackRule[] = [
  'section-resolves',
  'field-id-unique',
  'estimator-inputs-resolve',
  'activity-covered',
  'copy-key-exists',
  'media-cap',
  'media-alt-and-aspect',
  'one-gate-per-section',
  'gate-field-on-gate-screen',
  'gate-field-required',
  'gated-input-has-default',
  'default-in-gated-section',
  'fallback-default',
  'even-hue-ring',
  'energy-scale',
  'energy-locked-declared',
  'energy-participant-owned',
] as const;

export interface PackIssue {
  rule: PackRule;
  /** Where the violation is, e.g. `screens[3].fields[1]`. */
  path: string;
  message: string;
}

/** §9's required keys. `s3.lines[]` is `s3.lines.0` upward, at least four. */
export const REQUIRED_COPY_KEYS: readonly string[] = [
  's1.progress',
  's2.finish',
  's3.title',
  /* The rating stage and the second hold (plan 25 §E.2, §E.6, §E.7). The
     stage's prompt and note are not here: `pack.energy` names its own keys and
     `copy-key-exists` checks they resolve, so requiring a second fixed name
     for the same string would only stop a pack calling it something else. What
     is here is what the *client* asks for by name and no pack declares. */
  's4.energy.continue',
  's5.title',
  's6.reveal.title',
  's6.reveal.body',
  's6.pace.title',
  's6.pace.perDay',
  's6.pace.continue',
  's6.confirm',
  'sheet.setDirect',
  'sheet.done',
  'band.unallocated',
  /*
   * Beyond §9's table. §9's rule is that no string is hardcoded in the client,
   * and its table lists the keys the *spec* names rather than every key the
   * client needs — the questionnaire's own navigation, the intro page, the
   * join screen and the unit suffix beside a stepper are all participant-facing
   * and none appear there. Requiring them here is what stops a replacement pack
   * shipping without them and leaving a room looking at raw key names.
   */
  's1.next',
  's1.back',
  'intro.multitasking',
  'intro.continue',
  'join.prompt',
  'join.label',
  'join.action',
  'join.error.unknown',
  'join.error.failed',
  'unit.minutes',
  'unit.hours',
  'unit.times',
  'a11y.decrease',
  'a11y.increase',
  'band.notIncluded',
  'band.notIncludedCount',
  'toggle.wd',
  'toggle.we',
  'toggle.hours',
  'options.open',
  'options.reset',
  'options.reset.title',
  'options.reset.body',
  'options.reset.confirm',
  'options.reset.cancel',
  'options.reset.failed',
  /*
   * The done stage's four, plus the second reset body it needs (step 10.6,
   * step 10.7). §2.2 leaves that stage undefined and §9's table names no key
   * for it, on the same footing as the keys above: they are participant-facing
   * strings the spec does not enumerate, and a replacement pack that omits
   * them leaves a finished participant reading raw key names off the last
   * screen they see.
   *
   * They are spelled `s7.*` rather than `s5.*` because plan 25 renumbers the
   * machine: the rating stage and its hold take s4 and s5, and done moves to
   * s7. Step 10.6 wrote them before that landed, and `s5.title` then named two
   * different screens (§Edits to plan 24, item 3).
   */
  's7.title',
  's7.cuts.row',
  's7.noCuts.title',
  's7.noCuts.body',
  'options.reset.body.complete',
] as const;

export const S3_LINES_PREFIX = 's3.lines.';
/**
 * The second hold's own lines (plan 25 §E.7). A distinct set rather than a
 * reuse of `s3.lines`: the same four lines cycling on a second wait four
 * minutes later reads as a stuck app, which §6.3 spends a paragraph avoiding.
 */
export const S5_LINES_PREFIX = 's5.lines.';
/** Applies to both holds. Fewer than four and the cycle is visibly a loop. */
export const S3_LINES_MINIMUM = 4;
export const HOLD_LINES_PREFIXES: readonly string[] = [S3_LINES_PREFIX, S5_LINES_PREFIX] as const;

/** §8.3's ladder key for a weekly level, e.g. `s6.school.outcome.25`. */
export const outcomeKey = (weekly: number): string => `s6.school.outcome.${weekly}`;

function allScreenFields(pack: ContentPack): { screen: Screen; field: Field; path: string }[] {
  return pack.screens.flatMap((screen, screenIndex) =>
    screen.fields.map((field, fieldIndex) => ({
      screen,
      field,
      path: `screens[${screenIndex}].fields[${fieldIndex}]`,
    })),
  );
}

/** The declared inputs an estimator actually reads, per its implementation. */
function declaredInputs(def: EstimatorDef): string[] {
  const inputs = new Set(def.inputs);
  if (def.id === ARITH_ID && isArithParams(def.params)) {
    for (const term of def.params.terms) for (const id of arithTermInputs(term)) inputs.add(id);
  }
  if (def.id === HOUSEHOLD_ID && isHouseholdParams(def.params)) {
    for (const id of householdTermInputs(def.params)) inputs.add(id);
  }
  return [...inputs];
}

export function validatePack(pack: ContentPack): PackIssue[] {
  const issues: PackIssue[] = [];
  const add = (rule: PackRule, path: string, message: string): void => {
    issues.push({ rule, path, message });
  };

  const activityById = new Map<string, ActivityDef>();
  for (const activity of pack.activities) activityById.set(activity.id, activity);

  const fieldById = new Map<string, Field>();
  const sectionOfField = new Map<string, string>();
  const gateScreenOfSection = new Map<string, Screen>();

  /* ── field-id-unique ─────────────────────────────────────────────────── */
  for (const { screen, field, path } of allScreenFields(pack)) {
    if (fieldById.has(field.id)) {
      add('field-id-unique', path, `duplicate field id "${field.id}"`);
    }
    fieldById.set(field.id, field);
    sectionOfField.set(field.id, screen.sectionId);
  }

  /* ── section-resolves, media, one-gate-per-section ───────────────────── */
  const gateScreenSeen = new Set<string>();
  pack.screens.forEach((screen, index) => {
    const path = `screens[${index}]`;

    if (!activityById.has(screen.sectionId)) {
      add('section-resolves', path, `sectionId "${screen.sectionId}" is not an activity`);
    }

    const media = screen.media ?? [];
    if (media.length > 2) {
      add('media-cap', path, `${media.length} media; the cap is 2 (§4.5)`);
    }
    media.forEach((item, mediaIndex) => {
      const mediaPath = `${path}.media[${mediaIndex}]`;
      if (typeof item.alt !== 'string' || item.alt === '') {
        add('media-alt-and-aspect', mediaPath, 'alt is required');
      }
      if (typeof item.aspect !== 'number' || !(item.aspect > 0)) {
        add('media-alt-and-aspect', mediaPath, 'aspect is required and must be positive');
      }
    });

    if (screen.gate === true) {
      if (gateScreenSeen.has(screen.sectionId)) {
        add('one-gate-per-section', path, `section "${screen.sectionId}" has more than one gate`);
      }
      gateScreenSeen.add(screen.sectionId);
      gateScreenOfSection.set(screen.sectionId, screen);

      const first = pack.screens.find((other) => other.sectionId === screen.sectionId);
      if (first !== screen) {
        add(
          'one-gate-per-section',
          path,
          `the gate for section "${screen.sectionId}" is not its first screen`,
        );
      }
    }
  });

  /* ── gate field rules ────────────────────────────────────────────────── */
  const gatedSections = new Set<string>();
  pack.activities.forEach((activity, index) => {
    const gateField = activity.gateField;
    if (gateField === undefined) return;
    gatedSections.add(activity.id);
    const path = `activities[${index}]`;

    const field = fieldById.get(gateField);
    if (field === undefined) {
      add('gate-field-on-gate-screen', path, `gateField "${gateField}" is not a field in the pack`);
      return;
    }

    const gateScreen = gateScreenOfSection.get(activity.id);
    if (gateScreen === undefined || !gateScreen.fields.some((f) => f.id === gateField)) {
      add(
        'gate-field-on-gate-screen',
        path,
        `gateField "${gateField}" is not on the gate screen of section "${activity.id}"`,
      );
    }

    if (!field.required) {
      add('gate-field-required', path, `gate field "${gateField}" must be required (§4.6)`);
    }
    if (field.default === undefined) {
      add('gate-field-required', path, `gate field "${gateField}" must declare a default`);
    } else if (skips(activity, field.default)) {
      add('gate-field-required', path, `gate field "${gateField}" defaults to the skipping value`);
    }
  });

  /* ── default-in-gated-section ────────────────────────────────────────── */
  for (const { screen, field, path } of allScreenFields(pack)) {
    if (!gatedSections.has(screen.sectionId)) continue;
    if (field.default === undefined) {
      add(
        'default-in-gated-section',
        path,
        `"${field.id}" is behind a gate and must declare a default (§4.2.1 rule 6)`,
      );
    }
  }

  /* ── estimator rules ─────────────────────────────────────────────────── */
  const coveredByEstimator = new Set<string>();
  const seenActivities = new Set<string>();
  pack.estimators.forEach((def, index) => {
    const path = `estimators[${index}]`;
    coveredByEstimator.add(def.activityId);

    if (!activityById.has(def.activityId)) {
      add('activity-covered', path, `activityId "${def.activityId}" is not an activity`);
    }
    if (seenActivities.has(def.activityId)) {
      add('activity-covered', path, `"${def.activityId}" has more than one estimator`);
    }
    seenActivities.add(def.activityId);

    if (!hasImplementation(def.id)) {
      add('estimator-inputs-resolve', path, `no bundled implementation for "${def.id}"`);
    }
    if (def.id === ARITH_ID && !isArithParams(def.params)) {
      add('estimator-inputs-resolve', path, `${ARITH_ID} params must be a list of terms`);
    }
    if (def.id === HOUSEHOLD_ID && !isHouseholdParams(def.params)) {
      add('estimator-inputs-resolve', path, `${HOUSEHOLD_ID} params must carry wd and we models`);
    }
    for (const dayType of def.outputs) {
      if (!DAY_TYPES.includes(dayType)) {
        add('estimator-inputs-resolve', path, `unknown output day type "${dayType}"`);
      }
    }

    for (const inputId of declaredInputs(def)) {
      if (!fieldById.has(inputId)) {
        add('estimator-inputs-resolve', path, `input "${inputId}" is not a field in the pack`);
        continue;
      }
      // §4.6: an estimator may read a field from a gated-out section only if it
      // declares a default for it — the field's own default is unreachable once
      // the section is skipped.
      const section = sectionOfField.get(inputId);
      if (
        section !== undefined &&
        section !== def.activityId &&
        gatedSections.has(section) &&
        def.defaults?.[inputId] === undefined
      ) {
        add(
          'gated-input-has-default',
          path,
          `"${inputId}" lives in gated section "${section}"; declare a default for it`,
        );
      }
    }
  });

  /* ── activity-covered, fallback-default ──────────────────────────────── */
  const sectionsWithScreens = new Set(pack.screens.map((screen) => screen.sectionId));
  pack.activities.forEach((activity, index) => {
    const path = `activities[${index}]`;

    // A `locked` activity carries none of the questionnaire (§8.3: school's
    // sheet is the weekly stepper and nothing else), so screen coverage does
    // not apply to it.
    if (
      activity.locked !== true &&
      !sectionsWithScreens.has(activity.id) &&
      !coveredByEstimator.has(activity.id)
    ) {
      add('activity-covered', path, `"${activity.id}" has no screen and no estimator`);
    }

    // Every activity resolved through an estimator has a fallback path, and
    // `locked` activities are seeded from theirs.
    const needsFallback = coveredByEstimator.has(activity.id) || activity.locked === true;
    if (!needsFallback) return;
    for (const dayType of DAY_TYPES) {
      if (typeof activity.fallbackHours?.[dayType] !== 'number') {
        add('fallback-default', path, `"${activity.id}" has no fallback hours for "${dayType}"`);
      }
    }
  });

  /* ── energy: the scale is the instrument's, the levels are theirs ────── */
  const energy = pack.energy;
  if (energy === undefined || energy === null || typeof energy !== 'object') {
    add('energy-scale', 'energy', 'the pack declares no energy block');
  } else if (!Array.isArray(energy.scale)) {
    add('energy-scale', 'energy.scale', 'scale must be a list of rungs');
  } else {
    const seen = new Set<number>();
    energy.scale.forEach((rung, index) => {
      const path = `energy.scale[${index}]`;
      if (!ENERGY_LEVELS.includes(rung?.value)) {
        add('energy-scale', path, `"${String(rung?.value)}" is not a level between -2 and 2`);
        return;
      }
      if (seen.has(rung.value)) add('energy-scale', path, `level ${rung.value} appears twice`);
      seen.add(rung.value);
    });
    for (const level of ENERGY_LEVELS) {
      if (!seen.has(level)) add('energy-scale', 'energy.scale', `level ${level} is missing`);
    }
  }

  pack.activities.forEach((activity, index) => {
    const path = `activities[${index}]`;
    if (activity.locked === true) {
      if (!ENERGY_LEVELS.includes(activity.energy as never)) {
        add(
          'energy-locked-declared',
          path,
          `"${activity.id}" is locked and must declare an energy level; nobody rates it`,
        );
      }
      return;
    }
    if (activity.energy !== undefined) {
      add(
        'energy-participant-owned',
        path,
        `"${activity.id}" declares an energy level; that value is the participant's`,
      );
    }
  });

  /* ── even-hue-ring ───────────────────────────────────────────────────── */
  const step = 360 / pack.activities.length;
  const orders = new Set<number>();
  pack.activities.forEach((activity, index) => {
    const path = `activities[${index}]`;
    if (orders.has(activity.order)) {
      add('even-hue-ring', path, `duplicate order ${activity.order}`);
    }
    orders.add(activity.order);

    const expected = (((activity.order * step) % 360) + 360) % 360;
    if (Math.abs(normaliseHue(activity.hue) - expected) > 1e-9) {
      add(
        'even-hue-ring',
        path,
        `hue ${activity.hue} is not ${expected} (order ${activity.order} at ${step} degrees)`,
      );
    }
  });
  for (let order = 0; order < pack.activities.length; order += 1) {
    if (!orders.has(order)) {
      add('even-hue-ring', 'activities', `order ${order} is missing; the ring is not even`);
    }
  }

  /* ── copy-key-exists ─────────────────────────────────────────────────── */
  const copy = pack.copy ?? {};
  const requireCopy = (key: string | undefined, path: string): void => {
    if (key === undefined) return;
    if (typeof copy[key] !== 'string' || copy[key] === '') {
      add('copy-key-exists', path, `copy key "${key}" is missing`);
    }
  };

  pack.activities.forEach((activity, index) => requireCopy(activity.label, `activities[${index}]`));
  pack.screens.forEach((screen, index) => {
    const path = `screens[${index}]`;
    requireCopy(screen.prompt, path);
    requireCopy(screen.note, path);
    screen.media?.forEach((item, mediaIndex) =>
      requireCopy(item.alt, `${path}.media[${mediaIndex}]`),
    );
    screen.fields.forEach((field, fieldIndex) => {
      const fieldPath = `${path}.fields[${fieldIndex}]`;
      requireCopy(field.label, fieldPath);
      field.options?.forEach((option, optionIndex) =>
        requireCopy(option.label, `${fieldPath}.options[${optionIndex}]`),
      );
    });
  });
  for (const key of REQUIRED_COPY_KEYS) requireCopy(key, 'copy');

  pack.activities.forEach((activity, index) => {
    for (const weekly of weeklyLevels(activity.constraint)) {
      requireCopy(outcomeKey(weekly), `activities[${index}].constraint`);
    }
  });

  if (energy !== undefined && energy !== null && typeof energy === 'object') {
    requireCopy(energy.prompt, 'energy');
    requireCopy(energy.note, 'energy');
    if (Array.isArray(energy.scale)) {
      energy.scale.forEach((rung, index) =>
        requireCopy(rung?.label, `energy.scale[${index}]`),
      );
    }
  }

  for (const prefix of HOLD_LINES_PREFIXES) {
    const lines = Object.keys(copy).filter((key) => key.startsWith(prefix));
    if (lines.length < S3_LINES_MINIMUM) {
      add(
        'copy-key-exists',
        'copy',
        `${prefix.slice(0, -1)} needs at least ${S3_LINES_MINIMUM} entries; found ${lines.length}`,
      );
    }
  }

  return issues;
}

function normaliseHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

/** Mirrors `isGatedOut`, applied to a candidate default. */
function skips(activity: ActivityDef, value: unknown): boolean {
  if ('gateSkipValue' in activity) return value === activity.gateSkipValue;
  if (Array.isArray(value)) return value.length === 0;
  return !value;
}
