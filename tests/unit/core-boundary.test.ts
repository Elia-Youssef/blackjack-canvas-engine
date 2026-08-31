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

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
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

// ---------------------------------------------------------------------------
// M3: the closure, which the rule itself cannot deliver
// ---------------------------------------------------------------------------

/**
 * The rule decides by the text of the module specifier, so it can only see one
 * hop.
 *
 * `core-boundary/no-forbidden-imports` reports `../ui/x` and `../render/x` and
 * nothing else, which means a module whose own path names neither layer carries
 * either of them into `core/`'s module graph without producing a message.
 * `src/storage/document.ts` is exactly such a module today: it imports
 * `../ui/audio`, `../ui/motion` and `../ui/theme`, which is the adjudicated
 * relocation edge, so a single `import ... from '../storage/document'` inside
 * `core/` would put the DOM's audio and media-query modules in `core/`'s
 * closure with the whole lint gate green. `no-dom` does not cover the
 * difference either: it reports identifiers in the file it is linting, not in
 * what that file pulls in.
 *
 * This is a module-graph test rather than a lint change, deliberately. The rule
 * as written is the right rule for the thing it enforces, and the sentence in
 * its own header, "nothing under a `core/` directory may import `render/` or
 * `ui/`", is a statement about the closure. Nothing under `src/core/` imports
 * outside `src/core/` today, so what this adds is the pin, not a fix.
 *
 * The walker takes its source through a callback so that the same code walks
 * the real tree and a planted graph, which is what makes it a scan that can
 * fail rather than one that is believed.
 */

/** Every extension TypeScript and Node will load, matching `eslint.config.js`. */
const SOURCE_EXTENSIONS = ['.ts', '.mts', '.cts', '.tsx'] as const;

/** The layers `core/` may not reach, by any number of hops. */
const FORBIDDEN_ROOTS = ['src/ui/', 'src/render/'] as const;

/** Read one repository-relative path, or `null` when nothing is there. */
type ReadSource = (path: string) => string | null;

function fromDisk(path: string): string | null {
  const full = join(PROJECT_ROOT, path);
  if (!existsSync(full) || !statSync(full).isFile()) {
    return null;
  }
  return readFileSync(full, 'utf8');
}

/** Comments out, so a specifier inside one is not an edge. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Every relative specifier a module names, in any of the five forms the lint
 * rule itself listens for: a static import or re-export, a side-effect import,
 * a dynamic `import()`, and `require()`.
 */
function relativeSpecifiers(text: string): string[] {
  const pattern =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;
  return [...code(text).matchAll(pattern)]
    .map((match) => match[1] ?? '')
    .filter((specifier) => specifier.startsWith('.'));
}

/** The file a relative specifier names, resolved the way the loader would. */
function resolveSpecifier(read: ReadSource, from: string, specifier: string): string | null {
  const base = posix.normalize(posix.join(posix.dirname(from), specifier));
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => `${base}/index${extension}`),
  ];
  for (const candidate of candidates) {
    if (read(candidate) !== null) {
      return candidate;
    }
  }
  return null;
}

/**
 * Everything the roots reach, with the chain that reached it.
 *
 * An unresolvable relative specifier is a failure rather than a shrug: a walker
 * that silently dropped an edge it could not follow would report a clean
 * closure for exactly the graph it could not see.
 */
function closureFrom(read: ReadSource, roots: readonly string[]): Map<string, readonly string[]> {
  const reached = new Map<string, readonly string[]>();
  const queue: { readonly path: string; readonly via: readonly string[] }[] = roots.map((path) => ({
    path,
    via: [path],
  }));
  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined) {
      break;
    }
    if (reached.has(next.path)) {
      continue;
    }
    reached.set(next.path, next.via);
    const text = read(next.path);
    if (text === null) {
      throw new Error(`the closure walker could not read ${next.path}`);
    }
    for (const specifier of relativeSpecifiers(text)) {
      const target = resolveSpecifier(read, next.path, specifier);
      if (target === null) {
        throw new Error(`${next.path} names ${specifier}, which resolves to nothing`);
      }
      queue.push({ path: target, via: [...next.via, target] });
    }
  }
  return reached;
}

