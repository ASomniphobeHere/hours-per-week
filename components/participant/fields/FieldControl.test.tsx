// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ContentPack, Field } from '@/lib/pack/types';
import { minimalPack } from '@/lib/pack/__fixtures__/minimal';
import { FieldControl } from './FieldControl';

const pack: ContentPack = minimalPack();
pack.copy['q.test'] = 'How long';
pack.copy['q.wake'] = 'Wake time';
pack.copy['q.pick'] = 'Pick some';
pack.copy['opt.a'] = 'A';
pack.copy['opt.b'] = 'B';

function renderField(field: Field, answer?: unknown) {
  const onChange = vi.fn();
  render(<FieldControl pack={pack} field={field} answer={answer} onChange={onChange} />);
  return onChange;
}

describe('§4.2 field types', () => {
  it('steps a duration by the pack step and shows the pack unit', async () => {
    const user = userEvent.setup();
    const onChange = renderField({
      id: 'a.minutes',
      label: 'q.test',
      type: 'duration',
      unit: 'minutes',
      min: 0,
      max: 240,
      step: 15,
      required: true,
      default: 30,
    });

    expect(screen.getByRole('status')).toHaveTextContent('30min');
    await user.click(screen.getByLabelText('Increase'));
    expect(onChange).toHaveBeenCalledWith(45);
  });

  it('disables a stepper control at the pack bound rather than refusing silently', async () => {
    const user = userEvent.setup();
    const onChange = renderField(
      {
        id: 'a.count',
        label: 'q.test',
        type: 'count',
        unit: 'times',
        min: 0,
        max: 3,
        step: 1,
        required: true,
        default: 0,
      },
      0,
    );

    expect(screen.getByLabelText('Decrease')).toBeDisabled();
    await user.click(screen.getByLabelText('Increase'));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('writes a clock answer as HH:MM, the shape the estimator parses', () => {
    const onChange = renderField({
      id: 'a.wake',
      label: 'q.wake',
      type: 'clock',
      unit: 'clock',
      required: true,
      default: '07:00',
    });

    // The group carries the same accessible name as the control inside it, so
    // the lookup is scoped to the group rather than run across the document.
    const input = within(screen.getByRole('group', { name: 'Wake time' })).getByLabelText(
      'Wake time',
    );
    expect(input).toHaveValue('07:00');
    // Set rather than typed: the input is controlled by the answer prop, and
    // with onChange stubbed it never advances, so typing segment by segment
    // would assert the stub rather than the write.
    fireEvent.change(input, { target: { value: '06:30' } });
    expect(onChange).toHaveBeenLastCalledWith('06:30');
  });

  it('lets a choice hold exactly one value', async () => {
    const user = userEvent.setup();
    const onChange = renderField({
      id: 'a.pick',
      label: 'q.pick',
      type: 'choice',
      required: true,
      default: 'a',
      options: [
        { id: 'a', label: 'opt.a' },
        { id: 'b', label: 'opt.b' },
      ],
    });

    expect(screen.getByRole('radio', { name: 'A' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('accumulates and removes values on a multichoice', async () => {
    const user = userEvent.setup();
    const field: Field = {
      id: 'a.many',
      label: 'q.pick',
      type: 'multichoice',
      required: true,
      options: [
        { id: 'a', label: 'opt.a' },
        { id: 'b', label: 'opt.b' },
      ],
    };

    const onChange = renderField(field, ['a']);
    expect(screen.getByRole('checkbox', { name: 'A' })).toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith(['a', 'b']);

    await user.click(screen.getByRole('checkbox', { name: 'A' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('names the whole field, not just one control inside it', () => {
    renderField({
      id: 'a.minutes',
      label: 'q.test',
      type: 'duration',
      unit: 'minutes',
      required: true,
      default: 30,
    });

    // A stepper is two buttons and a readout with nothing labelable between
    // them; "On a workday" has to name the group or it names nothing.
    expect(screen.getByRole('group', { name: 'How long' })).toBeInTheDocument();
  });
});
