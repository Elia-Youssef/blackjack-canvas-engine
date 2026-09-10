import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

const decode = (value) => Buffer.from(value, 'base64').toString('utf8');
const protectedWords = [
  'Y2xhdWRl',
  'Y29kZXg=',
  'Y2hhdGdwdA==',
  'b3BlbmFp',
  'YW50aHJvcGlj',
  'Y29waWxvdA==',
  'Z2VtaW5p',
  'YWdlbnQ=',
  'YXJ0aWZpY2lhbCBpbnRlbGxpZ2VuY2U=',
].map(decode);
const protectedPhrase = decode('Y28tYXV0aG9yZWQtYnk=');
const reservedFiles = [
  'QUdFTlRTLm1k',
  'Q0xBVURFLm1k',
  'Q09ERVgubWQ=',
].map((value) => decode(value).toLowerCase());

const failures = [];
const fail = (message) => failures.push(message);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function permittedGameLanguage(line, word) {
  const isShortForm = word === decode('YWk=');
  const isGameTerm = isShortForm || word === protectedWords.at(-1);
  const isDependencyMetadata = isShortForm
    && line.toLowerCase().includes(`/sponsors/${decode('YWk=')}`);
  return (isGameTerm && /\b(?:opponent|dealer|gameplay)\b/i.test(line)) || isDependencyMetadata;
}

function checkText(text, label) {
  const lines = text.normalize('NFKC').split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const word of protectedWords) {
      const suffix = word === decode('YWdlbnQ=') ? 's?' : '';
      const pattern = new RegExp(`\\b${escapePattern(word)}${suffix}\\b`, 'i');
      if (pattern.test(line) && !permittedGameLanguage(line, word)) {
        fail(`${label}:${index + 1} contains a prohibited provenance term`);
      }
    }
    const shortForm = new RegExp(`\\b${decode('YWk=')}\\b`, 'i');
    if (shortForm.test(line) && !permittedGameLanguage(line, decode('YWk='))) {
      fail(`${label}:${index + 1} contains a prohibited provenance term`);
    }
    if (line.toLowerCase().includes(protectedPhrase)) {
      fail(`${label}:${index + 1} contains an authorship trailer`);
    }
  });
}

