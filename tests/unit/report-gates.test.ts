/**
 * The measurement reports, as gates. `BJ-22`, items `G2`, `H1` to `H5`, `H7`
 * and `D3`.
 *
 * Six scripts under `scripts/report/` measure the shipped bundle against a
 * stated number and exit non-zero when a number is missed. Two things have to be
 * true of each of them or the gate is decoration, and neither can be shown by
 * running the script on a build that passes:
 *
 *   1. **The threshold is the one the documents state.** A script whose ceiling
 *      drifted upward would report PASS for a build that got worse, and nothing
 *      else in the project would notice. Every constant is pinned to
 *      `tests/reference/design-contract.md` section 6 here, exactly as every
 *      colour is pinned to section 16 by `tokens.test.ts`.
 *   2. **A breach reaches the exit code.** One function decides, `finish` in
 *      `scripts/report/support.mjs`, and it is exercised in both directions
 *      below rather than described.
 *
 * **Why this file is the detector for most of the report mutation entries.** A
 * mutation to a threshold or to a sampler's guard has to be shown to be caught,
 * and the honest way to catch it is to run the script; but the contrast audit
 * takes four minutes and the memory soak takes half an hour, so a ledger entry
 * per guard would add hours to a sweep that already takes two. The scripts whose
 * gates are cheap keep end-to-end entries; the rest are pinned here, where the
 * detection costs milliseconds and is no less real: a constant that moves fails
 * this file, and a guard that is deleted fails this file.
 *
 * @vitest-environment node
 */

import { readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONTRACT = readFileSync(join(PROJECT_ROOT, 'tests', 'reference', 'design-contract.md'), 'utf8');

/** The text of one numbered section of the contract. */
function section(heading: string): string {
  const start = CONTRACT.indexOf(`## ${heading}`);
  expect(start, `section "${heading}" not found`).toBeGreaterThan(-1);
  const after = CONTRACT.indexOf('\n## ', start + 1);
  return CONTRACT.slice(start, after === -1 ? CONTRACT.length : after);
}

const THRESHOLDS = section('6. Measured thresholds');

/** `| \`name\` | value | ... |` from the contract, as a number. */
function stated(name: string): number {
  const row = new RegExp(`\\|\\s*\`${name}\`\\s*\\|\\s*([\\d.]+)\\s*\\|`).exec(THRESHOLDS);
  expect(row?.[1], `${name} is not in the design contract`).toBeDefined();
  return Number(row?.[1]);
}

/** One report script's source. */
function script(name: string): string {
  return readFileSync(join(PROJECT_ROOT, 'scripts', 'report', name), 'utf8');
}

/** The right-hand side of `const NAME = <number>` in a script. */
function constantIn(source: string, name: string): number {
  const found = new RegExp(`const ${name} = ([^;]+);`).exec(source);
  expect(found?.[1], `${name} is not declared`).toBeDefined();
  const text = (found?.[1] ?? '').replace(/_/g, '');
  // The declarations are numbers or a product of them: `2 * 1024 * 1024`,
  // `40 * KB`, `15 * 60_000`. Evaluating the arithmetic keeps the source
  // readable and still pins the value.
  const parts = text.split('*').map((part) => part.trim());
  let value = 1;
  for (const part of parts) {
    if (part === 'KB') {
      value *= 1024;
      continue;
    }
    expect(Number.isFinite(Number(part)), `${name} is not arithmetic on numbers: ${text}`).toBe(true);
    value *= Number(part);
  }
  return value;
}

const BUNDLE = script('bundle-size.mjs');
const CONTRAST = script('contrast.mjs');
const GRAPHICS = script('graphics.mjs');
const TARGETS = script('touch-targets.mjs');
const PERF = script('perf.mjs');
const LIGHTHOUSE = script('lighthouse.mjs');
const MEMORY = script('memory.mjs');

describe('BJ-22: every measured threshold is the one the documents state', () => {
  it('pins the bundle ceilings', () => {
    expect(constantIn(BUNDLE, 'JS_CEILING')).toBe(stated('javascript-gzip-kb') * 1024);
    expect(constantIn(BUNDLE, 'TOTAL_CEILING')).toBe(stated('total-transfer-gzip-kb') * 1024);
  });

  it('pins the load metrics', () => {
    expect(constantIn(LIGHTHOUSE, 'LCP_MS')).toBe(stated('lcp-ms'));
    expect(constantIn(LIGHTHOUSE, 'TBT_MS')).toBe(stated('total-blocking-time-ms'));
  });

  it('pins the Lighthouse preset the criterion names', () => {
    // Asserted out of the result by the script rather than set by it, so the
    // three numbers have to be the criterion's here as well or the script would
    // be asserting a preset nobody asked for.
    const found = /const EXPECTED_THROTTLE = \{([^}]+)\}/.exec(LIGHTHOUSE);
    expect(found?.[1], 'no expected throttle in the Lighthouse report').toBeDefined();
    const body = found?.[1] ?? '';
    expect(body).toContain(`rttMs: ${String(stated('lighthouse-rtt-ms'))}`);
    expect(body).toContain(`throughputKbps: ${String(stated('lighthouse-throughput-kbps'))}`);
    expect(body).toContain(`cpuSlowdownMultiplier: ${String(stated('lighthouse-cpu-slowdown'))}`);
  });

  it('pins the frame budget and the throttle it is measured under', () => {
    expect(constantIn(PERF, 'FRAME_P95')).toBe(stated('frame-p95-ms'));
    expect(constantIn(PERF, 'FRAME_P99')).toBe(stated('frame-p99-ms'));
    expect(constantIn(PERF, 'APP_P95')).toBe(stated('app-work-p95-ms'));
    expect(constantIn(PERF, 'LONG_TASK')).toBe(stated('long-task-ms'));
    expect(constantIn(PERF, 'SLOW_FRAME_FACTOR')).toBe(stated('slow-frame-factor'));
    expect(constantIn(PERF, 'SLOW_FRAME_SHARE')).toBe(stated('slow-frame-share-percent') / 100);
    expect(constantIn(PERF, 'CPU_THROTTLE')).toBe(stated('cpu-throttle'));
    // The sample the criterion names, in milliseconds.
    expect(constantIn(PERF, 'SAMPLE_MS')).toBe(60_000);
  });

  it('gates H4 on the worst run and not on the median of three', () => {
    // **The statistic, not only the threshold.** `LONG_TASK` above pins the
    // 50 ms; this pins what 50 ms is compared against. The row reported the
    // median of three per-run maxima from the day the script was written, so
    // `[52, 48, 48]` passed a row whose own words are "no task exceeds 50 ms",
    // and that triple is the exact shape of the compositor residual this
    // build's report documents and CI watches. The disclosure lived in a
    // comment and in the report's prose and in no gate.
    expect(PERF, 'the H4 row does not gate on the worst run').toContain(
      '`<= ${String(LONG_TASK)} ms`, worstAnyRun <= LONG_TASK],',
    );
    expect(PERF, 'the median is gating again').not.toContain(
      '`<= ${String(LONG_TASK)} ms`, results.worstTask <= LONG_TASK],',
    );
    // The median is still reported, because dropping it would trade one
    // partial view of three runs for another.
    expect(PERF).toContain("'`H4` worst task, median of the three runs',");
    expect(PERF).toContain("'informational, not gated',");
  });

  it('pins the touch-target floor and its clearance', () => {
    expect(constantIn(TARGETS, 'MIN_SIDE')).toBe(stated('touch-target-px'));
    expect(constantIn(TARGETS, 'MIN_CLEARANCE')).toBe(stated('touch-clearance-px'));
  });

  it('pins the two contrast ratios', () => {
    expect(constantIn(GRAPHICS, 'TEXT_RATIO')).toBe(stated('text-contrast-ratio'));
    expect(constantIn(GRAPHICS, 'NON_TEXT_RATIO')).toBe(stated('non-text-contrast-ratio'));
  });

  it('pins the heap ceiling and the checkpoint interval', () => {
    expect(constantIn(MEMORY, 'GROWTH_CEILING')).toBe(stated('retained-growth-mb') * 1024 * 1024);
    expect(MEMORY).toContain(`const minutes = Number.isFinite(override) && override > 0 ? override : ${String(stated('memory-checkpoint-minutes'))};`);
    expect(MEMORY).toContain('const CHECKPOINTS = [0, 15, 30];');
  });
});

