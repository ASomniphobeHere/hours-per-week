// @vitest-environment jsdom

/**
 * The S3 line cycle (§6.3, §9).
 *
 * What is asserted here is a cadence, so the clock is faked and advanced in
 * exact steps: a test that let the timers run would take forty seconds to
 * watch four lines and would still not prove *when* each dot arrived.
 *
 * Each phase gets its own `tick`. React flushes effects when `act` settles, so
 * the timer for the next phase is armed only once the current advance has
 * returned — one long advance across three dots fires the first timer and then
 * finds nothing else to run. Stepping phase by phase is also what keeps the
 * fake clock aligned with the real one: an advance that overshot a phase
 * boundary would arm the next timer late and drift the whole cycle.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { minimalPack } from '@/lib/pack/__fixtures__/minimal';
import { Hold, HOLD_DOTS, HOLD_DOT_MS, HOLD_PAUSE_MS, HOLD_SWAP_MS } from './Hold';

function tick(ms: number): Promise<void> {
  return act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** One line, start to replaced: three dots, the pause, and the swap. */
async function wholeLine(): Promise<void> {
  for (let dot = 0; dot < HOLD_DOTS; dot += 1) await tick(HOLD_DOT_MS);
  await tick(HOLD_PAUSE_MS);
  await tick(HOLD_SWAP_MS);
}

const line = () => screen.getByTestId('hold-line');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the S3 hold line', () => {
  it('opens on the first line with no ellipsis', () => {
    render(<Hold pack={minimalPack()} />);
    expect(line()).toHaveTextContent(/^One$/);
  });

  it('grows a dot every two seconds, to three', async () => {
    render(<Hold pack={minimalPack()} />);

    await tick(HOLD_DOT_MS - 1);
    expect(line()).toHaveTextContent(/^One$/);

    await tick(1);
    expect(line()).toHaveTextContent(/^One\.$/);

    await tick(HOLD_DOT_MS);
    expect(line()).toHaveTextContent(/^One\.\.$/);

    await tick(HOLD_DOT_MS);
    expect(line()).toHaveTextContent(/^One\.\.\.$/);
  });

  it('holds the complete ellipsis for three seconds before swapping', async () => {
    render(<Hold pack={minimalPack()} />);

    for (let dot = 0; dot < HOLD_DOTS; dot += 1) await tick(HOLD_DOT_MS);
    expect(line()).toHaveTextContent(/^One\.\.\.$/);

    // A fourth dot never arrives, however long the pause runs.
    await tick(HOLD_PAUSE_MS - 1);
    expect(line()).toHaveTextContent(/^One\.\.\.$/);

    // The swap animates out before the text is replaced.
    await tick(1);
    expect(line()).toHaveTextContent(/^One\.\.\.$/);
    expect(line().className).toMatch(/holdLineLeaving/);

    await tick(HOLD_SWAP_MS);
    expect(line()).toHaveTextContent(/^Two$/);
    expect(line().className).not.toMatch(/holdLineLeaving/);
  });

  it('works through the pack in order and comes back round', async () => {
    render(<Hold pack={minimalPack()} />);

    for (const text of ['Two', 'Three', 'Four', 'One']) {
      await wholeLine();
      expect(line()).toHaveTextContent(new RegExp(`^${text}$`));
    }
  });

  it('fills the ellipsis and stops on a one-line pack', async () => {
    const single = minimalPack();
    for (let i = 1; i < 4; i += 1) delete single.copy[`s3.lines.${i}`];

    render(<Hold pack={single} />);
    await wholeLine();
    await wholeLine();

    // No swap to animate, so the line simply sits there complete.
    expect(line()).toHaveTextContent(/^One\.\.\.$/);
    expect(line().className).not.toMatch(/holdLineLeaving/);
  });
});
