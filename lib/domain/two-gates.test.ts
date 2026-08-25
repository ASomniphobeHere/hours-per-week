/**
 * Two independently gated sections in one pack.
 *
 * The v1 pack gates exactly one section (`care`), so every other gate test in
 * this repo runs against a single gate and cannot tell "a gate skips its own
 * section" apart from "a gate skips the section that happens to be last".
 * §4.2.1 rule 2 is a statement about *independence*, and independence needs two.
 */

import { describe, expect, it } from 'vitest';
import { indexPack } from '@/lib/pack';
import { assertValidPack } from '@/lib/pack/loader';
import { buildEstimators } from '@/lib/estimators/registry';
import { minimalPack } from '@/lib/pack/__fixtures__/minimal';
import type { ContentPack } from '@/lib/pack/types';
import { setAnswer } from '@/lib/store/answers';
import { reachableScreens } from './gates';
import { progressOf } from './progress';
import { buildStack } from './stack';
import { derive } from './derive';
import type { AnswerMap } from './types';

/** The fixture, with `alpha` gated too — so both sections carry a gate. */
function twoGatePack(): ContentPack {
  const pack = minimalPack();

  const alpha = pack.activities.find((activity) => activity.id === 'alpha')!;
  alpha.gateField = 'alpha.any';
  alpha.gateSkipValue = 'no';

  pack.screens.unshift({
    id: 'alpha.gate',
    sectionId: 'alpha',
    prompt: 'q.alpha.gate.prompt',
    gate: true,
    fields: [
      {
        id: 'alpha.any',
        label: 'q.alpha.gate.label',
        type: 'choice',
        required: true,
        default: 'yes',
        options: [
          { id: 'yes', label: 'opt.yes' },
          { id: 'no', label: 'opt.no' },
        ],
      },
    ],
  });

  pack.copy['q.alpha.gate.prompt'] = 'Do you do alpha?';
  pack.copy['q.alpha.gate.label'] = 'Alpha';
  return pack;
}

const pack = assertValidPack(twoGatePack());
const index = indexPack(pack);
const estimators = buildEstimators(pack.estimators, index.fieldById);

const ids = (answers: AnswerMap) => reachableScreens(index, answers).map((screen) => screen.id);

describe('two gated sections (§4.2.1 rule 2)', () => {
  it('is a valid pack: a gate per section, each on its own first screen', () => {
    // `one-gate-per-section` and `gate-field-on-gate-screen` both pass, so the
    // shape under test is one a replacement pack could really ship.
    expect(() => assertValidPack(pack)).not.toThrow();
  });

  it('reaches every screen while both gates are unanswered (rule 6)', () => {
    expect(ids({})).toEqual(['alpha.gate', 'alpha.time', 'beta.gate', 'beta.time']);
  });

  it('skips only its own section when one gate closes', () => {
    expect(ids(setAnswer({}, 'alpha.any', 'no'))).toEqual([
      'alpha.gate',
      'beta.gate',
      'beta.time',
    ]);
    expect(ids(setAnswer({}, 'beta.any', 'no'))).toEqual([
      'alpha.gate',
      'alpha.time',
      'beta.gate',
    ]);
  });

  it('leaves both gate screens standing when both close', () => {
    let answers = setAnswer({}, 'alpha.any', 'no');
    answers = setAnswer(answers, 'beta.any', 'no');
    // Otherwise neither could be re-answered, and the round trip would be
    // one-way.
    expect(ids(answers)).toEqual(['alpha.gate', 'beta.gate']);
    expect(progressOf(index, answers, 'beta.gate')).toEqual({ current: 2, total: 2 });
  });

  it('round-trips both sections out and back in without losing an answer (AC 7)', () => {
    let answers = setAnswer({}, 'alpha.minutes.wd', 90);
    answers = setAnswer(answers, 'beta.minutes.wd', 45);

    answers = setAnswer(answers, 'alpha.any', 'no');
    answers = setAnswer(answers, 'beta.any', 'no');
    expect(ids(answers)).toHaveLength(2);

    answers = setAnswer(answers, 'alpha.any', 'yes');
    answers = setAnswer(answers, 'beta.any', 'yes');
    expect(ids(answers)).toHaveLength(4);

    expect(answers['alpha.minutes.wd']?.value).toBe(90);
    expect(answers['beta.minutes.wd']?.value).toBe(45);
  });

  it('puts both gated-out sections in Not included, and neither back early', () => {
    let answers = setAnswer({}, 'alpha.any', 'no');
    answers = setAnswer(answers, 'beta.any', 'no');

    const closed = buildStack(derive({ index, answers, estimators }).activities);
    // §11: every activity zeroed is a valid state — the stack is empty and
    // everything is inventory.
    expect(closed.bands).toEqual([]);
    expect(closed.notIncluded.map((activity) => activity.id)).toEqual(['alpha', 'beta']);

    const reopened = buildStack(
      derive({ index, answers: setAnswer(answers, 'alpha.any', 'yes'), estimators }).activities,
    );
    expect(reopened.bands.map((activity) => activity.id)).toEqual(['alpha']);
    expect(reopened.notIncluded.map((activity) => activity.id)).toEqual(['beta']);
  });
});
