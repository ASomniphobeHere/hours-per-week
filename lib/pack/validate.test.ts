import { describe, expect, it } from 'vitest';
import { minimalPack } from './__fixtures__/minimal';
import { schoolPack } from './__fixtures__/school';
import { PACK_RULES, validatePack, type PackRule } from './validate';
import { loadPack, PackValidationError } from './loader';

function rulesFired(pack: ReturnType<typeof minimalPack>): PackRule[] {
  return [...new Set(validatePack(pack).map((issue) => issue.rule))];
}

describe('the fixture', () => {
  it('passes every rule, so a failure below is the mutation and not the fixture', () => {
    expect(validatePack(minimalPack())).toEqual([]);
  });
});

describe('the school fixture', () => {
  /* It shifts every order and re-hues the ring, so it is exactly the kind of
     fixture that goes quietly wrong. If it fails to validate, the S4 tests are
     asserting against a pack the client would refuse to load. */
  it('passes all fourteen rules with the locked activity in it', () => {
    expect(validatePack(schoolPack())).toEqual([]);
  });
});

describe('§4.6 rules', () => {
  it('section-resolves — a screen naming a section that is not an activity', () => {
    const pack = minimalPack();
    pack.screens[0]!.sectionId = 'nowhere';
    expect(rulesFired(pack)).toContain('section-resolves');
  });

  it('field-id-unique — the same field id on two screens', () => {
    const pack = minimalPack();
    pack.screens[2]!.fields[0]!.id = 'alpha.minutes.wd';
    expect(rulesFired(pack)).toContain('field-id-unique');
  });

  it('estimator-inputs-resolve — an input that is not a field in the pack', () => {
    const pack = minimalPack();
    pack.estimators[0]!.inputs = ['alpha.minutes.wd', 'ghost'];
    expect(rulesFired(pack)).toContain('estimator-inputs-resolve');
  });

  it('estimator-inputs-resolve — an implementation this client cannot evaluate', () => {
    const pack = minimalPack();
    pack.estimators[0]!.id = 'remote.v9';
    expect(rulesFired(pack)).toContain('estimator-inputs-resolve');
  });

  it('activity-covered — an activity with no screen and no estimator', () => {
    const pack = minimalPack();
    pack.activities.push({
      id: 'gamma',
      label: 'act.alpha',
      hue: 0,
      order: 2,
      fallbackHours: { wd: 0, we: 0 },
    });
    expect(rulesFired(pack)).toContain('activity-covered');
  });

  it('activity-covered — two estimators claiming one activity', () => {
    const pack = minimalPack();
    pack.estimators.push({ ...pack.estimators[0]!, inputs: [] });
    expect(rulesFired(pack)).toContain('activity-covered');
  });

  it('copy-key-exists — a prompt whose key is absent', () => {
    const pack = minimalPack();
    delete pack.copy['q.alpha.prompt'];
    expect(rulesFired(pack)).toContain('copy-key-exists');
  });

  it('copy-key-exists — a §9 required key is absent', () => {
    const pack = minimalPack();
    delete pack.copy['s4.confirm'];
    expect(rulesFired(pack)).toContain('copy-key-exists');
  });

  it('copy-key-exists — a weekly level on the ladder with no outcome copy (§8.3)', () => {
    const pack = minimalPack();
    pack.activities[0]!.constraint = {
      minWeekly: 20,
      maxWeekly: 40,
      stepWeekly: 5,
      weekendAllowed: false,
    };
    for (const weekly of [20, 25, 30, 35]) {
      pack.copy[`s4.school.outcome.${weekly}`] = 'What the programme returns at that pace.';
    }
    expect(rulesFired(pack)).toContain('copy-key-exists');
  });

  it('copy-key-exists — every level on the ladder answered', () => {
    const pack = minimalPack();
    pack.activities[0]!.constraint = {
      minWeekly: 20,
      maxWeekly: 40,
      stepWeekly: 5,
      weekendAllowed: false,
    };
    for (const weekly of [20, 25, 30, 35, 40]) {
      pack.copy[`s4.school.outcome.${weekly}`] = 'What the programme returns at that pace.';
    }
    expect(validatePack(pack)).toEqual([]);
  });

  it('copy-key-exists — fewer than four s3.lines (§9: at least four)', () => {
    const pack = minimalPack();
    delete pack.copy['s3.lines.3'];
    expect(rulesFired(pack)).toContain('copy-key-exists');
  });

  it('media-cap — a third image (§4.5)', () => {
    const pack = minimalPack();
    pack.copy['alt.one'] = 'A photograph';
    pack.screens[0]!.media = [
      { src: 'a.png', alt: 'alt.one', aspect: 1 },
      { src: 'b.png', alt: 'alt.one', aspect: 1 },
      { src: 'c.png', alt: 'alt.one', aspect: 1 },
    ];
    expect(rulesFired(pack)).toContain('media-cap');
  });

  it('media-alt-and-aspect — a missing alt, and a missing aspect', () => {
    const pack = minimalPack();
    pack.copy['alt.one'] = 'A photograph';
    pack.screens[0]!.media = [
      { src: 'a.png', alt: '', aspect: 1 },
      { src: 'b.png', alt: 'alt.one', aspect: 0 },
    ];
    const fired = rulesFired(pack);
    expect(fired).toContain('media-alt-and-aspect');
    expect(fired).not.toContain('media-cap');
  });

  it('one-gate-per-section — a gate that is not its section’s first screen', () => {
    const pack = minimalPack();
    delete pack.screens[1]!.gate;
    pack.screens[2]!.gate = true;
    expect(rulesFired(pack)).toContain('one-gate-per-section');
  });

  it('one-gate-per-section — two gates in one section', () => {
    const pack = minimalPack();
    pack.screens[2]!.gate = true;
    expect(rulesFired(pack)).toContain('one-gate-per-section');
  });

  it('gate-field-on-gate-screen — a gateField that lives on a later screen', () => {
    const pack = minimalPack();
    pack.activities[1]!.gateField = 'beta.minutes.wd';
    expect(rulesFired(pack)).toContain('gate-field-on-gate-screen');
  });

  it('gate-field-required — a gate field that is not required', () => {
    const pack = minimalPack();
    pack.screens[1]!.fields[0]!.required = false;
    expect(rulesFired(pack)).toContain('gate-field-required');
  });

  it('gate-field-required — a gate defaulting to the skipping value', () => {
    const pack = minimalPack();
    pack.screens[1]!.fields[0]!.default = 'no';
    expect(rulesFired(pack)).toContain('gate-field-required');
  });

  it('gated-input-has-default — an estimator reading a gated section without declaring one', () => {
    const pack = minimalPack();
    pack.estimators[0]!.inputs = ['alpha.minutes.wd', 'beta.minutes.wd'];
    expect(rulesFired(pack)).toContain('gated-input-has-default');
  });

  it('gated-input-has-default — satisfied by a declared default', () => {
    const pack = minimalPack();
    pack.estimators[0]!.inputs = ['alpha.minutes.wd', 'beta.minutes.wd'];
    pack.estimators[0]!.defaults = { 'beta.minutes.wd': 0 };
    expect(rulesFired(pack)).not.toContain('gated-input-has-default');
  });

  it('default-in-gated-section — a field behind a gate with no default', () => {
    const pack = minimalPack();
    delete pack.screens[2]!.fields[0]!.default;
    expect(rulesFired(pack)).toContain('default-in-gated-section');
  });

  it('fallback-default — an estimator-backed activity with no fallback hours', () => {
    const pack = minimalPack();
    delete pack.activities[0]!.fallbackHours;
    expect(rulesFired(pack)).toContain('fallback-default');
  });

  it('fallback-default — a fallback declared for only one day type', () => {
    const pack = minimalPack();
    pack.activities[0]!.fallbackHours = { wd: 1 } as never;
    expect(rulesFired(pack)).toContain('fallback-default');
  });

  it('even-hue-ring — a hue off its order index', () => {
    const pack = minimalPack();
    pack.activities[1]!.hue = 200;
    expect(rulesFired(pack)).toContain('even-hue-ring');
  });

  it('even-hue-ring — two activities sharing an order', () => {
    const pack = minimalPack();
    pack.activities[1]!.order = 0;
    pack.activities[1]!.hue = 0;
    expect(rulesFired(pack)).toContain('even-hue-ring');
  });

  it('covers all fourteen rules across this suite', () => {
    // The suite above fires each rule at least once; this asserts the rule set
    // itself has not grown a member nothing tests.
    expect(PACK_RULES).toHaveLength(14);
    expect(new Set(PACK_RULES).size).toBe(14);
  });
});

describe('loader (§4.6 dev vs production)', () => {
  it('throws in dev, listing the issues', () => {
    const pack = minimalPack();
    delete pack.copy['s4.confirm'];
    expect(() => loadPack(pack, { dev: true })).toThrow(PackValidationError);
  });

  it('falls back to the last-good pack in production', () => {
    const good = minimalPack();
    const bad = minimalPack();
    delete bad.copy['s4.confirm'];

    const result = loadPack(bad, { dev: false, lastGood: good });
    expect(result.usedFallback).toBe(true);
    expect(result.pack).toBe(good);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('throws in production when there is no last-good pack to fall back to', () => {
    const bad = minimalPack();
    delete bad.copy['s4.confirm'];
    expect(() => loadPack(bad, { dev: false, lastGood: null })).toThrow(PackValidationError);
  });

  it('rejects a blob that is not a pack at all', () => {
    expect(() => loadPack({ version: 'v1' }, { dev: true })).toThrow(PackValidationError);
  });
});
