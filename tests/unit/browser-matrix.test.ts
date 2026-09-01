/**
 * Item `A3`, Critical: the five projects, and what each of them runs. `BJ-23`.
 *
 *   "The full automated suite passes on Playwright's Chromium, Firefox and
 *    WebKit projects and on the Chrome and Edge stable channels, at the pinned
 *    Playwright version."
 *
 * **A green browser run is not evidence for this item on its own, and that is
 * why this file exists.** Playwright grades whatever the config asks for: a
 * project deleted from `playwright.config.ts` makes the suite smaller and
 * still green, a channel dropped from a project's `use` makes it run the
 * bundled engine under the channel's name, and an exclusion added to one
 * project's `testIgnore` makes "the full suite" quietly mean less than it
 * says. None of the three fails anything. Each of them is exactly the way this
 * criterion could be claimed without being true, so the composition itself is
 * asserted here, off the same file the runner reads.
 *
 * **What "the full automated suite" is taken to mean, and why.** The suite has
 * been a composed thing since `BJ-18`: two spec files run in exactly one place
 * each, for reasons about the instrument rather than about coverage.
 * `motion-demo.spec.ts` measures a real frame interval and cannot share a
 * machine, so it runs alone in the timing chain and no main project runs it.
 * `visual.spec.ts` compares bitmaps against baselines that are per project and
 * per platform, so it runs on `chromium`, which is where the committed
 * baselines were minted. Both placements predate this part and both were
 * accepted for the three projects item `A3` names by name, so the strictest
 * possible reading, every spec on every project, is already not what the
 * criterion has ever meant. The reading it does have is asserted below as a
 * relation rather than as a list: **every project runs the same set as
 * `chromium` except for the one baseline file**, and the union over all
 * projects is every spec file on disk.
 *
 * That relation is what makes the file resistant to its own drift. A spec
 * added tomorrow needs no edit here and is required on all five; a spec
 * excluded from one project fails here whatever the reason, which is the point
 * at which the exclusion has to be argued for rather than absorbed.
 */

import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { devices } from '@playwright/test';
import { describe, expect, it } from 'vitest';

import config, { BUNDLED_IDENTITY, DESKTOP_FRAMING } from '../../playwright.config';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BROWSER_TESTS = join(PROJECT_ROOT, 'tests', 'browser');

/** The one spec whose home is the timing chain. `BJ-18`. */
const TIMING = 'motion-demo.spec.ts';

/** The one spec whose home is the project its baselines were minted on. `BJ-22`. */
const VISUAL = 'visual.spec.ts';

/** The three timing projects, in the order their chain runs them. */
const TIMING_PROJECTS = ['timing-chromium', 'timing-firefox', 'timing-webkit'];

/** Item `A3`'s five, in the order the criterion names them. */
const MATRIX = ['chromium', 'firefox', 'webkit', 'chrome', 'msedge'];

/** The two of the five that drive an installed browser rather than a bundled engine. */
const CHANNELS: Record<string, string> = { chrome: 'chrome', msedge: 'msedge' };

/**
 * The five fields that frame a page rather than name a browser.
 *
 * Held as a list so the test below can assert the descriptor carries nothing
 * outside it plus `defaultBrowserType` and `userAgent`, which is what makes a
 * Playwright release that adds a sixth framing field a red test here rather
 * than a field silently missing from the channels.
 */
const FRAMING_FIELDS = ['viewport', 'screen', 'deviceScaleFactor', 'isMobile', 'hasTouch'];

/**
 * The two fields that name the browser rather than frame the page.
 *
 * **Exactly one of them is subtracted, and it is not both.** `userAgent` is the
 * bundled engine's own identity string and is false of an installed channel, so
 * the config drops it. `defaultBrowserType` is `chromium` in this descriptor
 * and is **true** of both channels, since Chrome stable and Edge stable are
 * both Chromium-based, so the config keeps it and the channels carry it. The
 * test below asserts that split in both directions rather than describing it:
 * the framing the channels take is the descriptor minus `userAgent`, one field
 * and no more.
 */
const IDENTITY_FIELDS = ['userAgent', 'defaultBrowserType'];

type Pattern = string | RegExp;

/** Every browser spec file on disk, by name, sorted. */
function specFiles(): string[] {
  return readdirSync(BROWSER_TESTS)
    .filter((name) => name.endsWith('.spec.ts'))
    .sort();
}

/**
 * Whether one of a project's patterns selects a file.
 *
 * Only regular expressions are graded, and a string pattern throws rather than
 * being guessed at: Playwright reads a string as a glob against the full path,
 * this file would read it as something else, and a rule graded by two
 * different matchers is worse than no rule. Every pattern in the config today
 * is a `RegExp` named once and read from both directions, which is what the
 * config's own comment says it is for.
 */
