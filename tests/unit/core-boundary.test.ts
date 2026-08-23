/**
 * Item M3, severity Critical, 12 points.
 *
 *   "The core import boundary is lint-enforced and the lint fails the build: no
 *    module under core imports render, ui, the shared engine renderer, or any
 *    DOM or canvas type, and none calls Math.random. A deliberately violating
 *    fixture is rejected by the same rule."
 *
 * "By the same rule" is the load-bearing phrase, so this file resolves
 * `eslint.config.js` the way the command line does, from the project root, and
 * never constructs a configuration of its own. A test that lints with a bespoke
 * config proves that a rule exists, not that the build is gated by it.
 *
 * Five things are asserted, and each of them can fail on its own:
 *
 *   1. The three rules are configured at severity 2 for a real path inside
 *      `src/core/`, which is where they have to bite once BJ-2 lands code.
 *   2. Every violation the fixture marks is reported, by the named rule, on the
 *      marked line.
 *   3. Nothing else in the fixture is reported. An unmarked error fails too, so
 *      the fixture cannot drift into proving something other than the boundary.
 *   4. A structurally identical file outside `core/` is reported clean, so the
 *      rule is scoped rather than blanket.
 *   5. A `core/` file full of near misses is reported clean, so the rule is
 *      doing scope analysis rather than a text scan.
 *
 * Plus one that guards the gate itself: an `eslint-disable` comment inside
 * `core/` is inert, so the Critical architecture rule of the project cannot be
 * switched off for a line by whoever is in a hurry.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import type { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import {
  insideBoundary,
  specifierOf,
} from '../../tools/eslint-plugin-core-boundary/index.js';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const FIXTURES = join(PROJECT_ROOT, 'tests', 'lint', 'fixtures');
const VIOLATIONS = join(FIXTURES, 'core', 'violations.ts');
const CLEAN = join(FIXTURES, 'core', 'clean.ts');
const OUTSIDE = join(FIXTURES, 'outside', 'uses-dom.ts');

const BOUNDARY_RULES = [
  'core-boundary/no-forbidden-imports',
  'core-boundary/no-dom',
  'core-boundary/no-math-random',
] as const;

/** ESLint resolving eslint.config.js from the project root, as the CLI does. */
function eslint(): ESLint {
  return new ESLint({ cwd: PROJECT_ROOT });
}

async function lint(file: string): Promise<ESLint.LintResult> {
  const results = await eslint().lintFiles([file]);
  expect(results).toHaveLength(1);
  const result = results[0];
  if (result === undefined) {
    throw new Error(`no lint result for ${file}`);
  }
  return result;
}

interface Marker {
  readonly line: number;
  readonly ruleId: string;
}

/** The `// @expect <ruleId>` markers in the fixture, by line number. */
function markersOf(file: string): Marker[] {
  const markers: Marker[] = [];
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((text, index) => {
    const match = /@expect\s+(\S+)/.exec(text);
    if (match !== null && match[1] !== undefined) {
      markers.push({ line: index + 1, ruleId: match[1] });
    }
  });
  return markers;
}

function errorsOf(result: ESLint.LintResult): Linter.LintMessage[] {
  return result.messages.filter((message) => message.severity === 2);
}

function describeMessage(message: Linter.LintMessage): string {
  return `${String(message.line)}:${String(message.ruleId ?? 'unknown')}`;
}