describe('BJ-22: every graphic the criterion names is in the committed list', () => {
  it('carries the four the criterion names, by name', () => {
    // "The enumerated graphics list is committed alongside the audit script and
    // includes the card margin, the chip edge ring, the felt rail and the hand
    // value pill". A list that lost one of them would still audit cleanly.
    for (const id of [
      'card-margin',
      'chip-edge-ring-on-felt',
      'table-edge-on-page',
      'felt-rail-on-felt',
      'hand-value-pill',
    ]) {
      expect(GRAPHICS, `${id} is not in the enumerated graphics list`).toContain(`id: '${id}',`);
    }
  });

  it('measures both themes, both palettes and all three felts', () => {
    expect(CONTRAST).toContain("const TABLES = ['bronze', 'silver', 'gold'];");
    expect(CONTRAST).toContain("const THEMES = ['dark', 'light'];");
    expect(CONTRAST).toContain("forcedColors: 'active'");
    expect(CONTRAST).toContain("forcedColors: 'none'");
  });
});

describe('BJ-22: a sampler that measures nothing is a failure and not a silence', () => {
  /**
   * The guard each script carries, in its own words.
   *
   * These are the lines that turn "the sampler found nothing" into a breach.
   * Without them every script would report a clean sweep the day its sampler
   * stopped finding anything, which is the one failure a measurement script is
   * most likely to have and least likely to notice.
   */
  const guards: readonly (readonly [string, string, string])[] = [
    ['contrast.mjs', CONTRAST, 'no sample, so the graphic was not measured'],
    ['contrast.mjs', CONTRAST, 'the can-see control was not reported below threshold'],
    ['contrast.mjs', CONTRAST, 'so the sampler found some other pair'],
    ['contrast.mjs', CONTRAST, 'not the ${String(PLANTED_RATIO)}:1 those two colours are apart'],
    ['touch-targets.mjs', TARGETS, 'the can-see control was not reported as a breach'],
    ['touch-targets.mjs', TARGETS, 'targets were measured, so the census found almost nothing'],
    ['bundle-size.mjs', BUNDLE, 'the build emitted no files, so there is nothing to measure'],
    ['bundle-size.mjs', BUNDLE, 'no JavaScript was counted, so the sampler is measuring nothing'],
    // AUDIT-1: the exclusion is an explicit set, and a file that is in neither
    // the page nor that set is a shipped byte nobody measured. Without this
    // breach the residual reading counted only what the HTML named, and 218 KB
    // gzipped of eagerly fetched chunk was demonstrated invisible to both
    // ceilings while the report printed PASS with headroom.
    ['bundle-size.mjs', BUNDLE, '  if (unaccounted.length > 0) {'],
    ['bundle-size.mjs', BUNDLE, 'emitted but neither named by the page nor listed as not fetched'],
    ['perf.mjs', PERF, 'the long-task observer never attached, so H4 measured nothing'],
    ['perf.mjs', PERF, 'frames were sampled, so the sampler saw almost nothing'],
    ['perf.mjs', PERF, '    if (entry.rounds < MIN_ROUNDS) {'],
    ['perf.mjs', PERF, 'the blank-page control sampled only '],
    ['memory.mjs', MEMORY, 'a snapshot reported no retained size, so the parser read nothing'],
    ['memory.mjs', MEMORY, 'the timer census did not follow a timer it was shown'],
    ['memory.mjs', MEMORY, '  if (shortened) {'],
    ['lighthouse.mjs', LIGHTHOUSE, 'lighthouse returned no result'],
    ['lighthouse.mjs', LIGHTHOUSE, 'not the ${String(wanted)} the criterion names'],
  ];

  it('keeps every no-sample guard', () => {
    for (const [name, source, guard] of guards) {
      expect(source, `${name} lost the guard "${guard}"`).toContain(guard);
    }
  });

  it('counts the rounds a perf sample played from the page, not from a constant', () => {
    // **The guard above is only worth its line if the number it reads is real.**
    // The review found this script returning a hard-coded `rounds: 0` field
    // that nothing consumed, neutered the driver's betting arm and got four of
    // five rows green with zero rounds dealt. The count now comes from the
    // machine's own readout, taken before and after the sample.
    expect(PERF).toContain('window.__bjGame?.readout().rounds');
    expect(PERF).toContain('rounds: roundsAfter - roundsBefore,');
    expect(PERF, 'the dead rounds field is back').not.toContain('rounds: 0 ');
    expect(PERF, 'the dead rounds field is back').not.toContain('rounds: 0,');
  });

  it('reads the H1 p95 row against a measured floor and pins the interval too', () => {
    // The p95 ceiling is the delivered interval plus one tick of the
    // instrument, which is only honest while the delivered interval has a
    // ceiling of its own: without the second row a machine at 30 Hz would float
    // the first one up with it and pass.
    expect(constantIn(PERF, 'TIMESTAMP_QUANTUM')).toBe(0.1);
    expect(PERF).toContain('const frameCeiling = round2(results.interval + TIMESTAMP_QUANTUM);');
    expect(PERF).toContain('round2(results.interval) <= FRAME_P95');
    // And the floor is measured every run rather than asserted in a comment.
    expect(PERF).toContain('const blank = await sample(page, CONTROL_MS, false);');
    expect(PERF).toContain("await page.goto('about:blank');");
  });

  it('checks the contrast control against the pair it planted', () => {
    // The review found the control reporting 3.59:1, which is the planted
    // background against the page ground caught at the element's edge, not the
    // planted pair at all. Both readings are under threshold, so the control
    // passed while measuring the wrong two colours.
    expect(CONTRAST).toContain("const PLANTED_INK = '#777777';");
    expect(CONTRAST).toContain("const PLANTED_BACKGROUND = '#808080';");
    expect(CONTRAST).toContain('const PLANTED_RATIO = 1.13;');
    expect(CONTRAST).toContain('controlInk !== PLANTED_INK || controlBackground !== PLANTED_BACKGROUND');
    expect(CONTRAST).toContain('controlRatio !== PLANTED_RATIO');
    // And it reads a region strictly inside the element, which is what stops
    // the page ground from being the pair the sampler finds.
    expect(constantIn(CONTRAST, 'PLANTED_INSET')).toBe(2);
    expect(CONTRAST).toContain('x: plantedBox.x + PLANTED_INSET,');
  });

  it('names the bytes every report measured', () => {
    // A number taken over a `dist/` nobody can identify afterwards is a number
    // about nothing in particular, and these reports gate a merge.
    const support = readFileSync(
      join(PROJECT_ROOT, 'scripts', 'report', 'support.mjs'),
      'utf8',
    );
    expect(support).toContain("['Build fingerprint', `\\`${distFingerprint()}\\``],");
    expect(support).toContain('return fingerprint(hashTree(DIST));');
  });

  it('routes every report through the one function that sets the exit code', () => {
    for (const [name, source] of [
      ['contrast.mjs', CONTRAST],
      ['touch-targets.mjs', TARGETS],
      ['bundle-size.mjs', BUNDLE],
      ['perf.mjs', PERF],
      ['memory.mjs', MEMORY],
      ['lighthouse.mjs', LIGHTHOUSE],
    ] as const) {
      expect(source, `${name} does not finish through the shared exit path`).toMatch(
        /finish\('[a-z-]+\.md', lines, breaches\)/,
      );
    }
  });
});

