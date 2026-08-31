import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

function checkSubject(subject, label) {
  if (subject.length > 72) fail(`${label} exceeds 72 characters`);
  if (subject.endsWith('.')) fail(`${label} ends with a full stop`);
  if (!/^(?:BJ-\d+|fix|docs|ci|deps): [a-z0-9]/.test(subject)) {
    fail(`${label} does not use the required area and imperative summary format`);
  }
}

function checkMessage(message, label, requireClosure = true) {
  checkText(message, label);
  const lines = message.trimEnd().split(/\r?\n/);
  checkSubject(lines[0] ?? '', `${label} subject`);
  if (requireClosure) {
    const closureLines = lines.filter((line) => /^Closes: (?:None|[A-Z][A-Z0-9-]*(?:, [A-Z][A-Z0-9-]*)*)$/.test(line));
    if (closureLines.length !== 1) fail(`${label} must contain exactly one valid Closes line`);
  }
}

const branch = process.env.REPOSITORY_BRANCH || git('branch', '--show-current').trim();
const dependencyBranch = branch.startsWith('dependabot/');
const branchPattern = /^(?:main|bj-\d+-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|fix-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|docs-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|ci-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|dependabot\/(?:npm_and_yarn|github_actions)\/[A-Za-z0-9][A-Za-z0-9._/-]*)$/;
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
 */
function binaryExtensions() {
  // Relative, like every other read here: this gate is run from the project
  // root, and the tracked paths `git ls-files` hands back are relative to it.
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
    checkText(`${authorName}\n${authorEmail}\n${committerName}\n${committerEmail}`, `commit ${hash} identity`);
    checkMessage(messageParts.join('\x1f').trim(), `commit ${hash}`, !dependencyBranch);
  }
}

if (process.env.PULL_REQUEST_TITLE) {
  checkSubject(process.env.PULL_REQUEST_TITLE, 'pull request title');
  checkText(process.env.PULL_REQUEST_TITLE, 'pull request title');
}
if (process.env.PULL_REQUEST_BODY) {
  checkText(process.env.PULL_REQUEST_BODY, 'pull request body');
  const closureLines = process.env.PULL_REQUEST_BODY
    .split(/\r?\n/)
    .filter((line) => /^Closes: (?:None|[A-Z][A-Z0-9-]*(?:, [A-Z][A-Z0-9-]*)*)$/.test(line));
  if (!dependencyBranch && closureLines.length !== 1) {
    fail('pull request body must contain exactly one valid Closes line');
  }
}

if (failures.length) {
  failures.forEach((message) => console.error(`FAIL: ${message}`));
  process.exit(1);
}

console.log(`Repository policy passed for ${tracked.length} tracked files.`);
