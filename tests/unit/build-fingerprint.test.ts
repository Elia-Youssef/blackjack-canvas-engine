/**
 * Negative controls for the comparison behind item A6.
 *
 * `scripts/check-determinism.mjs` reports "byte-identical" or it fails the
 * build, and the only thing standing between those two outcomes is the
 * comparison in `scripts/build-fingerprint.mjs`. A comparison that always
 * returns "identical" would make the check pass forever, on any tree, which is
 * the same failure the deleted packaging script had in reverse.
 *
 * So each of these tests breaks something and requires the break to be found:
 * one flipped byte, one extra file, one file renamed to a name with identical
 * bytes. The last test goes the other way and requires an mtime change to be
 * ignored, because the hash has to be over content, not over metadata.
 */

import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { compare, fingerprint, hashTree } from '../../scripts/build-fingerprint.mjs';

const temporary: string[] = [];

function tree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'bj-fingerprint-'));
  temporary.push(dir);
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

afterEach(() => {
  while (temporary.length > 0) {
    const dir = temporary.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

const BUNDLE = {
  'index.html': '<!doctype html><title>Blackjack</title>',
  'assets/index-abc123.js': 'function e(){}e();',
};

describe('A6: the build comparison can fail', () => {
  it('calls two identical trees identical', () => {
    const a = hashTree(tree(BUNDLE));
    const b = hashTree(tree(BUNDLE));

    expect(compare(a, b).identical).toBe(true);
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('finds a single flipped byte', () => {
    const a = hashTree(tree(BUNDLE));
    const b = hashTree(
      tree({ ...BUNDLE, 'assets/index-abc123.js': 'function e(){}e()!' }),
    );

    const result = compare(a, b);
    expect(result.identical).toBe(false);
    expect(result.differing.map((diff) => diff.path)).toEqual(['assets/index-abc123.js']);
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it('finds a file present in only one build', () => {
    const a = hashTree(tree(BUNDLE));
    const b = hashTree(tree({ ...BUNDLE, 'assets/extra.js': 'export {};' }));

    const result = compare(a, b);
    expect(result.identical).toBe(false);
    expect(result.onlyInB).toEqual(['assets/extra.js']);
    expect(result.onlyInA).toEqual([]);
  });

  it('finds a rename even when the bytes are identical', () => {
    const a = hashTree(tree(BUNDLE));
    const b = hashTree(
      tree({
        'index.html': BUNDLE['index.html'],
        'assets/index-zzz999.js': BUNDLE['assets/index-abc123.js'],
      }),
    );

    const result = compare(a, b);
    expect(result.identical).toBe(false);
    expect(result.onlyInA).toEqual(['assets/index-abc123.js']);
    expect(result.onlyInB).toEqual(['assets/index-zzz999.js']);
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it('ignores mtime, because the hash is over content', () => {
    const dir = tree(BUNDLE);
    const before = hashTree(dir);

    utimesSync(join(dir, 'index.html'), Date.UTC(1999, 11, 31) / 1000, Date.UTC(1999, 11, 31) / 1000);
    const after = hashTree(dir);

    expect(fingerprint(after)).toBe(fingerprint(before));
    expect(compare(before, after).identical).toBe(true);
  });
});
