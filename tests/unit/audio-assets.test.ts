/**
 * The automated armour under item `K1`'s checklist. `BJ-19`.
 *
 *   "No audio file of any kind ships in the bundle. All sound is synthesised
 *    at runtime."
 *
 * `K1` is method I and closes by review against
 * `docs/review-checklists/no-audio-assets.md`, which lives outside this repo
 * beside the rest of the document set. This file is the checklist's automated
 * half, on the precedent `D1`'s checklist already has: every scan the reviewer
 * is asked to run also runs in the suite, with a can-see control in front of
 * each scanner, because an absence is the kind of claim most likely to be true
 * by accident and a rule checked only at review time holds until the next part.
 *
 * The build is real, not the leftover `dist/`: the test runs Vite over the
 * project's own config into a fresh temporary directory, so what it scans is
 * exactly what a clean checkout would emit and not whatever the last gate
 * happened to leave behind. The one build costs a few seconds and is the whole
 * price of the claim being about the shipped bytes rather than about a
 * directory's history.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The extensions an audio file can carry in a static bundle. */
const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.wav',
  '.ogg',
  '.oga',
  '.opus',
  '.flac',
  '.m4a',
  '.aac',
  '.weba',
  '.mid',
  '.midi',
]);

/** Every file under a directory, relative to it, sorted. */
function filesUnder(root: string): string[] {
  const found: string[] = [];
  const walk = (relative: string): void => {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      const path = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      found.push(path);
    }
  };
  walk('');
  return found.sort();
}

/** The extension of a path, lowercased, with the dot. */
function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot < 0 ? '' : path.slice(dot).toLowerCase();
}

/**
 * The scan itself, exported to itself: a finding is a file whose name says
 * audio, or a text asset that embeds audio bytes as a data URI.
 */
export function audioFindings(root: string, files: readonly string[]): string[] {
  const findings: string[] = [];
  for (const path of files) {
    if (AUDIO_EXTENSIONS.has(extensionOf(path))) {
      findings.push(`${path}: an audio file extension`);
      continue;
    }
    if (extensionOf(path) === '' || ['.html', '.js', '.css', '.json', '.svg'].includes(extensionOf(path))) {
      const text = readFileSync(join(root, path), 'utf8');
      if (/data:audio\//i.test(text)) {
        findings.push(`${path}: an inline audio data URI`);
      }
    }
  }
  return findings;
}

const outDirs: string[] = [];

afterAll(() => {
  while (outDirs.length > 0) {
    const dir = outDirs.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('K1 armour: the scanner can see', () => {
  it('flags an audio extension and an inline audio data URI in a synthetic tree', () => {
    // The can-see control, on the storage suite's reasoning: a scanner that
    // finds nothing is indistinguishable from a scanner that cannot look.
    const dir = mkdtempSync(join(tmpdir(), 'bj-audio-see-'));
    outDirs.push(dir);
    writeFileSync(join(dir, 'clean.js'), 'export {};');
    writeFileSync(join(dir, 'beep.mp3'), 'not really audio');
    writeFileSync(join(dir, 'inline.js'), 'const src = "data:audio/wav;base64,UklGRg==";');
    const findings = audioFindings(dir, filesUnder(dir));
    expect(findings).toEqual([
      'beep.mp3: an audio file extension',
      'inline.js: an inline audio data URI',
    ]);
  });
});

describe('K1 armour: the bundle the config emits', () => {
  it(
    'ships no audio file of any kind',
    async () => {
      const outDir = mkdtempSync(join(tmpdir(), 'bj-audio-bundle-'));
      outDirs.push(outDir);
      await build({
        root: PROJECT_ROOT,
        configFile: join(PROJECT_ROOT, 'vite.config.ts'),
        logLevel: 'error',
        build: { outDir },
      });

      const files = filesUnder(outDir);
      // A real build, judged as one: the emitted set is non-empty and every
      // file in it is one of the three kinds a script-and-style bundle of
      // this page can be, which is the structural form of "no audio file of
      // any kind ships" rather than a list of the ones we remembered.
      expect(files.length, 'the build emitted files').toBeGreaterThan(0);
      for (const path of files) {
        expect(
          ['.html', '.js', '.css'].includes(extensionOf(path)),
          `${path} is not a document, a script or a stylesheet`,
        ).toBe(true);
      }
      expect(audioFindings(outDir, files), 'the audio scan over the emitted files').toEqual([]);
    },
    60_000,
  );
});
