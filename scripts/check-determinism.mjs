/**
 * Item A6, Minor, 9 points.
 *
 *   "The build is deterministic: two builds from an identical source tree
 *    produce byte-identical output, compared by hash over every emitted file.
 *    A prior packaging script stamped mtimes and broke this."
 *
 * Building the same tree twice in a row and finding the same bytes is a weak
 * test, because nothing about the second run is different, so this does three
 * things to make the second build genuinely adversarial:
 *
 *   1. Every input file's mtime is set to a different timestamp before each
 *      build. This is the exact defect the item names. A build that stamps
 *      mtimes cannot pass.
 *   2. The two builds run in separate processes, with a different timezone
 *      each, so a stamped local date or time cannot pass either.
 *   3. Each build gets a different VITE_ prefixed environment variable. Vite
 *      inlines those where they are referenced, so if any build-time
 *      configuration has crept into the emitted bytes, the hashes move. This is
 *      the same property item A2 is inspected for, measured rather than read.
 *
 * The source tree is hashed before the first build and after the second, and
 * the run fails if those differ. Otherwise "identical source tree" would be an
 * assumption rather than a finding.
 *
 * Writes artifacts/reports/build.md at the repository root, through the same
 * writer every `report/*` script uses, so the workspace's mirror of the
 * evidence directory carries this report at the same age as the other six
 * rather than at whatever age it was last copied by hand. Exits 1 on any
 * mismatch, so it gates the merge.
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compare, fingerprint, hashTree } from './build-fingerprint.mjs';
import { writeReport } from './report/support.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = join(PROJECT_ROOT, 'artifacts', 'reports', 'build.md');
const WORK = join(PROJECT_ROOT, '.determinism');
const VITE_BIN = join(PROJECT_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

// Everything the build reads. Hashed to prove the tree did not move, and
// mtime-bumped to prove the build does not care when it last moved.
const INPUTS = ['src', 'packages', 'index.html', 'vite.config.ts', 'tsconfig.json'];

const RUNS = [
  { id: 'a', out: join(WORK, 'a'), mtime: Date.UTC(2001, 0, 1) / 1000, tz: 'UTC', probe: 'alpha' },
  {
    id: 'b',
    out: join(WORK, 'b'),
    mtime: Date.UTC(2033, 5, 15, 13, 45) / 1000,
    tz: 'Asia/Tokyo',
    probe: 'omega',
  },
];

function listFiles(target) {
  const found = [];
  function walk(current) {
    const info = statSync(current);
    if (info.isFile()) {
      found.push(current);
      return;
    }
    if (!info.isDirectory()) {
      return;
    }
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      walk(join(current, entry.name));
    }
  }
  walk(target);
  return found;
}

function inputFiles() {
  return INPUTS.flatMap((relativePath) => listFiles(join(PROJECT_ROOT, relativePath)));
}

function stampMtimes(seconds) {
  for (const file of inputFiles()) {
    utimesSync(file, seconds, seconds);
  }
}

/** Every input's real mtime, so the tree can be handed back as it was found. */
function captureMtimes() {
  const saved = new Map();
  for (const file of inputFiles()) {
    const info = statSync(file);
    saved.set(file, [info.atime, info.mtime]);
  }
  return saved;
}

/**
 * Put the original mtimes back.
 *
 * Without this the check leaves every source file stamped with the second
 * build's date, which is in the future. Content is untouched either way, but a
 * tree full of files modified in 2033 breaks `find -newer`, confuses every
 * incremental build cache downstream, and looks like corruption to whoever
 * opens the directory next. The stamping is a probe, not a result, so it gets
 * cleaned up like one.
 */
function restoreMtimes(saved) {
  for (const [file, [atime, mtime]] of saved) {
    if (existsSync(file)) {
      utimesSync(file, atime, mtime);
    }
  }
}

function hashInputs() {
  const files = INPUTS.flatMap((relativePath) => {
    const base = join(PROJECT_ROOT, relativePath);
    const info = statSync(base);
    if (info.isFile()) {
      return hashTree(dirname(base)).filter((f) => f.path === relativePath);
    }
    return hashTree(base, { skip: ['node_modules'] }).map((f) => ({
      ...f,
      path: `${relativePath}/${f.path}`,
    }));
  });
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return files;
}

function build(run) {
  execFileSync(
    process.execPath,
    [VITE_BIN, 'build', '--outDir', join('.determinism', run.id), '--emptyOutDir', '--logLevel', 'warn'],
    {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        TZ: run.tz,
        VITE_DETERMINISM_PROBE: run.probe,
      },
    },
  );
}

function table(rows) {
  return rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
}

