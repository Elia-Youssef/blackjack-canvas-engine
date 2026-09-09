/**
 * What CI actually runs, against what the config declares. AUDIT-2, `Z10-01`.
 *
 * `browser-matrix.test.ts` grades item `A3`'s composition off
 * `playwright.config.ts`, and that is one layer short of the claim. The set of
 * projects a merge is gated on is a hand-typed string in
 * `.github/workflows/ci.yml`, and until this file existed nothing in the
 * repository read `.github` at all: deleting ` --project=webkit` from the
 * browser step left the config untouched, every unit test green, all 700-odd
 * ledger entries green and the merge gate green, with the browser evidence
 * covering two engines instead of three. The sharpest form is one flag, and it
 * is already in the file: appending `--ignore-snapshots` to the visual job's
 * command makes item `E8`'s only bitmap comparison inert while the required
 * check still reports success.
 *
 * So the relation is asserted here, off the two files themselves. The union of
 * the projects the jobs name is the project set the config declares, in both
 * directions, so a deleted project, a renamed one and a job that asks for a
 * project nobody declares are all red here. The narrowing flags are read as
 * well, because a job that runs every project and compares nothing is the same
 * hole with a different spelling.
 *
 * **What this file deliberately does not do is parse YAML.** There is no YAML
 * dependency in this project and adding one to read four command lines would be
 * a poor trade; the file is split on its job keys and the commands are read as
 * text, which is how the workflow is written and how it is reviewed.
 *
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import config from '../../playwright.config';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOW = readFileSync(join(PROJECT_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
const PACKAGE = JSON.parse(
  readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8'),
) as { devDependencies: Record<string, string> };

/** The workflow's jobs, by name, as the text under each job key. */
function jobs(): Map<string, string> {
  const found = new Map<string, string>();
  const all = WORKFLOW.split(/\r?\n/);
  // From the `jobs:` key onward, so that the two-space keys under `on:` are not
  // read as jobs with steps of their own.
  const at = all.indexOf('jobs:');
  expect(at, 'ci.yml declares no jobs').toBeGreaterThan(-1);
  const lines = all.slice(at + 1);
  let current: string | null = null;
  let held: string[] = [];
  for (const line of lines) {
    const start = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (start !== null && start[1] !== undefined) {
      if (current !== null) {
        found.set(current, held.join('\n'));
      }
      current = start[1];
      held = [];
      continue;
    }
    if (current !== null) {
      held.push(line);
    }
  }
  if (current !== null) {
    found.set(current, held.join('\n'));
  }
  return found;
}

const JOBS = jobs();

/** Every `--project=` argument in one job's steps. */
function projectsOf(job: string): string[] {
  const body = JOBS.get(job) ?? '';
  return [...body.matchAll(/--project=([A-Za-z0-9-]+)/g)].map((match) => match[1] ?? '');
}

/** The names `playwright.config.ts` declares, in its own order. */
const DECLARED = (config.projects ?? []).map((project) => String(project.name));

/** The jobs that drive Playwright at all. */
const BROWSER_JOBS = ['visual-baselines', 'blackjack', 'browser-channels'];

describe('Z10-01: the projects CI runs are the projects the config declares', () => {
  it('finds the jobs this file grades, so a renamed job is not a silent pass', () => {
    // Every assertion below is scoped to a job by name. A job renamed or
    // deleted would make them all vacuous, which is the failure this file
    // exists to stop rather than an acceptable way for it to pass.
    for (const job of ['repository-policy', ...BROWSER_JOBS, 'memory-soak']) {
      expect(JOBS.has(job), `ci.yml declares no job called ${job}`).toBe(true);
    }
    for (const job of BROWSER_JOBS) {
      expect(projectsOf(job).length, `${job} names no project`).toBeGreaterThan(0);
    }
  });

  it('covers every declared project across the jobs, and names no other', () => {
    const asked = new Set(BROWSER_JOBS.flatMap((job) => projectsOf(job)));
    expect([...asked].sort()).toEqual([...DECLARED].sort());
  });

  it('runs the three engines and the timing chain in the gates job', () => {
    // The composition `playwright.config.ts` describes, read from the job that
    // gates the merge: the chain first, then the three mains that depend on it.
    expect(projectsOf('blackjack')).toEqual([
      'timing-chromium',
      'timing-firefox',
      'timing-webkit',
      'chromium',
      'firefox',
      'webkit',
    ]);
  });

  it('runs both stable channels in the channels job', () => {
    expect(projectsOf('browser-channels')).toEqual(['chrome', 'msedge']);
  });

  it('compares bitmaps in exactly the job whose purpose is bitmaps', () => {
    // `--ignore-snapshots` in the gates job is deliberate: the baselines are
    // per platform and are minted in the container the visual job runs. The
    // flag is therefore correct there and would be the whole defect here, since
    // a `visual-baselines` job carrying it reports success having compared
    // nothing.
    expect(JOBS.get('blackjack') ?? '').toContain('--ignore-snapshots');
    expect(JOBS.get('visual-baselines') ?? '', 'the baseline job compares nothing').not.toContain(
      '--ignore-snapshots',
    );
    expect(projectsOf('visual-baselines')).toEqual(['chromium']);
    expect(JOBS.get('visual-baselines') ?? '').toContain('visual.spec.ts');
  });

  it('passes no flag that would narrow a run below what the jobs claim', () => {
    // A run that quietly selects less is the same hole as a project that
    // quietly stopped existing. `--ignore-snapshots` is read above, by job,
    // because it is legitimate in exactly one of them.
    for (const flag of ['--grep', '--grep-invert', '--shard', '--last-failed', '--only-changed']) {
      expect(WORKFLOW, `ci.yml narrows a run with ${flag}`).not.toContain(flag);
    }
  });

  it('renders the baselines in the container the pinned Playwright ships', () => {
    // The committed baselines are Linux-rendered in this image. An image tag
    // that drifted from the pinned runner would compare one browser's drawing
    // against another's and fail for a reason that belongs to neither.
    const pinned = PACKAGE.devDependencies['@playwright/test'] ?? '';
    expect(pinned, 'no @playwright/test is pinned').toMatch(/^\d+\.\d+\.\d+$/);
    expect(JOBS.get('visual-baselines') ?? '').toContain(
      `image: mcr.microsoft.com/playwright:v${pinned}-`,
    );
  });
});
