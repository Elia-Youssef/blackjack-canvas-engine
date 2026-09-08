/**
 * The mutation harness's own reading of a gate. AUDIT-2, finding `Z9-01`.
 *
 * `scripts/mutation-check.mjs` is the evidence behind the claim that every other
 * gate in this project gates anything, and for most of its life it decided that
 * question from an exit status alone: any non-zero exit was "the gate went red",
 * and the child's output was discarded before anything could read it. Three
 * different events wear that face. A gate killed while it ran, a gate that
 * crashed before its first assertion and a gate whose command is missing are all
 * non-zero, and all three were printed as `detected` in a sweep that runs about
 * two hours and re-checks the environment nowhere after it starts. Both triggers
 * are on this project's record: a foreign server on the preview port reddening
 * 77 specs at `BJ-23`, and two sweeps killed at the end at `BJ-21` and `BJ-22`.
 *
 * So the discrimination is asserted here rather than described in the harness.
 * `classifyGateRun` is pure and takes a run's own facts, which is what lets a
 * unit test construct the four cases that no green tree ever produces. The
 * patterns each gate is read by are held against a real summary line and against
 * a run that printed none, because a pattern that matched everything would put
 * the defect straight back.
 *
 * The importing itself is part of the claim: the harness edits live source
 * files, and its entry-point guard is what keeps a mere import from starting a
 * sweep. A test that imports it and does not rewrite `src/` is that guard's
 * only demonstration.
 *
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { GATE_RED, classifyGateRun } from '../../scripts/mutation-check.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HARNESS = readFileSync(join(PROJECT_ROOT, 'scripts', 'mutation-check.mjs'), 'utf8');

/** A gate descriptor, as small as the classifier's contract allows. */
const GATE = { label: 'npm run test', red: GATE_RED.vitest };

/** One `spawnSync` result, with the fields a green run leaves. */
function run(over: Record<string, unknown>): Record<string, unknown> {
  return { status: 0, signal: null, error: undefined, stdout: '', stderr: '', ...over };
}

describe('Z9-01: a gate that did not reach a verdict is not evidence', () => {
  it('reads a gate that ran, asserted and failed as red', () => {
    expect(
      classifyGateRun(GATE, run({ status: 1, stdout: ' Test Files  1 failed | 42 passed (43)\n' })),
    ).toBe('red');
  });

  it('reads a gate that ran and passed as green', () => {
    expect(classifyGateRun(GATE, run({ stdout: ' Test Files  43 passed (43)\n' }))).toBe('green');
  });

  it('refuses a gate that was killed while it ran', () => {
    // The shape a timeout or a harness stop leaves: no status, a signal, and
    // whatever the gate had printed before it was stopped.
    expect(() =>
      classifyGateRun(GATE, run({ status: null, signal: 'SIGTERM', stdout: ' RUN  v4.1.11\n' })),
    ).toThrow(/killed by SIGTERM/);
  });

  it('refuses a gate that could not be started at all', () => {
    expect(() =>
      classifyGateRun(GATE, run({ status: null, error: { code: 'ENOENT' } })),
    ).toThrow(/could not be started \(ENOENT\)/);
  });

  it('refuses an exit status the gate does not use for an assertion failure', () => {
    // 2 is `scripts/report/gate.mjs`'s usage error and eslint's fatal
    // configuration error: the tool refusing its own arguments, not a breach.
    expect(() => classifyGateRun(GATE, run({ status: 2, stderr: 'usage: ...\n' }))).toThrow(
      /exited 2, which it does not use/,
    );
  });

  it("refuses an exit of one that carries no verdict of the gate's own", () => {
    // **The Windows case, and the reason the output is read at all.** An
    // externally killed child arrives here as status 1 with `signal` null, so
    // the only thing separating it from a failing assertion is whether the gate
    // printed its own summary line before it stopped.
    expect(() => classifyGateRun(GATE, run({ status: 1, stdout: ' RUN  v4.1.11\n' }))).toThrow(
      /without printing its own verdict/,
    );
  });

  it('names the gate and shows what it did print, so the stop can be acted on', () => {
    expect(() =>
      classifyGateRun(GATE, run({ status: 1, stderr: 'Error: connect ECONNREFUSED 127.0.0.1:4173\n' })),
    ).toThrow(/npm run test:[\s\S]*ECONNREFUSED/);
  });
});

describe('Z9-01: each gate is read by the summary line that gate prints', () => {
  it('matches a real red summary and not a run that printed none', () => {
    for (const [pattern, red, green] of [
      [GATE_RED.vitest, ' Test Files  1 failed | 42 passed (43)', ' Test Files  43 passed (43)'],
      [GATE_RED.eslint, '  2 problems (2 errors, 0 warnings)', ''],
      [GATE_RED.playwright, '  1 failed\n  188 passed (2.1m)', '  189 passed (2.1m)'],
      [GATE_RED.report, 'bundle-size.md FAILED with 1 breach(es).', 'bundle-size.md PASSED.'],
    ] as const) {
      expect(pattern.test(red), `${String(pattern)} does not match its own gate's red`).toBe(true);
      expect(pattern.test(green), `${String(pattern)} matches a gate that did not go red`).toBe(
        false,
      );
    }
  });

  it('gives every gate in the ledger a pattern to be read by', () => {
    // A gate descriptor with no `red` would throw on the first entry measured
    // against it rather than passing quietly, but the four constructors are
    // where a fifth gate would be added and this is the cheaper place to say so.
    for (const field of [
      'red: GATE_RED.vitest,',
      'red: GATE_RED.eslint,',
      'red: GATE_RED.playwright,',
      'red: GATE_RED.report,',
    ]) {
      expect(HARNESS, `a gate constructor lost "${field}"`).toContain(field);
    }
  });
});

describe('Z9-05: an interrupted sweep leaves neither a mutation nor a bundle', () => {
  // A `finally` does not run when a process is terminated by a signal, which is
  // the whole of the finding: measured by a signal probe kept with the audit's
  // working notes outside the repository, an interrupted entry left its
  // mutation written into the file. The handler and the discard are pinned here
  // the way `report-gates.test.ts` pins a report's no-sample guards, because
  // what they defend against cannot be produced inside a test runner: delivery
  // is the platform's, and on Windows an external kill runs no handler at all.
  it('installs the handler on both signals', () => {
    // Held with the line above it and with real newlines, so that the ledger
    // entry which quotes these two lines as an escaped string cannot satisfy
    // the pin the mutation is supposed to break.
    expect(HARNESS).toContain(
      "function main() {\n  process.on('SIGINT', onSignal);\n  process.on('SIGTERM', onSignal);\n",
    );
  });

  it('publishes how to undo the entry in flight, in both entry shapes', () => {
    expect(HARNESS).toContain('    inFlight = () => {\n      writeFileSync(path, original);\n    };');
    expect(HARNESS).toContain('    inFlight = () => {\n      rmSync(path, { force: true });\n    };');
  });

  it('discards the bundle a gate may have built under a mutation', () => {
    expect(HARNESS).toContain('function discardBuild() {\n  rmSync(DIST, { recursive: true, force: true });\n}');
    expect(HARNESS).toContain('  try {\n    sweep();\n  } finally {');
    expect(HARNESS).toContain("    discardBuild();\n    console.log('dist/ was removed");
  });
});
