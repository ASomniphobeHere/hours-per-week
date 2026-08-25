// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { load, memoryStorage, restore } from '@/lib/store/persist';
import { fieldIds } from '@/lib/pack';
import { minimalPack } from '@/lib/pack/__fixtures__/minimal';
import { Questionnaire } from './Questionnaire';
import { renderParticipant } from './__fixtures__/harness';

const pack = minimalPack();
const identity = { version: pack.version, fieldIds: fieldIds(pack) };

/** Scopes a query to one field's group, named by its label copy. */
function field(name: string) {
  return within(screen.getByRole('group', { name }));
}

function next() {
  return screen.getByRole('button', { name: 'Next' });
}

describe('S1 screen renderer (§4.2)', () => {
  it('renders screens in pack order, one at a time (AC 1)', async () => {
    const user = userEvent.setup();
    renderParticipant(<Questionnaire onComplete={vi.fn()} />);

    expect(screen.getByRole('heading')).toHaveTextContent('How long does alpha take?');
    await user.click(next());
    expect(screen.getByRole('heading')).toHaveTextContent('Do you do beta?');
    await user.click(next());
    expect(screen.getByRole('heading')).toHaveTextContent('How long does beta take?');
  });

  it('captures two day-scoped fields on one screen independently (AC 2)', async () => {
    const user = userEvent.setup();
    const { storage } = renderParticipant(<Questionnaire onComplete={vi.fn()} />);

    // Defaults are 60 min on a workday and 120 on a weekend day.
    await user.click(field('On a workday').getByLabelText('Increase'));

    expect(field('On a workday').getByRole('status')).toHaveTextContent('61');
    expect(field('On a weekend day').getByRole('status')).toHaveTextContent('120');

    const stored = load(storage)?.answers;
    expect(stored?.['alpha.minutes.wd']?.value).toBe(61);
    // The weekend field was never touched, so it holds no answer at all — two
    // keys, no shared state.
    expect(stored?.['alpha.minutes.we']).toBeUndefined();
  });

  it('writes every field change through to storage (AC 6, §5)', async () => {
    const user = userEvent.setup();
    const { storage } = renderParticipant(<Questionnaire onComplete={vi.fn()} />);

    await user.click(field('On a workday').getByLabelText('Increase'));
    await user.click(field('On a workday').getByLabelText('Increase'));

    expect(load(storage)?.answers['alpha.minutes.wd']?.value).toBe(62);
    // `revision` counts writes — it separates field.answer from field.revise
    // in telemetry (§10).
    expect(load(storage)?.answers['alpha.minutes.wd']?.revision).toBe(2);
  });

  it('resumes in place after a refresh (AC 6, §11)', async () => {
    const user = userEvent.setup();
    const storage = memoryStorage();
    const first = renderParticipant(<Questionnaire onComplete={vi.fn()} />, { storage });

    await user.click(field('On a workday').getByLabelText('Increase'));
    await user.click(next());
    expect(screen.getByRole('heading')).toHaveTextContent('Do you do beta?');
    first.unmount();

    // A refresh: the record is read back off storage and nothing else is known.
    const restored = restore(storage, identity);
    expect(restored).not.toBeNull();
    renderParticipant(<Questionnaire onComplete={vi.fn()} />, {
      state: restored?.state,
      storage,
    });

    expect(screen.getByRole('heading')).toHaveTextContent('Do you do beta?');
    expect(load(storage)?.answers['alpha.minutes.wd']?.value).toBe(61);
  });

  it('commits the pack default for a field the participant left alone', async () => {
    const user = userEvent.setup();
    const { storage } = renderParticipant(<Questionnaire onComplete={vi.fn()} />);

    await user.click(next());

    // Agreeing with what is on screen is an answer: without this the §2.2
    // advance condition "all screens answered" could never be met by
    // agreement, and §5's resume would send the participant back to screen one.
    expect(load(storage)?.answers['alpha.minutes.wd']?.value).toBe(60);
    expect(load(storage)?.answers['alpha.minutes.we']?.value).toBe(120);
  });

  it('calls onComplete from the last reachable screen (step 3.5)', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    renderParticipant(<Questionnaire onComplete={onComplete} />);

    await user.click(next());
    await user.click(next());
    expect(onComplete).not.toHaveBeenCalled();
    await user.click(next());
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('S1 gates (§4.2.1)', () => {
  it('skips the rest of the gated section and no other (AC 1)', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    renderParticipant(<Questionnaire onComplete={onComplete} />);

    await user.click(next());
    await user.click(screen.getByRole('radio', { name: 'No' }));
    await user.click(next());

    // beta.time is gone, so the gate screen was the last one. alpha, in
    // another section, was untouched by the gate.
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('preserves the section other answers across a falsy/truthy flip (AC 7)', async () => {
    const user = userEvent.setup();
    const { storage } = renderParticipant(<Questionnaire onComplete={vi.fn()} />);

    // Answer inside the gated section first.
    await user.click(next());
    await user.click(next());
    await user.click(field('On a workday').getByLabelText('Increase'));
    expect(load(storage)?.answers['beta.minutes.wd']?.value).toBe(31);

    // Gate it out, then back in. Nothing is cleared on the way through.
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('radio', { name: 'No' }));
    expect(load(storage)?.answers['beta.minutes.wd']?.value).toBe(31);
    await user.click(screen.getByRole('radio', { name: 'Yes' }));

    await user.click(next());
    expect(screen.getByRole('heading')).toHaveTextContent('How long does beta take?');
    expect(field('On a workday').getByRole('status')).toHaveTextContent('31');
  });

  it('recomputes progress over reachable screens when a gate changes (AC 8)', async () => {
    const user = userEvent.setup();
    renderParticipant(<Questionnaire onComplete={vi.fn()} />);

    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    await user.click(next());
    expect(screen.getByText('2 of 3')).toBeInTheDocument();

    // The total drops — honest, and preferred over a bar that lies to stay
    // monotonic (§4.2.1).
    await user.click(screen.getByRole('radio', { name: 'No' }));
    expect(screen.getByText('2 of 2')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Yes' }));
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
  });
});
