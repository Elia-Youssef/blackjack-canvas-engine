/**
 * Two values in the build configuration that nothing else reads.
 *
 * Both are `AUDIT-2` findings, and both have the same shape: a config key that
 * decides what ships or what is checked, with no reader anywhere, so an edit to
 * it moves the product and leaves every gate green.
 *
 * **The emitted language level** (`Z10-04`). `vite.config.ts` sets
 * `build.target`, which is the one place the syntax level of the shipped bundle
 * is decided: lower it and the same source ships transpiled further down, raise
 * it and the bundle can carry syntax the support floor does not promise.
 * QUALITY-BAR section 2 states that floor, and the number here is the build's
 * answer to it. The literal is written out rather than read from
 * `docs/QUALITY-BAR.md`: that file is outside the project tree and is not
 * checked out on a CI runner, so a test that read it would pass by being
 * skipped. What this pins is that the value cannot move without a deliberate
 * edit here as well.
 *
 * **What the type gate opens** (`Z10-03`). `eslint.config.js` states the rule
 * for itself, "every extension TypeScript and Node will load, not just the
 * three in use today ... a file the gate does not match is a file the gate does
 * not check", and the lint gate acts on it. `tsconfig.json` did not: its
 * include patterns ended in a literal `.ts`, which matches neither `foo.mts`
 * nor `foo.cts` nor `foo.tsx`, so such a file under `src/` was linted,
 * ledger-proven, bundled by Vite from its own extension list and never opened
 * by `tsc`. The include list is checked against the extension set ESLint
 * matches, per source root, so the two gates cannot come apart again.
 *
 * TypeScript's include patterns support `*`, `?` and `**` and **not** brace
 * expansion, so one pattern per extension is the only spelling that works: a
 * pattern ending in `.{ts,mts}` matches a file whose name ends in those nine
 * characters and nothing else, which is a widening that silently narrows. That
 * is why the assertion below is over a list rather than over one string.
 *
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import viteConfig from '../../vite.config';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * QUALITY-BAR section 2's support floor, as the build's target.
 *
 * Written in the spelling the config uses. Vite lowercases its own targets, and
 * a mismatch of case here would be a test agreeing with itself.
 */
const BUILD_TARGET = 'es2022';

/** Every extension TypeScript and Node will load, matching `eslint.config.js`. */
const SOURCE_EXTENSIONS = ['ts', 'tsx', 'mts', 'cts'] as const;

/** The roots whose TypeScript the type gate must open, each with its glob stem. */
const TYPED_ROOTS = ['src/**/*', 'tests/unit/**/*', 'tests/browser/**/*', 'packages/*/src/**/*'];

interface TsConfig {
  readonly include: readonly string[];
  readonly compilerOptions: Readonly<Record<string, unknown>>;
}

function tsconfig(): TsConfig {
  return JSON.parse(readFileSync(join(PROJECT_ROOT, 'tsconfig.json'), 'utf8')) as TsConfig;
}

describe('the emitted language level is the one the support floor states', () => {
  it('builds to the target QUALITY-BAR section 2 is answered with', () => {
    expect(viteConfig.build?.target).toBe(BUILD_TARGET);
  });

  it('type-checks against the same level it emits', () => {
    // The two are separate keys in separate files and neither reads the other.
    // A `tsc` target above the emitted one accepts syntax the bundle then ships
    // untranspiled, which is the shape of the mismatch worth catching; the
    // comparison is case-insensitive because the two files spell it
    // differently by convention.
    const target = tsconfig().compilerOptions['target'];
    expect(typeof target).toBe('string');
    expect(String(target).toLowerCase()).toBe(BUILD_TARGET);
  });
});

describe('the type gate opens every extension the lint gate matches', () => {
  it('includes each source root at each extension', () => {
    const { include } = tsconfig();
    for (const stem of TYPED_ROOTS) {
      for (const extension of SOURCE_EXTENSIONS) {
        expect(include, `${stem}.${extension} is outside the type gate`).toContain(
          `${stem}.${extension}`,
        );
      }
    }
  });

  it('matches the extension set ESLint states, so neither gate can outgrow the other', () => {
    // Read off `eslint.config.js` rather than restated, so widening one gate
    // and not the other is red here rather than discovered by a shipped module
    // that was never type-checked.
    const config = readFileSync(join(PROJECT_ROOT, 'eslint.config.js'), 'utf8');
    const declared = /files: \['\*\*\/\*\.\{([a-z,]+)\}'\]/.exec(config)?.[1];
    expect(declared, 'eslint.config.js states no extension set').toBeDefined();
    const typescript = (declared ?? '').split(',').filter((one) => !one.includes('js'));
    expect([...typescript].sort()).toEqual([...SOURCE_EXTENSIONS].sort());
  });
});
