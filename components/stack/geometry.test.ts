import { describe, expect, it } from 'vitest';
import {
  LABEL_MAX_PX,
  LABEL_MIN_PX,
  MIN_TAP_PX,
  RULER_HOURS,
  hoursSize,
  labelSize,
  layoutBands,
  pxPerHour,
  showsLabel,
  stackHours,
} from './geometry';

describe('pxPerHour (§7.2)', () => {
  it('divides what is left of the viewport after the chrome by 24', () => {
    // 800 - 56 - 64 - 56 = 624, over 24 hours.
    expect(pxPerHour({ viewportHeight: 800, headerH: 56, toggleH: 64, footerH: 56 })).toBe(26);
  });

  it('gives the stack the whole viewport when there is no chrome', () => {
    expect(pxPerHour({ viewportHeight: 720, headerH: 0, toggleH: 0, footerH: 0 })).toBe(30);
  });

  it('floors at zero rather than producing negative bands mid-resize', () => {
    expect(pxPerHour({ viewportHeight: 100, headerH: 56, toggleH: 64, footerH: 56 })).toBe(0);
  });
});

describe('stackHours (§7.2)', () => {
  it('is 24 while the day fits, so Unallocated has somewhere to go', () => {
    expect(stackHours(19.5)).toBe(24);
  });

  it('is the total once the day breaches, so the stack runs past the viewport', () => {
    expect(stackHours(27.7)).toBe(27.7);
  });
});

describe('type scaling (§7.4, AC 22)', () => {
  it('scales with band height at 0.16', () => {
    expect(labelSize(150)).toBeCloseTo(24);
    expect(hoursSize(150)).toBeCloseTo(24 * 0.72);
  });

  it('clamps at 13 px and 34 px', () => {
    expect(labelSize(10)).toBe(LABEL_MIN_PX);
    expect(labelSize(4000)).toBe(LABEL_MAX_PX);
  });

  it('omits the label block below a 20 px band', () => {
    expect(showsLabel(19.9)).toBe(false);
    expect(showsLabel(20)).toBe(true);
  });
});

describe('layoutBands (§7.2, §7.4)', () => {
  const perHour = 26;
  const container = 24 * perHour;

  it('stacks bands top to bottom in the order given, at hours x pxPerHour', () => {
    const boxes = layoutBands(
      [
        { id: 'sleep', hours: 8 },
        { id: 'work', hours: 8 },
      ],
      perHour,
      container,
    );
    expect(boxes.map((box) => [box.top, box.height])).toEqual([
      [0, 208],
      [208, 208],
    ]);
  });

  it('gives a 0.25 h band a 44 px hit area centred on it (AC 21)', () => {
    // 0.25 h at 26 px/h is a 6.5 px rule. The overlay is seven times that.
    const boxes = layoutBands(
      [
        { id: 'sleep', hours: 8 },
        { id: 'commute', hours: 0.25 },
        { id: 'work', hours: 8 },
      ],
      perHour,
      container,
    );
    const commute = boxes[1]!;
    expect(commute.height).toBeCloseTo(6.5);
    expect(commute.hitHeight).toBe(MIN_TAP_PX);
    // Centred: the overlay's midpoint is the band's midpoint.
    expect(commute.hitTop + commute.hitHeight / 2).toBeCloseTo(commute.top + commute.height / 2);
    expect(commute.labelled).toBe(false);
  });

  it('lets the smaller band win the overlap (§7.4)', () => {
    const boxes = layoutBands(
      [
        { id: 'big', hours: 8 },
        { id: 'thin', hours: 0.25 },
      ],
      perHour,
      container,
    );
    const [big, thin] = boxes as [(typeof boxes)[number], (typeof boxes)[number]];
    // They do overlap — the thin band's overlay reaches back into the big one.
    expect(thin.hitTop).toBeLessThan(big.top + big.height);
    expect(thin.hitZ).toBeGreaterThan(big.hitZ);
  });

  it('clamps an overlay into the container at both ends', () => {
    const boxes = layoutBands(
      [
        { id: 'first', hours: 0.25 },
        { id: 'middle', hours: 23.5 },
        { id: 'last', hours: 0.25 },
      ],
      perHour,
      container,
    );
    expect(boxes[0]!.hitTop).toBe(0);
    expect(boxes[2]!.hitTop + boxes[2]!.hitHeight).toBeCloseTo(container);
  });

  it('leaves a lone band ordered even with nothing to collide with', () => {
    expect(layoutBands([{ id: 'only', hours: 24 }], perHour, container)[0]!.hitZ).toBe(1);
  });
});

describe('the ruler (§7.3, AC 18)', () => {
  it('ticks every three hours from 0 to 24', () => {
    expect([...RULER_HOURS]).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 24]);
  });
});