describe('M3: the core/ boundary is lint-enforced', () => {
  it('configures all three rules as errors for a real src/core path', async () => {
    const config = (await eslint().calculateConfigForFile(
      join(PROJECT_ROOT, 'src', 'core', 'shoe.ts'),
    )) as Linter.Config;

    const rules = config.rules ?? {};
    for (const ruleId of BOUNDARY_RULES) {
      const entry = rules[ruleId];
      expect(entry, `${ruleId} is not configured for src/core/`).toBeDefined();
      // calculateConfigForFile normalises severities to their numeric form.
      const severity = Array.isArray(entry) ? entry[0] : entry;
      expect(
        severity === 2 || severity === 'error',
        `${ruleId} is not an error for src/core/, it is ${String(severity)}`,
      ).toBe(true);
    }
  });

  it('cannot be switched off from inside core/ with a disable comment', async () => {
    const config = (await eslint().calculateConfigForFile(
      join(PROJECT_ROOT, 'src', 'core', 'shoe.ts'),
    )) as Linter.Config;
    expect(config.linterOptions?.noInlineConfig).toBe(true);

    // The fixture carries a disable comment for no-math-random. ESLint reports
    // the directive as having no effect, and the violation is still an error.
    const result = await lint(VIOLATIONS);
    const inert = result.messages.filter(
      (message) => message.ruleId === null && /noInlineConfig/.test(message.message),
    );
    expect(inert.length).toBeGreaterThan(0);
  });

  it('rejects every marked violation in the fixture, by the named rule', async () => {
    const result = await lint(VIOLATIONS);
    const errors = errorsOf(result);
    const markers = markersOf(VIOLATIONS);

    expect(markers.length).toBeGreaterThan(0);
    expect(errors.length).toBeGreaterThan(0);

    for (const marker of markers) {
      const onLine = errors.filter((message) => message.line === marker.line);
      expect(
        onLine.map((message) => message.ruleId),
        `line ${String(marker.line)} expected ${marker.ruleId}`,
      ).toContain(marker.ruleId);
    }
  });

  it('reports nothing in the fixture that the fixture does not claim', async () => {
    const result = await lint(VIOLATIONS);
    const marked = new Set(markersOf(VIOLATIONS).map((marker) => marker.line));
    const unexpected = errorsOf(result).filter((message) => !marked.has(message.line));
    expect(unexpected.map(describeMessage)).toEqual([]);
  });

  it('exercises all three rules', async () => {
    const result = await lint(VIOLATIONS);
    const fired = new Set(errorsOf(result).map((message) => message.ruleId));
    for (const ruleId of BOUNDARY_RULES) {
      expect(fired, `${ruleId} never fired on the fixture`).toContain(ruleId);
    }
  });

  it('leaves a core/ file of near misses alone', async () => {
    const result = await lint(CLEAN);
    expect(result.messages.map(describeMessage)).toEqual([]);
  });

  it('leaves the same offences alone outside core/', async () => {
    const result = await lint(OUTSIDE);
    expect(result.messages.map(describeMessage)).toEqual([]);
  });

  it('treats src/Core as core, because Windows and macOS do', () => {
    expect(insideBoundary('src/core/shoe.ts', 'core')).toBe(true);
    expect(insideBoundary('src/Core/shoe.ts', 'core')).toBe(true);
    expect(insideBoundary('src/CORE/shoe.ts', 'core')).toBe(true);
    expect(insideBoundary('D:\\a\\src\\Core\\shoe.ts', 'core')).toBe(true);

    // A segment that merely contains the word is not the boundary.
    expect(insideBoundary('src/core-utils/shoe.ts', 'core')).toBe(false);
    expect(insideBoundary('src/render/felt.ts', 'core')).toBe(false);
  });

  it('reads a specifier from a template literal, which bundlers resolve', () => {
    const literal = { type: 'Literal', value: '../ui/panel' };
    const template = {
      type: 'TemplateLiteral',
      expressions: [],
      quasis: [{ value: { cooked: '../ui/panel' } }],
    };
    const interpolated = {
      type: 'TemplateLiteral',
      expressions: [{ type: 'Identifier' }],
      quasis: [{ value: { cooked: '../ui/' } }, { value: { cooked: '' } }],
    };

    expect(specifierOf(literal)).toBe('../ui/panel');
    expect(specifierOf(template)).toBe('../ui/panel');
    // An interpolated specifier is not statically known, so there is nothing
    // honest to check and the rule says so rather than guessing.
    expect(specifierOf(interpolated)).toBeNull();
  });

  it('excludes the fixtures from npm run lint and nothing else', () => {
    const manifest = JSON.parse(
      readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };

    const script = manifest.scripts['lint'] ?? '';
    const patterns = [...script.matchAll(/--ignore-pattern\s+"([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(patterns).toEqual(['tests/lint/fixtures/**']);
  });
});
