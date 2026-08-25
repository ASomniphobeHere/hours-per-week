// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { indexPack } from '@/lib/pack';
import { minimalPack } from '@/lib/pack/__fixtures__/minimal';
import { buildEstimators } from '@/lib/estimators/registry';
import { derive } from '@/lib/domain/derive';
import { setAnswer } from '@/lib/store/answers';
import type { AnswerMap } from '@/lib/domain/types';
import { StackSummary } from './StackSummary';

const pack = minimalPack();
const index = indexPack(pack);
const estimators = buildEstimators(pack.estimators, index.fieldById);

function renderStack(answers: AnswerMap) {
  const { activities } = derive({ index, answers, estimators });
  return render(<StackSummary pack={pack} activities={activities} />);
}

function bandIds() {
  return [...screen.getByTestId('stack').children].map((band) =>
    band.getAttribute('data-activity'),
  );
}

describe('the stack generated at the end of S1 (AC 9, AC 10)', () => {
  it('renders one band per non-zero activity, in pack order (AC 9)', () => {
    renderStack({});
    expect(bandIds()).toEqual(['alpha', 'beta']);
  });

  it('gives a wholly unanswered section a band from its field defaults (AC 10)', () => {
    renderStack({});

    // Nothing was answered at all, and neither section fell out of the stack —
    // this is §4.6's default rule paying off, and what makes §4.2.1 rule 6's
    // promise of a full stack honest.
    const alpha = within(screen.getByTestId('stack')).getByText('Alpha').closest('div');
    expect(alpha).toHaveTextContent('1 h');
    expect(screen.queryByTestId('not-included')).not.toBeInTheDocument();
  });

  it('moves a zero-hour activity into Not included (AC 9)', () => {
    renderStack(setAnswer({}, 'beta.any', 'no'));

    expect(bandIds()).toEqual(['alpha']);
    const list = within(screen.getByTestId('not-included'));
    expect(list.getByText('Not included')).toBeInTheDocument();
    expect(list.getByText('Beta')).toBeInTheDocument();
    // No hue, no spine, no hour count — the list is inventory (§7.7).
    expect(screen.getByTestId('not-included').textContent).not.toMatch(/\d/);
  });

  it('shows no Not included section when every activity has hours (§7.7)', () => {
    renderStack({});
    // Absent entirely when empty, with no empty-state copy.
    expect(screen.queryByTestId('not-included')).not.toBeInTheDocument();
  });

  it('carries each band its pack hue (§7.5)', () => {
    renderStack({});
    const [alpha, beta] = [...screen.getByTestId('stack').children] as HTMLElement[];
    expect(alpha?.style.getPropertyValue('--band-hue')).toBe('0deg');
    expect(beta?.style.getPropertyValue('--band-hue')).toBe('180deg');
  });
});
