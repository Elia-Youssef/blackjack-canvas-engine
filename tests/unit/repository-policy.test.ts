/**
 * The repository policy gate, graded by running the file CI runs. `AUDIT-2`,
 * the cure round's review finding `R-2`.
 *
 * **`scripts/check-repository-record.mjs` is a required merge check and nothing
 * in this repository read it.** The reviewer of the cure round reverted four of
 * its behaviours, the author conjunction under the body exemption, the widening
 * of the subject and branch forms to the `PF-n` and `ENG-n` areas, the guard for
 * a file that is tracked and not on disk, and the event-name gate that decides
 * whether an empty pull request body is a finding, and then ran `npm run
 * typecheck`, `npm run lint` and the whole unit suite: all three stayed green,
 * 1303 tests included. A gate whose own behaviour is unpinned can be quietly
 * narrowed, and the two paths with no arm anywhere were the two that only a
 * runner reaches, an empty body and a missing file.
 *
 * **The script is run, not re-implemented.** A second copy of its rules here
 * would agree with itself forever, which is the failure `tests/unit/reference/`
 * exists to avoid elsewhere. What happens instead is the smallest possible
 * swap: the file's text is read, its ONE `node:child_process` import line is
 * replaced by a stub that answers the four questions it asks the version-control
 * command, and the patched copy is spawned in a scratch directory whose
 * contents and environment are the scenario. Everything else, every regular
 * expression, every message and the exit code, is the shipped file's own. If
 * that import line ever moves, the swap fails loudly rather than grading
 * nothing.
 *
 * **Every hostile fixture below is stored base64-encoded and decoded at run
 * time, and that is a requirement rather than a flourish.** This file is
 * tracked, so the scan it grades reads these bytes, and so does the workspace
 * provenance walker: a fixture written out in full would fail the very gate it
 * exists to prove works. It is the pattern the script itself uses for its own
 * word list, for the same reason.
 *
 * @vitest-environment node
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(PROJECT_ROOT, 'scripts', 'check-repository-record.mjs');
const SOURCE = readFileSync(SCRIPT, 'utf8');

/** The one seam this file swaps, which is also the assertion that it exists. */
const IMPORT_LINE = "import { execFileSync } from 'node:child_process';";

/**
 * The stub that answers the four questions the gate asks about the repository.
 *
 * Four calls and no more: the record of commits, the tracked paths, the current
 * branch and whether there is a commit at all. An unrecognised call throws, so a
 * fifth question added to the gate arrives here as a failure rather than as a
 * silent empty answer.
 *
 * The scenario travels in one environment variable as JSON, because the child is
 * a separate process and its environment is the only channel this file controls
 * besides the working directory.
 */
const STUB = [
  'const fixture = JSON.parse(process.env.POLICY_FIXTURE ?? "{}");',
  'const execFileSync = (bin, args) => {',
  '  if (bin !== "git") throw new Error(`unexpected command: ${bin}`);',
  '  const asked = args.join(" ");',
  '  if (asked.startsWith("rev-parse")) {',
  '    if (fixture.hasCommit === false) throw new Error("no HEAD");',
  '    return "";',
  '  }',
  '  if (asked === "ls-files -z") return (fixture.tracked ?? []).join("\\u0000");',
  '  if (asked === "branch --show-current") return `${fixture.branch ?? "main"}\\n`;',
  '  if (asked.startsWith("log ")) {',
  '    return (fixture.commits ?? [])',
  '      .map((commit) => [',
  '        commit.hash, commit.authorName, commit.authorEmail,',
  '        commit.committerName, commit.committerEmail, commit.message,',
  '      ].join("\\u001f") + "\\u001e")',
  '      .join("");',
  '  }',
  '  throw new Error(`unexpected git call: ${asked}`);',
  '};',
].join('\n');

/** One commit as the gate's own `--format` hands it back. */
interface CommitFixture {
  readonly hash: string;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly committerName: string;
  readonly committerEmail: string;
  readonly message: string;
}

/** One whole run: what the repository looks like and what the runner says. */
interface Scenario {
  readonly branch?: string;
  readonly tracked?: readonly string[];
  readonly commits?: readonly CommitFixture[];
  readonly hasCommit?: boolean;
  /** Files written into the scratch working directory before the run. */
  readonly files?: Readonly<Record<string, string>>;
  /** Extra environment, which is how a pull request reaches the gate. */
  readonly env?: Readonly<Record<string, string>>;
}