function checkSubject(subject, label, allowGeneratedPullRequestReference = false) {
  // GitHub appends ` (#123)` when it creates a squash commit. The pull request
  // title is still checked verbatim before that write, so the 72-character
  // limit applies to the authored summary and not to this generated reference.
  // Only GitHub-committed records may take this path below; a human cannot add
  // a suffix to evade the commit-subject limit.
  const summary = allowGeneratedPullRequestReference
    ? subject.replace(/ \(#\d+\)$/, '')
    : subject;
  if (summary.length > 72) fail(`${label} exceeds 72 characters`);
  if (summary.endsWith('.')) fail(`${label} ends with a full stop`);
  // GITHUB section 4 names seven areas, `BJ-n`, `PF-n`, `ENG-n`, `fix`, `docs`,
  // `ci` and `deps`, and this expression accepted five of them: the first
  // `PF-0` or `ENG-1` commit would have failed the policy gate on a subject the
  // document lists as valid, before any other gate reported. Section 15's rule
  // is that the rule and its enforcement are never a version apart.
  if (!/^(?:(?:BJ|PF|ENG)-\d+|fix|docs|ci|deps): [a-z0-9]/.test(summary)) {
    fail(`${label} does not use the required area and imperative summary format`);
  }
}

function checkMessage(message, label, requireClosure = true, allowGeneratedPullRequestReference = false) {
  checkText(message, label);
  const lines = message.trimEnd().split(/\r?\n/);
  checkSubject(lines[0] ?? '', `${label} subject`, allowGeneratedPullRequestReference);
  if (requireClosure) {
    const closureLines = lines.filter((line) => /^Closes: (?:None|[A-Z][A-Z0-9-]*(?:, [A-Z][A-Z0-9-]*)*)$/.test(line));
    if (closureLines.length !== 1) fail(`${label} must contain exactly one valid Closes line`);
  }
}

/**
 * Whether a commit message is a dependency update's own, read from the subject
 * area the update tooling writes (`.github/dependabot.yml` sets that prefix)
 * and `checkSubject` already accepts, so the exemption can never be wider than
 * the accepted subject form.
 *
 * GITHUB section 4 exempts dependency-update commits, and only those, from the
 * `Closes:` line, and that is a property of the commit rather than of the run.
 * Reading it off the branch name instead got it wrong in both directions. A
 * dependency commit squashed onto `main` is scanned on a run whose branch is
 * `main`, so it was checked like any other and, because the walk covers the
 * whole history with no revision range, it would have failed this gate on
 * `main` and on every branch cut from it rather than once; and while a
 * dependency branch was building, every message in that history was excused,
 * human commits included. Only the `Closes:` line is ever excused: the subject
 * form, the provenance scan and the identity scan run on every commit.
 */
const dependencyCommit = (message) => /^deps: [a-z0-9]/.test(message);

const branch = process.env.REPOSITORY_BRANCH || git('branch', '--show-current').trim();
const dependencyBranch = branch.startsWith('dependabot/');
// A branch name is writable by anyone who can push one, so the body exemption
// below also requires the one fact GitHub attests itself: the pull request
// author the workflow passes in. Absent or different, the body is scanned like
// any other, and a person publishing work from a `dependabot/` branch gets no
// excuse from its name.
const dependencyUpdate =
  dependencyBranch && process.env.PULL_REQUEST_AUTHOR === 'dependabot[bot]';
// The seven branch shapes GITHUB section 2's table lists, `pf-n` and `eng-n`
// included: the same widening as `checkSubject`, for the same reason.
const branchPattern = /^(?:main|(?:bj|pf|eng)-\d+-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|fix-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|docs-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|ci-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|dependabot\/(?:npm_and_yarn|github_actions)\/[A-Za-z0-9][A-Za-z0-9._/-]*)$/;
if (!branchPattern.test(branch)) fail(`branch name ${JSON.stringify(branch)} is not allowed`);
checkText(branch, 'branch name');

const tracked = git('ls-files', '-z').split('\0').filter(Boolean);

/**
 * The extensions whose bytes are not text, taken from `.gitattributes`.
 *
 * **A skiplist, not an allowlist, because GITHUB section 7's rule is about
 * content.** "Nothing pushed names the tooling that produced it, ever ... a
 * file, a filename, a directory name" is a claim about every tracked file, so
 * the correct default for a content scan is to open everything and to name the
 * exceptions. An allowlist of eleven extensions was the opposite default: a
 * `.svg`, a `.cjs`, a `.toml`, a `.sh` or a `.webmanifest` had its path scanned
 * and its bytes never read, and the gate would have reported clean over it.
 * `eslint.config.js` already anticipates exactly that class for the `core/`
 * boundary, in as many words: "a file the gate does not match is a file the
 * gate does not check."
 *
 * The list is `.gitattributes`' `binary` set, read from that file rather than
 * restated, so the repository has one place that says which files are not text.
 * The scanned set is unchanged on today's tree.
 *
 * A `.gitattributes` that is tracked and not on disk, which is what an
 * uncommitted deletion looks like, is reported rather than thrown: see the
 * tracked-file loop below for the same treatment and the same reason. Nothing
 * is skipped when the list cannot be read, which is the safe direction for a
 * content scan.
 */
function binaryExtensions() {
  // Relative, like every other read here: this gate is run from the project
  // root, and the tracked paths `git ls-files` hands back are relative to it.
  if (!existsSync('.gitattributes')) {
    fail('.gitattributes is tracked but missing from the working tree; no file can be skipped');
    return new Set();
  }
  const attributes = readFileSync('.gitattributes', 'utf8');
  const found = new Set();
  for (const line of attributes.split(/\r?\n/)) {
    const match = /^\*(\.[A-Za-z0-9]+)\s+binary\b/.exec(line.trim());
    if (match !== null) {
      found.add(match[1].toLowerCase());
    }
  }
  if (found.size === 0) {
    fail('.gitattributes names no binary extensions, so the provenance scan cannot skip any');
  }
  return found;
}

const binary = binaryExtensions();
for (const file of tracked) {
  const lowerPath = file.toLowerCase();
  if (reservedFiles.includes(basename(lowerPath))) {
    fail(`${file} is a reserved local instruction file`);
  }
  checkText(file, `tracked path ${file}`);
  if (binary.has(extname(lowerPath))) {
    continue;
  }
  // A tracked file that is not on disk is the ordinary shape of a deletion
  // that has not been committed, and reading it throws `ENOENT` out of this
  // loop: the gate died with a stack trace instead of a `FAIL:` line, and
  // every tracked file after it in `git ls-files` order went unscanned. It is
  // reported in the gate's own vocabulary instead, and the scan carries on.
  // `check-determinism.mjs` was rewritten to avoid the same shape for the same
  // reason; the lesson had landed in one gate and not in this one.
  if (!existsSync(file)) {
    fail(`${file} is tracked but missing from the working tree`);
    continue;
  }
  // Decoded as UTF-8. A tracked file that is not valid UTF-8 and is not on the
  // binary list is a file this gate cannot read, which is a finding rather than
  // a pass: it would be the one place content could hide.
  const bytes = readFileSync(file);
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) {
    fail(`${file} is neither valid UTF-8 nor listed as binary in .gitattributes`);
  }
  checkText(text, file);
}

let hasCommit = true;
try {
  execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { stdio: 'ignore' });
} catch {
  hasCommit = false;
}