function report(result) {
  const status = result.identical ? 'PASS' : 'FAIL';
  const lines = [];

  lines.push('# Deterministic build report');
  lines.push('');
  lines.push(`**${status}.** Item \`A6\`, Minor, 9 points. Generated by`);
  lines.push('`scripts/check-determinism.mjs`. Do not edit by hand.');
  lines.push('');
  lines.push('Two builds of Blackjack from one source tree, compared by sha256 over every emitted file.');
  lines.push('The second build is made adversarial rather than merely repeated: every input file gets a');
  lines.push('different mtime, the process runs under a different timezone, and a different `VITE_` prefixed');
  lines.push('environment variable is set. A build that stamps a modification time, a local date or any part');
  lines.push('of its environment into the bundle cannot produce the same bytes twice under those conditions.');
  lines.push('');
  lines.push('## Result');
  lines.push('');
  lines.push(
    table([
      ['Measure', 'Value'],
      ['---', '---'],
      ['Verdict', `**${status}**`],
      ['Emitted files compared', String(result.buildA.length)],
      ['Files only in build A', String(result.onlyInA.length)],
      ['Files only in build B', String(result.onlyInB.length)],
      ['Files differing in content', String(result.differing.length)],
      ['Build A fingerprint', `\`${result.fingerprintA}\``],
      ['Build B fingerprint', `\`${result.fingerprintB}\``],
      ['Source tree before build A', `\`${result.sourceBefore}\``],
      ['Source tree after build B', `\`${result.sourceAfter}\``],
      ['Generated', result.generated],
    ]),
  );
  lines.push('');
  lines.push('## Conditions varied between the two builds');
  lines.push('');
  lines.push(
    table([
      ['Condition', 'Build A', 'Build B'],
      ['---', '---', '---'],
      ['Input file mtimes', '2001-01-01T00:00:00Z', '2033-06-15T13:45:00Z'],
      ['Process timezone', '`UTC`', '`Asia/Tokyo`'],
      ['`VITE_DETERMINISM_PROBE`', '`alpha`', '`omega`'],
      ['Process', 'separate', 'separate'],
    ]),
  );
  lines.push('');
  lines.push('## Emitted files');
  lines.push('');
  lines.push(
    table([
      ['File', 'Bytes', 'sha256'],
      ['---', '---:', '---'],
      ...result.buildA.map((file) => [`\`${file.path}\``, String(file.bytes), `\`${file.sha256}\``]),
    ]),
  );
  lines.push('');

  if (!result.identical) {
    lines.push('## Differences');
    lines.push('');
    for (const path of result.onlyInA) {
      lines.push(`- only in build A: \`${path}\``);
    }
    for (const path of result.onlyInB) {
      lines.push(`- only in build B: \`${path}\``);
    }
    for (const diff of result.differing) {
      lines.push(`- differs: \`${diff.path}\``);
      lines.push(`  - build A \`${diff.a}\``);
      lines.push(`  - build B \`${diff.b}\``);
    }
    lines.push('');
  }

  lines.push('## Can this check fail?');
  lines.push('');
  lines.push('A comparison that always answers "identical" would produce a PASS above on any tree at all,');
  lines.push('which is the deleted packaging defect in reverse. Two things stand against that, and neither');
  lines.push('of them is this report:');
  lines.push('');
  lines.push('- `tests/unit/build-fingerprint.test.ts` flips one byte, adds one file and');
  lines.push('  renames one file, and requires each to be found. It runs in the unit gate, which CI runs');
  lines.push('  before this check.');
  lines.push('- `npm run verify:mutations` breaks the comparison two ways, once by hard-coding the verdict');
  lines.push('  and once by hashing mtime instead of content, and requires the unit gate to go red both');
  lines.push('  times.');
  lines.push('');
  lines.push('## How to reproduce');
  lines.push('');
  lines.push('```bash');
  lines.push('npm ci && npm run verify:build');
  lines.push('```');
  lines.push('');

  writeReport('build.md', lines);
}

function main() {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });

  const sourceBefore = fingerprint(hashInputs());

  // The mtimes are a probe, so they are handed back exactly as found even if a
  // build throws. See restoreMtimes.
  const savedMtimes = captureMtimes();
  try {
    for (const run of RUNS) {
      stampMtimes(run.mtime);
      build(run);
    }
  } finally {
    restoreMtimes(savedMtimes);
  }

  const sourceAfter = fingerprint(hashInputs());

  const buildA = hashTree(RUNS[0].out);
  const buildB = hashTree(RUNS[1].out);
  const comparison = compare(buildA, buildB);

  const result = {
    ...comparison,
    identical: comparison.identical && sourceBefore === sourceAfter && buildA.length > 0,
    buildA,
    buildB,
    fingerprintA: fingerprint(buildA),
    fingerprintB: fingerprint(buildB),
    sourceBefore,
    sourceAfter,
    generated: new Date().toISOString(),
  };

  report(result);

  if (sourceBefore !== sourceAfter) {
    console.error('FAIL: the source tree changed between the two builds.');
  }
  if (buildA.length === 0) {
    console.error('FAIL: the build emitted no files, so there is nothing to compare.');
  }
  for (const diff of comparison.differing) {
    console.error(`FAIL: ${diff.path} differs between builds.`);
  }
  for (const path of [...comparison.onlyInA, ...comparison.onlyInB]) {
    console.error(`FAIL: ${path} is present in only one build.`);
  }

  if (!result.identical) {
    console.error(`Deterministic build check FAILED. Report: ${REPORT}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Deterministic build check PASSED: ${String(buildA.length)} files, fingerprint ${result.fingerprintA}`,
  );
  console.log(`Report: ${REPORT}`);
  rmSync(WORK, { recursive: true, force: true });
}

main();