/** Every source file under one repository-relative directory. */
function sourcesUnder(relative: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(join(PROJECT_ROOT, directory), { withFileTypes: true })) {
      const path = posix.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
        found.push(path);
      }
    }
  };
  walk(relative);
  return found;
}

function breachesIn(closure: Map<string, readonly string[]>): string[] {
  const breaches: string[] = [];
  for (const [path, via] of closure) {
    if (FORBIDDEN_ROOTS.some((root) => path.startsWith(root))) {
      breaches.push(via.join(' -> '));
    }
  }
  return breaches;
}

describe('M3: no module under core/ reaches render/ or ui/ by any number of hops', () => {
  it('resolves the whole closure and finds no forbidden file in it', () => {
    const roots = sourcesUnder('src/core');
    // Non-vacuity in both directions: the roots are the real ones, and the
    // closure really was walked rather than answered from an empty queue.
    expect(roots.length).toBeGreaterThan(8);
    expect(roots).toContain('src/core/table.ts');
    const closure = closureFrom(fromDisk, roots);
    expect(closure.size).toBeGreaterThanOrEqual(roots.length);
    expect([...closure.keys()]).toContain('src/core/cards.ts');

    expect(breachesIn(closure), 'core/ reaches a forbidden layer').toEqual([]);
  });

  it('sees a breach two hops away, which the lint rule cannot', () => {
    // The planted control. `bridge.ts` names neither forbidden layer in its own
    // path or in the specifier `core/` uses to reach it, so the specifier rule
    // is silent on it and the closure is not.
    const planted: Readonly<Record<string, string>> = {
      'src/core/a.ts': "import { thing } from '../storage/bridge';\nexport const a = thing;\n",
      'src/storage/bridge.ts': "export { thing } from '../ui/panel';\n",
      'src/ui/panel.ts': "export const thing = 'panel';\n",
    };
    const read: ReadSource = (path) => planted[path] ?? null;

    const closure = closureFrom(read, ['src/core/a.ts']);
    expect([...closure.keys()]).toEqual([
      'src/core/a.ts',
      'src/storage/bridge.ts',
      'src/ui/panel.ts',
    ]);
    expect(breachesIn(closure)).toEqual([
      'src/core/a.ts -> src/storage/bridge.ts -> src/ui/panel.ts',
    ]);

    // And the same walker over a graph that stops short reports nothing, so the
    // control above is about the hop rather than about the walker.
    const clean: Readonly<Record<string, string>> = {
      'src/core/a.ts': "import { thing } from './b';\nexport const a = thing;\n",
      'src/core/b.ts': "export const thing = 'b';\n",
    };
    expect(breachesIn(closureFrom((path) => clean[path] ?? null, ['src/core/a.ts']))).toEqual([]);
  });

  it('follows the four specifier forms the lint rule listens for', () => {
    const planted: Readonly<Record<string, string>> = {
      'src/core/a.ts':
        "import './b';\n" +
        "export { c } from './c';\n" +
        "const d = await import('./d');\n" +
        "const e = require('./e');\n" +
        '// import { f } from "../ui/f";\n',
      'src/core/b.ts': 'export const b = 1;\n',
      'src/core/c.ts': 'export const c = 2;\n',
      'src/core/d.ts': 'export const d = 3;\n',
      'src/core/e.ts': 'export const e = 4;\n',
    };
    const closure = closureFrom((path) => planted[path] ?? null, ['src/core/a.ts']);
    expect([...closure.keys()].sort()).toEqual([
      'src/core/a.ts',
      'src/core/b.ts',
      'src/core/c.ts',
      'src/core/d.ts',
      'src/core/e.ts',
    ]);
    // The commented-out import is not an edge, which is what keeps a prose
    // mention of `../ui/` from reading as a breach.
    expect(breachesIn(closure)).toEqual([]);
  });
});
