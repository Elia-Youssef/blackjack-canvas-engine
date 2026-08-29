/**
 * What every `report/*` measurement script shares. `BJ-22`.
 *
 * The measured items of the sheet, `G2`, `H1` to `H5`, `H7` and `D3`, are all
 * method **A**: a value measured against a stated numeric threshold, recorded as
 * an artifact, and gating the merge. That shape is the same six times over, so
 * it is written once here: serve the built `dist/`, drive it, write a markdown
 * report with the measurement beside the threshold and a verdict per row, and
 * exit non-zero when any row breaches.
 *
 * **A report that cannot FAIL is not a gate.** Every script built on this ends
 * in `finish`, which sets a non-zero exit code the moment one row is below its
 * threshold, and `scripts/mutation-check.mjs` carries an entry per script that
 * moves a threshold or blinds a sampler and requires the run to go red.
 *
 * The reports land in the project's own `artifacts/reports/`, which is where
 * `scripts/check-determinism.mjs` has always written `build.md` and which
 * ACCEPTANCE section 5's evidence index names. That directory is gitignored: a
 * measurement is evidence produced by a run, uploaded by the CI job that made
 * it, and never a committed file that could drift from the code it describes.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fingerprint, hashTree } from '../build-fingerprint.mjs';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REPORTS = join(PROJECT_ROOT, 'artifacts', 'reports');
export const DIST = join(PROJECT_ROOT, 'dist');

/**
 * The workspace's own reports directory, one level above the project.
 *
 * A **mirror** and never the home: the repository is `BlackJack/BlackJack`, so
 * CI has no such directory and a script that depended on one would fail there.
 * It is written only when it already exists, which is true on the machine the
 * document set lives on and false everywhere else.
 */
const WORKSPACE_REPORTS = resolve(PROJECT_ROOT, '..', '..', 'artifacts', 'reports');

/** Write one report, and mirror it to the workspace copy when there is one. */
export function writeReport(name, lines) {
  const body = `${lines.join('\n')}\n`;
  mkdirSync(REPORTS, { recursive: true });
  const path = join(REPORTS, name);
  writeFileSync(path, body, { encoding: 'utf8' });
  if (existsSync(WORKSPACE_REPORTS) && statSync(WORKSPACE_REPORTS).isDirectory()) {
    writeFileSync(join(WORKSPACE_REPORTS, name), body, { encoding: 'utf8' });
  }
  return path;
}

/** Fail loudly rather than measuring a directory that was never built. */
export function requireDist() {
  if (!existsSync(join(DIST, 'index.html'))) {
    throw new Error(`no built bundle at ${DIST}; run "npm run build" first`);
  }
}

/**
 * Serve the built `dist/` and hand back its origin.
 *
 * `vite preview` over `dist/`, never the dev server, for the reason
 * `playwright.config.ts` gives: the whole claim of item `A2` is that what ships
 * is a directory of static files, so a measurement of a transform pipeline that
 * will not exist in production measures the wrong thing.
 *
 * The port is the caller's, and it is deliberately not the browser gate's 4173:
 * a report script and a Playwright run can then be in flight at once without
 * either serving the other's bytes, which is the stale-server hazard `BJ-14`
 * recorded.
 */
export async function startPreview(port) {
  requireDist();
  const child = spawn(
    process.execPath,
    [join(PROJECT_ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview',
      '--port', String(port), '--strictPort'],
    { cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const url = `http://localhost:${String(port)}`;
  const errors = [];
  child.stderr.on('data', (chunk) => errors.push(String(chunk)));

  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`vite preview exited early: ${errors.join('')}`);
    }
    const ready = await fetch(url).then((response) => response.ok, () => false);
    if (ready) {
      break;
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`vite preview never answered on ${url}: ${errors.join('')}`);
    }
    await new Promise((wake) => setTimeout(wake, 200));
  }

  return {
    url,
    stop() {
      child.kill();
    },
  };
}

// ---------------------------------------------------------------------------
// WCAG contrast, over pixels rather than over tokens
// ---------------------------------------------------------------------------

function channel(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an `[r, g, b]` pixel. */
export function luminance(rgb) {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

/** The WCAG contrast ratio between two `[r, g, b]` pixels. */
export function contrastOf(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `#rrggbb` for a pixel, so a report row names the colour it measured. */
export function hexOf(rgb) {
  return `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

/** Two decimal places, the precision every ratio in SPEC 16 is quoted at. */
export function round2(value) {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// The report itself
// ---------------------------------------------------------------------------

/** A markdown table from a header row and body rows. */
export function table(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ];
}

/** PASS or FAIL, in the one form every report writes it. */
export function verdict(ok) {
  return ok ? 'PASS' : '**FAIL**';
}

/**
 * Write the report and set the exit code from the rows.
 *
 * One place decides, so no script can report a failure and exit zero. The
 * console lines are what a CI log shows: the verdict, the report path, and one
 * line per breach naming the measurement and the threshold it missed.
 */
export function finish(name, lines, breaches) {
  const path = writeReport(name, lines);
  for (const breach of breaches) {
    console.error(`FAIL: ${breach}`);
  }
  console.log(`Report: ${path}`);
  if (breaches.length > 0) {
    console.error(`${name} FAILED with ${String(breaches.length)} breach(es).`);
    process.exitCode = 1;
    return false;
  }
  console.log(`${name} PASSED.`);
  return true;
}

/**
 * The fingerprint of the built bundle, by the hash `npm run verify:build` uses.
 *
 * The same `hashTree` and the same `fingerprint` over the same emitted file
 * set, so the string a report carries is the string the determinism gate
 * publishes for the same tree, and the two can be compared by eye.
 */
export function distFingerprint() {
  if (!existsSync(join(DIST, 'index.html'))) {
    return 'no built bundle';
  }
  return fingerprint(hashTree(DIST));
}

/**
 * The environment block every report carries, so a number has conditions.
 *
 * **The fingerprint names the bytes that were measured**, which is the whole
 * point of a report that gates a merge: a number taken over a `dist/` nobody
 * can identify afterwards is a number about nothing in particular. It is the
 * one condition here that is about the subject rather than the machine.
 */
export function environmentRows(extra = []) {
  return [
    ['Node', process.version],
    ['Platform', `${process.platform} ${process.arch}`],
    ['Build fingerprint', `\`${distFingerprint()}\``],
    ['Generated', new Date().toISOString()],
    ...extra,
  ];
}
