/**
 * Item E1, Minor, 9 points.
 *
 *   "All colour, spacing, radius, type and motion values come from design
 *    tokens on the scales in the design contract. No literal value appears
 *    in component code."
 *
 * E1 is an **Inspection** item and its final verdict is a reviewer's. This file
 * does not decide it. What it removes is the part of that inspection a person should never be asked to
 * do by eye: comparing three files of hexes against a fourth.
 *
 * There are three copies of the palette in this repository and only one source.
 * `tests/reference/design-contract.md` is the source; `src/ui/tokens.css` and
 * `src/render/tokens.ts` are the two forms the code can use, because a canvas
 * context cannot take a `var()`. The tests below fail if any of the three
 * disagrees with the spec, and they re-derive all 35 committed contrast ratios
 * from the hexes themselves.
 *
 * That last part is the point. The instruction on this part was that no colour
 * may be invented, adjusted or improved, because every ratio in section 16 is
 * measured and a changed hex breaks G2 and E4 downstream without anything
 * going red in between. Now something goes red in between.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  BORDER,
  CHIP_DENOMINATIONS,
  CHIP_FILL,
  CHIP_GLYPH,
  CHIP_RING,
  DURATION,
  EASE,
  FELT,
  RADIUS,
  SPACE,
  SURFACE,
  duration,
} from '../../src/render/tokens';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CSS = readFileSync(join(PROJECT_ROOT, 'src', 'ui', 'tokens.css'), 'utf8');
const CONTRACT = readFileSync(join(PROJECT_ROOT, 'tests', 'reference', 'design-contract.md'), 'utf8');

/** The text of one numbered section of a markdown file. */
function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`## ${heading}`);
  expect(start, `section "${heading}" not found`).toBeGreaterThan(-1);
  const after = markdown.indexOf('\n## ', start + 1);
  return markdown.slice(start, after === -1 ? markdown.length : after);
}

const SPEC_16 = section(CONTRACT, '16. Visual direction');
const QB_15 = section(CONTRACT, '15. Design tokens');

/**
 * Every `--token: value;` declaration in the **base** `:root` block.
 *
 * Scoped to that block on purpose. The reduced-motion query redefines every
 * `--dur-*` as `var(--dur-0)`, and a whole-file scan would report that as the
 * declared value of `--dur-1` and quietly stop checking the real scale. The
 * conditional blocks are asserted separately, by the tests that own them.
 */
function baseDeclarations(): Map<string, string> {
  const start = CSS.indexOf(':root {');
  expect(start, 'no base :root block').toBeGreaterThan(-1);
  const end = CSS.indexOf('\n}', start);
  expect(end, 'base :root block is not closed').toBeGreaterThan(start);
  const block = CSS.slice(start, end);

  const found = new Map<string, string>();
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      found.set(name, value.trim());
    }
  }
  return found;
}

const DECLARED = baseDeclarations();

function declared(name: string): string {
  const value = DECLARED.get(name);
  expect(value, `${name} is not declared in tokens.css`).toBeDefined();
  return value ?? '';
}

// ---------------------------------------------------------------------------
// Contrast, re-derived rather than trusted.
// ---------------------------------------------------------------------------

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ---------------------------------------------------------------------------
// The palette, straight out of SPEC section 16.
// ---------------------------------------------------------------------------

/** `| \`--token\` | \`#HEX\` | ... | \`#HEX\` | ... |` from the chrome table. */
function chromePalette(): Map<string, { dark: string; light: string }> {
  const found = new Map<string, { dark: string; light: string }>();
  const row = /\|\s*`(--bj-[a-z-]+)`\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|[^|]*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|/g;
  for (const match of SPEC_16.matchAll(row)) {
    const [, name, dark, light] = match;
    if (name !== undefined && dark !== undefined && light !== undefined) {
      found.set(name, { dark: dark.toLowerCase(), light: light.toLowerCase() });
    }
  }
  return found;
}

/** `| \`--token\` | \`#HEX\` | ... |` from the play-surface table. */
function surfacePalette(): Map<string, string> {
  const found = new Map<string, string>();
  const row = /\|\s*`(--[a-z-]+)`\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|/g;
  for (const match of SPEC_16.matchAll(row)) {
    const [, name, hex] = match;
    if (name !== undefined && hex !== undefined && !name.startsWith('--bj-')) {
      found.set(name, hex.toLowerCase());
    }
  }
  return found;
}

