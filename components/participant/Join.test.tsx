// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { minimalPack } from '@/lib/pack/__fixtures__/minimal';
import { ApiError } from '@/lib/session/client';
import { Join } from './Join';
import { Intro } from './Intro';

const pack = minimalPack();

function code() {
  return screen.getByLabelText('Room code');
}

function joinButton() {
  return screen.getByRole('button', { name: 'Join' });
}

describe('the join screen (§6.2.1)', () => {
  it('resolves a four-digit code and nothing else', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn().mockResolvedValue(undefined);
    render(<Join pack={pack} onJoin={onJoin} />);

    expect(joinButton()).toBeDisabled();
    await user.type(code(), '4821');
    expect(joinButton()).toBeEnabled();
    await user.click(joinButton());

    // The participant sends a code. No roomId is asked for, held, or sent —
    // that separation is the only thing protecting the stage flag (§6.2.6).
    expect(onJoin).toHaveBeenCalledWith('4821');
  });

  it('keeps the code to four digits and drops anything else', async () => {
    const user = userEvent.setup();
    render(<Join pack={pack} onJoin={vi.fn()} />);

    await user.type(code(), '4a8-2 1 9 9');
    expect(code()).toHaveValue('4821');
  });

  it('says an unknown code is unknown (§6.1: 404)', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn().mockRejectedValue(new ApiError(404, 'no such room'));
    render(<Join pack={pack} onJoin={onJoin} />);

    await user.type(code(), '1234');
    await user.click(joinButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That code does not match a room.',
    );
  });

  it('does not blame the code for a network failure', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    render(<Join pack={pack} onJoin={onJoin} />);

    await user.type(code(), '1234');
    await user.click(joinButton());

    // Venue wifi dropping is a retry, not a wrong code. Telling forty people
    // their code is bad sends them to the facilitator for nothing.
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
  });

  it('clears the error once the code is edited', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn().mockRejectedValue(new ApiError(404, 'no such room'));
    render(<Join pack={pack} onJoin={onJoin} />);

    await user.type(code(), '1234');
    await user.click(joinButton());
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    // `maxLength` refuses a fifth digit, so correcting the code means
    // clearing it first — which is what a participant given the right code does.
    await user.clear(code());
    await user.type(code(), '4821');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('the intro page (§13)', () => {
  it('states the multitasking rule and nothing else', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(<Intro pack={pack} onContinue={onContinue} />);

    expect(screen.getByText('Each hour belongs to one activity.')).toBeInTheDocument();
    // No mechanism for it, per §13 — one page, one statement, one control.
    expect(screen.getAllByRole('button')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
