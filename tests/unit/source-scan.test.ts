/**
 * The shared comment stripper, pinned.
 *
 * Nine private copies of this primitive fed nine absence-proving scans, under
 * two names and in three behaviours, and the divergence that mattered was
 * whether a stripped comment joins the tokens on either side of it. Four copies
 * deleted the comment and five replaced it with a space; nobody chose, and
 * `tests/unit/motion.test.ts`'s copy said it mirrored `tests/unit/tokens.test.ts`
 * while doing the opposite.
 *
 * This file is where that question is answered once, so the answer is a test
 * rather than a habit. Each scan's own can-see control still lives with the
 * scan: what is asserted here is the primitive underneath them.
 */

import { describe, expect, it } from 'vitest';

import { stripComments } from './support/source-scan';

describe('stripComments: a comment separates, and never joins', () => {
  it('replaces a block comment with a space rather than with nothing', () => {
    expect(stripComments('foo/*c*/bar')).toBe('foo bar');
  });

  /**
   * The reason the question matters, as a construction rather than an argument.
   * `tokens.test.ts` hunts `#[0-9a-fA-F]{3,8}` through this stripper, so a
   * deleting strip would report a colour literal that the source does not
   * contain, in a scan whose whole job is to say that none is there.
   */
  it('cannot manufacture a hex literal out of two halves and a comment', () => {
    const hex = /#[0-9a-fA-F]{3,8}\b/g;
    const source = '  border: 1px solid var(--x); /* #ab */ /* cdef */\n';
    expect([...stripComments(source).matchAll(hex)]).toHaveLength(0);
    expect([...'#ab/*x*/cdef'.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(hex)]).toHaveLength(1);
    expect([...stripComments('#ab/*x*/cdef').matchAll(hex)]).toHaveLength(0);
  });

  it('removes a line comment and keeps the code before it, with a URL intact', () => {
    expect(stripComments('const a = 1; // a note')).toBe('const a = 1; ');
    expect(stripComments("const url = 'https://example.test/x';")).toBe(
      "const url = 'https://example.test/x';",
    );
  });

  it('leaves HTML comments alone unless a scan asks for them', () => {
    expect(stripComments('<p>a</p><!-- b -->')).toBe('<p>a</p><!-- b -->');
    expect(stripComments('<p>a</p><!-- b -->', { html: true })).toBe('<p>a</p> ');
  });
});