/** `| 10 | \`#HEX\` | **4.67:1** | **5.47:1** |` from the chip table. */
function chipPalette(): Map<number, { fill: string; ring: number; glyph: number }> {
  const found = new Map<number, { fill: string; ring: number; glyph: number }>();
  const row = /\|\s*(\d+)\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|\s*\*\*([\d.]+):1\*\*\s*\|\s*\*\*([\d.]+):1\*\*\s*\|/g;
  for (const match of SPEC_16.matchAll(row)) {
    const [, denom, fill, ring, glyph] = match;
    if (denom !== undefined && fill !== undefined && ring !== undefined && glyph !== undefined) {
      found.set(Number(denom), {
        fill: fill.toLowerCase(),
        ring: Number(ring),
        glyph: Number(glyph),
      });
    }
  }
  return found;
}

const CHROME = chromePalette();
const PLAY = surfacePalette();
const CHIPS = chipPalette();

describe('E1: the spec is the only source of colour', () => {
  it('finds the whole palette in SPEC section 16', () => {
    expect([...CHROME.keys()].sort()).toEqual([
      '--bj-accent',
      '--bj-elevated',
      '--bj-ground',
      '--bj-negative',
      '--bj-positive',
      '--bj-text',
      '--bj-text-muted',
    ]);
    expect(PLAY.size).toBe(11);
    expect([...CHIPS.keys()]).toEqual([10, 50, 100, 500]);
  });

  it('declares both chrome themes exactly as the spec measured them', () => {
    for (const [name, { dark, light }] of CHROME) {
      const suffix = name.replace('--bj-', '');
      expect(declared(`--bj-dark-${suffix}`), `dark ${name}`).toBe(dark);
      expect(declared(`--bj-light-${suffix}`), `light ${name}`).toBe(light);
    }
  });

  it('declares the play surface exactly as the spec measured it', () => {
    for (const [name, hex] of PLAY) {
      expect(declared(name), name).toBe(hex);
    }
  });

  it('carries the same play surface in the renderer record', () => {
    expect(SURFACE.feltBronze).toBe(PLAY.get('--felt-bronze'));
    expect(SURFACE.feltSilver).toBe(PLAY.get('--felt-silver'));
    expect(SURFACE.feltGold).toBe(PLAY.get('--felt-gold'));
    expect(SURFACE.rail).toBe(PLAY.get('--felt-rail'));
    expect(SURFACE.print).toBe(PLAY.get('--felt-print'));
    expect(SURFACE.cardMargin).toBe(PLAY.get('--card-margin'));
    expect(SURFACE.cardFace).toBe(PLAY.get('--card-face'));
    expect(SURFACE.cardBack).toBe(PLAY.get('--card-back'));
    expect(SURFACE.rankBlack).toBe(PLAY.get('--rank-black'));
    expect(SURFACE.rankRed).toBe(PLAY.get('--rank-red'));
    expect(CHIP_RING).toBe(PLAY.get('--chip-ring'));

    expect(FELT.bronze).toBe(SURFACE.feltBronze);
    expect(FELT.silver).toBe(SURFACE.feltSilver);
    expect(FELT.gold).toBe(SURFACE.feltGold);
  });

  it('carries the same chips in both forms', () => {
    expect(CHIP_DENOMINATIONS).toEqual([...CHIPS.keys()]);
    for (const [denomination, { fill }] of CHIPS) {
      expect(declared(`--chip-${String(denomination)}-fill`)).toBe(fill);
      expect(CHIP_FILL[denomination as keyof typeof CHIP_FILL]).toBe(fill);
    }
  });

  it('resolves the spec phrase "white glyph" to the value it measured', () => {
    // Section 16 commits four ratios for the chip glyph and no hex. All four
    // reproduce from #ffffff and from nothing else, so the token is the
    // measurement written down rather than a colour anybody chose.
    expect(CHIP_GLYPH).toBe('#ffffff');
    expect(declared('--chip-glyph')).toBe('#ffffff');
  });
});

