// @vitest-environment jsdom

/**
 * §7.9 — the options tab, the two taps to a reset, and the failure that costs
 * the participant nothing.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { minimalPack } from '@/lib/pack/__fixtures__/minimal';
import { Options } from './Options';

const pack = minimalPack();

function renderOptions(onReset: () => Promise<void> = () => Promise.resolve()) {
  return { user: userEvent.setup(), ...render(<Options pack={pack} onReset={onReset} />) };
}

const tab = () => screen.getByTestId('options-tab');

describe('the options tab (§7.9)', () => {
  it('shows nothing but the tab until it is opened', () => {
    renderOptions();
    expect(tab()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('options-overlay')).toBeNull();
    // The label is the pack's, not a hardcoded string (§9).
    expect(tab()).toHaveAttribute('aria-label', 'Options');
  });

  it('opens a menu, and closes again on a second tap', async () => {
    const { user } = renderOptions();

    await user.click(tab());
    expect(screen.getByTestId('options-reset')).toHaveTextContent('Start over');
    expect(tab()).toHaveAttribute('aria-expanded', 'true');

    await user.click(tab());
    expect(screen.queryByTestId('options-overlay')).toBeNull();
  });

  it('closes on the backdrop and on Escape', async () => {
    const { user } = renderOptions();

    await user.click(tab());
    await user.click(screen.getByTestId('options-backdrop'));
    expect(screen.queryByTestId('options-overlay')).toBeNull();

    await user.click(tab());
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('options-overlay')).toBeNull();
  });
});

describe('reset (§5, §7.9)', () => {
  it('does not reset on the first tap — the menu asks first', async () => {
    const onReset = vi.fn(() => Promise.resolve());
    const { user } = renderOptions(onReset);

    await user.click(tab());
    await user.click(screen.getByTestId('options-reset'));

    expect(onReset).not.toHaveBeenCalled();
    expect(screen.getByText('Start over?')).toBeInTheDocument();
    expect(screen.getByTestId('options-confirm')).toBeInTheDocument();
  });

  it('resets on the confirming tap', async () => {
    const onReset = vi.fn(() => Promise.resolve());
    const { user } = renderOptions(onReset);

    await user.click(tab());
    await user.click(screen.getByTestId('options-reset'));
    await user.click(screen.getByTestId('options-confirm'));

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('cancelling leaves the session alone and shuts the panel', async () => {
    const onReset = vi.fn(() => Promise.resolve());
    const { user } = renderOptions(onReset);

    await user.click(tab());
    await user.click(screen.getByTestId('options-reset'));
    await user.click(screen.getByTestId('options-cancel'));

    expect(onReset).not.toHaveBeenCalled();
    expect(screen.queryByTestId('options-overlay')).toBeNull();
  });

  it('reopens at the menu, never at the confirmation', async () => {
    const { user } = renderOptions();

    await user.click(tab());
    await user.click(screen.getByTestId('options-reset'));
    await user.keyboard('{Escape}');
    await user.click(tab());

    expect(screen.getByTestId('options-reset')).toBeInTheDocument();
    expect(screen.queryByTestId('options-confirm')).toBeNull();
  });

  it('surfaces a failure and leaves the confirmation up to try again', async () => {
    const onReset = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(undefined);
    const { user } = renderOptions(onReset);

    await user.click(tab());
    await user.click(screen.getByTestId('options-reset'));
    await user.click(screen.getByTestId('options-confirm'));

    expect(await screen.findByTestId('options-error')).toHaveTextContent(
      'Could not reach the server.',
    );

    // Nothing was destroyed, and the button is live again.
    await user.click(screen.getByTestId('options-confirm'));
    expect(onReset).toHaveBeenCalledTimes(2);
  });
});
