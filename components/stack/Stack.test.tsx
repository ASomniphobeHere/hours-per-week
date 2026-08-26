// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { indexPack } from '@/lib/pack';
import { minimalPack } from '@/lib/pack/__fixtures__/minimal';
import { buildEstimators } from '@/lib/estimators/registry';
import { derive } from '@/lib/domain/derive';
import { buildStack } from '@/lib/domain/stack';
import { setAnswer } from '@/lib/store/answers';
import type { AnswerMap, DayType } from '@/lib/domain/types';
import { LABEL_MAX_PX, LABEL_MIN_PX, RULER_HOURS } from './geometry';
import { Stack } from './Stack';

const pack = minimalPack();
const index = indexPack(pack);
const estimators = buildEstimators(pack.estimators, index.fieldById);

/** 32 px/h — a 768 px stack, which is what a phone gives once chrome is off it. */
const PER_HOUR = 32;

function renderStack(answers: AnswerMap = {}, dayType: DayType = 'wd', onSelect?: () => void) {
  const { activities } = derive({ index, answers, estimators });
  const { bands } = buildStack(activities);
  return render(
    <Stack
      pack={pack}
      bands={bands}
      dayType={dayType}
      perHour={PER_HOUR}
      onSelect={onSelect}
    />,
  );
}

function band(id: string): HTMLElement {
  const element = screen.getByTestId('stack').querySelector(`[data-activity="${id}"]`);
  if (element === null) throw new Error(`no band for "${id}"`);
  return element as HTMLElement;
}

function px(element: HTMLElement, property: 'top' | 'height'): number {
  return Number.parseFloat(element.style[property]);
}

describe('the stack (§7.2, §7.3)', () => {
  it('renders one band per non-zero activity in pack order (AC 9)', () => {
    renderStack();
    const ids = [...screen.getByTestId('stack').querySelectorAll('[data-activity]')].map((node) =>
      node.getAttribute('data-activity'),
    );
    expect(ids).toEqual(['alpha', 'beta']);
  });

  it('gives a wholly unanswered section a band from its field defaults (AC 10)', () => {
    // Nothing answered at all, and neither section fell out of the stack — this
    // is §4.6's default rule paying off, and what makes §4.2.1 rule 6's promise
    // of a full stack honest.
    renderStack();
    expect(band('alpha')).toHaveTextContent('1 h');
  });

  it('stacks bands top to bottom at hours x pxPerHour (§7.2)', () => {
    renderStack();
    // alpha 60 min = 1 h, beta 30 min = 0.5 h.
    expect([px(band('alpha'), 'top'), px(band('alpha'), 'height')]).toEqual([0, 32]);
    expect([px(band('beta'), 'top'), px(band('beta'), 'height')]).toEqual([32, 16]);
  });

  it('gives the container max(24, total) hours, so a fitting day fills a screen', () => {
    renderStack();
    expect(px(screen.getByTestId('stack'), 'height')).toBe(24 * PER_HOUR);
  });

  it('extends past the viewport once the day breaches (§7.2)', () => {
    // 1500 minutes is 25 h on its own, before beta's half hour.
    renderStack(setAnswer({}, 'alpha.minutes.wd', 1500));
    expect(px(screen.getByTestId('stack'), 'height')).toBe(25.5 * PER_HOUR);
  });

  it('carries each band its pack hue (§7.5)', () => {
    renderStack();
    expect(band('alpha').style.getPropertyValue('--band-hue')).toBe('0deg');
    expect(band('beta').style.getPropertyValue('--band-hue')).toBe('180deg');
  });

  it('renders no band on a day type an activity has no hours on (§7.7)', () => {
    // beta's estimator reads only its own two fields, so zeroing the workday one
    // leaves it in the stack with a weekend band and no workday band.
    const answers = setAnswer({}, 'beta.minutes.wd', 0);
    renderStack(answers, 'wd');
    expect(screen.getByTestId('stack').querySelector('[data-activity="beta"]')).toBeNull();
  });
});