describe('E1: every committed ratio re-derives from the committed hexes', () => {
  const round = (n: number): number => Math.round(n * 100) / 100;

  it('reproduces the chrome ratios on both grounds', () => {
    const quoted = /\|\s*`(--bj-[a-z-]+)`\s*\|\s*`#[0-9A-Fa-f]{6}`\s*\|\s*\*\*([\d.]+):1\*\*\s*\|\s*`#[0-9A-Fa-f]{6}`\s*\|\s*\*\*([\d.]+):1\*\*\s*\|/g;
    const darkGround = CHROME.get('--bj-ground')?.dark ?? '';
    const lightGround = CHROME.get('--bj-ground')?.light ?? '';
    let checked = 0;

    for (const match of SPEC_16.matchAll(quoted)) {
      const [, name, darkRatio, lightRatio] = match;
      const pair = name === undefined ? undefined : CHROME.get(name);
      if (pair === undefined || darkRatio === undefined || lightRatio === undefined) {
        continue;
      }
      expect(round(contrast(pair.dark, darkGround)), `${String(name)} on dark ground`).toBe(
        Number(darkRatio),
      );
      expect(round(contrast(pair.light, lightGround)), `${String(name)} on light ground`).toBe(
        Number(lightRatio),
      );
      checked += 1;
    }

    // text, text-muted, accent, positive, negative. ground and elevated quote
    // no ratio, because they are the ground.
    expect(checked).toBe(5);
  });

  it('reproduces the play surface ratios', () => {
    const bronze = PLAY.get('--felt-bronze') ?? '';
    const silver = PLAY.get('--felt-silver') ?? '';
    const gold = PLAY.get('--felt-gold') ?? '';
    const face = PLAY.get('--card-face') ?? '';
    const margin = PLAY.get('--card-margin') ?? '';
    const darkGround = CHROME.get('--bj-ground')?.dark ?? '';
    const lightGround = CHROME.get('--bj-ground')?.light ?? '';
    const ring = PLAY.get('--chip-ring') ?? '';

    expect(round(contrast(PLAY.get('--felt-rail') ?? '', darkGround))).toBe(8.02);
    expect(round(contrast(margin, bronze))).toBe(8.47);
    expect(round(contrast(margin, silver))).toBe(10.13);
    expect(round(contrast(margin, gold))).toBe(13.28);
    expect(round(contrast(PLAY.get('--card-back') ?? '', margin))).toBe(9.03);
    expect(round(contrast(PLAY.get('--rank-black') ?? '', face))).toBe(15.71);
    expect(round(contrast(PLAY.get('--rank-red') ?? '', face))).toBe(6.28);
    expect(round(contrast(PLAY.get('--felt-print') ?? '', bronze))).toBe(8.68);
    expect(round(contrast(ring, bronze))).toBe(8.01);
    expect(round(contrast(ring, silver))).toBe(9.59);
    expect(round(contrast(ring, gold))).toBe(12.58);

    // The derivation section 16 gives for why the boundary tokens exist at all.
    expect(round(contrast(bronze, darkGround))).toBe(1.97);
    expect(round(contrast(silver, darkGround))).toBe(1.65);
    expect(round(contrast(gold, darkGround))).toBe(1.26);
    expect(round(contrast(bronze, lightGround))).toBe(8.54);
    expect(round(contrast(silver, lightGround))).toBe(10.22);
    expect(round(contrast(gold, lightGround))).toBe(13.39);
  });

  it('reproduces every chip ratio, ring and glyph', () => {
    for (const [denomination, { fill, ring, glyph }] of CHIPS) {
      expect(round(contrast(CHIP_RING, fill)), `chip ${String(denomination)} ring`).toBe(ring);
      expect(round(contrast(CHIP_GLYPH, fill)), `chip ${String(denomination)} glyph`).toBe(glyph);
    }
  });

  it('holds the structural rule the palette is built on', () => {
    // QUALITY-BAR 15: where a fill cannot clear 3:1 against what is behind it,
    // a boundary token carries the contrast. Assert both halves, so that a
    // future edit cannot quietly make the boundary tokens pointless.
    const darkGround = CHROME.get('--bj-ground')?.dark ?? '';
    for (const felt of Object.values(FELT)) {
      expect(contrast(felt, darkGround), 'a felt should not clear 3:1 alone').toBeLessThan(3);
      expect(contrast(SURFACE.rail, felt), 'the rail must separate felt from ground').toBeGreaterThan(3);
    }
    for (const fill of Object.values(CHIP_FILL)) {
      expect(contrast(CHIP_RING, fill), 'the ring must separate a chip from its fill').toBeGreaterThan(3);
      for (const felt of Object.values(FELT)) {
        expect(contrast(CHIP_RING, felt), 'the ring must separate a chip from the felt').toBeGreaterThan(3);
      }
    }
  });
});

