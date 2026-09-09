/**
 * `tests/unit/reference/` may not import the code it is the reference for.
 * `AUDIT-2`, finding `Z1-04`.
 *
 * Five items' evidence rests on that rule and until now it was stated only in
 * prose, at the top of the two files it governs. `B1`'s 52-card sweep takes
 * every expected total, softness, bust and natural from `hand-evaluator.ts`;
 * `B13`'s settlement ladder takes its naturals and bust verdicts from the same
 * file; `B7`'s peek and `B8`'s dealer policy read it; `J3`'s 3,040-cell coach
 * sweep reads `basic-strategy-charts.ts`. `tests/unit/hand-value.test.ts` says
 * what the rule buys: an evaluator agreeing with itself proves consistency and
 * not correctness, and a misreading of SPEC 4.2 shared by the code and its test
 * is invisible.
 *
 * Nothing enforced it. The `core-boundary` plugin governs what `src/core/**`
 * may import and says nothing about a test fixture, and the mutation ledger
 * proves the reference is load bearing rather than independent: a reference that
 * delegated to `src/` would still be mutation-detectable, having stopped being
 * a second implementation. Measured at `AUDIT-2`: a probe file in that directory
 * importing `handValue` and `isNatural` from `src/core/hand` passed `npx eslint`
 * and `npx tsc --noEmit` with no output at all.
 *
 * So the rule is a scan, in the same family as the other provenance scans in
 * this suite. The directory is enumerated rather than listed, so a third file
 * cannot arrive unscanned, and the reader carries the can-see control every
 * scan here carries: the same extractor is run over a synthesised violation and
 * is required to report it.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REFERENCE_DIR = join(PROJECT_ROOT, 'tests', 'unit', 'reference');

/**
 * Every module specifier in one source, in every form the toolchain resolves.
 *
 * The four forms are the four `tools/eslint-plugin-core-boundary` listens for,
 * for the same reason: a rule that read `import ... from` alone would pass a
 * `require`, a bare side-effect import, a dynamic `import()` or a
 * `type X = import('...')`, and every one of them reaches the same module.
 */
function specifiersIn(source: string): readonly string[] {
  const found: string[] = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    // One `matchAll` per form. A reader that stopped visiting the forms would
    // report an empty specifier list for a file full of them, which the can-see
    // control below is what catches.
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) {
        found.push(specifier);
      }
    }
  }
  return found;
}

/**
 * Why one specifier is refused, or `null` when the reference may name it.
 *
 * Relative specifiers are resolved against the file that wrote them, so
 * `'../../../src/core/hand'` is refused by where it lands rather than by how it
 * is spelled: a specifier that reached `src/` through a longer walk is the same
 * import and is caught the same way.
 */
function refusalFor(specifier: string, fromDirectory: string): string | null {
  if (specifier.startsWith('@js-games/engine')) {
    return 'the shared engine';
  }
  if (!specifier.startsWith('.')) {
    return null;
  }
  const landed = relative(PROJECT_ROOT, resolve(fromDirectory, specifier)).replace(/\\/g, '/');
  return landed === 'src' || landed.startsWith('src/') ? `src/, at ${landed}` : null;
}

describe('B1, B7, B8, B13, J3: the reference implementations import nothing from src/', () => {
  const files = readdirSync(REFERENCE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx|mts|cts)$/.test(entry.name))
    .map((entry) => entry.name);

  it('has a reference directory to scan', () => {
    // The scan is worthless if the directory is empty or has been moved, and a
    // walk over nothing passes every assertion below.
    expect(files.length, 'tests/unit/reference/ holds no source to scan').toBeGreaterThanOrEqual(2);
    expect(files).toContain('hand-evaluator.ts');
    expect(files).toContain('basic-strategy-charts.ts');
  });

  it('names no module under src/ and none of the shared engine, in any import form', () => {
    for (const name of files) {
      const source = readFileSync(join(REFERENCE_DIR, name), 'utf8');
      for (const specifier of specifiersIn(source)) {
        expect(
          refusalFor(specifier, REFERENCE_DIR),
          `${name} imports ${specifier}, which is the code it is the reference for`,
        ).toBeNull();
      }
    }
  });

  it('keeps saying so in its own header, which is where a reader meets the rule', () => {
    for (const name of files) {
      const source = readFileSync(join(REFERENCE_DIR, name), 'utf8');
      expect(source, `${name} no longer states the rule`).toContain(
        'must not import anything from `src/`',
      );
    }
  });

  it('reports the import a compromised reference would carry', () => {
    // The can-see control, and it is the exact edit measured at `AUDIT-2`: this
    // line in either file hollows out five items' evidence at once and passed
    // every gate the repository had.
    const compromised = "import { handValue, isNatural } from '../../../src/core/hand';\n";
    const specifiers = specifiersIn(compromised);
    expect(specifiers).toEqual(['../../../src/core/hand']);
    expect(refusalFor(specifiers[0] ?? '', REFERENCE_DIR)).toBe('src/, at src/core/hand');

    // And the three other forms the extractor exists for, each landing in the
    // same place by a different spelling.
    for (const source of [
      "const hand = require('../../../src/core/hand');\n",
      "void import('../../../src/core/hand');\n",
      "import '../../../src/core/hand';\n",
    ]) {
      const [specifier] = specifiersIn(source);
      expect(specifier, `no specifier read out of ${source.trim()}`).toBeDefined();
      expect(refusalFor(specifier ?? '', REFERENCE_DIR)).toBe('src/, at src/core/hand');
    }

    // The shared engine's renderer is refused by name rather than by path,
    // because nothing resolves it on this side of a build.
    expect(refusalFor('@js-games/engine/core/hand', REFERENCE_DIR)).toBe('the shared engine');

    // And the two shapes a reference may legitimately carry: a node builtin and
    // a sibling inside the directory itself.
    expect(refusalFor('node:assert', REFERENCE_DIR)).toBeNull();
    expect(refusalFor('./hand-evaluator', REFERENCE_DIR)).toBeNull();
  });

  it('has one bare specifier the toolchain can resolve into the tree, and refuses it', () => {
    // The cure round's review, finding `NIT-3`. The reader passes every bare
    // specifier that is not the shared engine, and that is complete only while
    // no other bare specifier resolves anywhere near `src/`: an alias added to
    // either config tomorrow reopens the route this whole file exists to close,
    // and nothing pinned that absence. So the two places an alias can be
    // declared are read here.
    const tsconfig: unknown = JSON.parse(readFileSync(join(PROJECT_ROOT, 'tsconfig.json'), 'utf8'));
    const paths =
      typeof tsconfig === 'object' && tsconfig !== null && 'compilerOptions' in tsconfig
        ? ((tsconfig as { compilerOptions?: { paths?: Record<string, unknown> } }).compilerOptions
            ?.paths ?? {})
        : {};
    expect(
      Object.keys(paths),
      'a second path mapping resolves a bare specifier the scan passes',
    ).toEqual(['@js-games/engine/*']);

    // The bundler's own half. Vite and Vitest each resolve a `resolve.alias`
    // before any of this, and neither declares one: the word is read out of the
    // file rather than the loaded config, because a config that declared an
    // alias conditionally would still be a route.
    for (const config of ['vite.config.ts', 'vitest.config.ts']) {
      expect(
        readFileSync(join(PROJECT_ROOT, config), 'utf8'),
        `${config} declares an alias, which the reference scan does not read`,
      ).not.toMatch(/\balias\b/);
    }
  });
});
