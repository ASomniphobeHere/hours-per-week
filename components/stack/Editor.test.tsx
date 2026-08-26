// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setAnswer } from '@/lib/store/answers';
import { stateKey, type StorageLike } from '@/lib/store/persist';
import type { AnswerMap } from '@/lib/domain/types';
import {
  renderParticipant,
  sessionState,
} from '@/components/participant/__fixtures__/harness';
import { Editor } from './Editor';

/** 25 h on the workday from alpha alone, before beta's half hour (§7.6). */
const BREACHING = setAnswer({}, 'alpha.minutes.wd', 1500);

function renderEditor(
  answers: AnswerMap = {},
  storage?: StorageLike,
  reset?: () => Promise<void>,
) {
  return renderParticipant(<Editor />, {
    state: sessionState({ stage: 's2', answers }),
    storage,
    reset,
  });
}

const hours = (dayType: 'wd' | 'we') => screen.getByTestId(`toggle-hours-${dayType}`);
const workday = () => screen.getByRole('button', { name: /work day/i });
const weekend = () => screen.getByRole('button', { name: /weekend/i });

describe('the day-type toggle (§7.1)', () => {
  it('renders exactly one day type at a time, and the toggle picks which (AC 11)', async () => {
    renderEditor();
    expect(screen.getAllByTestId('stack')).toHaveLength(1);
    expect(screen.getByTestId('stack')).toHaveAttribute('data-daytype', 'wd');

    await userEvent.click(weekend());

    expect(screen.getAllByTestId('stack')).toHaveLength(1);
    expect(screen.getByTestId('stack')).toHaveAttribute('data-daytype', 'we');
  });

  it('defaults to the workday on first entry to S2 (§7.1)', () => {
    renderEditor();
    expect(workday()).toHaveAttribute('aria-pressed', 'true');
    expect(weekend()).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows each day its own occupied hours, whether selected or not (AC 12)', () => {
    renderEditor();
    // alpha 1 h + beta 0.5 h on the workday; alpha 2 h + beta 0.5 h on the weekend.
    expect(hours('wd')).toHaveTextContent('1.5 hr');
    expect(hours('we')).toHaveTextContent('2.5 hr');
  });

  it('keeps both totals live when the other day is the one being read (AC 12)', async () => {
    renderEditor();
    await userEvent.click(weekend());
    expect(hours('wd')).toHaveTextContent('1.5 hr');
    expect(hours('we')).toHaveTextContent('2.5 hr');
  });

  it('marks a breaching day on its segment, selected or not (AC 13)', () => {
    renderEditor(BREACHING);
    // The workday is over; it is also the selected one.
    expect(hours('wd')).toHaveAttribute('data-breach', 'true');
    expect(hours('we')).not.toHaveAttribute('data-breach');
  });

  it('marks the unselected day when it is the one that breaches (AC 13, AC 44)', async () => {
    renderEditor(BREACHING);
    await userEvent.click(weekend());
    // Now nothing on screen is striped, and the red workday total is the only
    // thing carrying the breach.
    expect(screen.getByTestId('stack')).toHaveAttribute('data-daytype', 'we');
    expect(hours('wd')).toHaveAttribute('data-breach', 'true');
  });

  it('states occupied hours and never the excess (AC 42)', () => {
    renderEditor(BREACHING);
    expect(hours('wd')).toHaveTextContent('25.5 hr');
    expect(hours('wd').textContent).not.toMatch(/[+]|over/i);
  });

  it('persists the selection, so a refresh resumes on it (AC 15)', async () => {
    const { storage } = renderEditor();
    await userEvent.click(weekend());
    const stored = storage.getItem(stateKey('sess-test'));
    expect(JSON.parse(stored ?? '{}').dayType).toBe('we');
  });
});

describe('Not included (§7.7)', () => {
  const zeroed = setAnswer({}, 'beta.any', 'no');

  it('is absent entirely when every activity has hours, with no empty-state copy (AC 31)', () => {
    renderEditor();
    expect(screen.queryByTestId('not-included')).not.toBeInTheDocument();
    expect(screen.queryByTestId('not-included-count')).not.toBeInTheDocument();
  });

  it('takes an activity at zero on both day types, which renders no band (AC 28)', () => {
    renderEditor(zeroed);
    expect(screen.getByTestId('stack').querySelector('[data-activity="beta"]')).toBeNull();
    const list = screen.getByTestId('not-included');
    expect(list.querySelector('[data-activity="beta"]')).not.toBeNull();
  });

  it('sits below the stack, past the 24-hour line (AC 29)', () => {
    renderEditor(zeroed);
    const stack = screen.getByTestId('stack');
    const list = screen.getByTestId('not-included');
    expect(stack.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('carries a footer count when it is non-empty (AC 29)', () => {
    renderEditor(zeroed);
    expect(screen.getByTestId('not-included-count')).toHaveTextContent('1 not included');
  });

  it('is inventory, not instrument: label only, no hue, no hours (§7.7)', () => {
    renderEditor(zeroed);
    const row = screen.getByTestId('not-included').querySelector('[data-activity="beta"]');
    expect(row).toHaveTextContent('Beta');
    expect(row?.textContent).not.toMatch(/\d/);
    expect((row as HTMLElement).style.getPropertyValue('--band-hue')).toBe('');
  });

  it('does not distinguish a gated-out section from one answered to zero (§7.7)', () => {
    const answeredToZero = setAnswer(setAnswer({}, 'beta.minutes.wd', 0), 'beta.minutes.we', 0);
    renderEditor(answeredToZero);
    const gatedOut = screen.getByTestId('not-included').textContent;
    screen.getByTestId('not-included').remove();
    renderEditor(zeroed);
    expect(screen.getByTestId('not-included').textContent).toBe(gatedOut);
  });
});

describe('the options tab (§7.9)', () => {
  it('is present in the editor, and shows nothing until it is opened', () => {
    renderEditor();
    expect(screen.getByTestId('options-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('options-overlay')).toBeNull();
  });

  it('takes no space in the chrome §7.2 measures the day against', () => {
    renderEditor();
    // Fixed, so it is out of flow: the header, toggle and footer are the only
    // things between the viewport and `24 × pxPerHour`.
    const tab = screen.getByTestId('options-tab');
    expect(tab.closest('[data-testid="editor-footer"]')).toBeNull();
    expect(tab.parentElement).toBe(screen.getByRole('main'));
  });

  it('reaches the session reset behind its confirmation (§5)', async () => {
    const user = userEvent.setup();
    const reset = vi.fn(() => Promise.resolve());
    renderEditor({}, undefined, reset);

    await user.click(screen.getByTestId('options-tab'));
    await user.click(screen.getByTestId('options-reset'));
    expect(reset).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('options-confirm'));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
