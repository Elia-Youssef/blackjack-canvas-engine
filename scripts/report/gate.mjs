/**
 * One measurement report, run as a gate. `BJ-22`.
 *
 * `scripts/mutation-check.mjs` invokes a gate as a single `node <bin> <argv>`,
 * and a report script measures the **built** `dist/`, so an entry that mutated
 * `src/` and then ran the report alone would measure the bundle from before the
 * mutation and report the mutation undetected. That is the stale-server defect
 * `BJ-14` recorded, in a second shape. This builds first and then runs the
 * report, so the bytes under measurement are always the mutated ones.
 *
 * Usage: `node scripts/report/gate.mjs bundle-size`
 */

import { build } from 'vite';

import { PROJECT_ROOT } from './support.mjs';

const name = process.argv[2];
if (name === undefined || !/^[a-z-]+$/.test(name)) {
  console.error('usage: node scripts/report/gate.mjs <report-name>');
  process.exit(2);
}

await build({ root: PROJECT_ROOT, logLevel: 'error' });
await import(`./${name}.mjs`);
