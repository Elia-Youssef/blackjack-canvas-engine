/**
 * Run every report, and fail on the ones that breached rather than on the first.
 *
 * `report:all` used to chain the six with `&&`, which stops at the first
 * non-zero exit. A run that breaches on the contrast audit then produces no
 * touch-target, Lighthouse or memory artifact for the same tree, so the first
 * breach hides how many others there were and CI's evidence directory comes
 * back short. Each report already decides its own verdict and writes its own
 * artifact, so the only thing missing was a runner that lets all six finish.
 *
 * Every report is still spawned through `npm run`, not by importing it: the
 * Lighthouse script carries its own install step in its `package.json` entry,
 * and running the module directly would skip it.
 *
 * Exit code is 1 if any report exited non-zero, 0 only if all six passed.
 */

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The six, in the order `report:all` has always run them. */
const REPORTS = [
  'report:bundle-size',
  'report:contrast',
  'report:touch-targets',
  'report:perf',
  'report:lighthouse',
  'report:memory',
];

function main() {
  const npmCli = process.env['npm_execpath'];
  if (npmCli === undefined || npmCli === '') {
    console.error('report:all must be run through npm, which supplies npm_execpath.');
    process.exitCode = 1;
    return;
  }

  const failed = [];
  for (const name of REPORTS) {
    console.log(`\n=== ${name} ===`);
    try {
      execFileSync(process.execPath, [npmCli, 'run', name], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
      });
    } catch (error) {
      // Bound and read, per QUALITY-BAR section 12. A non-zero exit is the
      // report saying it breached, which is the whole point of running it; any
      // other failure carries a message worth printing beside the name.
      const status = typeof error === 'object' && error !== null && 'status' in error
        ? error.status
        : null;
      console.error(`${name} exited ${String(status ?? 'abnormally')}`);
      failed.push(name);
    }
  }

  console.log('');
  if (failed.length > 0) {
    console.error(`report:all FAILED: ${failed.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`report:all passed all ${String(REPORTS.length)} reports.`);
}

main();
