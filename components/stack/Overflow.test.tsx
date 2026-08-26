// @vitest-environment jsdom

/**
 * §7.6 — the rim and the stripes (AC 41, AC 42).
 *
 * The two things worth pinning down are geometric and one is negative. The rim
 * sits at `24 × pxPerHour` and looks the same whatever the day sums to; the
 * stripes are one element starting at the rim, so a band straddling the line is
 * covered on its lower portion and nowhere else. And the whole layer states no
 * number — the excess appears in the client exactly nowhere (§7.6), and the
 * toggle's occupied-hours figure is the sole numeric signal.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HOURS_PER_DAY } from '@/lib/domain/types';
import { Overflow } from './Overflow';

const PER_HOUR = 20;
const RIM_TOP = `${HOURS_PER_DAY * PER_HOUR}px`;

function mount(total: number) {
  return render(<Overflow perHour={PER_HOUR} total={total} />);
}

const rim = () => screen.getByTestId('overflow-rim');
const stripes = () => screen.queryByTestId('overflow-stripes');

describe('the 24-hour rim (AC 41)', () => {
  it('sits at 24 × pxPerHour', () => {
    mount(20);
    expect(rim().style.top).toBe(RIM_TOP);
  });

  it('has one appearance, breaching or not — same class, same position', () => {
    const fitting = mount(18);
    const before = { className: rim().className, top: rim().style.top };
    fitting.unmount();

    mount(27.7);
    expect(rim().className).toBe(before.className);
    expect(rim().style.top).toBe(before.top);
  });

  it('is there before the breach: it is the edge of the day, not a warning', () => {
    mount(9);
    expect(rim()).toBeInTheDocument();
  });
});

describe('the stripes (AC 41)', () => {
  it('are absent while the day fits', () => {
    mount(HOURS_PER_DAY);
    expect(stripes()).toBeNull();
  });

  it('start at the rim, so only what runs past 24 h is covered', () => {
    mount(27.7);
    expect(stripes()?.style.top).toBe(RIM_TOP);
  });

  it('are one element however many bands cross the line', () => {
    mount(40);
    expect(screen.getAllByTestId('overflow-stripes')).toHaveLength(1);
  });
});

describe('silence (AC 42)', () => {
  it('states no number anywhere — not the total, not the excess', () => {
    const { container } = mount(27.7);
    expect(container.textContent).toBe('');
  });

  it('is inert to the pointer, so it cannot swallow a band tap', () => {
    mount(27.7);
    for (const element of [rim(), stripes()!]) {
      expect(element).toHaveAttribute('aria-hidden', 'true');
    }
  });
});