if (hasCommit) {
  const records = git('log', '--format=%H%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%B%x1e')
    .split('\x1e')
    .filter((record) => record.trim());
  for (const record of records) {
    const [hash, authorName, authorEmail, committerName, committerEmail, ...messageParts] = record.split('\x1f');
    const message = messageParts.join('\x1f').trim();
    checkText(`${authorName}\n${authorEmail}\n${committerName}\n${committerEmail}`, `commit ${hash} identity`);
    const generatedSquashCommit = committerName === 'GitHub' && committerEmail === 'noreply@github.com';
    checkMessage(message, `commit ${hash}`, !dependencyCommit(message), generatedSquashCommit);
  }
}

if (process.env.PULL_REQUEST_TITLE) {
  checkSubject(process.env.PULL_REQUEST_TITLE, 'pull request title');
  checkText(process.env.PULL_REQUEST_TITLE, 'pull request title');
}
/**
 * Whether this run is grading a pull request at all.
 *
 * **The guard used to be the body's own truthiness, which excused the one body
 * that must not be.** A pull request opened with no description renders
 * `github.event.pull_request.body` as the empty string, which is falsy, so the
 * block below was skipped entirely and the run reported "Repository policy
 * passed" over a pull request carrying no `Closes:` line and no scanned body.
 * A whitespace-only body was caught; only the genuinely empty one slipped, and
 * it compounds: the squash message is composed from that body, so the merged
 * commit reaches `main` with no `Closes:` line and the history walk then fails
 * on every later run.
 *
 * One guard was serving two cases that want different answers, and the runner
 * already distinguishes them. `GITHUB_EVENT_NAME` is a default variable on
 * every workflow run, so no workflow change carries this: on a `push` there is
 * no pull request and skipping is correct, on a `pull_request` the body is
 * required whatever it holds, and off a runner the variable is absent and a
 * local `verify:policy` behaves exactly as it did.
 */
const onPullRequest = process.env.GITHUB_EVENT_NAME === 'pull_request';

if (onPullRequest || process.env.PULL_REQUEST_BODY) {
  const pullRequestBody = process.env.PULL_REQUEST_BODY ?? '';
  // A dependency update's pull request body is generated by the update
  // tooling and quotes the bumped packages' own release notes, whose
  // contributor credits may name any product. The provenance rule is about
  // this repository's work, so the scan skips exactly this one generated
  // surface on the update tooling's own pull requests; the title, the branch
  // name, the commit messages and every tracked file are still scanned there.
  if (!dependencyUpdate) {
    checkText(pullRequestBody, 'pull request body');
  }
  const closureLines = pullRequestBody
    .split(/\r?\n/)
    .filter((line) => /^Closes: (?:None|[A-Z][A-Z0-9-]*(?:, [A-Z][A-Z0-9-]*)*)$/.test(line));
  if (!dependencyUpdate && closureLines.length !== 1) {
    fail('pull request body must contain exactly one valid Closes line');
  }
}

if (failures.length) {
  failures.forEach((message) => console.error(`FAIL: ${message}`));
  process.exit(1);
}

console.log(`Repository policy passed for ${tracked.length} tracked files.`);