describe('BJ-22: a breach reaches the exit code', () => {
  const held = process.exitCode;
  const control = 'gate-control.md';

  afterEach(async () => {
    process.exitCode = held;
    // The control writes a report, because that is what `finish` does, and the
    // evidence directory is not a place to leave litter: the two copies it can
    // have written go again.
    const { REPORTS } = (await import('../../scripts/report/support.mjs')) as {
      REPORTS: string;
    };
    for (const at of [join(REPORTS, control), join(REPORTS, '..', '..', '..', '..', 'artifacts', 'reports', control)]) {
      rmSync(at, { force: true });
    }
  });

  it('sets a non-zero exit code for a breach and leaves it alone otherwise', async () => {
    // The whole of "a report that cannot FAIL is not a gate", exercised rather
    // than described. `finish` writes its report either way, so the report of a
    // failing run is still there to read, which is what the CI upload is for.
    const { finish } = (await import('../../scripts/report/support.mjs')) as {
      finish: (name: string, lines: string[], breaches: string[]) => boolean;
    };

    process.exitCode = 0;
    expect(finish(control, ['# control', ''], [])).toBe(true);
    expect(process.exitCode).toBe(0);

    expect(finish(control, ['# control', ''], ['a threshold was missed'])).toBe(false);
    expect(process.exitCode).toBe(1);
  });
});