function matches(patterns: Pattern | Pattern[] | undefined, file: string): boolean {
  if (patterns === undefined) {
    return false;
  }
  const list = Array.isArray(patterns) ? patterns : [patterns];
  return list.some((pattern) => {
    if (typeof pattern === 'string') {
      throw new Error(
        `playwright.config.ts uses the string pattern ${pattern}; this file grades expressions`,
      );
    }
    return pattern.test(file);
  });
}

/** The spec files one project would run, resolved the way Playwright resolves them. */
function runs(name: string): string[] {
  const project = config.projects?.find((candidate) => candidate.name === name);
  if (project === undefined) {
    throw new Error(`playwright.config.ts declares no project called ${name}`);
  }
  return specFiles().filter((file) => {
    if (project.testMatch !== undefined && !matches(project.testMatch, file)) {
      return false;
    }
    return !matches(project.testIgnore, file);
  });
}

describe('A3: the browser matrix', () => {
  it('declares the three timing projects and the five the criterion names', () => {
    const names = (config.projects ?? []).map((project) => project.name);
    expect(names).toEqual([...TIMING_PROJECTS, ...MATRIX]);
  });

  it('drives Chrome stable and Edge stable through their channels', () => {
    for (const [name, channel] of Object.entries(CHANNELS)) {
      const project = config.projects?.find((candidate) => candidate.name === name);
      // The negative half matters more than the positive one: a project named
      // `msedge` with no channel launches the bundled Chromium and reports
      // itself as Edge, which is the criterion claimed rather than met.
      expect(project?.use, `${name} names its channel`).toMatchObject({ channel });
    }
    // And the reverse: no project that is not one of the two may carry a
    // channel, or the matrix would be measuring the same browser twice.
    for (const project of config.projects ?? []) {
      if (project.name !== undefined && project.name in CHANNELS) {
        continue;
      }
      const use = (project.use ?? {}) as Record<string, unknown>;
      expect(use['channel'], `${String(project.name)} runs a bundled engine`).toBeUndefined();
    }
  });

  it('frames the channels like the mains and lends them no bundled identity', () => {
    const descriptor: Record<string, unknown> = { ...devices['Desktop Chrome'] };
    const framing: Record<string, unknown> = { ...DESKTOP_FRAMING };
    // The subtraction, from the side the config cannot state: exactly one
    // field was removed and it is `userAgent`. `defaultBrowserType` stays,
    // because `chromium` is true of both installed channels. A descriptor field
    // this file has never heard of therefore fails here rather than quietly
    // reaching or not reaching the channels.
    expect(Object.keys(descriptor).sort()).toEqual([...FRAMING_FIELDS, ...IDENTITY_FIELDS].sort());
    expect(Object.keys(framing).sort()).toEqual(
      Object.keys(descriptor)
        .filter((key) => key !== 'userAgent')
        .sort(),
    );
    expect(BUNDLED_IDENTITY).toBe(descriptor['userAgent']);

    for (const name of Object.keys(CHANNELS)) {
      const use = (config.projects?.find((candidate) => candidate.name === name)?.use ??
        {}) as Record<string, unknown>;
      for (const field of Object.keys(framing)) {
        expect(use[field], `${name} is framed like the mains: ${field}`).toEqual(framing[field]);
      }
      // The point of the whole arrangement: an installed browser reports
      // itself. A descriptor's `userAgent` is the bundled engine's and would
      // be a false statement here, which QUALITY-BAR section 2 refuses.
      expect(use['userAgent'], `${name} reports its own identity`).toBeUndefined();
    }
  });

  it('runs the timing spec in the chain and nowhere else', () => {
    for (const name of TIMING_PROJECTS) {
      expect(runs(name), `${name} runs the timing spec alone`).toEqual([TIMING]);
    }
    for (const name of MATRIX) {
      expect(runs(name), `${name} leaves the timing spec to the chain`).not.toContain(TIMING);
    }
  });

  it('runs every other spec on every one of the five, baselines excepted', () => {
    const expected = specFiles().filter((file) => file !== TIMING);
    // `chromium` is the reference because it is where the baselines live, so
    // it is the one project that runs the whole of what the five share plus
    // the one file they cannot.
    expect(runs('chromium')).toEqual(expected);
    const shared = expected.filter((file) => file !== VISUAL);
    for (const name of MATRIX) {
      if (name === 'chromium') {
        continue;
      }
      expect(runs(name), `${name} runs the suite bar the baselines`).toEqual(shared);
    }
  });

  it('leaves no spec file unrun by every project', () => {
    const covered = new Set<string>();
    for (const name of [...TIMING_PROJECTS, ...MATRIX]) {
      for (const file of runs(name)) {
        covered.add(file);
      }
    }
    expect([...covered].sort()).toEqual(specFiles());
  });

  it('holds the five behind the timing chain, which measures alone', () => {
    for (const name of MATRIX) {
      const project = config.projects?.find((candidate) => candidate.name === name);
      expect(project?.dependencies, `${name} waits for the chain`).toEqual(['timing-webkit']);
    }
  });
});