describe('type scaling (§7.4, AC 22)', () => {
  it('scales the label with band height, within the clamp', () => {
    renderStack();
    const size = Number.parseFloat(band('alpha').style.getPropertyValue('--label-size'));
    expect(size).toBeGreaterThanOrEqual(LABEL_MIN_PX);
    expect(size).toBeLessThanOrEqual(LABEL_MAX_PX);
  });

  it('omits the label block below a 20 px band', () => {
    renderStack();
    // beta is half an hour: 16 px at this scale, visually a rule.
    expect(band('beta').textContent).toBe('');
    expect(band('alpha').textContent).not.toBe('');
  });
});

describe('tap targets (§7.4, AC 21)', () => {
  it('covers each band with a hit area of exactly its own height', () => {
    renderStack();
    const hits = [...screen.getByTestId('stack').querySelectorAll('[data-hit]')] as HTMLElement[];
    expect(hits).toHaveLength(2);
    for (const hit of hits) {
      const owner = band(hit.getAttribute('data-hit')!);
      expect(px(hit, 'height')).toBeCloseTo(px(owner, 'height'));
      expect(px(hit, 'top')).toBeCloseTo(px(owner, 'top'));
    }
  });

  it('keeps the overlays clear of one another', () => {
    renderStack();
    const hits = [...screen.getByTestId('stack').querySelectorAll('[data-hit]')] as HTMLElement[];
    // beta is the half-hour band; alpha is the hour above it.
    expect(px(hits[1]!, 'top')).toBeGreaterThanOrEqual(px(hits[0]!, 'top') + px(hits[0]!, 'height'));
  });

  it('opens the band it belongs to', async () => {
    const onSelect = vi.fn();
    renderStack({}, 'wd', onSelect);
    await userEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(onSelect).toHaveBeenCalledWith('beta');
  });
});

describe('the ruler (§7.3, AC 18)', () => {
  it('is one continuous scale over the container, not one per band', () => {
    renderStack();
    const ruler = screen.getByTestId('ruler');
    expect(ruler.parentElement).toBe(screen.getByTestId('stack'));
    expect(ruler.children).toHaveLength(RULER_HOURS.length);
  });

  it('puts every tick at its hour', () => {
    renderStack();
    const tops = [...screen.getByTestId('ruler').children].map((tick) =>
      Number.parseFloat((tick as HTMLElement).style.top),
    );
    expect(tops).toEqual(RULER_HOURS.map((hour) => hour * PER_HOUR));
  });

  it('states nothing between the spine and the tick (RD-1)', () => {
    renderStack();
    // A hairline rule and a number. Anything else in a tick is the plate coming
    // back by another name.
    for (const tick of screen.getByTestId('ruler').children) {
      expect(tick.children).toHaveLength(2);
    }
  });
});

describe('Unallocated (§7.8)', () => {
  it('is the bottom band, filling what is left of the day', () => {
    renderStack();
    const unallocated = screen.getByTestId('unallocated');
    // alpha 1 h + beta 0.5 h leaves 22.5.
    expect(px(unallocated, 'top')).toBe(1.5 * PER_HOUR);
    expect(px(unallocated, 'height')).toBe(22.5 * PER_HOUR);
  });

  it('is absent entirely once the day is full', () => {
    renderStack(setAnswer({}, 'alpha.minutes.wd', 1500));
    expect(screen.queryByTestId('unallocated')).not.toBeInTheDocument();
  });

  it('has no tap target of its own', () => {
    renderStack();
    expect(screen.getByTestId('unallocated').querySelector('button')).toBeNull();
  });

  it('drops its label when the slack is a sliver (§7.4)', () => {
    // 1404 minutes is 23.4 h; with beta's half hour that leaves six minutes of
    // the day unspent — a three-pixel rule with no room for a word.
    renderStack(setAnswer({}, 'alpha.minutes.wd', 1404));
    expect(screen.getByTestId('unallocated').textContent).toBe('');
  });
});