describe('E1: the numeric scales match QUALITY-BAR section 15', () => {
  /** `| \`--token\` | value |` anywhere in the section, including paired rows. */
  function qbTokens(): Map<string, string> {
    const found = new Map<string, string>();
    for (const match of QB_15.matchAll(/\|\s*`(--[a-z0-9-]+)`\s*\|\s*([^|]+?)\s*\|/g)) {
      const [, name, value] = match;
      if (name !== undefined && value !== undefined) {
        found.set(name, value.replace(/`/g, '').trim());
      }
    }
    return found;
  }

  const QB_TOKENS = qbTokens();

  it('finds every scale token in the quality bar', () => {
    for (const name of ['--type-xs', '--type-2xl', '--space-1', '--space-8', '--radius-pill',
      '--border-thick', '--focus-ring', '--dur-0', '--dur-4', '--ease-out', '--ease-in-out']) {
      expect(QB_TOKENS.has(name), `${name} missing from QUALITY-BAR 15`).toBe(true);
    }
  });

  it('declares the type scale in rem, on the 1.200 ratio', () => {
    const steps = ['--type-xs', '--type-sm', '--type-base', '--type-md', '--type-lg',
      '--type-xl', '--type-2xl'];
    for (const name of steps) {
      const value = declared(name);
      expect(value, `${name} must be rem, never px`).toMatch(/^[\d.]+rem$/);
      expect(value, name).toBe(QB_TOKENS.get(name));
    }

    // Ratio 1.200 between neighbours, to the precision the scale is quoted at.
    const values = steps.map((name) => Number.parseFloat(declared(name)));
    for (let i = 1; i < values.length; i += 1) {
      const lower = values[i - 1];
      const upper = values[i];
      expect(lower).toBeDefined();
      expect(upper).toBeDefined();
      expect((upper ?? 0) / (lower ?? 1)).toBeCloseTo(1.2, 2);
    }
  });

  it('declares spacing, radius and border exactly as stated', () => {
    for (const [name, value] of QB_TOKENS) {
      if (/^--(space|radius|border)-/.test(name)) {
        expect(declared(name), name).toBe(value);
      }
    }
  });

  it('declares the focus ring as 2px solid with 2px offset', () => {
    expect(QB_TOKENS.get('--focus-ring')).toBe('2px solid, 2px offset');
    expect(declared('--focus-ring-width')).toBe('var(--border-thin)');
    expect(declared('--border-thin')).toBe('2px');
    expect(declared('--focus-ring-style')).toBe('solid');
    expect(declared('--focus-ring-offset')).toBe('2px');
    // SPEC 16: the ring is --bj-accent, which is 9.65:1 dark and 6.17:1 light.
    expect(declared('--focus-ring-color')).toBe('var(--bj-accent)');
  });

  it('declares the durations and easings exactly as stated', () => {
    for (const [name, value] of QB_TOKENS) {
      if (/^--(dur|ease)-/.test(name)) {
        expect(declared(name), name).toBe(value);
      }
    }
  });

  it('carries the same scales in the renderer record, unitless', () => {
    for (const [name, value] of QB_TOKENS) {
      const space = /^--space-(\d)$/.exec(name);
      if (space?.[1] !== undefined) {
        expect(SPACE[Number(space[1]) as keyof typeof SPACE]).toBe(Number.parseInt(value, 10));
      }
      const radius = /^--radius-(\w+)$/.exec(name);
      if (radius?.[1] !== undefined) {
        expect(RADIUS[radius[1] as keyof typeof RADIUS]).toBe(Number.parseInt(value, 10));
      }
      const border = /^--border-(\w+)$/.exec(name);
      if (border?.[1] !== undefined) {
        expect(BORDER[border[1] as keyof typeof BORDER]).toBe(Number.parseInt(value, 10));
      }
      const dur = /^--dur-(\d)$/.exec(name);
      if (dur?.[1] !== undefined) {
        expect(DURATION[`d${dur[1]}` as keyof typeof DURATION]).toBe(Number.parseInt(value, 10));
      }
    }

    expect(`cubic-bezier(${EASE.out.join(', ')})`).toBe(QB_TOKENS.get('--ease-out'));
    expect(`cubic-bezier(${EASE.inOut.join(', ')})`).toBe(QB_TOKENS.get('--ease-in-out'));
  });
});

describe('E1: no literal value in component code', () => {
  /**
   * Every source file under src/, except the two that ARE the token layer.
   *
   * Installed at BJ-1 deliberately, while src/ui/ and src/render/ are still
   * empty. This scan has nothing to catch today, which is the only moment it
   * can be added without a migration: every component from BJ-13 onward is
   * written under it rather than audited against it afterwards.
   */
  function componentSources(): { path: string; text: string }[] {
    const files: { path: string; text: string }[] = [];
    const tokenLayer = [join('src', 'ui', 'tokens.css'), join('src', 'render', 'tokens.ts')];

    function walk(dir: string): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
          const relative = full.slice(PROJECT_ROOT.length + 1);
          if (!tokenLayer.includes(relative)) {
            files.push({ path: relative, text: readFileSync(full, 'utf8') });
          }
        }
      }
    }

    walk(join(PROJECT_ROOT, 'src'));
    return files;
  }

  /** Comments are prose, and prose is allowed to quote a value. */
  function withoutComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  it('finds the token layer and excludes exactly it', () => {
    const scanned = componentSources().map((file) => file.path);
    expect(scanned).not.toContain(join('src', 'ui', 'tokens.css'));
    expect(scanned).not.toContain(join('src', 'render', 'tokens.ts'));
    expect(scanned).toContain(join('src', 'main.ts'));
  });

  it('carries no colour literal outside the token layer', () => {
    const offenders: string[] = [];
    for (const { path, text } of componentSources()) {
      const code = withoutComments(text);
      for (const pattern of [/#[0-9a-fA-F]{3,8}\b/g, /\brgba?\s*\(/g, /\bhsla?\s*\(/g]) {
        for (const match of code.matchAll(pattern)) {
          offenders.push(`${path}: ${match[0]}`);
        }
      }
    }
    expect(offenders, 'colour belongs in the token layer, referenced by name').toEqual([]);
  });

  it('carries no dimension or duration literal in a stylesheet outside the token layer', () => {
    const offenders: string[] = [];
    for (const { path, text } of componentSources()) {
      if (!path.endsWith('.css')) {
        continue;
      }
      const code = withoutComments(text);
      // A bare 0 carries no unit and needs no token.
      for (const match of code.matchAll(/(?<![\w.-])(?!0\b)[\d.]+(px|rem|em|ms|s)\b/g)) {
        offenders.push(`${path}: ${match[0]}`);
      }
    }
    expect(offenders, 'sizes and durations resolve through var(--token)').toEqual([]);
  });
});

describe('E1: reduced motion and theme resolution', () => {
  it('resolves every duration to --dur-0 under reduced motion', () => {
    const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(CSS);
    expect(block?.[1], 'no prefers-reduced-motion block').toBeDefined();
    const body = block?.[1] ?? '';

    const durations = [...CSS.matchAll(/--dur-(\d):/g)].map((m) => m[1]);
    const nonZero = [...new Set(durations)].filter((d) => d !== '0');
    expect(nonZero.length).toBeGreaterThan(0);

    for (const step of nonZero) {
      expect(body, `--dur-${String(step)} is not zeroed under reduced motion`).toMatch(
        new RegExp(`--dur-${String(step)}\\s*:\\s*var\\(--dur-0\\)`),
      );
    }
    expect(declared('--dur-0')).toBe('0ms');
  });

  it('zeroes durations by redefining tokens, not by killing animation', () => {
    // A blanket `animation: none !important` sweep also cancels transitionend
    // and animationend, so anything sequenced on those stops arriving and the
    // order of states changes. Reduced motion must remove the animation and
    // leave the sequence alone.
    const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(CSS);
    const body = block?.[1] ?? '';
    expect(body).not.toMatch(/animation\s*:/);
    expect(body).not.toMatch(/transition\s*:/);
    expect(body).not.toMatch(/!important/);
  });

  it('resolves the renderer duration to zero under reduced motion', () => {
    expect(duration('d4', false)).toBe(DURATION.d4);
    expect(duration('d4', true)).toBe(0);
    for (const name of Object.keys(DURATION) as (keyof typeof DURATION)[]) {
      expect(duration(name, true)).toBe(0);
      expect(duration(name, false)).toBe(DURATION[name]);
    }
  });

  it('flips the chrome with the theme and leaves the play surface alone', () => {
    // SPEC 16: the play surface does not flip. Assert it directly, so that a
    // later part cannot add a pale felt without a second set of measured
    // ratios to go with it.
    const themed = [...CSS.matchAll(/(?:prefers-color-scheme|\[data-theme=)[^{]*\{([\s\S]*?)\n\s*\}/g)]
      .map((m) => m[1] ?? '')
      .join('\n');
    expect(themed.length).toBeGreaterThan(0);

    for (const name of PLAY.keys()) {
      expect(themed, `${name} must not be redefined per theme`).not.toContain(`${name}:`);
    }
    expect(themed).not.toContain('--chip-');
    expect(themed).toContain('--bj-ground:');
  });

  it('offers a settings override that wins over the system preference', () => {
    // SPEC 16: prefers-color-scheme by default, settings override wins.
    expect(CSS).toMatch(/:root\[data-theme='light'\]/);
    expect(CSS).toMatch(/:root\[data-theme='dark'\]/);
    // And the media query must not undo an explicit dark choice.
    expect(CSS).toMatch(/@media \(prefers-color-scheme: light\)\s*\{\s*:root:not\(\[data-theme='dark'\]\)/);
  });
});
