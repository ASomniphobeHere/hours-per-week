/**
 * Step 4.4's legibility check, run here rather than deferred to the acceptance
 * sweep — AC 19.
 *
 * RD-1 struck §7.3's translucent scrim and left the tick numbers standing alone
 * against ten arbitrary hues at full saturation. §7.3's own reasoning was that
 * no single colour holds contrast against all of them, and it traded that
 * guarantee for the cleaner mark, carrying the risk on the tick colour instead:
 *
 *   > Legibility against every hue at full saturation is a build check
 *   > (§12 AC 19), not an assumption.
 *
 * This is that check, as an assertion rather than a look, so the ring and the
 * tick colour cannot drift apart later without a red test.
 *
 * Nothing here restates a colour. The spine's `background` is read out of
 * `stack.module.css`, its `var()`s resolved against `styles/tokens.css`, and
 * its hue filled from the shipped pack — so this measures what the browser
 * paints, and a change to the ring's colour model has nowhere to hide.
 *
 * The threshold is WCAG 2.1 AA for normal text, 4.5:1. The tick numbers are
 * small, so the large-text allowance does not apply.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { v1Index } from '@/lib/pack/v1';

const CONTRAST_FLOOR = 4.5;

const tokensCss = readFileSync(new URL('../../styles/tokens.css', import.meta.url), 'utf8');
const stackCss = readFileSync(new URL('./stack.module.css', import.meta.url), 'utf8');

/* ── Reading the two stylesheets ─────────────────────────────────────────── */

function customProperties(css: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match as unknown as [string, string, string];
    found[name] = value.trim();
  }
  return found;
}

/** The declared value of one property inside one rule, e.g. `.spine`/`background`. */
function declaration(css: string, selector: string, property: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} rule in stack.module.css`);
  const end = css.indexOf('}', start);
  const body = css.slice(start, end);
  const declared = body
    .split(';')
    .map((line) => line.trim())
    .find((line) => line.startsWith(`${property}:`));
  if (declared === undefined) throw new Error(`no ${property} on ${selector}`);
  return declared.slice(property.length + 1).trim();
}

function resolveVars(expression: string, vars: Record<string, string>): string {
  let out = expression;
  for (let pass = 0; pass < 20 && out.includes('var('); pass += 1) {
    out = out.replace(
      /var\(\s*(--[\w-]+)\s*(?:,([^()]*))?\)/g,
      (_match, name: string, fallback: string | undefined) => vars[name] ?? (fallback ?? '').trim(),
    );
  }
  if (out.includes('var(')) throw new Error(`unresolved custom property in "${expression}"`);
  return out.trim();
}

/* ── Colour, far enough to compute a luminance ───────────────────────────── */

type Rgb = [number, number, number];

function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function oklchLinear(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** Linear-light channel back to an sRGB 0–1 value. */
function toSrgb(v: number): number {
  const clamped = Math.min(1, Math.max(0, v));
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function oklchToRgb(l: number, c: number, hue: number): Rgb {
  if (inGamut(oklchLinear(l, c, hue))) return oklchLinear(l, c, hue).map(toSrgb) as Rgb;
  // Browsers gamut-map an out-of-range oklch by reducing chroma at constant
  // lightness. Doing the same keeps this honest about what reaches the screen.
  let lo = 0;
  let hi = c;
  for (let pass = 0; pass < 40; pass += 1) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchLinear(l, mid, hue))) lo = mid;
    else hi = mid;
  }
  return oklchLinear(l, lo, hue).map(toSrgb) as Rgb;
}

const asNumber = (raw: string) => Number.parseFloat(raw);
const asFraction = (raw: string) => (raw.endsWith('%') ? asNumber(raw) / 100 : asNumber(raw));

/** The subset of CSS colour the editor uses. Anything else is a loud failure. */
function parseColor(css: string): Rgb {
  const hex = css.match(/^#([0-9a-f]{6})$/i);
  if (hex !== null) {
    const n = Number.parseInt(hex[1] ?? '', 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const parts = css.match(/^(hsl|oklch)\(([^/)]+)(?:\/[^)]*)?\)$/i);
  if (parts !== null) {
    const [fn, args] = [parts[1] ?? '', parts[2] ?? ''];
    const [a, b, c] = args.trim().split(/\s+/) as [string, string, string];
    if (fn.toLowerCase() === 'hsl') return hslToRgb(asNumber(a), asFraction(b), asFraction(c));
    return oklchToRgb(asFraction(a), asNumber(b), asNumber(c));
  }
  throw new Error(`unsupported colour "${css}"`);
}

function relativeLuminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  ) as Rgb;
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/* ── The check ───────────────────────────────────────────────────────────── */

const tokens = customProperties(tokensCss);
const spineExpression = declaration(stackCss, '.spine', 'background');
const tickExpression = declaration(stackCss, '.tickNumber', 'color');

/**
 * The spine is the band's hue at full saturation (§7.3) — the hardest
 * background the tick has to sit on. The 12% body is very nearly the page.
 */
function spineAt(hue: number): Rgb {
  return parseColor(resolveVars(spineExpression, { ...tokens, '--band-hue': `${hue}deg` }));
}

describe('tick legibility against the hue ring (AC 19, RD-1)', () => {
  const activities = v1Index().pack.activities;
  const hues = activities.map((activity) => activity.hue);
  const tickColor = resolveVars(tickExpression, tokens);
  const tick = parseColor(tickColor);

  it('reads a hue for every activity in the ring', () => {
    expect(hues).toHaveLength(activities.length);
    expect(hues.length).toBeGreaterThan(1);
  });

  it.each(hues)('is legible over the spine at hue %i', (hue) => {
    const ratio = contrast(tick, spineAt(hue));
    expect(
      ratio,
      `tick ${tickColor} on hue ${hue} at full saturation is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
  });
});
