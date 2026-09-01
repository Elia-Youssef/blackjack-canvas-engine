/**
 * The one comment stripper the source scans share.
 *
 * Nine copies of this primitive existed under two names and in three
 * behaviours, all of them feeding scans that prove an absence, where a wrong
 * strip produces a false clean or a false offender and nothing says which. The
 * copies did not disagree on purpose: `motion.test.ts`'s own comment said it
 * mirrored `tokens.test.ts`, and it did not.
 *
 * **The comment becomes a space, and the question is settled here rather than
 * per file.** Replacing a comment with nothing joins the tokens on either side
 * of it, so `#ab/*x*\/cdef` becomes `#abcdef`: a stripper that deletes can
 * MANUFACTURE a literal that is not in the source, and `tokens.test.ts`'s colour
 * scan, which hunts `#[0-9a-fA-F]{3,8}`, is exactly the scan that would report
 * it. A space cannot create a token; it can only separate two, and every scan
 * here reads whole tokens rather than character offsets, so separating costs
 * none of them anything. When in doubt a scan should over-report and be argued
 * with, never under-report and be believed.
 *
 * The limits are the ones the copies already had, and they are known: a `//`
 * inside a string literal is mistaken for a comment, and the guard on the
 * preceding character is what keeps a `://` intact. Every caller carries a
 * planted control proving its own scan can still see, which is what makes the
 * simplicity safe.
 *
 * `tests/unit/source-scan.test.ts` pins the joining question directly.
 */

/** How a scanner wants its source cleaned. */
export interface StripOptions {
  /** Also remove HTML comments, for a scan that reads `index.html`. */
  readonly html?: boolean;
}

/** Source with its comments replaced by a space, so a scan reads code. */
export function stripComments(text: string, options: StripOptions = {}): string {
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  return options.html === true ? stripped.replace(/<!--[\s\S]*?-->/g, ' ') : stripped;
}