/** What the run produced. */
interface Outcome {
  readonly status: number;
  readonly failures: readonly string[];
  readonly stdout: string;
}

/** A clean commit, so a scenario states only the field it is about. */
function commit(message: string, hash = 'a1b2c3d'): CommitFixture {
  return {
    hash,
    authorName: 'A Person',
    authorEmail: 'person@example.com',
    committerName: 'A Person',
    committerEmail: 'person@example.com',
    message,
  };
}

/** A squash commit whose trailing pull-request reference is written by GitHub. */
function githubSquashCommit(message: string): CommitFixture {
  return {
    ...commit(message),
    committerName: 'GitHub',
    committerEmail: 'noreply@github.com',
  };
}

/** A Dependabot-authored dependency update with its conventional subject. */
function dependabotCommit(message: string): CommitFixture {
  return {
    ...commit(message),
    authorName: 'dependabot[bot]',
    authorEmail: '49699333+dependabot[bot]@users.noreply.github.com',
  };
}

/** The `.gitattributes` the scan reads its skiplist from. */
const ATTRIBUTES = '*.png binary\n*.ico binary\n';

const scratch: string[] = [];

afterEach(() => {
  while (scratch.length > 0) {
    const directory = scratch.pop();
    if (directory !== undefined) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

/**
 * Run the gate over one scenario, with `patch` applied to its text first.
 *
 * `patch` is what makes the ledger entries provable from here: an entry that
 * takes a behaviour out of the script is the same edit applied through this
 * argument, and the scenario that goes red is the entry's detector.
 */
function run(scenario: Scenario, patch: (text: string) => string = (text) => text): Outcome {
  const directory = mkdtempSync(join(tmpdir(), 'policy-'));
  scratch.push(directory);

  expect(SOURCE.split(IMPORT_LINE).length - 1, 'the child process seam moved').toBe(1);
  const patched = patch(SOURCE).replace(IMPORT_LINE, STUB);
  const script = join(directory, 'gate.mjs');
  writeFileSync(script, patched, 'utf8');

  const files = { '.gitattributes': ATTRIBUTES, ...(scenario.files ?? {}) };
  for (const [name, text] of Object.entries(files)) {
    const target = join(directory, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text, 'utf8');
  }

  const result = spawnSync(process.execPath, [script], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      // Cleared rather than trusted: the runner this suite is run on may itself
      // be a pull request build, and a leaked variable would decide a scenario.
      GITHUB_EVENT_NAME: '',
      PULL_REQUEST_TITLE: '',
      PULL_REQUEST_BODY: '',
      PULL_REQUEST_AUTHOR: '',
      REPOSITORY_BRANCH: '',
      POLICY_FIXTURE: JSON.stringify({
        branch: scenario.branch ?? 'main',
        tracked: scenario.tracked ?? ['.gitattributes'],
        commits: scenario.commits ?? [],
        hasCommit: scenario.hasCommit ?? (scenario.commits ?? []).length > 0,
      }),
      ...(scenario.env ?? {}),
    },
  });

  const failures = `${result.stderr}`
    .split(/\r?\n/)
    .filter((line) => line.startsWith('FAIL: '))
    .map((line) => line.slice('FAIL: '.length));
  // A crash is neither a pass nor a reported failure, and the difference matters
  // to two of the arms below: the message is surfaced rather than swallowed.
  expect(`${result.stderr}`, 'the gate threw instead of reporting').not.toContain(
    'Error: unexpected',
  );
  return { status: result.status ?? -1, failures, stdout: `${result.stdout}` };
}

const decode = (value: string): string => Buffer.from(value, 'base64').toString('utf8');

/**
 * A dependency update's own body, quoting release notes that credit a product
 * the provenance scan is built to catch. Encoded, per this file's header.
 */
const HOSTILE_BODY = decode(
  'IyMgUmVsZWFzZSBub3RlcwoKQnVtcHMgbGVmdC1wYWQgZnJvbSAxLjAuMCB0byAxLjEuMC4KCi0g' +
    'dGhhbmtzIHRvIHRoZSBjb3BpbG90IHRlYW0gZm9yIHRoZSByZXBvcnQK',
);

/** A tracked file whose bytes must be found by the content scan. Encoded too. */
const HOSTILE_FILE = decode(
  'Ly8gYSB0cmFja2VkIGZpbGUgd2hvc2UgYnl0ZXMgbmFtZSBhIHByb2R1Y3QgdGhlIHNjYW4gbXVz' +
    'dCBjYXRjaDogY2hhdGdwdAo=',
);

/** The branch a dependency update is published from. */
const UPDATE_BRANCH = 'dependabot/npm_and_yarn/dev-group-1a2b3c';

/** The author the runner attests for that update, which the gate requires. */
const UPDATE_AUTHOR = 'dependabot[bot]';

describe('the repository policy gate answers for its own behaviour', () => {
  it('runs the shipped file, and the scan it performs can find something', () => {
    // The can-see control for every arm below. A stub that answered nothing, a
    // patch that broke the file or a spawn that never started would produce a
    // clean run here just as readily as a healthy gate does, so the first thing
    // asserted is that a run with something wrong in it says so, in the gate's
    // own words and with the gate's own exit code.
    const clean = run({ commits: [commit('fix: tidy the thing\n\nCloses: None')] });
    expect(clean.failures, clean.failures.join(' / ')).toEqual([]);
    expect(clean.status).toBe(0);
    expect(clean.stdout).toContain('Repository policy passed for 1 tracked files.');

    const dirty = run({
      commits: [commit('fix: tidy the thing\n\nCloses: None')],
      tracked: ['.gitattributes', 'src/note.ts'],
      files: { 'src/note.ts': HOSTILE_FILE },
    });
    expect(dirty.status).toBe(1);
    expect(dirty.failures.join(' / ')).toContain('src/note.ts:1 contains a prohibited');
  });

  it('excuses a dependency squash on main from the Closes line', () => {
    // Scenario (a). The exemption is a property of the commit, read from the
    // subject, so it survives the squash onto `main` where the branch it was
    // built on no longer exists. Without this the first such squash would fail
    // the gate on `main` and on every branch cut from it, permanently.
    const outcome = run({
      branch: 'main',
      commits: [commit('deps: bump the dev group')],
    });
    expect(outcome.failures, outcome.failures.join(' / ')).toEqual([]);
    expect(outcome.status).toBe(0);
  });

  it('accepts authenticated Dependabot metadata without weakening human records', () => {
    const subject = 'deps: Bump the dev group across 1 directory with 6 updates';
    const update = run({
      branch: UPDATE_BRANCH,
      commits: [dependabotCommit(subject)],
      env: {
        GITHUB_EVENT_NAME: 'pull_request',
        PULL_REQUEST_AUTHOR: UPDATE_AUTHOR,
        PULL_REQUEST_TITLE: subject,
        PULL_REQUEST_BODY: HOSTILE_BODY,
      },
    });
    expect(update.failures, update.failures.join(' / ')).toEqual([]);
    expect(update.status).toBe(0);

    const ordinary = run({ commits: [commit(subject)] });
    expect(ordinary.status).toBe(1);
    expect(ordinary.failures.join(' / ')).toContain(
      'does not use the required area and imperative summary format',
    );

    const ordinaryPullRequest = run({
      branch: 'fix-a-thing',
      commits: [commit('fix: check the policy\n\nCloses: None')],
      env: {
        GITHUB_EVENT_NAME: 'pull_request',
        PULL_REQUEST_TITLE: subject,
        PULL_REQUEST_BODY: 'Closes: None',
      },
    });
    expect(ordinaryPullRequest.status).toBe(1);
    expect(ordinaryPullRequest.failures.join(' / ')).toContain(
      'pull request title does not use the required area and imperative summary format',
    );
  });

  it('measures a GitHub squash reference outside the authored subject budget', () => {
    // GitHub writes the pull request number after the title while it creates a
    // squash commit. The title must fit the budget before that decoration; the
    // generated reference must not turn the resulting main commit into a
    // permanent policy failure.
    const title = `fix: ${'x'.repeat(67)}`;
    const squashedSubject = `${title} (#34)`;
    const generated = run({
      branch: 'main',
      commits: [githubSquashCommit(`${squashedSubject}\n\nCloses: None`)],
    });
    expect(generated.failures, generated.failures.join(' / ')).toEqual([]);
    expect(generated.status).toBe(0);

    const ordinary = run({ commits: [commit(`${squashedSubject}\n\nCloses: None`)] });
    expect(ordinary.status).toBe(1);
    expect(ordinary.failures.join(' / ')).toContain('subject exceeds 72 characters');

    const pullRequest = run({
      branch: 'fix-subject-budget',
      commits: [commit('fix: check the policy\n\nCloses: None')],
      env: {
        GITHUB_EVENT_NAME: 'pull_request',
        PULL_REQUEST_TITLE: squashedSubject,
        PULL_REQUEST_BODY: 'Closes: None',
      },
    });
    expect(pullRequest.status).toBe(1);
    expect(pullRequest.failures.join(' / ')).toContain('pull request title exceeds 72 characters');
  });

  it('still requires a Closes line from a human commit on an update branch', () => {
    // Scenario (b), and the mirror of the one above: reading the exemption off
    // the branch got it wrong in both directions, and this is the direction
    // that excused real work. The branch is the update tooling's own and the
    // commit is not, so the commit is graded like any other.
    const outcome = run({
      branch: UPDATE_BRANCH,
      commits: [commit('fix: sneak a change in beside the bump')],
    });
    expect(outcome.status).toBe(1);
    expect(outcome.failures.join(' / ')).toContain('must contain exactly one valid Closes line');
  });

  it('excuses the update tooling own pull request body, author and all', () => {
    // Scenario (c). A dependency body quotes the bumped packages' release notes,
    // whose contributor credits may name any product, so that one generated
    // surface is skipped. The branch alone does not buy the exemption: the
    // author the runner attests has to agree.
    const outcome = run({
      branch: UPDATE_BRANCH,
      commits: [commit('deps: bump the dev group')],
      env: {
        GITHUB_EVENT_NAME: 'pull_request',
        PULL_REQUEST_BODY: HOSTILE_BODY,
        PULL_REQUEST_AUTHOR: UPDATE_AUTHOR,
      },
    });
    expect(outcome.failures, outcome.failures.join(' / ')).toEqual([]);
    expect(outcome.status).toBe(0);
  });

  it('scans that same body when the author is anyone else', () => {
    // Scenario (d), which is the whole point of the conjunction: a branch name
    // is writable by anyone who can push one, so a person publishing work from
    // an update branch gets no excuse from its name. Same branch, same body,
    // different author, and both halves of the exemption come back.
    const outcome = run({
      branch: UPDATE_BRANCH,
      commits: [commit('deps: bump the dev group')],
      env: {
        GITHUB_EVENT_NAME: 'pull_request',
        PULL_REQUEST_BODY: HOSTILE_BODY,
        PULL_REQUEST_AUTHOR: 'a-person',
      },
    });
    expect(outcome.status).toBe(1);
    expect(outcome.failures.join(' / ')).toContain(
      'pull request body:5 contains a prohibited provenance term',
    );
    expect(outcome.failures.join(' / ')).toContain(
      'pull request body must contain exactly one valid Closes line',
    );
  });

  it('refuses an empty pull request body, which is the one that used to pass', () => {
    // Scenario (e). The guard used to be the body's own truthiness, so a pull
    // request opened with no description skipped the block entirely and the run
    // reported a pass over a body with no `Closes:` line in it. It compounds:
    // the squash message is composed from that body, so the merged commit
    // reaches `main` with no `Closes:` line and every later history walk fails.
    const outcome = run({
      branch: 'fix-a-thing',
      commits: [commit('fix: tidy the thing\n\nCloses: None')],
      env: { GITHUB_EVENT_NAME: 'pull_request', PULL_REQUEST_BODY: '' },
    });
    expect(outcome.status).toBe(1);
    expect(outcome.failures).toEqual([
      'pull request body must contain exactly one valid Closes line',
    ]);
  });

  it('says nothing about a body off a runner, where there is no pull request', () => {
    // Scenario (f), and the other half of that guard: on a `push` and at a
    // local `verify:policy` there is no pull request to have a body, and
    // requiring one would fail every run this project makes on its own machine.
    // The two cases want different answers and the runner already tells them
    // apart, which is why the event name and not the body decides.
    const outcome = run({
      branch: 'fix-a-thing',
      commits: [commit('fix: tidy the thing\n\nCloses: None')],
      env: { PULL_REQUEST_BODY: '' },
    });
    expect(outcome.failures, outcome.failures.join(' / ')).toEqual([]);
    expect(outcome.status).toBe(0);
  });

  it('reports a tracked file that is missing and keeps scanning the rest', () => {
    // Scenario (g). A tracked file that is not on disk is the ordinary shape of
    // an uncommitted deletion, and reading it used to throw out of the loop: the
    // gate died with a stack trace instead of a `FAIL:` line and every tracked
    // file after it went unscanned. Both halves are asserted, the report and the
    // continuation, and the second is what a `try` around the read would not
    // give: the file after the ghost carries something the scan must catch, so
    // a run that stopped early comes back one failure short.
    const outcome = run({
      commits: [commit('fix: tidy the thing\n\nCloses: None')],
      tracked: ['.gitattributes', 'src/ghost.ts', 'src/note.ts'],
      files: { 'src/note.ts': HOSTILE_FILE },
    });
    expect(outcome.status).toBe(1);
    expect(outcome.failures).toContain('src/ghost.ts is tracked but missing from the working tree');
    expect(
      outcome.failures.join(' / '),
      'the scan stopped at the missing file',
    ).toContain('src/note.ts:1 contains a prohibited');
  });

  it('accepts the areas GITHUB section 2 lists, and no branch shouted in capitals', () => {
    // Scenario (h). The subject and branch forms name seven areas, and the
    // expressions accepted five: the first `PF-0` or `ENG-1` commit would have
    // failed the gate on a form the document lists as valid, before any other
    // gate reported. The negative arm is the same branch in capitals, which
    // keeps the widening from having quietly become a widening of the case rule.
    const accepted = run({
      branch: 'pf-2-integrator',
      commits: [commit('PF-2: build the integrator\n\nCloses: PF2')],
    });
    expect(accepted.failures, accepted.failures.join(' / ')).toEqual([]);
    expect(accepted.status).toBe(0);

    const shouted = run({
      branch: 'PF-2-Integrator',
      commits: [commit('PF-2: build the integrator\n\nCloses: PF2')],
    });
    expect(shouted.status).toBe(1);
    expect(shouted.failures.join(' / ')).toContain('is not allowed');
  });
});

describe('the ledger entries that break this gate are red against the arms above', () => {
  // The three edits `scripts/mutation-check.mjs` carries for this file, applied
  // here as well so the pairing is stated in one place rather than only in the
  // ledger. Each one is a behaviour the reviewer reverted with the whole suite
  // staying green; each now has an arm that goes red.

  it('goes red on the author conjunction reduced to the branch test alone', () => {
    const outcome = run(
      {
        branch: UPDATE_BRANCH,
        commits: [commit('deps: bump the dev group')],
        env: {
          GITHUB_EVENT_NAME: 'pull_request',
          PULL_REQUEST_BODY: HOSTILE_BODY,
          PULL_REQUEST_AUTHOR: 'a-person',
        },
      },
      (text) =>
        text.replace(
          "  dependencyBranch && process.env.PULL_REQUEST_AUTHOR === 'dependabot[bot]';",
          '  dependencyBranch;',
        ),
    );
    // Without the conjunction the hostile body is excused on a branch name
    // alone, which is exactly what scenario (d) forbids.
    expect(outcome.status, outcome.failures.join(' / ')).toBe(0);
  });

  it('goes red on the missing-file guard dropped', () => {
    const outcome = run(
      {
        commits: [commit('fix: tidy the thing\n\nCloses: None')],
        tracked: ['.gitattributes', 'src/ghost.ts', 'src/note.ts'],
        files: { 'src/note.ts': HOSTILE_FILE },
      },
      (text) =>
        text.replace(
          '  if (!existsSync(file)) {\n' +
            '    fail(`${file} is tracked but missing from the working tree`);\n' +
            '    continue;\n' +
            '  }\n',
          '',
        ),
    );
    // The read throws out of the loop, so there is no `FAIL:` line for the
    // ghost and the file after it is never scanned at all.
    expect(outcome.failures).toEqual([]);
    expect(outcome.status).not.toBe(0);
  });

  it('goes red on the event-name gate dropped from the body check', () => {
    const outcome = run(
      {
        branch: 'fix-a-thing',
        commits: [commit('fix: tidy the thing\n\nCloses: None')],
        env: { GITHUB_EVENT_NAME: 'pull_request', PULL_REQUEST_BODY: '' },
      },
      (text) =>
        text.replace(
          'if (onPullRequest || process.env.PULL_REQUEST_BODY) {',
          'if (process.env.PULL_REQUEST_BODY) {',
        ),
    );
    // The empty body is falsy, so the whole block is skipped and the gate
    // reports a pass over a pull request carrying no `Closes:` line.
    expect(outcome.failures, outcome.failures.join(' / ')).toEqual([]);
    expect(outcome.status).toBe(0);
  });
});
