/**
 * Mutation validation for every automated gate this project has so far.
 *
 * One entry per gate, added by the part that builds it: `M3` and `A6` at BJ-0,
 * `E1` at BJ-1, `B1` at BJ-2, `B2` and `B3` at BJ-3, `B7` and `B8` at BJ-4,
 * `B13` and `B14` at BJ-5, `J1` and `J2` at BJ-6, `C2` at BJ-7, `B6`, `B9`,
 * `B10`, `B11` and `B12` at BJ-8, `J3` at BJ-9, `J5` and `J6` at BJ-10,
 * `I1`, `I2` and `I3` at BJ-11, `H6`, `M5`, `B5` and `B16` at BJ-12,
 * `E3`, `E4` and `E5` at BJ-13, `M1`, `C5`, `C8` and `B15` at BJ-15, `E6`,
 * `E7` and `E9` at BJ-14, `F1` to `F7` at BJ-16, and `D1`, `D2`, `D4`, `D5`
 * and `D6` at BJ-17.
 *
 * The `BJ-17` block breaks the input surface. Its edits split the one activation
 * binding into a pointer-only and a keyboard-only path, put the native
 * `disabled` property back on a greyed control and take away the refusal that
 * replaced it, break each of the focus policy's four jobs in turn, remove the
 * focus indicator and then spend it in a colour that cannot clear 3:1, lay the
 * top bar out where the tab order does not go, plant a context-menu suppression
 * and a secondary-button binding, and take three browser gestures away, by
 * declaration, by scroll chaining and by suppression. Its additions are the
 * six absences item `D1`'s checklist rests on, dropped into the real `src/ui/`
 * on the `I3` precedent: a mouse-only path, a touch-only path, a forbidden
 * coordinate, a pointer capture, a secondary binding and a removed indicator.
 * `D6` is a Demonstration item and closes at the session, so its entries prove
 * the armour under it can fail rather than the item itself, which is the
 * treatment `E3`, `E4`, `E5`, `E6` and `F4` already have.
 *
 * The `BJ-16` block breaks the responsive layout: the two width floors and the
 * height threshold against the contract fixture, the width-first rule that the
 * 1024 x 1366 tablet turns on, the surface plan's factor and its refusal to
 * clamp, the definite shell height whose absence pushed the action buttons below
 * the fold at `BJ-14`, the wrapping that keeps 320 px free of page scroll, the
 * portrait framing and the narrow bar's disclosure, the per-frame layout
 * resolution a rotation depends on, the size setting's route to the layout and
 * the four values it offers, the stage that scrolls to a magnified surface, both
 * bars' unsticking, and the three pieces of `F4`'s safe-area mechanism. Its fix
 * round added five more, for the two blockers the review measured: the sticky
 * rule with its room test removed and with the play surface left out of the sum,
 * two screens with controls that stop being rendered at all, and a controls row
 * that hides its overflow in a scroller with no affordance. `F4` is
 * a Demonstration item and closes at the session, so its three entries prove the
 * armour under it can fail rather than the item itself, which is the treatment
 * `E3`, `E4`, `E5` and `E6` already have.
 *
 * The `BJ-15` block is the first to be measured by the **browser** gate rather
 * than by `npm run test`. Its three items are graded in Playwright over the
 * built `dist/`, because a DOM element, a rendered box and a real round cannot
 * be seen from a unit test, so a mutation to a component, to the stylesheet or
 * to the composition root's frame is invisible to the unit suite and has to be
 * required red by the gate that actually watches it. `browserGate` below builds
 * one command per spec, so an entry names the gate it breaks. Four entries in
 * that block still go to `npm run test`: the refusal sentences, the scene
 * arrangement and the frame loop's one conversion are arithmetic and are
 * covered by `tests/unit/chrome.test.ts`.
 *
 * The `BJ-11` block breaks the storage seam, the versioned envelope and the
 * field-by-field salvage. Two of its entries are additions rather than edits,
 * because the two claims they break are about an absence: that no file under
 * `src/` carries a bare `catch`, and that exactly one of them names the platform
 * storage globals. A scanner that finds nothing is indistinguishable from a
 * scanner that cannot see, so a file carrying each is dropped into the real
 * `src/storage/` and the suite has to go red.
 *
 * The `BJ-12` block breaks the properties the soak, the determinism harness
 * and the frame-independence harness grade: the four-term identity's published
 * sum and the release of the deferred remainder, the shoe's in-play
 * accounting, the defensive rebuild's subtraction, its attempt counter and its
 * trigger, the clamp's negative and ceiling clauses, the drain loop's raw
 * delta, carried remainder and multiplicity, the resume, the session seed and
 * the shoe's split stream. Several are also caught by older suites, which is
 * layering rather than redundancy; each one is required red by `npm run test`
 * with the three BJ-12 files in it.
 *
 * The `BJ-13` block breaks the play-surface armour. E3, E4 and E5 are all
 * method D and close at the demonstration session, so these entries prove the
 * automated armour under them can fail, not the items themselves: the pip
 * layout table, both corner indices and the far corner's rotation, the suit
 * ink mapping, the face-down card's concealment, the wager decomposition, the
 * stack offset, the per-denomination fill and the value glyph, the four
 * printed lines and their ink, the rail's floor, the one-blit frame path, the
 * grain's determinism, the DPR backing store with its single scale call, the
 * pass order, the text pass's explicit state, the directory scan that keeps
 * DPR arithmetic out of everything but the surface wrapper, the vignette's
 * presence in the bake, and the corner index printing the dealt rank. One
 * entry breaks the recording context itself, on the hand-evaluator precedent
 * that a second implementation is armour only while it can fail: a recorder
 * gone blind to an operation must turn a test red, not quietly pass it.
 *
 * The `BJ-10` block's `J5` entries also break the per-round action journal that
 * part added to `table.ts`. No acceptance item is claimed for the journal; it
 * is labelled `J5` because SPEC 8's "every action taken" is the field it exists
 * to fill and `J5` is the item that grades that list.
 *
 * The `BJ-6` block carries entries labelled `B15` as well. The betting rules and
 * the four-term identity are built at `BJ-6` and unit tested there, and `B15`
 * grades them at `BJ-15` where the chip controls exist to render a rejection.
 * The label names the item the property belongs to, not the part that wrote the
 * entry, so that a later reader looking for what protects `B15` finds it.
 *
 * "A lint rule that cannot fail is not a gate" is the standing instruction, and
 * LESSONS.md carries two separate entries about gates that had quietly stopped
 * checking anything. A passing test suite is not evidence that the suite would
 * notice a regression; only a deliberate break is.
 *
 * Each mutation below damages one thing and requires a named command to go red.
 * If a mutation is applied and the command still passes, that mutation is
 * reported as UNDETECTED and this script exits 1, because a gate that survives
 * its own removal is decoration.
 *
 * Every file is restored in a finally block, including on Ctrl-C. Run it with:
 *
 *   npm run verify:mutations
 *
 * It is not part of the merge gate. It is the evidence behind the claim that
 * the merge gate works, and it is cheap enough to run whenever either gate is
 * edited.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The local CLI entry points, invoked through node directly. Going through a
// shell would mean passing arguments unescaped, and going through npx would
// mean the harness could pick up a different version than the merge gate uses.
const UNIT = {
  label: 'npm run test',
  bin: join(PROJECT_ROOT, 'node_modules', 'vitest', 'vitest.mjs'),
  argv: ['run'],
};
const LINT = {
  label: 'npm run lint',
  bin: join(PROJECT_ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js'),
  argv: ['.', '--ignore-pattern', 'tests/lint/fixtures/**'],
};

/**
 * The browser gate, one spec at a time, on Chromium. Added at BJ-15.
 *
 * The three chrome items are graded in Playwright over the built `dist/`, so a
 * mutation to a component or to the stylesheet is invisible to `npm run test`
 * and has to be required red by the gate that actually watches it. One command
 * per spec rather than one for all three, so a line below names the gate it
 * breaks rather than "some browser test went red".
 *
 * **The preview server must not already be running.** `playwright.config.ts`
 * reuses an existing server outside CI, and a reused server serves the `dist/`
 * that was built before the mutation was applied. Every invocation here starts
 * its own, which rebuilds; the baseline check below would also catch a stale one
 * the moment a mutation stopped being visible, but the cheaper answer is not to
 * leave a preview server running while this script is.
 *
 * Chromium alone. The merge gate runs all three engines; what these entries have
 * to show is that the assertion can fail, and a second and third engine would
 * triple the wall clock to show it twice more.
 */
function browserGate(spec) {
  return {
    label: `npm run test:browser -- ${spec} (chromium)`,
    bin: join(PROJECT_ROOT, 'node_modules', '@playwright', 'test', 'cli.js'),
    argv: ['test', '--project=chromium', '--reporter=line', `tests/browser/${spec}`],
  };
}

const BETTING = browserGate('betting.spec.ts');
const OVERLAYS = browserGate('overlays.spec.ts');
const ROUND_RESULT = browserGate('round-result.spec.ts');

// BJ-14's three, added by the part that built them. `E7` and `E9` are graded
// over the built `dist/`, and `E6`'s browser armour drives the demonstration
// hook, so a mutation to the motion layer, the stylesheet or the composition
// root is required red by the gate that watches the page.
const REDUCED_MOTION = browserGate('reduced-motion.spec.ts');
const SPEED_SETTING = browserGate('speed-setting.spec.ts');
const MOTION_DEMO = browserGate('motion-demo.spec.ts');

// BJ-16's seven, one per item plus the armour under the Demonstration one. Six
// of the seven are graded in the browser for the same reason the chrome items
// are: a breakpoint, a rendered box, a scrollbar and a hit test cannot be seen
// from a unit test. The arithmetic behind them is unit tested, and the entries
// below say which of the two each mutation is required red by.
const BREAKPOINTS = browserGate('breakpoints.spec.ts');
const NO_HSCROLL = browserGate('no-hscroll.spec.ts');
const PORTRAIT = browserGate('portrait.spec.ts');
const ORIENTATION = browserGate('orientation.spec.ts');
const SURFACE_SCALE = browserGate('surface-scale.spec.ts');
const SMALL_VIEWPORT = browserGate('small-viewport.spec.ts');
const SAFE_AREA = browserGate('safe-area.spec.ts');

// BJ-17's four. Three of the part's five items are graded in the browser, for
// the reason the chrome and layout items are: an input method, a tab order and a
// rendered focus ring cannot be seen from a unit test. The fourth spec is the
// armour under the Demonstration item, on the `F4` and `E6` precedent. The
// source scans behind item `D1` are unit tested instead, and their entries name
// `UNIT`.
const INPUT_PARITY = browserGate('input-parity.spec.ts');
const KEYBOARD = browserGate('keyboard.spec.ts');
const SECONDARY_POINTER = browserGate('secondary-pointer.spec.ts');
const GESTURES = browserGate('gestures.spec.ts');

/**
 * Mutations that edit an existing file.
 *
 * `find` must appear exactly once, so a mutation cannot silently stop applying
 * after a refactor: this script fails loudly instead.
 */
const EDITS = [
  {
    item: 'M3',
    name: 'the DOM rule is switched off in the lint config',
    file: 'eslint.config.js',
    find: "'core-boundary/no-dom': 'error',",
    replace: "'core-boundary/no-dom': 'off',",
    detectedBy: UNIT,
  },
  {
    item: 'M3',
    name: 'the import rule is switched off in the lint config',
    file: 'eslint.config.js',
    find: "'core-boundary/no-forbidden-imports': 'error',",
    replace: "'core-boundary/no-forbidden-imports': 'off',",
    detectedBy: UNIT,
  },
  {
    item: 'M3',
    name: 'the boundary becomes disableable with an inline comment',
    file: 'eslint.config.js',
    find: "linterOptions: { noInlineConfig: true },",
    replace: "linterOptions: { noInlineConfig: false },",
    detectedBy: UNIT,
  },
  {
    item: 'M3',
    name: 'npm run lint is widened to ignore more than the fixtures',
    file: 'package.json',
    find: '"lint": "eslint . --ignore-pattern \\"tests/lint/fixtures/**\\""',
    replace: '"lint": "eslint . --ignore-pattern \\"tests/lint/fixtures/**\\" --ignore-pattern \\"src/core/**\\""',
    detectedBy: UNIT,
  },
  {
    item: 'M3',
    name: 'the rule stops limiting itself to core/ and reports everywhere',
    file: 'tools/eslint-plugin-core-boundary/index.js',
    find: '  return segments(filename).some((segment) => segment.toLowerCase() === wanted);',
    replace: '  return Boolean(filename) || Boolean(wanted);',
    detectedBy: UNIT,
  },
  {
    item: 'M3',
    name: 'the boundary match goes back to being case sensitive',
    file: 'tools/eslint-plugin-core-boundary/index.js',
    find: '  return segments(filename).some((segment) => segment.toLowerCase() === wanted);',
    replace: '  return segments(filename).some((segment) => segment === wanted);',
    detectedBy: UNIT,
  },
  {
    item: 'M3',
    name: 'a template literal specifier stops being read',
    file: 'tools/eslint-plugin-core-boundary/index.js',
    find: "  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {",
    replace: "  if (node.type === 'TemplateLiteral' && node.expressions.length === -1) {",
    detectedBy: UNIT,
  },
  {
    item: 'M3',
    name: 'globalThis is no longer refused outright inside core/',
    file: 'tools/eslint-plugin-core-boundary/index.js',
    find: "                report(id, 'globalReach', id.name);",
    replace: '                void id.name;',
    detectedBy: UNIT,
  },
  {
    item: 'M3',
    name: 'capturing Math itself stops being an error',
    file: 'tools/eslint-plugin-core-boundary/index.js',
    find: "              context.report({ node: id, messageId: 'mathAliased' });",
    replace: '              void id;',
    detectedBy: UNIT,
  },
  {
    item: 'M3',
    name: 'Document and Window drop off the banned globals list',
    file: 'tools/eslint-plugin-core-boundary/banned-globals.js',
    find: "  'Document', 'Window', 'WindowProxy', 'WorkerGlobalScope', 'VisualViewport',",
    replace: "  'WindowProxy', 'WorkerGlobalScope', 'VisualViewport',",
    detectedBy: UNIT,
  },
  {
    item: 'M3',
    name: 'a violation is removed from the fixture',
    file: 'tests/lint/fixtures/core/violations.ts',
    find: '  return Math.random(); // @expect core-boundary/no-math-random',
    replace: '  return 0.5; // @expect core-boundary/no-math-random',
    detectedBy: UNIT,
  },
  {
    item: 'E1',
    name: 'a chrome hex is edited in the stylesheet',
    file: 'src/ui/tokens.css',
    find: '  --bj-dark-accent: #e8b33c;',
    replace: '  --bj-dark-accent: #e8b33d;',
    detectedBy: UNIT,
  },
  {
    item: 'E1',
    name: 'a play surface hex is edited in the renderer record',
    file: 'src/render/tokens.ts',
    find: "  rail: '#c2a86a',",
    replace: "  rail: '#c2a86b',",
    detectedBy: UNIT,
  },
  {
    item: 'E1',
    name: 'a duration drifts off the QUALITY-BAR scale',
    file: 'src/ui/tokens.css',
    find: '  --dur-3: 220ms;',
    replace: '  --dur-3: 240ms;',
    detectedBy: UNIT,
  },
  {
    item: 'E1',
    name: 'reduced motion stops zeroing a duration',
    file: 'src/ui/tokens.css',
    find: '    --dur-3: var(--dur-0);',
    replace: '    --dur-3: 220ms;',
    detectedBy: UNIT,
  },
  {
    item: 'E1',
    name: 'the type scale is given in px instead of rem',
    file: 'src/ui/tokens.css',
    find: '  --type-md: 1.2rem;',
    replace: '  --type-md: 19.2px;',
    detectedBy: UNIT,
  },
  {
    item: 'A6',
    name: 'the build comparison always reports identical',
    file: 'scripts/build-fingerprint.mjs',
    find: '    identical:\n      onlyInA.length === 0 &&',
    replace: '    identical:\n      true ||\n      onlyInA.length === 0 &&',
    detectedBy: UNIT,
  },
  {
    item: 'A6',
    name: 'the build hash covers mtime instead of content alone',
    file: 'scripts/build-fingerprint.mjs',
    find: '          sha256: hashBytes(bytes),',
    replace: '          sha256: hashBytes(String(statSync(full).mtimeMs)),',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // B1. Hand evaluation, and the two things that make it provable: the
  // independent evaluator, and the size of the space the sweep covers.
  // ------------------------------------------------------------------
  {
    item: 'B1',
    name: 'the Ace adjustment is never applied',
    file: 'src/core/hand.ts',
    find: '  return { total: soft ? total + ACE_ADJUSTMENT : total, soft };',
    replace: '  return { total, soft };',
    detectedBy: UNIT,
  },
  {
    item: 'B1',
    name: 'the Ace adjustment stops fitting at exactly 21',
    file: 'src/core/hand.ts',
    find: '  const soft = holdsAce && total + ACE_ADJUSTMENT <= TARGET;',
    replace: '  const soft = holdsAce && total + ACE_ADJUSTMENT < TARGET;',
    detectedBy: UNIT,
  },
  {
    item: 'B1',
    name: 'a hand of exactly 21 starts counting as bust',
    file: 'src/core/hand.ts',
    find: '  return handValue(cards).total > TARGET;',
    replace: '  return handValue(cards).total >= TARGET;',
    detectedBy: UNIT,
  },
  {
    item: 'B1',
    name: 'a natural stops excluding hands created by a split',
    file: 'src/core/hand.ts',
    find: '  if (origin.fromSplit) {\n    return false;\n  }',
    replace: '  void origin;',
    detectedBy: UNIT,
  },
  {
    item: 'B1',
    name: 'a natural stops requiring exactly two cards',
    file: 'src/core/hand.ts',
    find: '  if (cards.length !== 2) {',
    replace: '  if (cards.length < 2) {',
    detectedBy: UNIT,
  },
  {
    item: 'B1',
    name: 'a King stops being worth ten',
    file: 'src/core/cards.ts',
    find: '  K: 10,',
    replace: '  K: 9,',
    detectedBy: UNIT,
  },
  {
    item: 'B1',
    name: 'the independent evaluator is wrong, and the sweep still believes it',
    file: 'tests/unit/reference/hand-evaluator.ts',
    find: 'const LIMIT = 21;',
    replace: 'const LIMIT = 20;',
    detectedBy: UNIT,
  },
  {
    item: 'B1',
    name: 'the sweep quietly stops covering five-card hands',
    file: 'tests/unit/hand-value.test.ts',
    find: 'const EXHAUSTIVE_LENGTH = 5;',
    replace: 'const EXHAUSTIVE_LENGTH = 4;',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // B2. The shoe: its composition, the two deck counts it offers, the
  // uniformity of the shuffle, and the invariant that no card is ever in
  // play twice. The first three break in the generator, so they break here.
  // ------------------------------------------------------------------
  {
    item: 'B2',
    name: 'the shuffle draws its partner from the whole array',
    file: 'src/core/rng.ts',
    find: '      swap(items, index, nextInt(index + 1));',
    replace: '      swap(items, index, nextInt(items.length));',
    detectedBy: UNIT,
  },
  {
    item: 'B2',
    name: 'nextInt reduces by modulo instead of rejecting',
    file: 'src/core/rng.ts',
    find: '      const draw = nextUint32() >>> shift;',
    replace: '      const draw = nextUint32() % bound;',
    detectedBy: UNIT,
  },
  {
    item: 'B2',
    name: 'nextFloat divides by 2^32 - 1, so 1 becomes reachable',
    file: 'src/core/rng.ts',
    find: '    return nextUint32() / UINT32_SPAN;',
    replace: '    return nextUint32() / (UINT32_SPAN - 1);',
    detectedBy: UNIT,
  },
  {
    item: 'B2',
    name: 'split hands back a copy of the parent state',
    file: 'src/core/rng.ts',
    find: '    const derived = splitSeed(a, b, c, d, splits);\n    return fromWords(seedWords(derived));',
    replace: '    void splitSeed(a, b, c, d, splits);\n    return createFrom(a, b, c, d);',
    detectedBy: UNIT,
  },
  {
    // The entry above does not cover this: a split that copies state leaves the
    // parent unadvanced too, so only a mutation that consumes a word isolates
    // "taking a child does not move the parent", which is the half of SPEC 4.1
    // the shoe's stability against a later consumer actually rests on.
    item: 'B2',
    name: 'split consumes a word from the parent it was taken from',
    file: 'src/core/rng.ts',
    find: '    const derived = splitSeed(a, b, c, d, splits);',
    replace: '    const derived = nextUint32();',
    detectedBy: UNIT,
  },
  {
    item: 'B2',
    name: 'a suit is dropped from the composition',
    file: 'src/core/shoe.ts',
    find: '        for (const suit of SUITS) {',
    replace: '        for (const suit of SUITS.slice(1)) {',
    detectedBy: UNIT,
  },
  {
    item: 'B2',
    name: 'the shoe is built one deck short',
    file: 'src/core/shoe.ts',
    find: '    for (let deck = 0; deck < decks; deck += 1) {',
    replace: '    for (let deck = 0; deck < decks - 1; deck += 1) {',
    detectedBy: UNIT,
  },
  {
    item: 'B2',
    name: 'a deck count outside 6 and 8 becomes reachable',
    file: 'src/core/shoe.ts',
    find: '  return DECK_COUNTS.some((count) => count === value);',
    replace: '  return Number.isInteger(value) && value > 0;',
    detectedBy: UNIT,
  },
  {
    item: 'B2',
    name: 'the defensive rebuild stops excluding the cards in play',
    file: 'src/core/shoe.ts',
    find: '      if (outstanding > 0) {\n        owed.set(key, outstanding - 1);\n        continue;\n      }',
    replace: '      void outstanding;',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // B3. The cut card: where it may sit, and that the reshuffle it triggers
  // waits for the round to finish. The last entry breaks the test's own
  // derivation of the SPEC 4.1 worst case rather than the game's code.
  // ------------------------------------------------------------------
  {
    item: 'B3',
    name: 'the cut card window reaches past 40 percent of the shoe',
    file: 'src/core/shoe.ts',
    find: 'export const MAX_UNDEALT_PERCENT = 40;',
    replace: 'export const MAX_UNDEALT_PERCENT = 55;',
    detectedBy: UNIT,
  },
  {
    item: 'B3',
    name: 'the cut card window starts below 25 percent of the shoe',
    file: 'src/core/shoe.ts',
    find: 'export const MIN_UNDEALT_PERCENT = 25;',
    replace: 'export const MIN_UNDEALT_PERCENT = 20;',
    detectedBy: UNIT,
  },
  {
    // Both entries above move the ends of the window. This one leaves the ends
    // exactly where they are and changes the shape: the minimum of two uniform
    // draws is triangular, so the mean slides about a sixth of the window low
    // and the bottom slots pile up. SPEC 4.1 says uniformly random, not merely
    // inside the window.
    item: 'B3',
    name: 'the cut card position stops being uniform inside its window',
    file: 'src/core/shoe.ts',
    find: '    const behind = range.min + stream.nextInt(range.max - range.min + 1);',
    replace:
      '    const span = range.max - range.min + 1;\n' +
      '    const behind = range.min + Math.min(stream.nextInt(span), stream.nextInt(span));',
    detectedBy: UNIT,
  },
  {
    item: 'B3',
    name: 'the shoe reshuffles mid-round, the moment the cut card is reached',
    file: 'src/core/shoe.ts',
    find: '    if (dealt >= stack.length) {\n      rebuild();\n    }',
    replace: '    if (dealt >= stack.length || cutCardReached()) {\n      rebuild();\n    }',
    detectedBy: UNIT,
  },
  {
    item: 'B3',
    name: 'the round boundary stops reshuffling when the cut card was reached',
    file: 'src/core/shoe.ts',
    find: '    reshuffle();\n    return true;',
    replace: '    return true;',
    detectedBy: UNIT,
  },
  {
    item: 'B3',
    name: 'the worst-case round drops the dealer from its value budget',
    file: 'tests/unit/cut-card.test.ts',
    find: 'const MAX_ROUND_VALUE = MAX_HANDS * MAX_PLAYER_VALUE + MAX_DEALER_VALUE;',
    replace: 'const MAX_ROUND_VALUE = MAX_HANDS * MAX_PLAYER_VALUE;',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // B8. The dealer's policy: one comparison, at 17, with no case for a
  // soft total. The first entry is the variant SPEC 4.9 names and
  // rejects, and it is the one the sweep's negative control exists for:
  // a policy that grew this branch would agree with the control
  // everywhere, which is what the control asserts cannot happen.
  // ------------------------------------------------------------------
  {
    item: 'B8',
    name: 'the policy grows a special case and hits soft 17',
    file: 'src/core/dealer.ts',
    find: '  return handValue(cards).total < STANDS_AT;',
    replace:
      '  const reading = handValue(cards);\n' +
      '  if (reading.soft && reading.total === STANDS_AT) {\n' +
      '    return true;\n' +
      '  }\n' +
      '  return reading.total < STANDS_AT;',
    detectedBy: UNIT,
  },
  {
    item: 'B8',
    name: 'the comparison slips to <= and the dealer draws to 17',
    file: 'src/core/dealer.ts',
    find: 'total < STANDS_AT;',
    replace: 'total <= STANDS_AT;',
    detectedBy: UNIT,
  },
  {
    item: 'B8',
    name: 'the threshold drops and the dealer stands on 16',
    file: 'src/core/dealer.ts',
    find: 'export const STANDS_AT = 17;',
    replace: 'export const STANDS_AT = 16;',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // B7. The peek: which up cards it fires on, which one carries an
  // insurance offer, that it reads the hole card through SPEC 4.2's
  // single definition of a natural, and that its result cannot leak.
  // The last three break the leak-free result three different ways,
  // because "carries one bit" fails differently from "is the same
  // object every time" and from "refuses rather than answers".
  // ------------------------------------------------------------------
  {
    item: 'B7',
    name: 'the peek stops firing on a ten-value up card',
    file: 'src/core/dealer.ts',
    find: '  return isAce(up) || isTenValue(up);',
    replace: '  return isAce(up);',
    detectedBy: UNIT,
  },
  {
    item: 'B7',
    name: 'the peek fires on every up card there is',
    file: 'src/core/dealer.ts',
    find: 'export function peeksOn(up: Rank): boolean {',
    replace: 'export function peeksOn(up: Rank): boolean {\n  return true;',
    detectedBy: UNIT,
  },
  {
    item: 'B7',
    name: 'insurance starts being offered on a ten-value up card too',
    file: 'src/core/dealer.ts',
    find: 'export function offersInsurance(up: Rank): boolean {\n  return isAce(up);',
    replace:
      'export function offersInsurance(up: Rank): boolean {\n  return isAce(up) || isTenValue(up);',
    detectedBy: UNIT,
  },
  {
    item: 'B7',
    name: 'the peek never reads the hole card it was handed',
    file: 'src/core/dealer.ts',
    find: 'isNatural([upCard, holeCard], UNSPLIT)',
    replace: 'isNatural([upCard, upCard], UNSPLIT)',
    detectedBy: UNIT,
  },
  {
    item: 'B7',
    name: 'the result grows a field and leaks the hole card with it',
    file: 'src/core/dealer.ts',
    find: '  return isNatural([upCard, holeCard], UNSPLIT) ? DEALER_NATURAL : NO_DEALER_NATURAL;',
    replace:
      '  const dealerNatural = isNatural([upCard, holeCard], UNSPLIT);\n' +
      '  return Object.freeze({ dealerNatural, hole: holeCard.rank });',
    detectedBy: UNIT,
  },
  {
    item: 'B7',
    name: 'the result becomes a fresh object per peek instead of a shared one',
    file: 'src/core/dealer.ts',
    find: '? DEALER_NATURAL : NO_DEALER_NATURAL;',
    replace:
      '? Object.freeze({ dealerNatural: true })\n' +
      '    : Object.freeze({ dealerNatural: false });',
    detectedBy: UNIT,
  },
  {
    item: 'B7',
    name: 'a peek behind an up card SPEC 4.4 never peeks behind is answered instead of refused',
    file: 'src/core/dealer.ts',
    find:
      '    throw new RangeError(\n' +
      '      `SPEC 4.4 peeks behind an Ace or a ten-value up card only; ${upCard.rank} is neither`,\n' +
      '    );',
    replace: '    return NO_DEALER_NATURAL;',
    detectedBy: UNIT,
  },
  {
    // The refusal is public information, decided by the up card alone. This
    // makes it carry the one card nobody may see, which is a tell in a log or
    // a stack trace rather than on screen and is the same defect either way.
    item: 'B7',
    name: 'the refusal message starts naming the hole card',
    file: 'src/core/dealer.ts',
    find:
      '      `SPEC 4.4 peeks behind an Ace or a ten-value up card only; ${upCard.rank} is neither`,',
    replace:
      '      `SPEC 4.4 peeks behind an Ace or a ten-value up card only; ${upCard.rank} is neither, ' +
      'and ${holeCard.rank} is behind it`,',
    detectedBy: UNIT,
  },
  {
    item: 'B7',
    name: 'a result constant loses its freeze and can be decorated in place',
    file: 'src/core/dealer.ts',
    find: 'const NO_DEALER_NATURAL: PeekResult = Object.freeze({ dealerNatural: false });',
    replace: 'const NO_DEALER_NATURAL: PeekResult = { dealerNatural: false };',
    detectedBy: UNIT,
  },
  {
    // The dealer's hand is never a split hand, so this flag reads as harmless
    // until it silently turns every dealer natural into an ordinary 21 and the
    // peek stops resolving anything.
    item: 'B7',
    name: 'the peek asks about a split hand, so no natural is ever found',
    file: 'src/core/dealer.ts',
    find: 'const UNSPLIT: SplitOrigin = Object.freeze({ fromSplit: false });',
    replace: 'const UNSPLIT: SplitOrigin = Object.freeze({ fromSplit: true });',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // B13. The settlement ladder: the order of the nine rungs, and the
  // exact delta on each. The first three are the reorderings SPEC 4.10
  // warns about, and each one is invisible to a hand that reaches only
  // one of the two rungs it moves, which is why the sweep runs all
  // three as controls rather than testing the rungs one at a time.
  // ------------------------------------------------------------------
  {
    item: 'B13',
    name: 'rungs 2 and 3 swap, so a natural beats a natural instead of pushing',
    file: 'src/core/settlement.ts',
    find:
      '  if (playerNatural && dealerNatural) {\n' +
      "    return decided(2, 'PUSH', 0);\n" +
      '  }\n' +
      '\n' +
      '  // Rung 3. Player natural, and by rung 2 the dealer has none. Pays 3:2.\n' +
      '  if (playerNatural) {\n' +
      "    return decided(3, 'BLACKJACK', naturalPayout(wager));\n" +
      '  }',
    replace:
      '  if (playerNatural) {\n' +
      "    return decided(3, 'BLACKJACK', naturalPayout(wager));\n" +
      '  }\n' +
      '\n' +
      '  // Rung 3. Player natural, and by rung 2 the dealer has none. Pays 3:2.\n' +
      '  if (playerNatural && dealerNatural) {\n' +
      "    return decided(2, 'PUSH', 0);\n" +
      '  }',
    detectedBy: UNIT,
  },
  {
    item: 'B13',
    name: 'rungs 5 and 6 swap, so a player who busted first is paid for a dealer bust',
    file: 'src/core/settlement.ts',
    find:
      '  if (isBust(player.cards)) {\n' +
      "    return decided(5, 'DEALER_WIN', -wager);\n" +
      '  }\n' +
      '\n' +
      "  // Rung 6. Dealer bust, with the player's hand still live.\n" +
      '  if (isBust(dealer.cards)) {\n' +
      "    return decided(6, 'PLAYER_WIN', wager);\n" +
      '  }',
    replace:
      '  if (isBust(dealer.cards)) {\n' +
      "    return decided(6, 'PLAYER_WIN', wager);\n" +
      '  }\n' +
      '\n' +
      "  // Rung 6. Dealer bust, with the player's hand still live.\n" +
      '  if (isBust(player.cards)) {\n' +
      "    return decided(5, 'DEALER_WIN', -wager);\n" +
      '  }',
    detectedBy: UNIT,
  },
  {
    // SPEC 4.8's late surrender, turned into early surrender. The pair of
    // inputs this moves cannot arise in play, because the peek resolves a
    // dealer natural first, which is exactly why the sweep drives them.
    item: 'B13',
    name: 'rung 1 loses its dealer-natural qualifier',
    file: 'src/core/settlement.ts',
    find: '  if (player.surrendered && !dealerNatural) {',
    replace: '  if (player.surrendered) {',
    detectedBy: UNIT,
  },
  {
    item: 'B13',
    name: 'the natural pays 6:5 instead of 3:2',
    file: 'src/core/settlement.ts',
    find: 'export const NATURAL_PAYS = Object.freeze({ numerator: 3, denominator: 2 });',
    replace: 'export const NATURAL_PAYS = Object.freeze({ numerator: 6, denominator: 5 });',
    detectedBy: UNIT,
  },
  {
    item: 'B13',
    name: 'equal naturals stop pushing and start paying the wager',
    file: 'src/core/settlement.ts',
    find: "    return decided(2, 'PUSH', 0);",
    replace: "    return decided(2, 'PUSH', wager);",
    detectedBy: UNIT,
  },
  {
    item: 'B13',
    name: 'equal values stop pushing and start paying the wager',
    file: 'src/core/settlement.ts',
    find: "  return decided(9, 'PUSH', 0);",
    replace: "  return decided(9, 'PUSH', wager);",
    detectedBy: UNIT,
  },
  {
    item: 'B13',
    name: 'surrender returns the whole wager rather than half of it',
    file: 'src/core/settlement.ts',
    find: "    return decided(1, 'SURRENDER', -(wager / SURRENDER_DIVISOR));",
    replace: "    return decided(1, 'SURRENDER', -wager);",
    detectedBy: UNIT,
  },
  {
    item: 'B13',
    name: 'rung 7 stops being strict, so an equal value goes to the player',
    file: 'src/core/settlement.ts',
    find: '  if (playerValue > dealerValue) {',
    replace: '  if (playerValue >= dealerValue) {',
    detectedBy: UNIT,
  },
  {
    // A split hand's two-card 21 is 21, not a natural. SPEC 4.6. This is the
    // mistake `SplitOrigin` exists to make hard, and it pays 3:2 on every
    // split hand that lands an Ace beside a ten.
    item: 'B13',
    name: 'the player natural stops reading the hand it is asked about',
    file: 'src/core/settlement.ts',
    find: '  const playerNatural = isNatural(player.cards, player.origin);',
    replace: '  const playerNatural = isNatural(player.cards, UNSPLIT);',
    detectedBy: UNIT,
  },
  {
    // The other way round, and quieter: the dealer holds one hand all round,
    // so borrowing the player's origin makes every dealer natural vanish on a
    // split hand alone and settles a natural as an ordinary 21.
    item: 'B13',
    name: "the dealer's natural starts reading the player's split origin",
    file: 'src/core/settlement.ts',
    find: '  const dealerNatural = isNatural(dealer.cards, UNSPLIT);',
    replace: '  const dealerNatural = isNatural(dealer.cards, player.origin);',
    detectedBy: UNIT,
  },
  {
    item: 'B13',
    name: 'the sweep quietly stops covering the doubled table maximum',
    file: 'tests/unit/settlement.test.ts',
    find: 'const SWEEP_WAGERS = [10, 50, 100, 500, 2000, 4000] as const;',
    replace: 'const SWEEP_WAGERS = [10, 50, 100, 500, 2000] as const;',
    detectedBy: UNIT,
  },
  {
    // The B1 and B3 precedent: break the test's own reading of the rule rather
    // than the game's code. The sweep has to notice that its oracle no longer
    // says what SPEC 4.10 says, which it can only do by actually driving the
    // inputs the qualifier decides.
    item: 'B13',
    name: "the test's own ladder drops rung 1's qualifier",
    file: 'tests/unit/settlement.test.ts',
    find: '  if (input.surrendered && !dealer.natural) {\n' +
      "    return { rung: 1, outcome: 'SURRENDER', net: -(w / SURRENDER_DIVISOR) };\n" +
      '  }\n' +
      '  if (player.natural && dealer.natural) {\n' +
      "    return { rung: 2, outcome: 'PUSH', net: 0 };\n" +
      '  }\n' +
      '  if (player.natural) {\n' +
      "    return { rung: 3, outcome: 'BLACKJACK', net: (w * NATURAL_NUMERATOR) / NATURAL_DENOMINATOR };\n" +
      '  }\n' +
      '  if (dealer.natural) {\n' +
      "    return { rung: 4, outcome: 'DEALER_WIN', net: -w };\n" +
      '  }\n' +
      '  if (player.bust) {',
    replace: '  if (input.surrendered) {\n' +
      "    return { rung: 1, outcome: 'SURRENDER', net: -(w / SURRENDER_DIVISOR) };\n" +
      '  }\n' +
      '  if (player.natural && dealer.natural) {\n' +
      "    return { rung: 2, outcome: 'PUSH', net: 0 };\n" +
      '  }\n' +
      '  if (player.natural) {\n' +
      "    return { rung: 3, outcome: 'BLACKJACK', net: (w * NATURAL_NUMERATOR) / NATURAL_DENOMINATOR };\n" +
      '  }\n' +
      '  if (dealer.natural) {\n' +
      "    return { rung: 4, outcome: 'DEALER_WIN', net: -w };\n" +
      '  }\n' +
      '  if (player.bust) {',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // B14. Exact payouts. The first breaks the 2:1 arithmetic; the second
  // is the one no numeric assertion can see, because rounding a payout
  // that is already whole changes nothing until a denomination moves;
  // the last two break the test's own derivation of the reachable
  // wagers and its own checker, in the B1 and B3 precedent.
  // ------------------------------------------------------------------
  {
    item: 'B14',
    name: 'insurance pays 1:1 instead of 2:1',
    file: 'src/core/settlement.ts',
    find: 'export const INSURANCE_PAYS = 2;',
    replace: 'export const INSURANCE_PAYS = 1;',
    detectedBy: UNIT,
  },
  {
    item: 'B14',
    name: 'a rounding call appears in the 3:2 natural, where no number can see it',
    file: 'src/core/settlement.ts',
    find: '  return (wager * NATURAL_PAYS.numerator) / NATURAL_PAYS.denominator;',
    replace: '  return Math.round((wager * NATURAL_PAYS.numerator) / NATURAL_PAYS.denominator);',
    detectedBy: UNIT,
  },
  {
    item: 'B14',
    name: 'the reachable wager set forgets that a hand can double',
    file: 'tests/unit/payout-integrality.test.ts',
    find:
      'const HAND_WAGERS = new Set<number>([\n' +
      '  ...INITIAL_WAGERS,\n' +
      '  ...[...INITIAL_WAGERS].map((wager) => wager * DOUBLE),\n' +
      ']);',
    replace: 'const HAND_WAGERS = new Set<number>([...INITIAL_WAGERS]);',
    detectedBy: UNIT,
  },
  {
    item: 'B14',
    name: 'the fraction checker tests for a finite number instead of a whole one',
    file: 'tests/unit/payout-integrality.test.ts',
    find: '      if (!Number.isInteger(value)) {',
    replace: '      if (!Number.isFinite(value)) {',
    detectedBy: UNIT,
  },
  {
    // The B7 precedent: the structural assertions about what a caller is handed
    // are worth no more than the mutations that show they can fail. A settled
    // hand travels to the wallet, to the round result and into history, so a
    // result that can be edited in place is a number that can change after the
    // player has been shown it.
    item: 'B13',
    name: 'a settled hand loses its freeze and can be edited after the fact',
    file: 'src/core/settlement.ts',
    find: '  return Object.freeze({ outcome, net, rung });',
    replace: '  return { outcome, net, rung };',
    detectedBy: UNIT,
  },
  {
    item: 'B13',
    name: 'the settled hand grows a fourth field',
    file: 'src/core/settlement.ts',
    find: '  return Object.freeze({ outcome, net, rung });',
    replace: '  return Object.freeze({ outcome, net, rung, paid: net > 0 });',
    detectedBy: UNIT,
  },
  {
    // SPEC 4.7 loses the stake when the dealer holds no natural. Paying it
    // instead makes insurance a free bet, and the sign is the whole rule.
    item: 'B14',
    name: 'insurance pays out on the branch where the stake is lost',
    file: 'src/core/settlement.ts',
    find: '  return dealerNatural ? INSURANCE_PAYS * stake : -stake;',
    replace: '  return dealerNatural ? INSURANCE_PAYS * stake : stake;',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // J1. SPEC 6's three tables: the six numbers, the threshold comparison,
  // both halves of the entry predicate, and SPEC 13's launch fallback. The
  // fallback needs three entries because "the highest unlocked table" is
  // invisible wherever only one table is enterable, which is every fresh
  // account, and because "unreachable" fails two different ways: by firing
  // when it should not, and by claiming it did not when it did.
  // ------------------------------------------------------------------
  {
    item: 'J1',
    name: "Bronze's minimum moves off SPEC 6",
    file: 'src/core/wallet.ts',
    find: "  Object.freeze<TableLimits>({ id: 'bronze', minimum: 10, maximum: 100, unlocksAt: 0 }),",
    replace:
      "  Object.freeze<TableLimits>({ id: 'bronze', minimum: 20, maximum: 100, unlocksAt: 0 }),",
    detectedBy: UNIT,
  },
  {
    item: 'J1',
    name: "Silver's maximum moves off SPEC 6",
    file: 'src/core/wallet.ts',
    find:
      "  Object.freeze<TableLimits>({ id: 'silver', minimum: 50, maximum: 500, unlocksAt: 2500 }),",
    replace:
      "  Object.freeze<TableLimits>({ id: 'silver', minimum: 50, maximum: 400, unlocksAt: 2500 }),",
    detectedBy: UNIT,
  },
  {
    item: 'J1',
    name: "Silver's unlock threshold drops below SPEC 6's 2,500",
    file: 'src/core/wallet.ts',
    find: 'unlocksAt: 2500 }),',
    replace: 'unlocksAt: 2000 }),',
    detectedBy: UNIT,
  },
  {
    item: 'J1',
    name: "Gold's unlock threshold drops below SPEC 6's 10,000",
    file: 'src/core/wallet.ts',
    find: 'unlocksAt: 10000 }),',
    replace: 'unlocksAt: 5000 }),',
    detectedBy: UNIT,
  },
  {
    // The loud failure J1's criterion asks for in as many words. SPEC 13's
    // fallback is unreachable only because every minimum is at or below the
    // 1,000 starting bankroll, so raising one has to fail rather than quietly
    // start stranding a player at their own persisted table.
    item: 'J1',
    name: "a table minimum is raised above the 1,000 bankroll, so SPEC 13's fallback becomes reachable",
    file: 'src/core/wallet.ts',
    find:
      "  Object.freeze<TableLimits>({ id: 'gold', minimum: 100, maximum: 2000, unlocksAt: 10000 }),",
    replace:
      "  Object.freeze<TableLimits>({ id: 'gold', minimum: 1100, maximum: 2000, unlocksAt: 10000 }),",
    detectedBy: UNIT,
  },
  {
    item: 'J1',
    name: 'the starting bankroll stops being 1,000',
    file: 'src/core/wallet.ts',
    find: 'export const STARTING_CHIPS = 1000;',
    replace: 'export const STARTING_CHIPS = 900;',
    detectedBy: UNIT,
  },
  {
    item: 'J1',
    name: 'the unlock comparison stops being inclusive at the threshold',
    file: 'src/core/wallet.ts',
    find: '  return bestBalance >= tableLimits(id).unlocksAt;',
    replace: '  return bestBalance > tableLimits(id).unlocksAt;',
    detectedBy: UNIT,
  },
  {
    // The same comparison, written a second time for the list form. It would
    // drift apart from the predicate above without noticing.
    item: 'J1',
    name: 'the unlocked list and the unlock predicate disagree at the threshold',
    file: 'src/core/wallet.ts',
    find: '  return TABLES.filter((table) => bestBalance >= table.unlocksAt);',
    replace: '  return TABLES.filter((table) => bestBalance > table.unlocksAt);',
    detectedBy: UNIT,
  },
  {
    item: 'J1',
    name: 'entry stops checking the unlock threshold, so a locked table opens',
    file: 'src/core/wallet.ts',
    find: '  return bestBalance >= limits.unlocksAt && chips >= limits.minimum;',
    replace: '  return chips >= limits.minimum;',
    detectedBy: UNIT,
  },
  {
    item: 'J1',
    name: 'entry stops checking the minimum, so a player who cannot bet sits down',
    file: 'src/core/wallet.ts',
    find: '  return bestBalance >= limits.unlocksAt && chips >= limits.minimum;',
    replace: '  return bestBalance >= limits.unlocksAt;',
    detectedBy: UNIT,
  },
  {
    item: 'J1',
    name: "SPEC 13's fallback scans from the bottom and picks the lowest table",
    file: 'src/core/wallet.ts',
    find: '  for (let index = TABLES.length - 1; index >= 0; index -= 1) {',
    replace: '  for (let index = 0; index < TABLES.length; index += 1) {',
    detectedBy: UNIT,
  },
  {
    item: 'J1',
    name: 'a launch stops preferring the persisted table',
    file: 'src/core/wallet.ts',
    find: '  if (canEnter(persisted, bestBalance, STARTING_CHIPS)) {',
    replace: '  if (!canEnter(persisted, bestBalance, STARTING_CHIPS)) {',
    detectedBy: UNIT,
  },
  {
    // "Unreachable" is only a claim if the code can say when it was reached.
    // A fallback that never admits to firing passes an unreachability test by
    // lying rather than by being unreachable.
    item: 'J1',
    name: 'the fallback stops admitting that it fired',
    file: 'src/core/wallet.ts',
    find: '    fromFallback: true,',
    replace: '    fromFallback: false,',
    detectedBy: UNIT,
  },
  {
    item: 'J1',
    name: 'the lowest table is read off the wrong end of SPEC 6',
    file: 'src/core/wallet.ts',
    find: '  const first = TABLES[0];',
    replace: '  const first = TABLES[TABLES.length - 1];',
    detectedBy: UNIT,
  },
  {
    // The B1 and B3 precedent: break the test's own reading rather than the
    // game's code. A sweep that stopped covering the exact threshold would
    // pass a comparison that had slipped to strict.
    item: 'J1',
    name: "the tables sweep stops covering Silver's exact threshold",
    file: 'tests/unit/tables.test.ts',
    find: 'const BEST_BALANCES = [0, 1, 999, 1000, 2499, 2500, 2501, 9999, 10000, 10001, 25000] as const;',
    replace: 'const BEST_BALANCES = [0, 1, 999, 1000, 2499, 2501, 9999, 10000, 10001, 25000] as const;',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // J2. The unlocks are keyed to a high-water mark, so the mark has to rise
  // on a win, survive a loss, survive the free reset of SPEC 4.12 and cross
  // a session. Each of those fails differently and each gets an entry.
  // ------------------------------------------------------------------
  {
    item: 'J2',
    name: 'the best balance follows the current balance down instead of holding',
    file: 'src/core/wallet.ts',
    find: '    if (chips > bestBalance) {\n      bestBalance = chips;\n    }',
    replace: '    bestBalance = chips;',
    detectedBy: UNIT,
  },
  {
    // The one reading question SPEC 6's "best chip balance ever reached" leaves
    // open, and the one no single-hand round can answer: through a one-hand
    // round the wager is out of the balance from the deal to the settlement, so
    // `chips + committed` only ever reads what `chips` read before the deal. It
    // differs on exactly one shape, a split hand paid while its sibling is still
    // on the table, and there it marks money that is still at risk and unlocks a
    // table early and permanently.
    item: 'J2',
    name: 'the mark reads the balance plus the money still on the table',
    file: 'src/core/wallet.ts',
    find: '    if (chips > bestBalance) {\n      bestBalance = chips;\n    }',
    replace:
      '    const reading = chips + committed();\n' +
      '    if (reading > bestBalance) {\n' +
      '      bestBalance = reading;\n' +
      '    }',
    detectedBy: UNIT,
  },
  {
    item: 'J2',
    name: 'settlement stops marking the balance at all',
    file: 'src/core/wallet.ts',
    find: '    state.settled = true;\n    recordBest();',
    replace: '    state.settled = true;',
    detectedBy: UNIT,
  },
  {
    item: 'J2',
    name: 'the free reset takes the unlocks back with the bankroll',
    file: 'src/core/wallet.ts',
    find: '    chips = STARTING_CHIPS;\n    wager = NO_WAGER;',
    replace: '    chips = STARTING_CHIPS;\n    wager = NO_WAGER;\n    bestBalance = STARTING_CHIPS;',
    detectedBy: UNIT,
  },
  {
    item: 'J2',
    name: 'the reset stops restoring the bankroll at all',
    file: 'src/core/wallet.ts',
    find: '    chips = STARTING_CHIPS;\n    wager = NO_WAGER;',
    replace: '    wager = NO_WAGER;',
    detectedBy: UNIT,
  },
  {
    item: 'J2',
    name: 'a persisted high-water mark is dropped on the way in',
    file: 'src/core/wallet.ts',
    find: '  let bestBalance = carried;',
    replace: '  let bestBalance = STARTING_CHIPS;',
    detectedBy: UNIT,
  },
  {
    item: 'J2',
    name: 'a corrupt persisted mark is accepted instead of refused',
    file: 'src/core/wallet.ts',
    find: '  if (!Number.isInteger(carried) || carried < STARTING_CHIPS) {',
    replace: '  if (!Number.isFinite(carried)) {',
    detectedBy: UNIT,
  },
  {
    item: 'J2',
    name: 'the bust-out offer lists a lower table the balance cannot afford',
    file: 'src/core/wallet.ts',
    find: '    (table) => bestBalance >= table.unlocksAt && chips >= table.minimum,',
    replace: '    (table) => bestBalance >= table.unlocksAt,',
    detectedBy: UNIT,
  },
  {
    item: 'J2',
    name: 'busting out fires one chip early, at the minimum rather than below it',
    file: 'src/core/wallet.ts',
    find: '    out: chips < limits.minimum,',
    replace: '    out: chips <= limits.minimum,',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // B15. The betting rules of SPEC 4.11, built at BJ-6 and graded at BJ-15.
  // The first block is the one the criterion names first: a tap over the
  // ceiling is rejected and changes nothing, never clamped. The clamp is
  // invisible to every assertion about an accepted tap, which is why it
  // gets an entry of its own rather than relying on a boundary slip.
  // ------------------------------------------------------------------
  {
    item: 'B15',
    name: 'a chip tap over the ceiling is clamped instead of rejected',
    file: 'src/core/wallet.ts',
    find:
      '  const next = wager + chip;\n' +
      '  if (next > wagerCeiling(limits, chips)) {\n' +
      "    return refused('above-ceiling');\n" +
      '  }\n' +
      '  return accepted(next);',
    replace: '  return accepted(Math.min(wager + chip, wagerCeiling(limits, chips)));',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'the tap refuses a chip that lands exactly on the ceiling',
    file: 'src/core/wallet.ts',
    find: '  if (next > wagerCeiling(limits, chips)) {',
    replace: '  if (next >= wagerCeiling(limits, chips)) {',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'the ceiling forgets the balance and reads the table maximum alone',
    file: 'src/core/wallet.ts',
    find: '  return Math.min(limits.maximum, chips);',
    replace: '  return limits.maximum;',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'a chip whose denomination equals the ceiling renders disabled',
    file: 'src/core/wallet.ts',
    find: '  return chip <= wagerCeiling(limits, chips);',
    replace: '  return chip < wagerCeiling(limits, chips);',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'Max loses its floor and leaves the 10 grid',
    file: 'src/core/wallet.ts',
    find: '  return Math.floor(wagerCeiling(limits, chips) / WAGER_GRID) * WAGER_GRID;',
    replace: '  return wagerCeiling(limits, chips);',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'Max reads the table maximum alone and wagers money that is not there',
    file: 'src/core/wallet.ts',
    find: '  return Math.floor(wagerCeiling(limits, chips) / WAGER_GRID) * WAGER_GRID;',
    replace: '  return Math.floor(limits.maximum / WAGER_GRID) * WAGER_GRID;',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'Repeat reads affordability as the balance alone and repeats an illegal wager',
    file: 'src/core/wallet.ts',
    find: '  if (previous > wagerCeiling(limits, chips)) {',
    replace: '  if (previous > chips) {',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'Repeat raises a below-minimum wager to the table minimum',
    file: 'src/core/wallet.ts',
    find: '  return accepted(previous);',
    replace: '  return accepted(Math.max(previous, limits.minimum));',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'Repeat treats a bankroll with no round behind it as a repeatable wager',
    file: 'src/core/wallet.ts',
    find: '  if (previous <= NO_WAGER) {',
    replace: '  if (previous < NO_WAGER) {',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'Deal raises a below-minimum wager instead of blocking it',
    file: 'src/core/wallet.ts',
    find:
      '    const reason = dealRefusal(wager, limits, chips);\n' +
      '    if (reason !== null) {\n' +
      '      return Object.freeze({ ok: false, reason });\n' +
      '    }\n' +
      '    const initial = wager;',
    replace:
      '    const reason = dealRefusal(wager, limits, chips);\n' +
      "    if (reason !== null && reason !== 'below-minimum') {\n" +
      '      return Object.freeze({ ok: false, reason });\n' +
      '    }\n' +
      '    const initial = Math.max(wager, limits.minimum);',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'Deal stops checking the table minimum',
    file: 'src/core/wallet.ts',
    find: '  if (wager < limits.minimum) {',
    replace: '  if (wager < 0) {',
    detectedBy: UNIT,
  },
  {
    // The one defect no assertion about a payout can see. SPEC 4.11 keeps every
    // wager on the 10 grid so the 3:2 natural is exact, and settle() answers an
    // off-grid wager without complaint, so this is where the grid is held.
    item: 'B15',
    name: 'Deal stops holding the 10 grid and lets a 25 wager through',
    file: 'src/core/wallet.ts',
    find: '  if (wager % WAGER_GRID !== 0) {',
    replace: '  if (wager % 1 !== 0) {',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: "Deal's ceiling forgets the table maximum",
    file: 'src/core/wallet.ts',
    find: "  if (wager > wagerCeiling(limits, chips)) {\n    return 'above-ceiling';\n  }",
    replace: "  if (wager > chips) {\n    return 'above-ceiling';\n  }",
    detectedBy: UNIT,
  },
  {
    // The order of the two bounds is only visible where a wager breaks both,
    // which is any wager on a balance below the table minimum. Swapped, Deal
    // tells a player who has run out of money to bet more, and every other
    // input in the suite answers identically.
    item: 'B15',
    name: 'Deal answers below-minimum before above-ceiling',
    file: 'src/core/wallet.ts',
    find:
      "  if (wager > wagerCeiling(limits, chips)) {\n" +
      "    return 'above-ceiling';\n" +
      '  }\n' +
      '  if (wager < limits.minimum) {\n' +
      "    return 'below-minimum';\n" +
      '  }',
    replace:
      '  if (wager < limits.minimum) {\n' +
      "    return 'below-minimum';\n" +
      '  }\n' +
      '  if (wager > wagerCeiling(limits, chips)) {\n' +
      "    return 'above-ceiling';\n" +
      '  }',
    detectedBy: UNIT,
  },
  {
    // The B1, B3 and B13 precedent again, on the sweep that carries the Repeat
    // reading rather than on the code.
    item: 'B15',
    name: 'the Repeat sweep narrows and stops crossing a Gold wager with a Bronze table',
    file: 'tests/unit/wallet.test.ts',
    find: 'const PREVIOUS_WAGERS = [0, 10, 50, 100, 200, 500, 1000, 2000] as const;',
    replace: 'const PREVIOUS_WAGERS = [0, 10, 50, 100, 200, 500, 1000] as const;',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // B15 again, and H6. The conserved quantity: the wager leaves the balance
  // at the deal, settlement credits back wager plus net, and nothing else
  // moves it. Each term of the identity gets an entry that removes it.
  // ------------------------------------------------------------------
  {
    item: 'B15',
    name: 'the wager stops leaving the balance at the deal',
    file: 'src/core/wallet.ts',
    find: '    chips -= initial;',
    replace: '    void initial;',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'settlement credits the net alone and swallows the wager',
    file: 'src/core/wallet.ts',
    find: '    const credit = state.wager + net;',
    replace: '    const credit = net;',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'settlement credits the wager twice',
    file: 'src/core/wallet.ts',
    find: '    const credit = state.wager + net;',
    replace: '    const credit = state.wager + state.wager + net;',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'a settled hand stays committed, so the identity moves by the wager too',
    file: 'src/core/wallet.ts',
    find: '    state.settled = true;',
    replace: '    state.settled = false;',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'committed counts hands that have already been paid',
    file: 'src/core/wallet.ts',
    find: '    return hands.reduce((total, hand) => (hand.settled ? total : total + hand.wager), 0);',
    replace: '    return hands.reduce((total, hand) => total + hand.wager, 0);',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'the conserved quantity drops its committed term',
    file: 'src/core/wallet.ts',
    find: '      conserved: chips + committed() + insuranceStake - deferredStake,',
    replace: '      conserved: chips + insuranceStake - deferredStake,',
    detectedBy: UNIT,
  },
  {
    // The two terms SPEC 4.7 fills in at BJ-8 are zero here, so no arithmetic
    // mutation of them can be detected yet. What can be held is the shape: a
    // readout narrowed back to three terms is the negative control H6 names.
    item: 'B15',
    name: 'the readout drops the deferred stake and narrows the identity to three terms',
    file: 'src/core/wallet.ts',
    find: '      deferredStake,\n      conserved:',
    replace: '      conserved:',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'the readout drops the insurance stake, narrowing the identity the other way',
    file: 'src/core/wallet.ts',
    find: '      insuranceStake,\n      deferredStake,',
    replace: '      deferredStake,',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'the double increment never leaves the balance',
    file: 'src/core/wallet.ts',
    find: '    chips -= increment;',
    replace: '    void increment;',
    detectedBy: UNIT,
  },
  {
    // The guard reads `canFund` since BJ-15 collapsed the three spellings of
    // SPEC 4.5's funding rule into one exported comparison. The mutation is
    // unchanged in meaning: the double must refuse one chip lower than it does.
    item: 'B15',
    name: 'the double refuses at exactly the balance it needs',
    file: 'src/core/wallet.ts',
    find: '    if (!canFund(increment, chips)) {',
    replace: '    if (increment >= chips) {',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'the split wager never leaves the balance',
    file: 'src/core/wallet.ts',
    find: '    chips -= equal;',
    replace: '    void equal;',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'the split refuses at exactly the balance it needs',
    file: 'src/core/wallet.ts',
    find: '    if (!canFund(equal, chips)) {',
    replace: '    if (equal >= chips) {',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'the split hand is created carrying nothing',
    file: 'src/core/wallet.ts',
    find: '    hands.push({ wager: equal, settled: false });',
    replace: '    hands.push({ wager: 0, settled: false });',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'the round boundary closes over a hand that never settled',
    file: 'src/core/wallet.ts',
    find: '    if (unsettled > 0) {',
    replace: '    if (unsettled > 1) {',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'the deal stops recording the wager Repeat repeats',
    file: 'src/core/wallet.ts',
    find: '    previousWager = initial;',
    replace: '    previousWager = NO_WAGER;',
    detectedBy: UNIT,
  },
  {
    item: 'B15',
    name: 'the deal leaves the committed wager sitting on the betting controls',
    file: 'src/core/wallet.ts',
    find: '    wager = NO_WAGER;\n    hands.push({ wager: initial, settled: false });',
    replace: '    hands.push({ wager: initial, settled: false });',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // C2. The phase machine. Four things fail differently and each gets its
  // own entries: which intent SPEC 10 allows on which screen, that a
  // refusal changes nothing at all, the per-frame drain of DESIGN section
  // 3, and the timers. The legality cells are broken one row at a time
  // because a table is only ever wrong in one cell at first, and a sweep
  // that stopped covering a phase would pass every row it still had.
  // ------------------------------------------------------------------
  {
    item: 'C2',
    name: 'the betting screen leaves a player action live',
    file: 'src/core/table.ts',
    find:
      "  betting: Object.freeze<IntentKind[]>([\n" +
      "    'tapChip',\n    'clear',\n    'repeat',\n    'max',\n    'changeTable',\n    'deal',\n  ]),",
    replace:
      "  betting: Object.freeze<IntentKind[]>([\n" +
      "    'tapChip',\n    'clear',\n    'repeat',\n    'max',\n    'changeTable',\n    'deal',\n" +
      "    'hit',\n  ]),",
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'the player turn loses Stand, so no round can reach the reveal',
    file: 'src/core/table.ts',
    find:
      "  playerTurn: Object.freeze<IntentKind[]>(['hit', 'stand', 'double', 'split', 'surrender']),",
    replace: "  playerTurn: Object.freeze<IntentKind[]>(['hit', 'double', 'split', 'surrender']),",
    detectedBy: UNIT,
  },
  {
    // SPEC 4.11 blocks changing the wager after the deal and `wallet.ts`
    // holds none of that: nothing in it is a phase gate. If the timed
    // phases do not close the four controls, the rule is enforced nowhere.
    item: 'C2',
    name: 'a timed phase leaves the betting controls live through the deal',
    file: 'src/core/table.ts',
    find: '  dealing: Object.freeze<IntentKind[]>([]),',
    replace: "  dealing: Object.freeze<IntentKind[]>(['tapChip', 'clear', 'repeat', 'max']),",
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'the round result screen starts accepting a deal',
    file: 'src/core/table.ts',
    find: "  roundResult: Object.freeze<IntentKind[]>(['nextHand']),",
    replace: "  roundResult: Object.freeze<IntentKind[]>(['nextHand', 'deal']),",
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'the phase gate is removed and every action reaches the layer beneath',
    file: 'src/core/table.ts',
    find:
      '    if (!LEGAL[phase.kind].includes(intent.kind)) {\n' +
      "      return refused(intent.kind, 'phase', 'wrong-phase');\n" +
      '    }\n',
    replace: '',
    detectedBy: UNIT,
  },
  {
    // The order is the requirement, not the outcome. Asking the wallet
    // first answers the same way on most inputs and names the wrong reason
    // on the rest, and on a player action it reaches a hand that is not
    // there. C2's counted wallet is what sees it.
    //
    // Re-anchored at `BJ-10`, which put SPEC 8's action journal between the
    // phase gate and the return and so retired the `return perform(intent);`
    // this used to hang on. The mutation is the same one: `perform` runs
    // before the gate, and the gate then refuses what it has already done.
    item: 'C2',
    name: 'the wallet is consulted before the phase is asked',
    file: 'src/core/table.ts',
    find:
      '    if (!LEGAL[phase.kind].includes(intent.kind)) {\n' +
      "      return refused(intent.kind, 'phase', 'wrong-phase');\n" +
      '    }\n' +
      '    const result = perform(intent);',
    replace:
      '    const result = perform(intent);\n' +
      '    if (!LEGAL[phase.kind].includes(intent.kind)) {\n' +
      "      return refused(intent.kind, 'phase', 'wrong-phase');\n" +
      '    }',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'a phase rejection puts the intent back on the queue, so it changes state',
    file: 'src/core/table.ts',
    find: "      return refused(intent.kind, 'phase', 'wrong-phase');",
    replace: "      queued.push(intent);\n      return refused(intent.kind, 'phase', 'wrong-phase');",
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'a phase rejection resets the accumulator of the phase it was refused on',
    file: 'src/core/table.ts',
    find: '    if (!LEGAL[phase.kind].includes(intent.kind)) {',
    replace: '    if (!LEGAL[phase.kind].includes(intent.kind)) {\n      elapsed = 0;',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'an intent kind SPEC 10 does not offer is answered instead of refused loudly',
    file: 'src/core/table.ts',
    find:
      '    if (!INTENT_KINDS.includes(intent.kind)) {\n' +
      '      throw new RangeError(`SPEC 10 offers no intent called ${String(intent.kind)}`);\n' +
      '    }\n',
    replace: '',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'the drain applies every accepted intent in the queue rather than one',
    file: 'src/core/table.ts',
    find:
      '      applied = result;\n' +
      '      if (phase !== before) {\n' +
      '        discarded = queued.length;\n' +
      '        queued.length = 0;\n' +
      '      }\n' +
      '      break;',
    replace:
      '      applied = result;\n' +
      '      if (phase !== before) {\n' +
      '        discarded = queued.length;\n' +
      '        queued.length = 0;\n' +
      '        break;\n' +
      '      }',
    detectedBy: UNIT,
  },
  {
    // DESIGN section 3's trap in one line: a queued click aimed at a screen
    // that has gone is judged against the screen that replaced it, where it
    // may well be legal and acts on something the player never saw.
    item: 'C2',
    name: 'a queued intent survives the phase change instead of being discarded',
    file: 'src/core/table.ts',
    find: '        discarded = queued.length;\n        queued.length = 0;',
    replace: '        discarded = 0;',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'a refused intent consumes the frame a live control should have taken',
    file: 'src/core/table.ts',
    find: '      if (!result.ok) {\n        rejected.push(result);\n        continue;\n      }',
    replace: '      if (!result.ok) {\n        rejected.push(result);\n        break;\n      }',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'queueing applies at once, so the frame stops deciding when an intent acts',
    file: 'src/core/table.ts',
    find: '  function queue(intent: Intent): void {\n    queued.push(intent);\n  }',
    replace: '  function queue(intent: Intent): void {\n    apply(intent);\n  }',
    detectedBy: UNIT,
  },
  {
    // SPEC 4.4: the offer closes before the peek result is applied, because
    // insurance can only win on the branch the peek decides. Peeking first
    // sends an Ace to the peek and the side wager could only ever be lost.
    item: 'C2',
    name: 'the deal branch peeks before it offers insurance',
    file: 'src/core/table.ts',
    find:
      "  if (offersInsurance(up)) {\n    return 'insurance';\n  }\n" +
      "  if (peeksOn(up)) {\n    return 'peek';\n  }",
    replace:
      "  if (peeksOn(up)) {\n    return 'peek';\n  }\n" +
      "  if (offersInsurance(up)) {\n    return 'insurance';\n  }",
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'the deal stops branching to the peek on a ten-value up card',
    file: 'src/core/table.ts',
    find: "  if (peeksOn(up)) {\n    return 'peek';\n  }\n  return 'playerTurn';",
    replace: "  return 'playerTurn';",
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    // `BJ-7` supplied the up card as an option and `BJ-8` deleted it: the
    // `dealerUp` step draws a card and the branch reads that card's rank, so
    // the two cannot disagree. What is broken here is the reading.
    name: 'the up card is never read, so every deal takes the otherwise arm',
    file: 'src/core/table.ts',
    find: '    return dealer[UP_CARD]?.rank ?? null;',
    replace: '    return null;',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'the delta clamp is removed and a one second frame deals four cards',
    file: 'src/core/table.ts',
    find: '  return Math.min(dt, MAX_STEP);',
    replace: '  return dt;',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'a negative delta stops being treated as zero',
    file: 'src/core/table.ts',
    find: '  if (!Number.isFinite(dt) || dt <= 0) {',
    replace: '  if (!Number.isFinite(dt)) {',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'a resume gap is consumed rather than dropped',
    file: 'src/core/table.ts',
    find: '  if (dt > RESUME_GAP) {\n    return 0;\n  }',
    replace: '  if (dt > RESUME_GAP) {\n    return MAX_STEP;\n  }',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'the accumulator is emptied at each step instead of keeping the remainder',
    file: 'src/core/table.ts',
    find: '      elapsed -= step.duration;',
    replace: '      elapsed = 0;',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'a timed transition fires on the first frame rather than on its constant',
    file: 'src/core/table.ts',
    find: '    while (step !== null && elapsed >= step.duration) {',
    replace: '    while (step !== null && elapsed > 0) {',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'the remainder is carried onto a screen that waits for the player',
    file: 'src/core/table.ts',
    find: '    if (step === null) {\n      elapsed = 0;\n    }',
    replace: '',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'the reveal is paced by the deal interval instead of the reveal pause',
    file: 'src/core/table.ts',
    find: '        return { duration: TIMINGS.revealPause, take: revealHoleCard };',
    replace: '        return { duration: TIMINGS.dealInterval, take: revealHoleCard };',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: "SPEC 5's deal interval drifts",
    file: 'src/core/table.ts',
    find: '  dealInterval: 0.22,',
    replace: '  dealInterval: 0.2,',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: "SPEC 5's dealer draw interval drifts",
    file: 'src/core/table.ts',
    find: '  dealerDrawInterval: 0.65,',
    replace: '  dealerDrawInterval: 0.6,',
    detectedBy: UNIT,
  },
  {
    // SPEC 5 lists no peek constant, so the peek borrows the hole card's own
    // flip. A number of its own is a number nothing in SPEC 5 can correct,
    // and it is the one place a peek could acquire a timing tell.
    item: 'C2',
    name: 'the peek is given a pause of its own instead of the hole card flip',
    file: 'src/core/table.ts',
    find: 'export const PEEK_PAUSE = TIMINGS.holeCardFlip;',
    replace: 'export const PEEK_PAUSE = 0.5;',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: "the Speed multiplier drifts off SPEC 5's 0.6",
    file: 'src/core/table.ts',
    find: 'export const FAST_SPEED_MULTIPLIER = 0.6;',
    replace: 'export const FAST_SPEED_MULTIPLIER = 0.5;',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: "the delta clamp drifts off QUALITY-BAR section 7's 0.25 s",
    file: 'src/core/table.ts',
    find: 'export const MAX_STEP = 0.25;',
    replace: 'export const MAX_STEP = 0.5;',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: "the resume threshold drifts off QUALITY-BAR section 7's 5 s",
    file: 'src/core/table.ts',
    find: 'export const RESUME_GAP = 5;',
    replace: 'export const RESUME_GAP = 30;',
    detectedBy: UNIT,
  },
  {
    // SPEC 4.9 warns about exactly this: by the time the hole card is
    // revealed no hand is live any more, so a live-hand contention test
    // means the dealer never draws at all.
    item: 'C2',
    name: 'the contention test goes back to asking whether a hand is live',
    file: 'src/core/table.ts',
    find: "    return hands.some((hand) => hand.state !== 'bust' && hand.state !== 'surrendered');",
    replace: "    return hands.some((hand) => hand.state === 'live');",
    detectedBy: UNIT,
  },
  {
    // The discipline `wallet.ts` handed to this part: it throws on a round
    // closed with a hand still committed and on a second initial commit, so
    // a boundary that never fires turns the next Deal into a wallet throw
    // reached by a player action.
    item: 'C2',
    name: 'the round boundary never closes, so the next deal reaches a wallet throw',
    file: 'src/core/table.ts',
    find: '    wallet.endRound();\n    shoe.endRound();',
    replace: '    shoe.endRound();',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: "the insurance offer stakes the whole wager rather than SPEC 4.7's half",
    file: 'src/core/table.ts',
    find: '      stake: hand.wager / INSURANCE_STAKE_DIVISOR,',
    replace: '      stake: hand.wager,',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'Next Hand always returns to betting and never offers the bust-out',
    file: 'src/core/table.ts',
    find:
      '        phase = bustOut(selected, state.bestBalance, state.chips).out ? BUST_OUT : BETTING;',
    replace: '        phase = BETTING;',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'the bust-out drops to a table SPEC 4.12 did not offer',
    file: 'src/core/table.ts',
    find:
      '        if (!lower.includes(intent.table)) {\n' +
      "          return refused('dropTable', 'wallet', 'table-locked');\n" +
      '        }',
    replace: '        void lower;',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'the free reset leaves the player at the table SPEC 4.12 takes them off',
    file: 'src/core/table.ts',
    find: '        selected = LOWEST_TABLE.id;',
    replace: '',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: "choosing a table stops checking SPEC 6's entry rule",
    file: 'src/core/table.ts',
    find:
      '        if (!canEnter(intent.table, state.bestBalance, state.chips)) {\n' +
      "          return refused('chooseTable', 'wallet', 'table-locked');\n" +
      '        }',
    replace: '        void state;',
    detectedBy: UNIT,
  },
  {
    // `TableOptions.table` seats without validating, so this guard is the only
    // thing between a locked table and play. Its sibling above answers a
    // different question, which is why one entry could not stand for both.
    item: 'C2',
    name: "Start stops checking SPEC 6's entry rule for the table it is seated at",
    file: 'src/core/table.ts',
    find:
      '        if (!canEnter(selected, state.bestBalance, state.chips)) {\n' +
      "          return refused('start', 'wallet', 'table-locked');\n" +
      '        }',
    replace: '        void state;',
    detectedBy: UNIT,
  },
  {
    // QUALITY-BAR section 7 drops the accumulator on a resume, not merely the
    // delta. The two agree at an empty accumulator, so this survives every
    // assertion taken at one.
    item: 'C2',
    name: 'a resume keeps the accumulator instead of emptying it',
    file: 'src/core/table.ts',
    find: '      elapsed = 0;\n      return;',
    replace: '      return;',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'an accepted action always reports the same phase behind it',
    file: 'src/core/table.ts',
    find: '    return Object.freeze({ ok: true, kind, phase: phase.kind });',
    replace: "    return Object.freeze({ ok: true, kind, phase: 'start' });",
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'the bust-out refusal blames the phase for what the wallet decided',
    file: 'src/core/table.ts',
    find: "          return refused('dropTable', 'wallet', 'table-locked');",
    replace: "          return refused('dropTable', 'phase', 'table-locked');",
    detectedBy: UNIT,
  },
  {
    // Without this the sweep's 170 "changed nothing" comparisons are idle:
    // a readout sharing the machine's arrays equals itself after any
    // mutation whatsoever.
    item: 'C2',
    name: 'the readout hands back the live hands instead of a snapshot',
    file: 'src/core/table.ts',
    find: '      hands: Object.freeze(hands.map(copyHand)),',
    replace: '      hands,',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'the readout hands back the live intent queue instead of a snapshot',
    file: 'src/core/table.ts',
    find: '      queued: Object.freeze([...queued]),',
    replace: '      queued,',
    detectedBy: UNIT,
  },
  {
    // The B1, B3, B13, J1 and B15 precedent: break the test's own reading of
    // the rule rather than the game's code. The sweep has to notice that its
    // transcription of SPEC 10 no longer matches the machine, which it can
    // only do by actually driving the machine.
    item: 'C2',
    name: "the sweep's own transcription of SPEC 10 opens a control on the wrong screen",
    file: 'tests/unit/phase-legality.test.ts',
    find: "  betting: ['tapChip', 'clear', 'repeat', 'max', 'changeTable', 'deal'],",
    replace: "  betting: ['tapChip', 'clear', 'repeat', 'max', 'changeTable', 'deal', 'hit'],",
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'the sweep quietly stops covering the bust-out phase',
    file: 'tests/unit/phase-legality.test.ts',
    find: "  'settling',\n  'roundResult',\n  'bustOut',\n];",
    replace: "  'settling',\n  'roundResult',\n];",
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // B6. The opening deal of SPEC 4.3: four cards, who got each one, which
  // of the dealer's two is face down, and that the cards are the shoe's.
  // The order and the concealment fail differently, so each gets entries
  // of its own, and the face-down clause gets three because "reports one
  // card down", "does not publish it" and "turns it over eventually" are
  // three separate things a machine can get wrong one at a time.
  // ------------------------------------------------------------------
  {
    item: 'B6',
    name: 'the deal gives the dealer cards to the player',
    file: 'src/core/table.ts',
    find:
      "    if (step === 'playerCard') {\n" +
      '      dealTo(FIRST_HAND);\n' +
      '      return;\n' +
      '    }\n' +
      '    dealer.push(shoe.draw());',
    replace: '    void step;\n    dealTo(FIRST_HAND);',
    detectedBy: UNIT,
  },
  {
    item: 'B6',
    name: "SPEC 4.3's order gives the player both cards before the dealer",
    file: 'src/core/table.ts',
    find:
      'export const OPENING_DEAL: readonly DealStep[] = Object.freeze([\n' +
      "  'playerCard',\n  'dealerUp',\n  'playerCard',\n  'dealerHole',\n]);",
    replace:
      'export const OPENING_DEAL: readonly DealStep[] = Object.freeze([\n' +
      "  'playerCard',\n  'playerCard',\n  'dealerUp',\n  'dealerHole',\n]);",
    detectedBy: UNIT,
  },
  {
    // "Exactly" is the clause an order assertion cannot see: a fifth card
    // dealt after the four still reads player, dealer, player, dealer.
    item: 'B6',
    name: 'the deal runs to five cards instead of exactly four',
    file: 'src/core/table.ts',
    find: "  'playerCard',\n  'dealerUp',\n  'playerCard',\n  'dealerHole',\n]);",
    replace: "  'playerCard',\n  'dealerUp',\n  'playerCard',\n  'dealerHole',\n  'playerCard',\n]);",
    detectedBy: UNIT,
  },
  {
    item: 'B6',
    name: 'the hole card is dealt face up',
    file: 'src/core/table.ts',
    find: '    return CONCEALED_PHASES.includes(phase.kind) && dealer.length > HOLE_CARD ? 1 : 0;',
    replace: '    return 0;',
    detectedBy: UNIT,
  },
  {
    item: 'B6',
    name: 'the hole card turns face up while the player is still acting',
    file: 'src/core/table.ts',
    find:
      'const CONCEALED_PHASES: readonly PhaseKind[] = Object.freeze([\n' +
      "  'dealing',\n  'peek',\n  'insurance',\n  'playerTurn',\n]);",
    replace:
      'const CONCEALED_PHASES: readonly PhaseKind[] = Object.freeze([\n' +
      "  'dealing',\n  'peek',\n  'insurance',\n]);",
    detectedBy: UNIT,
  },
  {
    // The readout can report one card concealed and publish it anyway,
    // which no count of concealed cards can see.
    item: 'B6',
    name: 'the readout publishes the whole dealer hand, hole card and all',
    file: 'src/core/table.ts',
    find: '      dealerVisible: Object.freeze(dealer.slice(0, dealer.length - concealed)),',
    replace: '      dealerVisible: Object.freeze([...dealer]),',
    detectedBy: UNIT,
  },
  {
    // SPEC 4.1's boundary, which the shoe cannot see for itself: the round
    // module is the only thing that can tell it a round has ended.
    item: 'B6',
    name: 'the shoe is never told the round ended, so its cards stay in play',
    file: 'src/core/table.ts',
    find: '    wallet.endRound();\n    shoe.endRound();',
    replace: '    wallet.endRound();',
    detectedBy: UNIT,
  },
  {
    item: 'B6',
    name: 'the seed is ignored, so every session deals the same shoe',
    file: 'src/core/table.ts',
    find: 'createShoe(rules.decks, createRng(options.seed ?? DEFAULT_SEED))',
    replace: 'createShoe(rules.decks, createRng(DEFAULT_SEED))',
    detectedBy: UNIT,
  },
  {
    // SPEC 12 prints both hand values at the round result and SPEC 10 keeps
    // the play surface behind every screen, so sweeping the felt at the
    // settlement leaves the round result with nothing to show.
    item: 'B6',
    name: 'the table is swept at the settlement, so the round result is empty',
    file: 'src/core/table.ts',
    find: '    wallet.endRound();\n    shoe.endRound();\n    rounds += 1;',
    replace:
      '    wallet.endRound();\n    shoe.endRound();\n    rounds += 1;\n' +
      '    hands.length = 0;\n    dealer.length = 0;',
    detectedBy: UNIT,
  },
  {
    // SPEC 4.5 and 4.2: a hand that is already finished must not be offered
    // an action, which is how a player natural reaches the reveal and how
    // split Aces end the turn.
    item: 'B6',
    name: 'the turn is handed to a hand that has already finished',
    file: 'src/core/table.ts',
    find:
      '  function handOverToPlayer(): Phase {\n' +
      "    const next = hands.findIndex((hand) => hand.state === 'live');\n" +
      '    return next === NOT_FOUND ? REVEAL : playerTurnAt(next);\n' +
      '  }',
    replace: '  function handOverToPlayer(): Phase {\n    return playerTurnAt(FIRST_HAND);\n  }',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // B9. Double Down: the three clauses of SPEC 4.5's availability row, the
  // one card it deals, the wager it doubles and the hand it ends. The
  // bust entry is the one no payout can see, because SPEC 4.10 reads the
  // cards and would settle a busted hand correctly either way: what it
  // breaks is SPEC 4.9's contention gate.
  // ------------------------------------------------------------------
  {
    item: 'B9',
    name: 'Double stops requiring exactly two cards',
    file: 'src/core/table.ts',
    find:
      '  if (hand.cards.length !== INITIAL_CARDS) {\n' +
      "    return 'not-two-cards';\n" +
      '  }\n' +
      '  if (hand.fromSplit && !context.rules.doubleAfterSplit) {',
    replace: '  if (hand.fromSplit && !context.rules.doubleAfterSplit) {',
    detectedBy: UNIT,
  },
  {
    item: 'B9',
    name: 'Double stops refusing a split Ace hand',
    file: 'src/core/table.ts',
    find:
      'export function doubleRefusal(hand: HandInPlay, context: ActionContext): RejectionReason | null {\n' +
      '  if (hand.fromSplitAces) {\n' +
      "    return 'split-aces';\n" +
      '  }\n',
    replace:
      'export function doubleRefusal(hand: HandInPlay, context: ActionContext): RejectionReason | null {\n',
    detectedBy: UNIT,
  },
  {
    item: 'B9',
    name: 'Double after split stops reading its house-rule toggle',
    file: 'src/core/table.ts',
    find:
      '  if (hand.fromSplit && !context.rules.doubleAfterSplit) {\n' +
      "    return 'double-after-split-off';\n" +
      '  }\n',
    replace: '',
    detectedBy: UNIT,
  },
  {
    item: 'B9',
    name: 'Double deals no card at all',
    file: 'src/core/table.ts',
    find:
      '        const grown = dealTo(index);\n' +
      "        resolve(index, isBust(grown.cards) ? 'bust' : 'doubled');",
    replace: "        resolve(index, 'doubled');",
    detectedBy: UNIT,
  },
  {
    item: 'B9',
    name: 'Double leaves the hand live instead of ending it',
    file: 'src/core/table.ts',
    find:
      "        resolve(index, isBust(grown.cards) ? 'bust' : 'doubled');\n" +
      '        phase = handOverToPlayer();',
    replace: '        void grown;',
    detectedBy: UNIT,
  },
  {
    item: 'B9',
    name: 'the doubled wager is not the one the wallet committed',
    file: 'src/core/table.ts',
    find: '        hands[index] = Object.freeze({ ...hand, wager: commit.wager });',
    replace: '        void commit.wager;',
    detectedBy: UNIT,
  },
  {
    item: 'B9',
    name: 'a doubled hand that busts is recorded as doubled, so the dealer draws for it',
    file: 'src/core/table.ts',
    find: "        resolve(index, isBust(grown.cards) ? 'bust' : 'doubled');",
    replace: "        resolve(index, 'doubled');",
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // B10. Split. The insertion, the wallet index it makes necessary, the
  // cap, the pair test, the two flags and the split-Ace rule each fail
  // differently. The settlement entry is the one `BJ-7` wrote down as a
  // hazard and left to this part: it pays the doubled wager of one hand
  // onto the undoubled wager of another, and the round total is identical
  // either way, so only the per-hand credits can see it.
  // ------------------------------------------------------------------
  {
    item: 'B10',
    name: 'the split hand is appended instead of inserted beside its parent',
    file: 'src/core/table.ts',
    find: '    hands.splice(\n      index + 1,\n      0,',
    replace: '    hands.splice(\n      hands.length,\n      0,',
    detectedBy: UNIT,
  },
  {
    item: 'B10',
    name: "the settlement keys on the table's position instead of the wallet's hand",
    file: 'src/core/table.ts',
    find: '        credit: wallet.settleHand(hand.walletHand, decided.net),',
    replace: '        credit: wallet.settleHand(hands.indexOf(hand), decided.net),',
    detectedBy: UNIT,
  },
  {
    item: 'B10',
    name: 'the split cap lets a fourth split through',
    file: 'src/core/table.ts',
    find: '  if (context.splits >= MAX_SPLITS) {',
    replace: '  if (context.splits > MAX_SPLITS) {',
    detectedBy: UNIT,
  },
  {
    item: 'B10',
    name: 'the split cap is dropped entirely',
    file: 'src/core/table.ts',
    find: '  if (context.splits >= MAX_SPLITS) {\n    return \'split-limit\';\n  }\n',
    replace: '',
    detectedBy: UNIT,
  },
  {
    item: 'B10',
    name: "SPEC 4.6's three splits become four",
    file: 'src/core/table.ts',
    find: 'const MAX_SPLITS = 3;',
    replace: 'const MAX_SPLITS = 4;',
    detectedBy: UNIT,
  },
  {
    item: 'B10',
    name: 'a split Ace hand may be resplit',
    file: 'src/core/table.ts',
    find:
      'export function splitRefusal(hand: HandInPlay, context: ActionContext): RejectionReason | null {\n' +
      '  if (hand.fromSplitAces) {\n' +
      "    return 'split-aces';\n" +
      '  }\n',
    replace:
      'export function splitRefusal(hand: HandInPlay, context: ActionContext): RejectionReason | null {\n',
    detectedBy: UNIT,
  },
  {
    item: 'B10',
    name: 'the pair test reads a fixed comparison instead of the house rule',
    file: 'src/core/table.ts',
    find: '  if (!canSplit(hand.cards, context.rules.splitRule)) {',
    replace: "  if (!canSplit(hand.cards, 'equalRank')) {",
    detectedBy: UNIT,
  },
  {
    // The parent as well as the child. SPEC 4.6's "a two-card 21 on a split
    // hand is 21, not a natural" is about both halves, so a parent that
    // kept its unsplit origin pays 3:2 on an Ace beside a ten.
    item: 'B10',
    name: 'the parent of a split keeps its unsplit origin',
    file: 'src/core/table.ts',
    find:
      '    hands[index] = Object.freeze({\n' +
      '      ...hand,\n' +
      '      cards: Object.freeze([first]),\n' +
      '      fromSplit: true,\n' +
      '      fromSplitAces: aces,\n' +
      '    });',
    replace:
      '    hands[index] = Object.freeze({\n' +
      '      ...hand,\n' +
      '      cards: Object.freeze([first]),\n' +
      '      fromSplitAces: aces,\n' +
      '    });',
    detectedBy: UNIT,
  },
  {
    item: 'B10',
    name: 'a split of Aces is not recorded as one',
    file: 'src/core/table.ts',
    find: '    const aces = isAce(first.rank);',
    replace: '    const aces = false;',
    detectedBy: UNIT,
  },
  {
    item: 'B10',
    name: 'only one of the two hands a split produced receives a card',
    file: 'src/core/table.ts',
    find: '    dealOntoSplitHand(index);\n    dealOntoSplitHand(index + 1);',
    replace: '    dealOntoSplitHand(index);',
    detectedBy: UNIT,
  },
  {
    item: 'B10',
    name: 'split Aces are left live instead of standing automatically',
    file: 'src/core/table.ts',
    find: "    resolve(index, grown.fromSplitAces ? 'stood' : stateAfterCard(grown));",
    replace: '    resolve(index, stateAfterCard(grown));',
    detectedBy: UNIT,
  },
  {
    item: 'B10',
    name: 'the split counter never moves, so the cap can never be reached',
    file: 'src/core/table.ts',
    find: '    const aces = isAce(first.rank);\n    splits += 1;',
    replace: '    const aces = isAce(first.rank);',
    detectedBy: UNIT,
  },
  {
    item: 'B10',
    name: 'a hand reaching exactly 21 is left live instead of standing',
    file: 'src/core/table.ts',
    find: '    if (handValue(hand.cards).total === TARGET) {\n      return \'stood\';\n    }\n',
    replace: '',
    detectedBy: UNIT,
  },
  {
    item: 'B10',
    name: 'a natural is recorded as an ordinary 21',
    file: 'src/core/table.ts',
    find:
      "    if (isNatural(hand.cards, { fromSplit: hand.fromSplit })) {\n      return 'blackjack';\n    }\n",
    replace: '',
    detectedBy: UNIT,
  },
  {
    // The mistake `SplitOrigin` exists to make hard, one level up from the
    // one `settlement.ts` already carries an entry for: the hand's state
    // would call a split 21 a blackjack and the payout would follow.
    item: 'B10',
    name: 'the hand state ignores the split origin when testing for a natural',
    file: 'src/core/table.ts',
    find: '    if (isNatural(hand.cards, { fromSplit: hand.fromSplit })) {',
    replace: '    if (isNatural(hand.cards, { fromSplit: false })) {',
    detectedBy: UNIT,
  },
  {
    item: 'B10',
    name: 'Hit stops refusing a split Ace hand',
    file: 'src/core/table.ts',
    find:
      'export function hitRefusal(hand: HandInPlay): RejectionReason | null {\n' +
      '  if (hand.fromSplitAces) {\n' +
      "    return 'split-aces';\n" +
      '  }\n',
    replace: 'export function hitRefusal(hand: HandInPlay): RejectionReason | null {\n',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // B11. SPEC 4.7's side wager. The funding arithmetic is the part that
  // fails silently: an uncaptured `min(chips, stake)` reads a balance that
  // has already paid, and the shortfall released a step early takes the
  // balance negative on exactly the branch where the stake is lost. Both
  // are written out here rather than argued about in a comment.
  // ------------------------------------------------------------------
  {
    item: 'B11',
    name: 'the funded part is read after the balance has already paid',
    file: 'src/core/wallet.ts',
    find:
      '    const funded = Math.min(chips, stake);\n' +
      '    chips -= funded;\n' +
      '    insuranceStake += stake;\n' +
      '    deferredStake += stake - funded;',
    replace:
      '    chips -= Math.min(chips, stake);\n' +
      '    insuranceStake += stake;\n' +
      '    deferredStake += stake - Math.min(chips, stake);',
    detectedBy: UNIT,
  },
  {
    item: 'B11',
    name: 'the whole stake leaves the balance even when it is not there',
    file: 'src/core/wallet.ts',
    find: '    const funded = Math.min(chips, stake);',
    replace: '    const funded = stake;',
    detectedBy: UNIT,
  },
  {
    item: 'B11',
    name: 'settling the side wager credits the net alone and swallows the stake',
    file: 'src/core/wallet.ts',
    find: '    const credit = insuranceStake + net;',
    replace: '    const credit = net;',
    detectedBy: UNIT,
  },
  {
    item: 'B11',
    name: 'the round boundary stops releasing the deferred stake, waiving it',
    file: 'src/core/wallet.ts',
    find: '    chips -= deferredStake;\n    deferredStake = 0;',
    replace: '    deferredStake = 0;',
    detectedBy: UNIT,
  },
  {
    // The design `B11` rejected, and the reason it rejected it.
    item: 'B11',
    name: 'the shortfall is released with the side wager, taking the balance negative',
    file: 'src/core/wallet.ts',
    find: '    const credit = insuranceStake + net;\n    chips += credit;\n    insuranceStake = 0;',
    replace:
      '    const credit = insuranceStake + net;\n' +
      '    chips += credit - deferredStake;\n' +
      '    deferredStake = 0;\n' +
      '    insuranceStake = 0;',
    detectedBy: UNIT,
  },
  {
    item: 'B11',
    name: 'the peek stops settling the side wager it was taken against',
    file: 'src/core/table.ts',
    find: '    settleOpenStake(dealerNatural);\n',
    replace: '',
    detectedBy: UNIT,
  },
  {
    item: 'B11',
    name: 'the ordinary offer stops checking that the balance covers the stake',
    file: 'src/core/table.ts',
    find: '        if (!offer.evenMoney && wallet.readout().chips < offer.stake) {',
    replace: '        if (offer.stake < 0) {',
    detectedBy: UNIT,
  },
  {
    item: 'B11',
    name: 'even money is refused when the balance cannot cover it',
    file: 'src/core/table.ts',
    find: '        if (!offer.evenMoney && wallet.readout().chips < offer.stake) {',
    replace: '        if (wallet.readout().chips < offer.stake) {',
    detectedBy: UNIT,
  },
  {
    item: 'B11',
    name: 'even money stops reading its house-rule toggle',
    file: 'src/core/table.ts',
    find:
      '      evenMoney: rules.evenMoney && isNatural(hand.cards, { fromSplit: hand.fromSplit }),',
    replace: '      evenMoney: isNatural(hand.cards, { fromSplit: hand.fromSplit }),',
    detectedBy: UNIT,
  },
  {
    item: 'B11',
    name: 'even money is offered on any hand rather than on a natural',
    file: 'src/core/table.ts',
    find:
      '      evenMoney: rules.evenMoney && isNatural(hand.cards, { fromSplit: hand.fromSplit }),',
    replace: '      evenMoney: rules.evenMoney,',
    detectedBy: UNIT,
  },
  {
    item: 'B11',
    name: "the deferred remainder is not recorded on SPEC 12's round result",
    file: 'src/core/table.ts',
    find: '      deferred: openStake.deferred,',
    replace: '      deferred: 0,',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // B12. Late surrender: the three clauses of SPEC 4.8 and its toggle.
  // The split clause is the one every other clause hides, because a hand
  // fresh from a split holds exactly two cards and has taken no action.
  // ------------------------------------------------------------------
  {
    item: 'B12',
    name: 'Surrender stops refusing a hand created by a split',
    file: 'src/core/table.ts',
    find: "  if (hand.fromSplit) {\n    return 'from-split';\n  }\n",
    replace: '',
    detectedBy: UNIT,
  },
  {
    item: 'B12',
    name: 'Surrender stops reading its house-rule toggle',
    file: 'src/core/table.ts',
    find: "  if (!context.rules.surrender) {\n    return 'surrender-off';\n  }\n",
    replace: '',
    detectedBy: UNIT,
  },
  {
    item: 'B12',
    name: "Surrender stops requiring a hand's initial two cards",
    file: 'src/core/table.ts',
    find:
      '  if (hand.cards.length !== INITIAL_CARDS) {\n' +
      "    return 'not-two-cards';\n" +
      '  }\n' +
      '  return null;\n' +
      '}',
    replace: '  return null;\n}',
    detectedBy: UNIT,
  },
  {
    item: 'B12',
    name: 'the surrendered hand is left live instead of ending immediately',
    file: 'src/core/table.ts',
    find: "        resolveActiveHand('surrendered');\n        return accepted('surrender');",
    replace: "        return accepted('surrender');",
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // C2 again. SPEC 10's eighteenth intent, and the drain comparison `BJ-7`
  // deferred to this part because only a split can produce two phases with
  // the same tag and a different payload.
  // ------------------------------------------------------------------
  {
    // DESIGN section 3's trap, in the one form `BJ-7` could not drive: a
    // double press on Stand across a split stands the hand the player has
    // not looked at yet.
    item: 'C2',
    name: 'the drain compares the phase tag instead of the phase itself',
    file: 'src/core/table.ts',
    find: '      if (phase !== before) {',
    replace: '      if (phase.kind !== before.kind) {',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'Change Table stops checking for a pending wager',
    file: 'src/core/table.ts',
    find:
      '        if (wallet.readout().wager !== NO_WAGER) {\n' +
      "          return refused('changeTable', 'availability', 'pending-wager');\n" +
      '        }\n',
    replace: '',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'Change Table clears the pending wager instead of refusing',
    file: 'src/core/table.ts',
    find: "          return refused('changeTable', 'availability', 'pending-wager');",
    replace: '          wallet.clear();',
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'Change Table returns to the betting screen instead of the start screen',
    file: 'src/core/table.ts',
    find: "        phase = START;\n        return accepted('changeTable');",
    replace: "        phase = BETTING;\n        return accepted('changeTable');",
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: 'Change Table is left live on a screen SPEC 10 does not offer it on',
    file: 'src/core/table.ts',
    find: '  dealing: Object.freeze<IntentKind[]>([]),',
    replace: "  dealing: Object.freeze<IntentKind[]>(['changeTable']),",
    detectedBy: UNIT,
  },
  {
    item: 'C2',
    name: "the sweep's own transcription drops the eighteenth intent",
    file: 'tests/unit/phase-legality.test.ts',
    find: "  'changeTable',\n  'deal',\n  'takeInsurance',",
    replace: "  'deal',\n  'takeInsurance',",
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // The house-rule record of SPEC 14. No item claims the file, so each
  // default is labelled with the item whose criterion names the toggle:
  // `B9` and `B10` on Double after split, `B10` on the split comparison,
  // `B11` on even money and `B12` on surrender.
  // ------------------------------------------------------------------
  {
    item: 'B10',
    name: "SPEC 4.6's Double after split default is switched off",
    file: 'src/core/rules.ts',
    find: '  doubleAfterSplit: true,',
    replace: '  doubleAfterSplit: false,',
    detectedBy: UNIT,
  },
  {
    item: 'B12',
    name: "SPEC 4.8's surrender default is switched off",
    file: 'src/core/rules.ts',
    find: '  surrender: true,\n  evenMoney: true,',
    replace: '  surrender: false,\n  evenMoney: true,',
    detectedBy: UNIT,
  },
  {
    item: 'B11',
    name: "SPEC 4.7's even money default is switched off",
    file: 'src/core/rules.ts',
    find: '  surrender: true,\n  evenMoney: true,',
    replace: '  surrender: true,\n  evenMoney: false,',
    detectedBy: UNIT,
  },
  {
    item: 'B10',
    name: "SPEC 4.6's split comparison defaults to equal rank",
    file: 'src/core/rules.ts',
    find: "  splitRule: 'equalValue',",
    replace: "  splitRule: 'equalRank',",
    detectedBy: UNIT,
  },
  {
    item: 'B10',
    name: 'the house-rule record ignores what a caller asked for',
    file: 'src/core/rules.ts',
    find: '  return Object.freeze({ ...DEFAULT_RULES, ...overrides });',
    replace: '  return Object.freeze({ ...DEFAULT_RULES });',
    detectedBy: UNIT,
  },
  // ------------------------------------------------------------------
  // J3. The strategy coach at BJ-9. Three failure modes, and they fail
  // differently:
  //
  //   1. A cell is simply wrong. Caught by the 3,040 cell sweep against
  //      the committed reference charts.
  //   2. A house rule is resolved wrongly, or stops being resolved at
  //      all. Caught by the same sweep on the combinations that rule
  //      moves, and by the two exact-set controls.
  //   3. The walk, the legality it borrows from `table.ts` and
  //      `wallet.ts`, the modes and the counters. Caught by the unit
  //      tests around each.
  //
  // The last six break the test's own reading rather than the game's
  // code, which is the B1, B3 and J1 precedent: a sweep that had stopped
  // covering a cell, a combination or a wrong-cell set would pass a
  // generator that was wrong in exactly that place.
  // ------------------------------------------------------------------
  {
    item: 'J3',
    name: 'the hard 16 surrender clause drops the Ace column',
    file: 'src/core/strategy.ts',
    find: "    if (rules.surrender && against(up, ['9', '10', 'A'])) {",
    replace: "    if (rules.surrender && against(up, ['9', '10'])) {",
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'a hard 15 surrenders against an Ace, which is the hit-soft-17 cell',
    file: 'src/core/strategy.ts',
    find: "    if (rules.surrender && up === '10') {",
    replace: "    if (rules.surrender && (up === '10' || up === 'A')) {",
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'a hard 11 doubles into an Ace, which is the hit-soft-17 cell',
    file: 'src/core/strategy.ts',
    find: "    return up === 'A' ? HIT : DOUBLE_OR_HIT;",
    replace: '    return DOUBLE_OR_HIT;',
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'a soft 18 doubles against a 2 instead of standing',
    file: 'src/core/strategy.ts',
    find: "    if (against(up, ['3', '4', '5', '6'])) {\n      return DOUBLE_OR_STAND;",
    replace: "    if (against(up, ['2', '3', '4', '5', '6'])) {\n      return DOUBLE_OR_STAND;",
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'a soft 18 hits against an 8 instead of standing',
    file: 'src/core/strategy.ts',
    find: "    if (against(up, ['9', '10', 'A'])) {\n      return HIT;\n    }",
    replace: "    if (against(up, ['8', '9', '10', 'A'])) {\n      return HIT;\n    }",
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'a hard 12 stands against a 3',
    file: 'src/core/strategy.ts',
    find: "    return against(up, ['4', '5', '6']) ? STAND : HIT;",
    replace: "    return against(up, ['3', '4', '5', '6']) ? STAND : HIT;",
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'a hard 9 doubles against a 2',
    file: 'src/core/strategy.ts',
    find:
      '  if (total === 9) {\n' +
      "    return against(up, ['3', '4', '5', '6']) ? DOUBLE_OR_HIT : HIT;\n" +
      '  }',
    replace:
      '  if (total === 9) {\n' +
      "    return against(up, ['2', '3', '4', '5', '6']) ? DOUBLE_OR_HIT : HIT;\n" +
      '  }',
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'the 2,2 and 3,3 row stops reading Double after split',
    file: 'src/core/strategy.ts',
    find:
      "    case '2':\n" +
      "    case '3':\n" +
      '      return rules.doubleAfterSplit\n' +
      "        ? against(up, ['2', '3', '4', '5', '6', '7'])\n" +
      "        : against(up, ['4', '5', '6', '7']);",
    replace:
      "    case '2':\n" +
      "    case '3':\n" +
      "      return against(up, ['2', '3', '4', '5', '6', '7']);",
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'the 4,4 row stops reading Double after split',
    file: 'src/core/strategy.ts',
    find: "      return rules.doubleAfterSplit && against(up, ['5', '6']);",
    replace: "      return against(up, ['5', '6']);",
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'the 6,6 row stops reading Double after split',
    file: 'src/core/strategy.ts',
    find:
      '      return rules.doubleAfterSplit\n' +
      '        ? against(up, DEALER_STIFF)\n' +
      "        : against(up, ['3', '4', '5', '6']);",
    replace: '      return against(up, DEALER_STIFF);',
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'a pair of 9s is split against a 7',
    file: 'src/core/strategy.ts',
    find: "      return against(up, ['2', '3', '4', '5', '6', '8', '9']);",
    replace: "      return against(up, ['2', '3', '4', '5', '6', '7', '8', '9']);",
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'a ten-value pair is split, which no reading of SPEC 4.6 does',
    file: 'src/core/strategy.ts',
    find:
      "    case '10':\n" +
      "      // Never, under either reading of SPEC 4.6's pair test. This is the cell\n" +
      '      // SPEC 7 names as the reason the equal-value and equal-rank toggle\n' +
      '      // changes no recommendation: a 20 is not a hand to take apart.\n' +
      '      return false;',
    replace: "    case '10':\n      return true;",
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'a pair cell loses the fall-through the walk needs',
    file: 'src/core/strategy.ts',
    find: '  return Object.freeze([SPLIT, ...tail]);',
    replace: '  void tail;\n  return Object.freeze([SPLIT]);',
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'the walk returns the first preference rather than the first legal one',
    file: 'src/core/strategy.ts',
    find: '    if (legal(action, table, situation)) {',
    replace: '    if (cell.preference.length > 0) {',
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'the coach stops asking whether the balance funds the increment',
    file: 'src/core/strategy.ts',
    find: '  return canFund(situation.hand.wager, situation.chips);',
    replace: '  void situation;\n  return true;',
    detectedBy: UNIT,
  },
  {
    // The off-by-one the whole-clause mutation above cannot reach. SPEC 4.5 and
    // 4.6 both say "chips available **>=** the hand's wager", so a balance of
    // exactly the wager funds the double. BJ-15 collapsed the coach's reading
    // and the wallet's into `canFund`, so the strict comparison now sits in
    // `wallet.ts`; breaking it there breaks the coach and the two commits at
    // once, which is what one reading means. The boundary is driven at the wager
    // and at one chip under it rather than at a comfortable balance.
    item: 'J3',
    name: 'the funding comparison goes strict, refusing a balance of exactly the wager',
    file: 'src/core/wallet.ts',
    find: '  return wager <= chips;',
    replace: '  return wager < chips;',
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'Double availability is re-derived instead of asked of table.ts',
    file: 'src/core/strategy.ts',
    find: '      return doubleRefusal(hand, context) === null && fundsAnEqualWager(situation);',
    replace:
      "      return hand.cards.length === 2 && hand.state === 'live' && fundsAnEqualWager(situation);",
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'the live-hand guard is dropped, so a bust hand reaches the lookup',
    file: 'src/core/strategy.ts',
    find:
      "  if (situation.hand.state !== 'live') {\n" +
      '    return null;\n' +
      '  }\n' +
      '  const cell = table.cellFor(situation.hand.cards, situation.up);',
    replace: '  const cell = table.cellFor(situation.hand.cards, situation.up);',
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'the chart stops folding the face cards onto the 10 column',
    file: 'src/core/strategy.ts',
    find: "  if (rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') {",
    replace: "  if (rank === '10') {",
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'the hard surface stops covering 2,2',
    file: 'src/core/strategy.ts',
    find: 'export const LOWEST_HARD_TOTAL = 4;',
    replace: 'export const LOWEST_HARD_TOTAL = 5;',
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'the soft surface stops covering A,A',
    file: 'src/core/strategy.ts',
    find: 'export const LOWEST_SOFT_TOTAL = 12;',
    replace: 'export const LOWEST_SOFT_TOTAL = 13;',
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'the soft surface is generated from the hard rules',
    file: 'src/core/strategy.ts',
    find:
      '  const softSurface = buildSurface(SOFT_TOTALS, (total, up) => softPreference(total, up));',
    replace:
      '  const softSurface = buildSurface(SOFT_TOTALS, (total, up) => hardPreference(total, up, rules));',
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'the coach counts a decision while SPEC 7 has it switched off',
    file: 'src/core/strategy.ts',
    find:
      "  if (mode === 'off') {\n" +
      '    return Object.freeze({ record, verdict: null });\n' +
      '  }\n' +
      '  const verdict = compare(table, situation, played);',
    replace: '  void mode;\n  const verdict = compare(table, situation, played);',
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'the accuracy percentage reads zero before the first decision',
    file: 'src/core/strategy.ts',
    find: '  if (counters.decisions === 0) {\n    return null;\n  }',
    replace: '  if (counters.decisions === 0) {\n    return 0;\n  }',
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'a new session clears the lifetime counters too',
    file: 'src/core/strategy.ts',
    find: '  return Object.freeze({ session: NO_COUNTERS, lifetime: record.lifetime });',
    replace: '  return Object.freeze({ session: NO_COUNTERS, lifetime: NO_COUNTERS });',
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'the coach reads the first hand rather than the active one',
    file: 'src/core/strategy.ts',
    find: '  const hand = readout.hands[phase.activeHand];',
    replace: '  const hand = readout.hands[0];',
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'an insurance intent is counted as a basic strategy decision',
    file: 'src/core/strategy.ts',
    find: "    case 'surrender':\n      return 'surrender';\n    default:\n      return null;",
    replace:
      "    case 'surrender':\n" +
      "      return 'surrender';\n" +
      "    case 'takeInsurance':\n" +
      "      return 'stand';\n" +
      '    default:\n' +
      '      return null;',
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'hint mode answers in review mode as well',
    file: 'src/core/strategy.ts',
    find: "  return mode === 'hint' ? recommend(table, situation) : null;",
    replace: "  return mode === 'off' ? null : recommend(table, situation);",
    detectedBy: UNIT,
  },
  {
    // The B1, B3 and J1 precedent: break the test's own reading rather than
    // the game's code. A reference chart that no longer says what published
    // basic strategy says would agree with a generator wrong in that same
    // cell, which is the whole failure the chart exists to stop.
    item: 'J3',
    name: 'the reference chart drops surrender from hard 16 against an Ace',
    file: 'tests/unit/reference/basic-strategy-charts.ts',
    find: "  16: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'Rh', 'Rh', 'Rh'],",
    replace: "  16: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'Rh', 'Rh', 'H'],",
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'the reference chart doubles a soft 18 against a 2',
    file: 'tests/unit/reference/basic-strategy-charts.ts',
    find: "  18: ['S', 'Ds', 'Ds', 'Ds', 'Ds', 'S', 'S', 'H', 'H', 'H'],",
    replace: "  18: ['Ds', 'Ds', 'Ds', 'Ds', 'Ds', 'S', 'S', 'H', 'H', 'H'],",
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'the sweep quietly stops covering one of the 8 rule combinations',
    file: 'tests/unit/reference/basic-strategy-charts.ts',
    find: '  { decks: 8, doubleAfterSplit: false, surrender: false },\n];',
    replace: '];',
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'the sweep own count of the hard rows drifts off the surface',
    file: 'tests/unit/strategy-coach.test.ts',
    find: 'const HARD_ROW_COUNT = 18;',
    replace: 'const HARD_ROW_COUNT = 17;',
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'the DAS control expected cell set loses 6,6 against a 2',
    file: 'tests/unit/strategy-coach.test.ts',
    find: "  'pair 4 vs 6',\n  'pair 6 vs 2',\n];",
    replace: "  'pair 4 vs 6',\n];",
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'the surrender control expected cell set loses 8,8 against an Ace',
    file: 'tests/unit/strategy-coach.test.ts',
    find: "  'pair 8 vs 10',\n  'pair 8 vs A',\n];",
    replace: "  'pair 8 vs 10',\n];",
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'the reference chart starts importing from the code it checks',
    file: 'tests/unit/reference/basic-strategy-charts.ts',
    find: '/** One cell as a published chart abbreviates it. */',
    replace:
      "import { TARGET } from '../../../src/core/hand';\n\n" +
      '/** One cell as a published chart abbreviates it. */\n' +
      'export const LIMIT = TARGET;\n',
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'a preference list is handed out unfrozen',
    file: 'src/core/strategy.ts',
    find: "const DOUBLE_OR_HIT: PreferenceList = Object.freeze(['double', 'hit']);",
    replace: "const DOUBLE_OR_HIT: PreferenceList = ['double', 'hit'];",
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'the machine starts importing the coach, so an action could route through it',
    file: 'src/core/table.ts',
    find: 'export function hitRefusal(hand: HandInPlay): RejectionReason | null {',
    replace:
      "import { strategyTable } from './strategy'; void strategyTable; " +
      'export function hitRefusal(hand: HandInPlay): RejectionReason | null {',
    detectedBy: UNIT,
  },
  {
    item: 'J3',
    name: 'one of the three coach modes drops off the published list',
    file: 'src/core/strategy.ts',
    find: "export const COACH_MODES: readonly CoachMode[] = Object.freeze(['off', 'hint', 'review']);",
    replace: "export const COACH_MODES: readonly CoachMode[] = Object.freeze(['off', 'hint']);",
    detectedBy: UNIT,
  },

  // -------------------------------------------------------------------------
  // BJ-10: SPEC 8's hand history (`J5`) and SPEC 9's eleven milestones (`J6`)
  // -------------------------------------------------------------------------
  //
  // The `J5` block covers `history.ts` and the per-round action journal `BJ-10`
  // added to `table.ts` to fill SPEC 8's "every action taken". No acceptance
  // item is claimed for the journal; it is labelled `J5` because that is the
  // item whose field list it exists to complete.

  {
    item: 'J5',
    name: 'the ring stops evicting, because SPEC 8 fifty becomes fifty-one',
    file: 'src/core/history.ts',
    find: 'export const HISTORY_LIMIT = 50;',
    replace: 'export const HISTORY_LIMIT = 51;',
    detectedBy: UNIT,
  },
  {
    item: 'J5',
    name: 'the ring keeps the oldest rounds instead of the newest',
    file: 'src/core/history.ts',
    find: 'return Object.freeze([entry, ...history].slice(0, HISTORY_LIMIT));',
    replace: 'return Object.freeze([...history, entry].slice(0, HISTORY_LIMIT));',
    detectedBy: UNIT,
  },
  {
    item: 'J5',
    name: 'a stored hand value drifts off the cards it was computed from',
    file: 'src/core/history.ts',
    find: 'value: handValue(inPlay.cards).total,',
    replace: 'value: 0,',
    detectedBy: UNIT,
  },
  {
    item: 'J5',
    name: 'the dealer value stops being computed from the dealer hand',
    file: 'src/core/history.ts',
    find: 'dealerValue: handValue(readout.dealerVisible).total,',
    replace: 'dealerValue: 0,',
    detectedBy: UNIT,
  },
  {
    item: 'J5',
    name: 'the round chip delta quietly drops SPEC 4.7 side wager',
    file: 'src/core/history.ts',
    find: '(insurance === null ? 0 : insurance.net),',
    replace: '(insurance === null ? 0 : 0),',
    detectedBy: UNIT,
  },
  {
    item: 'J5',
    name: 'a hand chip delta becomes the credit rather than SPEC 4.10 net',
    file: 'src/core/history.ts',
    find: 'delta: hand.credit - hand.wager,',
    replace: 'delta: hand.credit,',
    detectedBy: UNIT,
  },
  {
    item: 'J5',
    name: 'the entry grows a field SPEC 8 does not name',
    file: 'src/core/history.ts',
    find: '    coach: coach === null ? null : Object.freeze([...coach]),',
    replace:
      '    coach: coach === null ? null : Object.freeze([...coach]),\n    table: readout.table,',
    detectedBy: UNIT,
  },
  {
    item: 'J5',
    name: 'the entry loses the action journal SPEC 8 names',
    file: 'src/core/history.ts',
    find: '    actions: phase.result.actions,\n',
    replace: '',
    detectedBy: UNIT,
  },
  {
    item: 'J5',
    name: 'a coach that was off records an empty list rather than nothing',
    file: 'src/core/history.ts',
    find: 'coach: coach === null ? null : Object.freeze([...coach]),',
    replace: 'coach: Object.freeze([...(coach ?? [])]),',
    detectedBy: UNIT,
  },
  {
    item: 'J5',
    name: 'the hole-card guard stops firing, so a one-card dealer hand records',
    file: 'src/core/history.ts',
    find: 'if (readout.dealerConcealed !== 0) {',
    replace: 'if (readout.dealerConcealed !== 0 && Boolean(0)) {',
    detectedBy: UNIT,
  },
  {
    item: 'J5',
    name: 'the round-result guard stops firing in the recorder',
    file: 'src/core/history.ts',
    find: "if (phase.kind !== 'roundResult') {",
    replace: "if (phase.kind !== 'roundResult' && Boolean(0)) {",
    detectedBy: UNIT,
  },
  {
    item: 'J5',
    name: 'the empty history is not empty, so a full data reset clears nothing',
    file: 'src/core/history.ts',
    find: 'export const NO_HISTORY: History = Object.freeze([]);',
    replace:
      'export const NO_HISTORY: History = Object.freeze([\n' +
      '  Object.freeze({\n' +
      '    hands: Object.freeze([]),\n' +
      '    dealer: Object.freeze([]),\n' +
      '    dealerValue: 0,\n' +
      '    actions: Object.freeze([]),\n' +
      '    wager: 0,\n' +
      '    delta: 0,\n' +
      '    coach: null,\n' +
      '  }),\n' +
      ']);',
    detectedBy: UNIT,
  },
  {
    // Caught by `tests/unit/hand-history.test.ts`, "records what was taken and
    // not what was attempted", and by nothing else. **`C2`'s legality sweep
    // does not bite on this**, which is worth writing down because it looks as
    // though it should: that sweep compares 180 rejections, but it compares
    // them through `TableReadout`, which never exposes the journal, and
    // `RoundResult.actions` is only copied out at `settleRound`. A refused
    // intent that had been journalled would leave every `C2` assertion equal
    // and show up only in a recorded history.
    item: 'J5',
    name: 'the journal records actions the machine refused as well as took',
    file: 'src/core/table.ts',
    find: 'if (result.ok && action !== null) {',
    replace: 'if (action !== null) {',
    detectedBy: UNIT,
  },
  {
    // Caught by the two rounds `hand-history.test.ts` drives for exactly this,
    // and by the set comparison against `PLAYER_ACTIONS` beside them. Before
    // `BJ-10`'s review no test recorded a doubled or a surrendered round, so
    // either action could be dropped from SPEC 4.5's list with the suite green
    // and SPEC 8's field quietly missing a move the player made.
    item: 'J5',
    name: 'SPEC 4.5 action list loses Double Down',
    file: 'src/core/table.ts',
    find: "  'double',\n  'split',\n  'surrender',\n]);",
    replace: "  'split',\n  'surrender',\n]);",
    detectedBy: UNIT,
  },
  {
    item: 'J5',
    name: 'SPEC 4.5 action list loses Surrender',
    file: 'src/core/table.ts',
    find: "  'split',\n  'surrender',\n]);",
    replace: "  'split',\n]);",
    detectedBy: UNIT,
  },
  {
    item: 'J5',
    name: 'the journal is not cleared with the felt, so it spans rounds',
    file: 'src/core/table.ts',
    find: '    journal.length = 0;\n',
    replace: '',
    detectedBy: UNIT,
  },
  {
    item: 'J5',
    name: 'the journal stops recording anything at all',
    file: 'src/core/table.ts',
    find: '      journal.push(action);\n',
    replace: '',
    detectedBy: UNIT,
  },
  {
    item: 'J5',
    name: 'SPEC 4.5 action list loses the two insurance decisions',
    file: 'src/core/table.ts',
    find:
      'export const PLAYER_ACTIONS: readonly PlayerAction[] = Object.freeze([\n' +
      "  'takeInsurance',\n  'declineInsurance',\n",
    replace: 'export const PLAYER_ACTIONS: readonly PlayerAction[] = Object.freeze([\n',
    detectedBy: UNIT,
  },
  {
    item: 'J5',
    name: 'every intent counts as a SPEC 4.5 action, including the deal',
    file: 'src/core/table.ts',
    find: '  const found = PLAYER_ACTIONS.find((action) => action === kind);\n  return found ?? null;',
    replace: '  return kind as PlayerAction;',
    detectedBy: UNIT,
  },
  {
    item: 'J5',
    name: 'the result keeps the live journal, which Next Hand then empties',
    file: 'src/core/table.ts',
    find: 'actions: Object.freeze([...journal]),',
    replace: 'actions: journal,',
    detectedBy: UNIT,
  },

  {
    item: 'J6',
    name: 'a milestone can be awarded a second time',
    file: 'src/core/statistics.ts',
    find: 'const awarded = MILESTONES.filter((id) => met[id] && !stats.milestones.includes(id));',
    replace: 'const awarded = MILESTONES.filter((id) => met[id]);',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'milestones stop being appended, so an award replaces the record',
    file: 'src/core/statistics.ts',
    find: ': Object.freeze([...stats.milestones, ...awarded]),',
    replace: ': Object.freeze([...awarded]),',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'awards stop coming out in SPEC 9 table order',
    file: 'src/core/statistics.ts',
    find: 'const awarded = MILESTONES.filter((id) => met[id] && !stats.milestones.includes(id));',
    replace:
      'const awarded = [...MILESTONES]\n' +
      '    .reverse()\n' +
      '    .filter((id) => met[id] && !stats.milestones.includes(id));',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'a push breaks a win streak instead of leaving it alone',
    file: 'src/core/statistics.ts',
    find: 'streak = net > 0 ? streak + 1 : net < 0 ? 0 : streak;',
    replace: 'streak = net > 0 ? streak + 1 : 0;',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'a loss no longer ends a win streak',
    file: 'src/core/statistics.ts',
    find: 'streak = net > 0 ? streak + 1 : net < 0 ? 0 : streak;',
    replace: 'streak = net > 0 ? streak + 1 : streak;',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'the streak rows read the run left standing rather than its peak',
    file: 'src/core/statistics.ts',
    find: 'peak = streak > peak ? streak : peak;',
    replace: 'peak = streak;',
    detectedBy: UNIT,
  },
  {
    // Both thresholds are broken here because both were driven symbolically
    // before `BJ-10`'s review: a test that runs `SHORT_WIN_STREAK - 1` hands
    // and then one more passes for any value the constant could hold. The
    // suite now asserts the literals SPEC 9 prints as well.
    item: 'J6',
    name: 'SPEC 9 row 3 five-hand streak becomes a four-hand streak',
    file: 'src/core/statistics.ts',
    find: 'export const SHORT_WIN_STREAK = 5;',
    replace: 'export const SHORT_WIN_STREAK = 4;',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'SPEC 9 row 4 ten-hand streak becomes a nine-hand streak',
    file: 'src/core/statistics.ts',
    find: 'export const LONG_WIN_STREAK = 10;',
    replace: 'export const LONG_WIN_STREAK = 9;',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'a natural that met the dealer own stops counting as a natural',
    file: 'src/core/statistics.ts',
    find: 'const NATURAL_RUNGS: readonly Rung[] = Object.freeze([2, 3]);',
    replace: 'const NATURAL_RUNGS: readonly Rung[] = Object.freeze([3]);',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'Bronze becomes a milestone, which SPEC 9 says it is not',
    file: 'src/core/statistics.ts',
    find: 'Object.freeze({\n  bronze: null,',
    replace: "Object.freeze({\n  bronze: 'reachedSilver',",
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'SPEC 9 eleven becomes ten',
    file: 'src/core/statistics.ts',
    find: "  'survivedAndRecovered',\n]);",
    replace: ']);',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'doubling the bankroll reads the balance rather than the high-water mark',
    file: 'src/core/statistics.ts',
    find: 'doubledBankroll: best >= DOUBLED_BANKROLL,',
    replace: 'doubledBankroll: chips >= DOUBLED_BANKROLL,',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'the doubled target drifts off SPEC 4.11 starting bankroll',
    file: 'src/core/statistics.ts',
    find: 'export const DOUBLED_BANKROLL = STARTING_CHIPS * 2;',
    replace: 'export const DOUBLED_BANKROLL = STARTING_CHIPS * 3;',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'SPEC 9 ten percent stops being a percentage',
    file: 'src/core/statistics.ts',
    find: 'export const LOW_WATER_CHIPS = (STARTING_CHIPS * LOW_WATER_PERCENT) / 100;',
    replace: 'export const LOW_WATER_CHIPS = STARTING_CHIPS * LOW_WATER_PERCENT;',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'the low-water latch fires at ten percent rather than below it',
    file: 'src/core/statistics.ts',
    find: 'const belowLowWater = stats.belowLowWater || chips < LOW_WATER_CHIPS;',
    replace: 'const belowLowWater = stats.belowLowWater || chips <= LOW_WATER_CHIPS;',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'recovery is awarded short of SPEC 9 starting amount',
    file: 'src/core/statistics.ts',
    find: 'survivedAndRecovered: belowLowWater && chips >= STARTING_CHIPS,',
    replace: 'survivedAndRecovered: belowLowWater && chips >= STARTING_CHIPS - 1,',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'SPEC 4.12 free reset stops clearing the low-water latch',
    file: 'src/core/statistics.ts',
    find: '    rounds: stats.rounds,\n    milestones: stats.milestones,\n    belowLowWater: false,',
    replace:
      '    rounds: stats.rounds,\n' +
      '    milestones: stats.milestones,\n' +
      '    belowLowWater: stats.belowLowWater,',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'a fresh launch stops clearing the low-water latch',
    file: 'src/core/statistics.ts',
    find: '    rounds: 0,\n    milestones: stats.milestones,\n    belowLowWater: false,',
    replace:
      '    rounds: 0,\n    milestones: stats.milestones,\n    belowLowWater: stats.belowLowWater,',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'a new session clears the lifetime counters as well as the session ones',
    file: 'src/core/statistics.ts',
    find: '    session: NO_COUNTERS,\n    lifetime: stats.lifetime,\n    streak: 0,',
    replace: '    session: NO_COUNTERS,\n    lifetime: NO_COUNTERS,\n    streak: 0,',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'SPEC 4.12 free reset wipes the session counters, which it preserves',
    file: 'src/core/statistics.ts',
    find: '    session: stats.session,\n    lifetime: stats.lifetime,\n    streak: stats.streak,',
    replace: '    session: NO_COUNTERS,\n    lifetime: stats.lifetime,\n    streak: stats.streak,',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'the thousand-hand row reads the session scope rather than the lifetime',
    file: 'src/core/statistics.ts',
    find: 'thousandHands: lifetime.handsPlayed >= THOUSAND_HANDS,',
    replace: 'thousandHands: session.handsPlayed >= THOUSAND_HANDS,',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'the hundred-hand row awards at ninety-nine',
    file: 'src/core/statistics.ts',
    find: 'export const HUNDRED_HANDS = 100;',
    replace: 'export const HUNDRED_HANDS = 99;',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'the accuracy row reads the coach session scope rather than the lifetime',
    file: 'src/core/statistics.ts',
    find: 'const { decisions, matched } = coach.lifetime;',
    replace: 'const { decisions, matched } = coach.session;',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'the accuracy row awards below SPEC 9 ninety percent',
    file: 'src/core/statistics.ts',
    find: 'return decisions >= ACCURACY_DECISIONS && matched * 100 >= ACCURACY_PERCENT * decisions;',
    replace:
      'return decisions >= ACCURACY_DECISIONS && matched * 100 >= (ACCURACY_PERCENT - 1) * decisions;',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'the accuracy row drops SPEC 9 hundred-decision floor',
    file: 'src/core/statistics.ts',
    find: 'return decisions >= ACCURACY_DECISIONS && matched * 100 >= ACCURACY_PERCENT * decisions;',
    replace: 'return matched * 100 >= ACCURACY_PERCENT * decisions;',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'a split win stops requiring the hand to have come from a split',
    file: 'src/core/statistics.ts',
    find: 'splitWin = splitWin || (inPlay.fromSplit && net > 0);',
    replace: 'splitWin = splitWin || net > 0;',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'a split win stops requiring the split hand to have won',
    file: 'src/core/statistics.ts',
    find: 'splitWin = splitWin || (inPlay.fromSplit && net > 0);',
    replace: 'splitWin = splitWin || inPlay.fromSplit;',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'a push is counted as a win',
    file: 'src/core/statistics.ts',
    find: 'wins: counters.wins + (net > 0 ? 1 : 0),',
    replace: 'wins: counters.wins + (net < 0 ? 0 : 1),',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'SPEC 4.8 surrender is counted as a push rather than a loss',
    file: 'src/core/statistics.ts',
    find: 'pushes: counters.pushes + (net > 0 || net < 0 ? 0 : 1),',
    replace: 'pushes: counters.pushes + (net > 0 ? 0 : 1),',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'SPEC 11 blackjack tally stops counting',
    file: 'src/core/statistics.ts',
    find: 'blackjacks: counters.blackjacks + (natural ? 1 : 0),',
    replace: 'blackjacks: counters.blackjacks,',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'the round-boundary guard stops firing, so a round can be counted twice',
    file: 'src/core/statistics.ts',
    find: 'if (readout.rounds !== stats.rounds + 1) {',
    replace: 'if (readout.rounds !== stats.rounds + 1 && Boolean(0)) {',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'the round-result guard stops firing in the counters',
    file: 'src/core/statistics.ts',
    find: "if (phase.kind !== 'roundResult') {",
    replace: "if (phase.kind !== 'roundResult' && Boolean(0)) {",
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'SPEC 11 best balance is invented here rather than read from the wallet',
    file: 'src/core/statistics.ts',
    find: 'bestBalance: wallet.bestBalance,',
    replace: 'bestBalance: STARTING_CHIPS,',
    detectedBy: UNIT,
  },
  {
    item: 'J6',
    name: 'the two readout scopes are handed the same coach counters',
    file: 'src/core/statistics.ts',
    find: 'lifetime: scope(stats.lifetime, coach.lifetime),',
    replace: 'lifetime: scope(stats.lifetime, coach.session),',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // BJ-11: the versioned document, the salvage and the store seam
  // ------------------------------------------------------------------

  {
    item: 'I1',
    name: 'the envelope is sealed at a version this build does not write',
    file: 'src/storage/migrations.ts',
    find: 'return Object.freeze({ version: DOCUMENT_VERSION, data });',
    replace: 'return Object.freeze({ version: DOCUMENT_VERSION + 1, data });',
    detectedBy: UNIT,
  },
  {
    item: 'I1',
    name: 'the storage key stops being namespaced',
    file: 'src/storage/document.ts',
    find: 'export const STORAGE_KEY = `${STORAGE_NAMESPACE}.${STORAGE_GAME}`;',
    replace: 'export const STORAGE_KEY = STORAGE_GAME;',
    detectedBy: UNIT,
  },
  {
    item: 'I1',
    name: 'a document from the future is read instead of discarded',
    file: 'src/storage/migrations.ts',
    find: '  if (envelope.version > to) {',
    replace: '  if (envelope.version > to && Boolean(0)) {',
    detectedBy: UNIT,
  },
  {
    item: 'I1',
    name: 'a missing migration step quietly becomes an identity step',
    file: 'src/storage/migrations.ts',
    find: '    const step = steps.get(version);',
    replace: '    const step = steps.get(version) ?? ((data) => data);',
    detectedBy: UNIT,
  },
  {
    item: 'I1',
    name: 'a migration step that throws stops being caught',
    file: 'src/storage/migrations.ts',
    find: '      data = step(data);\n    } catch (error) {',
    replace: '      data = step(data);\n    } catch (error) {\n      throw error;',
    detectedBy: UNIT,
  },
  {
    item: 'I1',
    name: 'a throwing step is reported as a missing one',
    file: 'src/storage/migrations.ts',
    find: "        reason: 'migration-failed',",
    replace: "        reason: 'no-migration',",
    detectedBy: UNIT,
  },
  {
    item: 'I1',
    name: 'a step is registered for a version no document can claim',
    file: 'src/storage/migrations.ts',
    find: 'export const MIGRATIONS: ReadonlyMap<number, Migration> = new Map<number, Migration>();',
    replace:
      'export const MIGRATIONS: ReadonlyMap<number, Migration> = new Map<number, Migration>([[0, (data) => data]]);',
    detectedBy: UNIT,
  },
  {
    item: 'I1',
    name: 'a version below the first schema is accepted as a version',
    file: 'src/storage/migrations.ts',
    find:
      "  return typeof value === 'number' && Number.isSafeInteger(value) && value >= MIN_DOCUMENT_VERSION;",
    replace: "  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;",
    detectedBy: UNIT,
  },
  {
    item: 'I1',
    name: 'a fractional version is accepted as a version',
    file: 'src/storage/migrations.ts',
    find:
      "  return typeof value === 'number' && Number.isSafeInteger(value) && value >= MIN_DOCUMENT_VERSION;",
    replace:
      "  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_DOCUMENT_VERSION;",
    detectedBy: UNIT,
  },

  {
    item: 'I1',
    name: 'the loader reports a walked document as one that never moved',
    file: 'src/storage/persistence.ts',
    find: "      source: walked.steps > 0 ? 'migrated' : 'stored',",
    replace: "      source: 'stored',",
    detectedBy: UNIT,
  },

  {
    item: 'I2',
    name: 'the envelope read stops catching an unparseable string',
    file: 'src/storage/migrations.ts',
    find: '    parsed = JSON.parse(text);\n  } catch (error) {',
    replace: '    parsed = JSON.parse(text);\n  } catch (error) {\n    throw error;',
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'a parsed value that is not an object is read as an envelope anyway',
    file: 'src/storage/migrations.ts',
    find: '  if (!isRecord(parsed)) {',
    replace: '  if (!isRecord(parsed) && Boolean(0)) {',
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'the persisted mark floor drops below SPEC 4.11 starting bankroll',
    file: 'src/storage/document.ts',
    find:
      "  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= STARTING_CHIPS) {",
    replace: "  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {",
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'a fractional persisted mark reaches the wallet',
    file: 'src/storage/document.ts',
    find:
      "  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= STARTING_CHIPS) {",
    replace:
      "  if (typeof value === 'number' && Number.isFinite(value) && value >= STARTING_CHIPS) {",
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'a table SPEC 6 does not name is seated',
    file: 'src/storage/document.ts',
    find: "  if (typeof value === 'string' && isTableId(value)) {",
    replace: "  if (typeof value === 'string') {",
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'the SPEC 11 counter identity stops being checked',
    file: 'src/storage/document.ts',
    find: '  if (wins + losses + pushes !== handsPlayed || blackjacks > handsPlayed) {',
    replace: '  if (blackjacks > handsPlayed) {',
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'more blackjacks than hands played stops being checked',
    file: 'src/storage/document.ts',
    find: '  if (wins + losses + pushes !== handsPlayed || blackjacks > handsPlayed) {',
    replace: '  if (wins + losses + pushes !== handsPlayed) {',
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'a milestone SPEC 9 does not name is kept',
    file: 'src/storage/document.ts',
    find: '    if (!isMember(entry, MILESTONES)) {',
    replace: '    if (!isMember(entry, MILESTONES) && Boolean(0)) {',
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'a milestone stored twice is awarded twice',
    file: 'src/storage/document.ts',
    find: '    if (kept.includes(entry)) {',
    replace: '    if (kept.includes(entry) && Boolean(0)) {',
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'a history longer than SPEC 8 keeps is kept whole',
    file: 'src/storage/document.ts',
    find:
      '  const source = value.length > HISTORY_LIMIT ? value.slice(0, HISTORY_LIMIT) : value;',
    replace: '  const source = value;',
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'the history is truncated from the newest end rather than the oldest',
    file: 'src/storage/document.ts',
    find:
      '  const source = value.length > HISTORY_LIMIT ? value.slice(0, HISTORY_LIMIT) : value;',
    replace: '  const source = value.length > HISTORY_LIMIT ? value.slice(-HISTORY_LIMIT) : value;',
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'a coach scope with more matches than decisions is kept',
    file: 'src/storage/document.ts',
    find: '  if (matched > decisions) {',
    replace: '  if (matched > decisions && Boolean(0)) {',
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'a setting naming nothing the spec defines is accepted',
    file: 'src/storage/document.ts',
    find: '  if (isMember(value, allowed)) {',
    replace: '  if (isMember(value, allowed) || true) {',
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'a numeric setting outside the listed set is accepted',
    file: 'src/storage/document.ts',
    find: '  if (isNumberMember(value, allowed)) {',
    replace: '  if (isNumberMember(value, allowed) || true) {',
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'a volume above the ceiling is accepted',
    file: 'src/storage/document.ts',
    find: '    value <= MAX_VOLUME',
    replace: '    value <= Number.MAX_VALUE',
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'a negative count is accepted as a count',
    file: 'src/storage/document.ts',
    find:
      "  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;",
    replace:
      "  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;",
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'a payload that is not an object is read field by field anyway',
    file: 'src/storage/document.ts',
    find: "  if (!isRecord(value)) {\n    note('', 'not-a-document');",
    replace: "  if (!isRecord(value) && Boolean(0)) {\n    note('', 'not-a-document');",
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'a malformed history entry is kept instead of dropped',
    file: 'src/storage/document.ts',
    find:
      '  if (hands === null || dealer === null || dealerValue === null || actions === null) {',
    replace:
      '  if ((hands === null || dealer === null || dealerValue === null || actions === null) && Boolean(0)) {',
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'a card outside SPEC 4.1 composition is accepted',
    file: 'src/storage/document.ts',
    find: '  if (!isMember(rank, RANKS) || !isMember(suit, SUITS)) {',
    replace: '  if ((!isMember(rank, RANKS) || !isMember(suit, SUITS)) && Boolean(0)) {',
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'an outcome SPEC 4.10 does not name is accepted',
    file: 'src/storage/document.ts',
    find: '  if (!isOutcome(outcome) || !isRung(rung)) {',
    replace: '  if ((!isOutcome(outcome) || !isRung(rung)) && Boolean(0)) {',
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'an action SPEC 4.5 does not name is accepted',
    file: 'src/storage/document.ts',
    find: '    if (!isMember(entry, PLAYER_ACTIONS)) {',
    replace: '    if (!isMember(entry, PLAYER_ACTIONS) && Boolean(0)) {',
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'a coach that was off is read as an unreadable entry',
    file: 'src/storage/document.ts',
    find:
      'function verdictsOfEntry(value: unknown): readonly CoachVerdict[] | null | undefined {\n  if (value === null) {\n    return null;\n  }',
    replace:
      'function verdictsOfEntry(value: unknown): readonly CoachVerdict[] | null | undefined {\n  if (value === null) {\n    return undefined;\n  }',
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'a chip balance somebody stored survives into the document',
    file: 'src/storage/document.ts',
    find: "    howToPlaySeen: flag(value['howToPlaySeen'], 'howToPlaySeen', false, note),",
    replace:
      "    howToPlaySeen: flag(value['howToPlaySeen'], 'howToPlaySeen', false, note),\n    chips: value['chips'],",
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'the loaded statistics no longer have a session opened on them',
    file: 'src/storage/document.ts',
    find: '    statistics: openStatisticsSession(document.statistics),',
    replace: '    statistics: document.statistics,',
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'the loaded coach record no longer has a session opened on it',
    file: 'src/storage/document.ts',
    find: '    coach: openCoachSession(document.coach),',
    replace: '    coach: document.coach,',
    detectedBy: UNIT,
  },
  {
    item: 'I2',
    name: 'an absent document is read as a corrupt one',
    file: 'src/storage/persistence.ts',
    find: '  if (text === null) {',
    replace: '  if (text === null && Boolean(0)) {',
    detectedBy: UNIT,
  },

  {
    item: 'I3',
    name: 'the probe stops catching the property access',
    file: 'src/storage/store.ts',
    find: "    return degraded(describeFailure('probe', error));",
    replace: '    throw error;',
    detectedBy: UNIT,
  },
  {
    item: 'I3',
    name: 'the adapter swallows the refusal the platform store raised',
    file: 'src/storage/store.ts',
    find: '      storage.setItem(key, value);',
    replace:
      '      try {\n        storage.setItem(key, value);\n      } catch (error) {\n        void error;\n      }',
    detectedBy: UNIT,
  },
  {
    item: 'I3',
    name: 'an empty storage property is adapted instead of refused',
    file: 'src/storage/store.ts',
    find: '    if (storage === null || storage === undefined) {',
    replace: '    if (storage === null && Boolean(0)) {',
    detectedBy: UNIT,
  },
  {
    item: 'I3',
    name: 'every degraded probe shares one fallback store',
    file: 'src/storage/store.ts',
    find:
      'function degraded(failure: StoreFailure): StoreProbe {\n  return Object.freeze({ store: createMemoryStore(), durable: false, failure });\n}',
    replace:
      'const SHARED_FALLBACK = createMemoryStore();\nfunction degraded(failure: StoreFailure): StoreProbe {\n  return Object.freeze({ store: SHARED_FALLBACK, durable: false, failure });\n}',
    detectedBy: UNIT,
  },
  {
    item: 'I3',
    name: 'the shipped source stops reading the platform property',
    file: 'src/storage/store.ts',
    find: 'export const browserStorage: StorageSource = () => window.localStorage;',
    replace: 'export const browserStorage: StorageSource = () => null;',
    detectedBy: UNIT,
  },
  {
    item: 'I3',
    name: "a thrown value's name stops being read",
    file: 'src/storage/store.ts',
    find: "  return error instanceof Error ? error.name : 'NonError';",
    replace: "  return 'Error';",
    detectedBy: UNIT,
  },
  {
    item: 'I3',
    name: 'the in-memory document only moves when the write lands',
    file: 'src/storage/persistence.ts',
    find: '    current = next;\n    return record(saveDocument(probe.store, next));',
    replace:
      '    const attempt = record(saveDocument(probe.store, next));\n    if (attempt.ok) {\n      current = next;\n    }\n    return attempt;',
    detectedBy: UNIT,
  },
  {
    item: 'I3',
    name: 'a write that lands no longer clears the degradation',
    file: 'src/storage/persistence.ts',
    find: '      carryFailing = false;\n    } else {',
    replace: '    } else {',
    detectedBy: UNIT,
  },
  {
    item: 'I3',
    name: 'a write that throws is raised instead of recorded',
    file: 'src/storage/persistence.ts',
    find: "    return Object.freeze({ ok: false, failure: describeFailure('write', error) });",
    replace: '    throw error;',
    detectedBy: UNIT,
  },
  {
    item: 'I3',
    name: 'the session scope stops being projected out at the write',
    file: 'src/storage/persistence.ts',
    find:
      '    store.write(STORAGE_KEY, JSON.stringify(sealEnvelope(openDocumentSession(document))));',
    replace: '    store.write(STORAGE_KEY, JSON.stringify(sealEnvelope(document)));',
    detectedBy: UNIT,
  },
  {
    item: 'I3',
    name: 'a read that throws is raised instead of defaulted',
    file: 'src/storage/persistence.ts',
    find:
      "    return defaulted('unreadable', [Object.freeze({ field: '', reason: 'unreadable' })], failure);",
    replace: '    throw error;',
    detectedBy: UNIT,
  },
  {
    item: 'I3',
    name: 'a reset only clears memory when the remove lands',
    file: 'src/storage/persistence.ts',
    find:
      '    current = DEFAULT_DOCUMENT;\n    restored = restoreFrom(current);\n    try {\n      probe.store.remove(STORAGE_KEY);',
    replace:
      '    try {\n      probe.store.remove(STORAGE_KEY);\n      current = DEFAULT_DOCUMENT;\n      restored = restoreFrom(current);',
    detectedBy: UNIT,
  },
  {
    item: 'I3',
    name: 'a reset stops rebuilding the session, so the old wallet survives it',
    file: 'src/storage/persistence.ts',
    find: '    restored = restoreFrom(current);',
    replace: '    void current;',
    detectedBy: UNIT,
  },
  {
    item: 'I3',
    name: 'a missing mark is spelled as an undefined key rather than an absent one',
    file: 'src/storage/persistence.ts',
    find: '  return mark === undefined ? {} : { bestBalance: mark };',
    replace: '  return { bestBalance: mark as number };',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // BJ-12. The soak, the determinism harness and the frame-independence
  // harness. H6 is the conservation audit between every two observations,
  // B5 the rebuild that must never fire and must subtract what it owes when
  // forced, M5 the clamp, the drain and the schedule at six frame rates,
  // B16 the seeded transcripts and the shoe's own split stream.
  // ------------------------------------------------------------------
  {
    item: 'H6',
    name: 'the wallet readout drops the fourth identity term',
    file: 'src/core/wallet.ts',
    find: '      conserved: chips + committed() + insuranceStake - deferredStake,',
    replace: '      conserved: chips + committed() + insuranceStake,',
    detectedBy: UNIT,
  },
  {
    item: 'H6',
    name: 'the round boundary waives the deferred remainder instead of taking it back',
    file: 'src/core/wallet.ts',
    find: '    chips -= deferredStake;\n    deferredStake = 0;',
    replace: '    deferredStake = 0;',
    detectedBy: UNIT,
  },
  {
    item: 'H6',
    name: 'the shoe stops clearing in-play cards at the round boundary',
    file: 'src/core/shoe.ts',
    find: '  function endRound(): boolean {\n    inPlay.length = 0;',
    replace: '  function endRound(): boolean {',
    detectedBy: UNIT,
  },
  {
    item: 'H6',
    name: 'a drawn card is no longer recorded as in play',
    file: 'src/core/shoe.ts',
    find: '    inPlay.push(drawn);',
    replace: '    void drawn;',
    detectedBy: UNIT,
  },
  {
    item: 'B5',
    name: 'the forced rebuild stops subtracting the cards in play',
    file: 'src/core/shoe.ts',
    find: '      if (outstanding > 0) {\n        owed.set(key, outstanding - 1);\n        continue;\n      }',
    replace: '      void outstanding;',
    detectedBy: UNIT,
  },
  {
    item: 'B5',
    name: 'the rebuild counter stops counting attempts',
    file: 'src/core/shoe.ts',
    find: '    rebuilds += 1;',
    replace: '    rebuilds += 0;',
    detectedBy: UNIT,
  },
  {
    item: 'B5',
    name: 'an exhausted shoe throws instead of attempting the rebuild',
    file: 'src/core/shoe.ts',
    find: '    if (dealt >= stack.length) {\n      rebuild();\n    }',
    replace: '    if (dealt > stack.length) {\n      rebuild();\n    }',
    detectedBy: UNIT,
  },
  {
    item: 'M5',
    name: 'a negative delta is consumed instead of treated as zero',
    file: 'src/core/table.ts',
    find: '  if (!Number.isFinite(dt) || dt <= 0) {',
    replace: '  if (!Number.isFinite(dt)) {',
    detectedBy: UNIT,
  },
  {
    item: 'M5',
    name: 'the per-frame ceiling comes off the clamp',
    file: 'src/core/table.ts',
    find: '  return Math.min(dt, MAX_STEP);',
    replace: '  return dt;',
    detectedBy: UNIT,
  },
  {
    item: 'M5',
    name: 'the accumulator consumes the raw delta rather than the clamped one',
    file: 'src/core/table.ts',
    find: '    elapsed += clampDelta(dt);',
    replace: '    elapsed += dt;',
    detectedBy: UNIT,
  },
  {
    item: 'M5',
    name: 'the drain drops the remainder instead of carrying it',
    file: 'src/core/table.ts',
    find: '      elapsed -= step.duration;',
    replace: '      elapsed = 0;',
    detectedBy: UNIT,
  },
  {
    item: 'M5',
    name: 'a resume returns without emptying the accumulator',
    file: 'src/core/table.ts',
    find: '    if (Number.isFinite(dt) && dt > RESUME_GAP) {\n      elapsed = 0;\n      return;\n    }',
    replace: '    if (Number.isFinite(dt) && dt > RESUME_GAP) {\n      return;\n    }',
    detectedBy: UNIT,
  },
  {
    item: 'M5',
    name: 'the drain loop degrades to one step per frame',
    file: 'src/core/table.ts',
    find: '    while (step !== null && elapsed >= step.duration) {',
    replace: '    if (step !== null && elapsed >= step.duration) {',
    detectedBy: UNIT,
  },
  {
    item: 'B16',
    name: 'the table ignores the seed it was given',
    file: 'src/core/table.ts',
    find: 'createRng(options.seed ?? DEFAULT_SEED)',
    replace: 'createRng(DEFAULT_SEED)',
    detectedBy: UNIT,
  },
  {
    item: 'B16',
    name: 'the shoe shares the session stream instead of splitting its own',
    file: 'src/core/shoe.ts',
    find: '  const stream = source.split();',
    replace: '  const stream = source;',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // BJ-13: the play surface. Armour for the D items E3, E4 and E5.
  // ------------------------------------------------------------------
  {
    item: 'E3',
    name: "the 7 loses its odd pip and becomes symmetric",
    file: 'src/render/card.ts',
    find: "  '7': Object.freeze([at(L, T), at(R, T), at(C, UM), at(L, M), at(R, M), at(L, B), at(R, B)]),",
    replace: "  '7': Object.freeze([at(L, T), at(R, T), at(L, M), at(R, M), at(L, B), at(R, B)]),",
    detectedBy: UNIT,
  },
  {
    item: 'E3',
    name: 'the far corner index is no longer printed',
    file: 'src/render/card.ts',
    find:
      '  drawCornerRank(ctx, spec);\n' +
      '  rotatedAboutCentre(ctx, spec, () => {\n' +
      '    drawCornerRank(ctx, spec);\n' +
      '  });',
    replace: '  drawCornerRank(ctx, spec);',
    detectedBy: UNIT,
  },
  {
    item: 'E3',
    name: 'the far corner stops rotating and prints upright',
    file: 'src/render/card.ts',
    find:
      '  ctx.translate(spec.x + spec.width / 2, spec.y + height / 2);\n' +
      '  ctx.rotate(Math.PI);',
    replace: '  ctx.translate(spec.x + spec.width / 2, spec.y + height / 2);',
    detectedBy: UNIT,
  },
  {
    item: 'E3',
    name: 'hearts and diamonds lose the red ink',
    file: 'src/render/card.ts',
    find: "  return suit === 'hearts' || suit === 'diamonds' ? SURFACE.rankRed : SURFACE.rankBlack;",
    replace: '  return SURFACE.rankBlack;',
    detectedBy: UNIT,
  },
  {
    item: 'E3',
    name: 'a face-down card prints its rank anyway',
    file: 'src/render/card.ts',
    find:
      '  if (!spec.faceUp) {\n' +
      '    return;\n' +
      '  }\n' +
      '\n' +
      '  drawCornerRank(ctx, spec);',
    replace: '  drawCornerRank(ctx, spec);',
    detectedBy: UNIT,
  },
  {
    item: 'E4',
    name: 'the greedy walk skips every other denomination',
    file: 'src/render/chips.ts',
    find: '  for (let index = CHIP_DENOMINATIONS.length - 1; index >= 0; index -= 1) {',
    replace: '  for (let index = CHIP_DENOMINATIONS.length - 1; index >= 0; index -= 2) {',
    detectedBy: UNIT,
  },
  {
    item: 'E4',
    name: 'the stack collapses onto one circle with no offset',
    file: 'src/render/chips.ts',
    find: '    y: spec.y - index * CHIP_GEOMETRY.stackOffset * spec.radius,',
    replace: '    y: spec.y,',
    detectedBy: UNIT,
  },
  {
    item: 'E4',
    name: 'every chip fills in the 10 colour regardless of denomination',
    file: 'src/render/chips.ts',
    find: '  ctx.fillStyle = CHIP_FILL[placement.denomination];',
    replace: '  ctx.fillStyle = CHIP_FILL[10];',
    detectedBy: UNIT,
  },
  {
    item: 'E4',
    name: 'the top chip prints an empty value glyph',
    file: 'src/render/chips.ts',
    find: '  ctx.fillText(String(top.denomination), top.x, top.y);',
    replace: "  ctx.fillText('', top.x, top.y);",
    detectedBy: UNIT,
  },
  {
    item: 'E5',
    name: 'the insurance line drops off the felt print',
    file: 'src/render/felt.ts',
    find: "    'INSURANCE PAYS 2 TO 1',\n    'BLACKJACK PAYS 3 TO 2',",
    replace: "    'BLACKJACK PAYS 3 TO 2',",
    detectedBy: UNIT,
  },
  {
    item: 'E5',
    name: 'the limits line prints the minimum twice',
    file: 'src/render/felt.ts',
    find: '    `MINIMUM ${String(limits.minimum)} - MAXIMUM ${String(limits.maximum)}`,',
    replace: '    `MINIMUM ${String(limits.minimum)} - MAXIMUM ${String(limits.minimum)}`,',
    detectedBy: UNIT,
  },
  {
    item: 'E5',
    name: 'the print ink swaps to the rail token',
    file: 'src/render/felt.ts',
    find: '  ctx.fillStyle = SURFACE.print;',
    replace: '  ctx.fillStyle = SURFACE.rail;',
    detectedBy: UNIT,
  },
  {
    item: 'E5',
    name: 'procedural drawing leaks back into the per-frame path',
    file: 'src/render/felt.ts',
    find: '      target.drawImage(canvas as unknown as CanvasImageSource, 0, 0, spec.width, spec.height);',
    replace:
      '      drawGround(target, frameOf(spec), FELT[spec.felt]);\n' +
      '      target.drawImage(canvas as unknown as CanvasImageSource, 0, 0, spec.width, spec.height);',
    detectedBy: UNIT,
  },
  {
    item: 'E5',
    name: 'the felt grain goes nondeterministic',
    file: 'src/render/felt.ts',
    find: '      const value = grain(column, row);',
    replace: '      const value = Math.random();',
    detectedBy: UNIT,
  },
  {
    item: 'E5',
    name: 'the rail thins below the border floor at small sizes',
    file: 'src/render/felt.ts',
    find: '  const railWidth = Math.max(g.railMinimum, g.rail * scale);',
    replace: '  const railWidth = g.rail * scale;',
    detectedBy: UNIT,
  },
  {
    item: 'E3',
    name: 'the backing store ignores the device pixel ratio',
    file: 'src/render/surface.ts',
    find: '  canvas.width = Math.round(width * dpr);',
    replace: '  canvas.width = Math.round(width);',
    detectedBy: UNIT,
  },
  {
    item: 'E3',
    name: 'the context is never scaled to logical units',
    file: 'src/render/surface.ts',
    find: '  ctx.scale(dpr, dpr);',
    replace: '  void dpr;',
    detectedBy: UNIT,
  },
  {
    item: 'E5',
    name: 'the text pass runs before the shape pass',
    file: 'src/render/surface.ts',
    find:
      '  beginShapePass(ctx);\n' +
      '  for (const layer of layers) {\n' +
      '    layer.drawShapes(ctx);\n' +
      '  }\n' +
      '  endPass(ctx);\n' +
      '\n' +
      '  beginTextPass(ctx);\n' +
      '  for (const layer of layers) {\n' +
      '    layer.drawText(ctx);\n' +
      '  }\n' +
      '  endPass(ctx);',
    replace:
      '  beginTextPass(ctx);\n' +
      '  for (const layer of layers) {\n' +
      '    layer.drawText(ctx);\n' +
      '  }\n' +
      '  endPass(ctx);\n' +
      '\n' +
      '  beginShapePass(ctx);\n' +
      '  for (const layer of layers) {\n' +
      '    layer.drawShapes(ctx);\n' +
      '  }\n' +
      '  endPass(ctx);',
    detectedBy: UNIT,
  },
  {
    item: 'E5',
    name: 'the text pass stops setting its font explicitly',
    file: 'src/render/surface.ts',
    find: '  ctx.font = font(SPACE[4], SANS_FAMILY);',
    replace: '  void SPACE;',
    detectedBy: UNIT,
  },
  {
    item: 'E5',
    name: 'the felt loses its vignette and bakes flat',
    file: 'src/render/felt.ts',
    find: '  drawGround(ctx, frame, felt);\n  drawVignette(ctx, spec, frame, felt);',
    replace: '  drawGround(ctx, frame, felt);',
    detectedBy: UNIT,
  },
  {
    item: 'E3',
    name: 'the corner index prints a fixed rank instead of the dealt one',
    file: 'src/render/card.ts',
    find: '  ctx.fillText(spec.rank, spec.x + g.indexX * spec.width, spec.y + g.indexRankDrop * spec.width);',
    replace: "  ctx.fillText('K', spec.x + g.indexX * spec.width, spec.y + g.indexRankDrop * spec.width);",
    detectedBy: UNIT,
  },
  {
    item: 'E3',
    name: 'the recorder goes blind to rotation, and the corner armour with it',
    file: 'tests/unit/support/recording-context.ts',
    find: "  'rotate',\n  'translate',",
    replace: "  'translate',",
    detectedBy: UNIT,
  },

  // -------------------------------------------------------------------------
  // BJ-15. The DOM chrome: B15's betting rules at the controls, C5's overlays,
  // C8's round result. Every one of these is invisible to `npm run test`,
  // because the thing it breaks is a component, a stylesheet rule or the
  // composition root's frame, so each is required red by the browser gate that
  // grades the item.
  // -------------------------------------------------------------------------

  {
    item: 'B15',
    name: 'a chip tap over the ceiling is clamped instead of refused',
    file: 'src/core/wallet.ts',
    find: "  if (next > wagerCeiling(limits, chips)) {\n    return refused('above-ceiling');\n  }",
    replace:
      '  if (next > wagerCeiling(limits, chips)) {\n' +
      '    return accepted(wagerCeiling(limits, chips));\n' +
      '  }',
    detectedBy: BETTING,
  },
  {
    item: 'B15',
    name: 'the chip rack disables the 500 by name instead of by the ceiling',
    file: 'src/ui/components/betting.ts',
    find: '        const enabled = chipEnabled(denomination, limits, balance);',
    replace: '        const enabled = denomination !== 500;',
    detectedBy: BETTING,
  },
  {
    item: 'B15',
    name: 'a chip button computes a wager instead of adding its denomination',
    file: 'src/ui/components/betting.ts',
    find: "        actions.queue({ kind: 'tapChip', chip: denomination });",
    replace: "        actions.queue({ kind: 'max' });",
    detectedBy: BETTING,
  },
  {
    item: 'B15',
    name: 'Deal stops being blocked below the table minimum',
    file: 'src/core/wallet.ts',
    find: "  if (wager < limits.minimum) {\n    return 'below-minimum';\n  }",
    replace: '  if (wager < limits.minimum) {\n    return null;\n  }',
    detectedBy: BETTING,
  },
  {
    item: 'B15',
    name: 'Max stops flooring onto the 10 grid',
    file: 'src/core/wallet.ts',
    find: '  return Math.floor(wagerCeiling(limits, chips) / WAGER_GRID) * WAGER_GRID;',
    replace: '  return wagerCeiling(limits, chips);',
    detectedBy: BETTING,
  },
  {
    item: 'B15',
    name: 'a refusal stops surfacing its reason to the player',
    file: 'src/ui/components/notice.ts',
    find: '      setText(root, reasonText(notice.reason));',
    replace: "      setText(root, '');",
    detectedBy: BETTING,
  },
  {
    // The same break the `UNIT` entry above makes to the readout's field list,
    // made to the published sum and required red by the gate that grades `B15`.
    // It is only reachable on an insured round: on every other round the third
    // term is identically zero and the four-term form and the two-term one
    // agree on every frame, which is why the betting spec drives seed 4.
    item: 'B15',
    name: 'the published identity drops the insurance stake, at the controls',
    file: 'src/core/wallet.ts',
    find: '      conserved: chips + committed() + insuranceStake - deferredStake,',
    replace: '      conserved: chips + committed() - deferredStake,',
    detectedBy: BETTING,
  },
  {
    item: 'C5',
    name: 'the overlay leaves the play-surface row and covers the readouts',
    file: 'src/ui/chrome.css',
    find: '.bj-overlay {\n  position: absolute;',
    replace: '.bj-overlay {\n  position: fixed;',
    detectedBy: OVERLAYS,
  },
  {
    item: 'C5',
    name: 'the overlay host is mounted on the shell instead of inside the body row',
    file: 'src/ui/chrome.ts',
    find: '  shell.body.append(overlays.host);',
    replace: '  shell.root.append(overlays.host);',
    detectedBy: OVERLAYS,
  },
  {
    item: 'C5',
    name: 'opening an overlay reaches into the game and clears the wager',
    file: 'src/main.ts',
    find: '    openOverlay(id: OverlayId): void {\n      overlay = id;\n    },',
    replace:
      '    openOverlay(id: OverlayId): void {\n' +
      '      overlay = id;\n' +
      "      table.queue({ kind: 'clear' });\n" +
      '    },',
    detectedBy: OVERLAYS,
  },
  {
    item: 'C5',
    name: 'the frame loop pauses while an overlay is open',
    file: 'src/main.ts',
    find: '    drainInput();\n    table.update(dt);',
    replace: '    drainInput();\n    table.update(overlay === null ? dt : 0);',
    detectedBy: OVERLAYS,
  },
  {
    item: 'C8',
    name: 'the round result prints the dealer value as the player value',
    file: 'src/ui/components/round-result.ts',
    find: "      field('Your hand', 'player-value', formatChips(playerValue)),",
    replace: "      field('Your hand', 'player-value', formatChips(dealerValue)),",
    detectedBy: ROUND_RESULT,
  },
  {
    item: 'C8',
    name: 'the round result prints a fixed reason instead of the deciding rung',
    file: 'src/ui/components/round-result.ts',
    find: "      field('Reason', 'reason', rungText(settled.rung)),",
    replace: "      field('Reason', 'reason', rungText(7)),",
    detectedBy: ROUND_RESULT,
  },
  {
    item: 'C8',
    name: 'the round result prints a fixed outcome',
    file: 'src/ui/components/round-result.ts',
    find: "      field('Outcome', 'outcome', outcomeText(settled.outcome)),",
    replace: "      field('Outcome', 'outcome', outcomeText('PUSH')),",
    detectedBy: ROUND_RESULT,
  },
  {
    item: 'C8',
    name: 'the chip delta forgets that the wager already left the balance',
    file: 'src/ui/components/round-result.ts',
    find: "      field('Chips', 'delta', formatDelta(settled.credit - settled.wager)),",
    replace: "      field('Chips', 'delta', formatDelta(settled.credit)),",
    detectedBy: ROUND_RESULT,
  },
  {
    item: 'C8',
    name: 'the insurance result is never shown',
    file: 'src/ui/components/round-result.ts',
    find: '      setHidden(insurance, side === null);',
    replace: '      setHidden(insurance, true);',
    detectedBy: ROUND_RESULT,
  },
  {
    // SPEC 12 prints the result per hand. A constant index passes every
    // single-hand round in the suite, which is why the spec drives a split.
    item: 'C8',
    name: 'every verdict is filed under the first hand rather than the hand it was made on',
    file: 'src/ui/components/round-result.ts',
    find: '    const mine = verdicts.filter((entry) => entry.hand === index);',
    replace: '    const mine = verdicts.filter((entry) => entry.hand === 0);',
    detectedBy: ROUND_RESULT,
  },
  {
    item: 'C8',
    name: 'a round played with the coach off records verdicts as if it were on',
    file: 'src/main.ts',
    find: "      if (applied.kind === 'deal') {\n        verdicts = coachMode === 'off' ? null : [];\n      }",
    replace: "      if (applied.kind === 'deal') {\n        verdicts = [];\n      }",
    detectedBy: ROUND_RESULT,
  },

  // The unit armour BJ-15 added beside the browser specs: the sentences, the
  // scene arrangement and the loop's one conversion, none of which needs a page.
  {
    item: 'B15',
    name: 'two refusals collapse onto one sentence',
    file: 'src/ui/text.ts',
    find: "    case 'below-minimum':\n      return 'That is below the table minimum.';",
    replace:
      "    case 'below-minimum':\n" +
      "      return 'That is more than the table maximum or your balance allows.';",
    detectedBy: UNIT,
  },
  {
    item: 'M1',
    name: 'a hand stops being centred on the point it is laid out at',
    file: 'src/render/scene.ts',
    find: '  const left = centreX - total / 2;',
    replace: '  const left = centreX;',
    detectedBy: UNIT,
  },
  {
    item: 'M1',
    name: 'the felt stops rebaking when the device pixel ratio changes',
    file: 'src/render/scene.ts',
    find: '    current.dpr !== next.dpr ||',
    replace: '',
    detectedBy: UNIT,
  },
  {
    item: 'M1',
    name: 'the frame loop invents a delta for the frame it cannot measure',
    file: 'src/ui/loop.ts',
    find: '    const dt = previous === null ? 0 : (timestamp - previous) / MS_PER_SECOND;',
    replace: '    const dt = previous === null ? 1 / 60 : (timestamp - previous) / MS_PER_SECOND;',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // BJ-14: the motion layer, reduced motion and the Speed setting.
  //
  // `E6` is method D and closes at the demonstration session, so its entries
  // prove the automated armour under it can fail rather than proving the item.
  // `E7` and `E9` are method T and are graded by the two browser specs, so the
  // mutations only a page can see are required red by the gate that actually
  // watches one: a removed CSS animation, a composition root that stops asking
  // the platform and a Speed control that never reaches the machine are all
  // invisible to `npm run test`.
  //
  // The first two are the ones worth reading. `timedStep` exempting the peek
  // from the Speed multiplier is the exact defect `table.ts`'s own header warns
  // about, and it is the timing tell SPEC 4.4 forbids; `PACING.peekPause`
  // restating 0.3 instead of importing `PEEK_PAUSE` is the same defect written
  // the other way round, an alias that stopped following what it aliases.
  // ------------------------------------------------------------------
  {
    item: 'E9',
    name: 'Fast stops being a multiplier and runs at Normal speed',
    file: 'src/core/table.ts',
    find: "  return speed === 'fast' ? FAST_SPEED_MULTIPLIER : 1;",
    replace: '  return 1;',
    detectedBy: UNIT,
  },
  {
    item: 'E6',
    name: 'the Speed multiplier is applied to every phase except the peek',
    file: 'src/core/table.ts',
    find: '    return { duration: step.duration * speedMultiplier(speed), take: step.take };',
    replace:
      "    const scale = phase.kind === 'peek' ? 1 : speedMultiplier(speed);\n" +
      '    return { duration: step.duration * scale, take: step.take };',
    detectedBy: UNIT,
  },
  {
    item: 'E6',
    name: 'the render layer restates the peek pause instead of importing it',
    file: 'src/render/animate.ts',
    find: '  peekPause: PEEK_PAUSE,',
    replace: '  peekPause: 0.3,',
    detectedBy: UNIT,
  },
  {
    item: 'E6',
    name: 'the hole card gets thin and thick again without turning over',
    file: 'src/render/animate.ts',
    find: '  return Math.abs(Math.cos(Math.PI * clampProgress(progress)));',
    replace: '  return 0.2 + 0.8 * Math.abs(Math.cos(Math.PI * clampProgress(progress)));',
    detectedBy: UNIT,
  },
  {
    item: 'E6',
    name: 'the flip shows its face while the card still has width',
    file: 'src/render/animate.ts',
    find: '  return clampProgress(progress) >= DONE / 2;',
    replace: '  return clampProgress(progress) >= DONE / 4;',
    detectedBy: UNIT,
  },
  {
    item: 'E6',
    name: 'a dealt card slides in a straight line instead of on an arc',
    file: 'src/render/animate.ts',
    find: '    y: lerp(from.y, to.y, t) - lift * Math.sin(Math.PI * clampProgress(progress)),',
    replace: '    y: lerp(from.y, to.y, t),',
    detectedBy: UNIT,
  },
  {
    item: 'E6',
    name: 'the travel curve goes linear, so nothing eases and nothing settles',
    file: 'src/render/animate.ts',
    find: '  return ease(EASE.out, progress);',
    replace: '  return progress;',
    detectedBy: UNIT,
  },
  {
    item: 'E6',
    name: 'the balance snaps to its new value instead of counting',
    file: 'src/render/animate.ts',
    find: '  return Math.round(toward(from, to, progress));',
    replace: '  return to;',
    detectedBy: UNIT,
  },
  {
    item: 'E6',
    name: 'the win pulse beats four times faster and breaches the flash ceiling',
    file: 'src/render/animate.ts',
    find: '  return (fade * (DONE - Math.cos(2 * Math.PI * WIN_PULSE_CYCLES * progress))) / 2;',
    replace:
      '  return (fade * (DONE - Math.cos(2 * Math.PI * 4 * WIN_PULSE_CYCLES * progress))) / 2;',
    detectedBy: UNIT,
  },
  {
    item: 'E6',
    name: 'the win pulse keeps pulsing under reduced motion',
    file: 'src/render/animate.ts',
    find: "  const progress = motion.progress('winPulse', age);",
    replace: "  const progress = Math.min(DONE, age / motion.seconds('winPulse'));",
    detectedBy: UNIT,
  },
  {
    item: 'E6',
    name: 'the saturated-red measurement reads the wrong channel',
    file: 'src/render/animate.ts',
    find: '  return total === 0 ? 0 : red / total;',
    replace: '  return total === 0 ? 0 : green / total;',
    detectedBy: UNIT,
  },
  {
    item: 'E7',
    name: 'a second reduced-motion branch appears outside the one switch',
    file: 'src/render/scene.ts',
    find: '      let moving = 0;',
    replace:
      '      let moving = 0;\n' +
      '      if (motion.reducedMotion) {\n' +
      '        moving = 0;\n' +
      '      }',
    detectedBy: UNIT,
  },
  {
    item: 'E7',
    name: 'the simulation starts naming the reduced-motion flag',
    file: 'src/core/table.ts',
    find: "export const DEFAULT_SPEED: Speed = 'normal';",
    replace: "export const DEFAULT_SPEED: Speed = 'normal';\nexport const reducedMotion = false;",
    detectedBy: UNIT,
  },
  {
    item: 'E7',
    name: 'reduced motion collapses the pacing instead of removing the animation',
    file: 'src/render/animate.ts',
    find: '    return PACING[name] * scale;',
    replace: '    return reducedMotion ? 0 : PACING[name] * scale;',
    detectedBy: UNIT,
  },
  {
    item: 'E9',
    name: 'the pacing sweep stops listing every constant',
    file: 'src/render/animate.ts',
    find: '  Object.keys(PACING) as PacingName[],',
    replace: '  (Object.keys(PACING) as PacingName[]).slice(0, 3),',
    detectedBy: UNIT,
  },
  {
    item: 'E7',
    name: 'SPEC 14 system arm starts overriding a platform preference',
    file: 'src/ui/motion.ts',
    find: '  return alwaysReduce || systemPrefers;',
    replace: '  return alwaysReduce && systemPrefers;',
    detectedBy: UNIT,
  },
  {
    item: 'E7',
    name: 'the platform preference is read once and never followed again',
    file: 'src/ui/motion.ts',
    find: "  query?.addEventListener('change', onChange);",
    replace: '  void onChange;',
    detectedBy: UNIT,
  },
  {
    item: 'E7',
    name: 'the composition root stops asking the platform for the flag',
    file: 'src/main.ts',
    find:
      '    const motion = resolveMotion({ reducedMotion: preference.reduced(), ' +
      'speed: table.speed() });',
    replace: '    const motion = resolveMotion({ reducedMotion: false, speed: table.speed() });',
    detectedBy: REDUCED_MOTION,
  },
  {
    item: 'E7',
    name: 'the media query is never read, so the page answers no-preference',
    file: 'src/ui/motion.ts',
    find: '  return matchMedia(REDUCED_MOTION_QUERY);',
    replace: '  return null;',
    detectedBy: REDUCED_MOTION,
  },
  {
    item: 'E7',
    name: 'the overlay declares no transition, so removing it proves nothing',
    file: 'src/ui/chrome.css',
    find: '  animation: bj-overlay-in var(--dur-3) var(--ease-out) both;',
    replace: '  animation: none;',
    detectedBy: REDUCED_MOTION,
  },
  {
    // The canvas arm of the same clause, and the one the whole design rests on:
    // every tween is written over `progress`, so this is not one animation
    // escaping the flag but all of them at once. It is browser-gated because a
    // tween in flight is a property of a real round on a real loop.
    item: 'E7',
    name: 'the one reduced-motion switch is removed and every tween runs anyway',
    file: 'src/render/animate.ts',
    find: '      if (reducedMotion) {\n        return DONE;\n      }\n',
    replace: '',
    detectedBy: REDUCED_MOTION,
  },
  {
    item: 'E7',
    name: 'the balance count-up ignores the flag and runs under reduced motion',
    file: 'src/ui/components/readouts.ts',
    find: "      state.motion.progress('balanceCountUp', counting.age),",
    replace: "      Math.min(1, counting.age / state.motion.seconds('balanceCountUp')),",
    detectedBy: REDUCED_MOTION,
  },
  {
    item: 'E7',
    name: 'the tween instrument goes blind and reports nothing in flight',
    file: 'src/render/scene.ts',
    find: '      inFlight = moving;',
    replace: '      inFlight = 0;',
    detectedBy: REDUCED_MOTION,
  },
  {
    item: 'E9',
    name: 'the machine stops scaling its phase durations by the Speed',
    file: 'src/core/table.ts',
    find: '    return { duration: step.duration * speedMultiplier(speed), take: step.take };',
    replace: '    return { duration: step.duration, take: step.take };',
    detectedBy: SPEED_SETTING,
  },
  {
    item: 'E9',
    name: 'the render layer stops scaling its tween durations by the Speed',
    file: 'src/render/animate.ts',
    find: '    return PACING[name] * scale;',
    replace: '    return PACING[name];',
    detectedBy: SPEED_SETTING,
  },
  {
    item: 'E9',
    name: 'the Speed control is pressed and the machine never hears about it',
    file: 'src/main.ts',
    find: '      table.setSpeed(speed);',
    replace: '      void speed;',
    detectedBy: SPEED_SETTING,
  },
  {
    item: 'E6',
    name: 'the peek runs on a pause of its own instead of the hole card flip',
    file: 'src/core/table.ts',
    find: '        return { duration: PEEK_PAUSE, take: applyPeek };',
    replace: '        return { duration: TIMINGS.settlePause, take: applyPeek };',
    detectedBy: MOTION_DEMO,
  },
  {
    item: 'E6',
    name: 'the seed search stops telling the two arms of the peek apart',
    file: 'tests/browser/support/peek-seeds.ts',
    find: "    return kind === 'settling' ? 'natural' : 'none';",
    replace: "    return 'natural';",
    detectedBy: MOTION_DEMO,
  },

  // ------------------------------------------------------------------
  // F1. The four breakpoints. The first four break the table itself, which
  // is unit tested against the contract fixture the way every token is; the
  // last two break the layout the table decides, which only a browser sees.
  // The width-first entry is the trap QUALITY-BAR section 5 records an
  // earlier build falling into: a 1024 x 1366 tablet in its natural
  // orientation matched no row at all.
  // ------------------------------------------------------------------
  {
    item: 'F1',
    name: 'the wide floor drifts off QUALITY-BAR section 5',
    file: 'src/ui/breakpoints.ts',
    find: 'export const WIDE_MIN_WIDTH = 1024;',
    replace: 'export const WIDE_MIN_WIDTH = 1000;',
    detectedBy: UNIT,
  },
  {
    item: 'F1',
    name: 'the medium floor drifts off QUALITY-BAR section 5',
    file: 'src/ui/breakpoints.ts',
    find: 'export const MEDIUM_MIN_WIDTH = 768;',
    replace: 'export const MEDIUM_MIN_WIDTH = 720;',
    detectedBy: UNIT,
  },
  {
    item: 'F1',
    name: 'orientation is consulted before width, so a tall tablet stops being wide',
    file: 'src/ui/breakpoints.ts',
    find: "  if (viewport.width >= WIDE_MIN_WIDTH) {\n    return 'wide';\n  }",
    replace:
      "  if (viewport.height >= viewport.width) {\n" +
      "    return 'portrait';\n" +
      '  }\n' +
      '  if (viewport.width >= WIDE_MIN_WIDTH) {\n' +
      "    return 'wide';\n" +
      '  }',
    detectedBy: UNIT,
  },
  {
    item: 'F1',
    name: 'the surface plan is clamped back into its box, so magnification is refused',
    file: 'src/ui/breakpoints.ts',
    find: '  const scale = baseScale * surfaceSizeFactor(size);',
    replace: '  const scale = Math.min(baseScale * surfaceSizeFactor(size), baseScale);',
    detectedBy: UNIT,
  },
  {
    // The layout half of the defect the BJ-14 review recorded, put back: with
    // `min-height`, the middle row's `1fr` resolves against a height the row can
    // grow, so the play surface grows the document and the action buttons go
    // below the fold. Six of the nine tests in the spec go red on it.
    item: 'F1',
    name: 'the shell goes back to a minimum height, and the play surface grows the page',
    file: 'src/ui/chrome.css',
    find: '  height: 100vh;\n  height: 100dvh;\n  display: grid;',
    replace: '  min-height: 100vh;\n  display: grid;',
    detectedBy: BREAKPOINTS,
  },
  {
    item: 'F1',
    name: 'the resolved breakpoint never reaches the page',
    file: 'src/ui/chrome.ts',
    find: "      setAttribute(shell.root, 'data-breakpoint', state.layout.breakpoint);",
    replace: '      void state.layout.breakpoint;',
    detectedBy: BREAKPOINTS,
  },
  {
    // The `BJ-16` review's first blocker, put back: with the height threshold as
    // the only condition, the bars stick at a viewport with no room for them, the
    // play-surface row is squeezed to nothing and controls land below a fold the
    // page cannot scroll past. Ten tests go red on it, and with the mode
    // expectations removed the physical invariant goes red on its own.
    item: 'F1',
    name: 'the bars stick wherever the threshold allows, with or without room',
    file: 'src/ui/breakpoints.ts',
    find:
      '  return chrome.top + chrome.controls + chrome.overhead + MIN_SURFACE_HEIGHT <= viewport.height;',
    replace: '  return true;',
    detectedBy: BREAKPOINTS,
  },
  {
    // The same rule with the play surface left out of the sum: the two bars fit,
    // the row between them does not, and the surface is planned from nothing.
    item: 'F1',
    name: 'the sticky decision forgets the play surface needs room too',
    file: 'src/ui/breakpoints.ts',
    find: '  return chrome.top + chrome.controls + chrome.overhead + MIN_SURFACE_HEIGHT <= viewport.height;',
    replace: '  return chrome.top + chrome.controls + chrome.overhead <= viewport.height;',
    detectedBy: BREAKPOINTS,
  },
  {
    // The `BJ-16` review's second blocker: a control removed from a screen was
    // invisible to a sweep of what was on screen. Two of SPEC 4.5's five actions
    // stop being rendered at all.
    item: 'F1',
    name: 'two of SPEC 4.5s five actions stop being rendered',
    file: 'src/ui/components/actions.ts',
    find: '  for (const row of ROWS) {\n    const control = button(',
    replace: '  for (const row of ROWS.slice(0, 3)) {\n    const control = button(',
    detectedBy: BREAKPOINTS,
  },
  {
    item: 'F1',
    name: "SPEC 6's start screen stops offering two of its three tables",
    file: 'src/ui/components/screens.ts',
    find: '  for (const limits of TABLES) {',
    replace: '  for (const limits of TABLES.slice(0, 1)) {',
    detectedBy: BREAKPOINTS,
  },
  {
    item: 'F1',
    name: 'the controls row hides its overflow in a scroller with no affordance',
    file: 'src/ui/chrome.css',
    find: '.bj-controls {\n  display: flex;\n  flex-direction: column;\n  gap: var(--space-2);\n}',
    replace:
      '.bj-controls {\n  display: flex;\n  flex-direction: column;\n  gap: var(--space-2);\n  overflow-y: auto;\n  max-height: var(--surface-min-height);\n}',
    detectedBy: BREAKPOINTS,
  },

  // ------------------------------------------------------------------
  // F2. No horizontal page scroll from 320 px upward. The control rows wrap
  // and may shrink, and a row that refuses to shrink below its content is the
  // defect: five buttons at their labels' width are wider than a 320 px
  // viewport, and the row they are in then carries an overflow the page never
  // sees, which is the reading this entry proved the spec had to grow.
  // ------------------------------------------------------------------
  {
    item: 'F2',
    name: 'the control rows refuse to shrink, and hide an overflow at 320 px',
    file: 'src/ui/chrome.css',
    find: '  display: flex;\n  flex-wrap: wrap;\n  gap: var(--space-2);\n  min-width: 0;\n}',
    replace:
      '  display: flex;\n  flex-wrap: wrap;\n  gap: var(--space-2);\n  min-width: max-content;\n}',
    detectedBy: NO_HSCROLL,
  },

  // ------------------------------------------------------------------
  // F3. Portrait as a re-arrangement. The first two break the framing and the
  // split, which are arithmetic; the last two break the two things that make
  // the narrow bar a re-arrangement rather than a scale.
  // ------------------------------------------------------------------
  {
    item: 'F3',
    name: 'portrait is framed as a squashed landscape',
    file: 'src/ui/breakpoints.ts',
    find: "  return breakpoint === 'portrait' ? SURFACE_FRAMING.portrait : SURFACE_FRAMING.landscape;",
    replace: '  return SURFACE_FRAMING.landscape;',
    detectedBy: UNIT,
  },
  {
    item: 'F3',
    name: 'the narrow top bar keeps a readout DESIGN section 4 moves behind the disclosure',
    file: 'src/ui/components/readouts.ts',
    find: "export const PRIMARY_READOUT_KEYS: readonly string[] = Object.freeze([\n  BALANCE_KEY,\n  'wager',\n  'hand-value',\n]);",
    replace: "export const PRIMARY_READOUT_KEYS: readonly string[] = Object.freeze([\n  BALANCE_KEY,\n  'wager',\n  'hand-value',\n  'penetration',\n]);",
    detectedBy: UNIT,
  },
  {
    item: 'F3',
    name: 'the disclosure stays open at every width, so nothing is re-arranged',
    file: 'src/ui/components/readouts.ts',
    find: '        more.open = showsEveryReadout(breakpoint);',
    replace: '        more.open = true;',
    detectedBy: PORTRAIT,
  },
  {
    item: 'F3',
    name: 'the disclosure control is never shown, so the eleven are unreachable',
    file: 'src/ui/chrome.css',
    find: ".bj-shell[data-breakpoint='compact'] .bj-readouts__summary,\n.bj-shell[data-breakpoint='portrait'] .bj-readouts__summary {\n  display: block;",
    replace: ".bj-shell[data-breakpoint='compact'] .bj-readouts__summary,\n.bj-shell[data-breakpoint='portrait'] .bj-readouts__summary {\n  display: none;",
    detectedBy: PORTRAIT,
  },

  // ------------------------------------------------------------------
  // F5. An orientation change. The layout is resolved every frame, and a
  // layout resolved once at boot is the defect that makes a rotation need a
  // reload: the page keeps the shape it was loaded in.
  // ------------------------------------------------------------------
  {
    item: 'F5',
    name: 'the layout is resolved once at boot and never again',
    file: 'src/main.ts',
    find: '    layout = layoutNow();\n    const wanted = planSurface(',
    replace: '    const wanted = planSurface(',
    detectedBy: ORIENTATION,
  },
  {
    item: 'F5',
    name: 'orientation stops deciding below the medium floor, so a turn changes nothing',
    file: 'src/ui/breakpoints.ts',
    find: "  return viewport.height >= viewport.width ? 'portrait' : 'compact';",
    replace: "  return 'compact';",
    detectedBy: ORIENTATION,
  },

  // ------------------------------------------------------------------
  // F6. The play-surface size setting. One entry per clause of the criterion
  // that this part closes: the four values, the factor reaching the machine,
  // the factor itself, and "clips nothing".
  // ------------------------------------------------------------------
  {
    item: 'F6',
    name: 'the setting is pressed and the layout never hears about it',
    file: 'src/main.ts',
    find: '      surfaceSize = size;',
    replace: '      void size;',
    detectedBy: SURFACE_SCALE,
  },
  {
    item: 'F6',
    name: 'the panel offers three of QUALITY-BAR section 4s four sizes',
    file: 'src/ui/components/overlays.ts',
    find: '  for (const size of SURFACE_SIZES) {',
    replace: '  for (const size of SURFACE_SIZES.slice(0, 3)) {',
    detectedBy: SURFACE_SCALE,
  },
  {
    // The anchor is the two lines above the declaration rather than the whole
    // rule down to its brace. `BJ-17` added `overscroll-behavior` to the same
    // rule for item `D6` and the old anchor, which ran to the closing brace,
    // stopped matching; this one names what it breaks and nothing else.
    item: 'F6',
    name: 'the stage stops scrolling, so a magnified surface is clipped',
    file: 'src/ui/chrome.css',
    find: '  min-width: 0;\n  min-height: 0;\n  overflow: auto;',
    replace: '  min-width: 0;\n  min-height: 0;\n  overflow: hidden;',
    detectedBy: SURFACE_SCALE,
  },
  {
    item: 'F6',
    name: 'every size resolves to the same factor',
    file: 'src/render/surface.ts',
    find: '  return size / SURFACE_SIZE_WHOLE;',
    replace: '  return 1;',
    detectedBy: UNIT,
  },
  {
    // The two declarations of `SurfaceSize` cannot import each other before
    // BJ-20, so the guarantee that they agree is one test and nothing else.
    item: 'F6',
    name: 'the persisted size list drifts from the presentation one',
    file: 'src/storage/document.ts',
    find: 'export const SURFACE_SIZES = [100, 125, 150, 200] as const satisfies readonly SurfaceSize[];',
    replace: 'export const SURFACE_SIZES = [100, 125, 150, 175] as const satisfies readonly SurfaceSize[];',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // F7. 320 x 256, and the two bars. The threshold is arithmetic; whether the
  // bars honour it is a computed style, and whether the row they leave the
  // play surface is real is a rendered box.
  // ------------------------------------------------------------------
  {
    item: 'F7',
    name: 'the sticky threshold drifts off QUALITY-BAR section 5',
    file: 'src/ui/breakpoints.ts',
    find: 'export const STICKY_BARS_MIN_HEIGHT = 400;',
    replace: 'export const STICKY_BARS_MIN_HEIGHT = 320;',
    detectedBy: UNIT,
  },
  {
    item: 'F7',
    name: 'the bars unstick one pixel late, at the threshold rather than below it',
    file: 'src/ui/breakpoints.ts',
    find: '  if (viewport.height < STICKY_BARS_MIN_HEIGHT) {',
    replace: '  if (viewport.height <= STICKY_BARS_MIN_HEIGHT) {',
    detectedBy: UNIT,
  },
  {
    item: 'F7',
    name: 'the top bar sticks at every height, and consumes a 256 px viewport',
    file: 'src/ui/chrome.css',
    find: ".bj-shell[data-sticky-bars='on'] .bj-top {",
    replace: '.bj-shell .bj-top {',
    detectedBy: SMALL_VIEWPORT,
  },
  {
    item: 'F7',
    name: 'the height threshold never reaches the page',
    file: 'src/ui/chrome.ts',
    find:
      "      setAttribute(shell.root, 'data-sticky-bars', state.layout.stickyBars ? 'on' : 'off');",
    replace: '      void state.layout.stickyBars;',
    detectedBy: SMALL_VIEWPORT,
  },
  {
    item: 'F7',
    name: 'the play surface takes a share of nothing instead of its minimum height',
    file: 'src/ui/chrome.css',
    find: '  height: var(--surface-min-height);\n}',
    replace: '  height: 0;\n}',
    detectedBy: SMALL_VIEWPORT,
  },

  // ------------------------------------------------------------------
  // F4. Safe-area insets. The item is Demonstration and closes at the
  // session; these break the armour under it, which is the mechanism: the
  // meta that makes the insets non-zero, the padding that spends them, and
  // the sticky offsets that would otherwise pin a bar under the indicator.
  // ------------------------------------------------------------------
  {
    item: 'F4',
    name: 'the viewport meta loses viewport-fit=cover, and every inset becomes zero',
    file: 'index.html',
    find: '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
    replace: '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    detectedBy: SAFE_AREA,
  },
  {
    item: 'F4',
    name: 'the shell padding stops spending the insets',
    file: 'src/ui/chrome.css',
    find:
      '  padding: calc(var(--space-3) + var(--bj-safe-top)) calc(var(--space-3) + var(--bj-safe-right))\n' +
      '    calc(var(--space-3) + var(--bj-safe-bottom)) calc(var(--space-3) + var(--bj-safe-left));',
    replace: '  padding: var(--space-3);',
    detectedBy: SAFE_AREA,
  },
  {
    item: 'F4',
    name: 'the sticky top bar sticks to the notch instead of below it',
    file: 'src/ui/chrome.css',
    find: '  top: var(--bj-safe-top);',
    replace: '  top: 0;',
    detectedBy: SAFE_AREA,
  },

  // ------------------------------------------------------------------
  // BJ-17: input parity, the keyboard, and the two absences.
  //
  // D2 and D4 are Critical and are graded in the browser. D1 is Inspection
  // and its checklist is `docs/review-checklists/input.md`; the scans in it
  // also run in `tests/unit/input-surface.test.ts`, so the entries that break
  // them name the unit gate. D5's whole content is an absence, and D6 is a
  // Demonstration whose mechanism is armoured here on the `F4` precedent.
  // ------------------------------------------------------------------
  {
    // The criterion's second sentence, one half at a time. `pointerdown` is a
    // real pointer event and a real handler; what it is not is reachable by a
    // keyboard, and nothing but a keyboard route can tell.
    item: 'D2',
    name: 'the activation binds pointerdown, so no keyboard can reach a control',
    file: 'src/ui/dom.ts',
    find: "  node.addEventListener('click', () => {",
    replace: "  node.addEventListener('pointerdown', () => {",
    detectedBy: INPUT_PARITY,
  },
  {
    item: 'D2',
    name: 'the activation binds keydown, so no touch can reach a control',
    file: 'src/ui/dom.ts',
    find: "  node.addEventListener('click', () => {",
    replace: "  node.addEventListener('keydown', () => {",
    detectedBy: INPUT_PARITY,
  },
  {
    // QUALITY-BAR section 3's "kept focusable", and the defect it names by
    // name. A natively disabled button leaves the tab order, so the census
    // finds Silver and Gold unreachable by keyboard on the start screen.
    item: 'D2',
    name: 'a greyed control goes back to the native disabled property',
    file: 'src/ui/dom.ts',
    find: "  setAttribute(node, 'aria-disabled', disabled ? 'true' : null);",
    replace: '  node.disabled = disabled;',
    detectedBy: INPUT_PARITY,
  },
  {
    // The other way a control leaves the tab order, and the one the `BJ-17`
    // review constructed by hand: the control is rendered, is the right size, is
    // pressable at its own centre and takes focus from a script, and no keyboard
    // can reach it. It is here because the census that missed it read keyboard
    // reachability as `focus()` plus an `activeElement` comparison, which
    // `tabindex="-1"` satisfies. The reading is now tab-order membership plus a
    // real `Tab` from the control beside it, and the stray audit no longer
    // short-circuits on the tag before it reads `tabIndex`, so this is required
    // red by two independent assertions in the same file.
    item: 'D2',
    name: 'one action control is taken out of the tab order',
    file: 'src/ui/components/actions.ts',
    find: "      { className: 'bj-button', attributes: { 'data-action': row.action } },",
    replace:
      '      {\n' +
      "        className: 'bj-button',\n" +
      '        attributes:\n' +
      "          row.action === 'double'\n" +
      "            ? { 'data-action': row.action, tabindex: '-1' }\n" +
      "            : { 'data-action': row.action },\n" +
      '      },',
    detectedBy: INPUT_PARITY,
  },
  {
    // The other half of the same change. `aria-disabled` does not stop the
    // platform delivering the press, so the refusal moved into the factory;
    // without it a greyed control fires an intent the chrome already knows the
    // machine will refuse, and the refusal reaches the player as a notice.
    item: 'D4',
    name: 'a greyed control stops refusing the press it is given',
    file: 'src/ui/dom.ts',
    find: '    if (unavailable(node)) {\n      return;\n    }',
    replace: '    void unavailable;',
    detectedBy: KEYBOARD,
  },
  {
    item: 'D4',
    name: 'Tab stops being contained inside an open overlay',
    file: 'src/ui/input.ts',
    find: "    if (event.key === 'Tab') {\n      contain(event);\n    }",
    replace: '    void contain;',
    detectedBy: KEYBOARD,
  },
  {
    item: 'D4',
    name: 'Escape stops closing the overlay it is pressed in',
    file: 'src/ui/input.ts',
    find: '      options.close();\n      return;',
    replace: '      return;',
    detectedBy: KEYBOARD,
  },
  {
    // "Restore it on close", broken the way it would break in practice: focus
    // goes somewhere reasonable rather than nowhere, which is why the spec
    // names the control it has to land on rather than merely requiring focus.
    item: 'D4',
    name: 'closing an overlay drops focus on the anchor instead of the control that opened it',
    file: 'src/ui/input.ts',
    find: '        const back = restoreTo !== null && focusable(restoreTo) ? restoreTo : anchor;',
    replace: '        const back = anchor;',
    detectedBy: KEYBOARD,
  },
  {
    item: 'D4',
    name: 'focus falls to the body when the screen a control was on is replaced',
    file: 'src/ui/input.ts',
    find: '    held = null;\n    anchor.focus();',
    replace: '    held = null;',
    detectedBy: KEYBOARD,
  },
  {
    // The same custodian, reading the authored attribute instead of the rendered
    // box. It answers correctly for all five of SPEC 10's screens, which are
    // toggled with `hidden`, and wrongly for the one control `BJ-16` hides with
    // a stylesheet: the readout disclosure, which a rotation takes away.
    item: 'D4',
    name: 'the focus custodian asks for the hidden attribute rather than a rendered box',
    file: 'src/ui/input.ts',
    find: '  return node.getClientRects().length > 0;',
    replace: "  return node.closest('[hidden]') === null;",
    detectedBy: KEYBOARD,
  },
  {
    item: 'D4',
    name: 'the focus indicator is removed from every button and chip',
    file: 'src/ui/chrome.css',
    find:
      '.bj-button:focus-visible,\n' +
      '.bj-chip:focus-visible {\n' +
      '  outline: var(--focus-ring-width) var(--focus-ring-style) var(--focus-ring-color);',
    replace: '.bj-button:focus-visible,\n.bj-chip:focus-visible {\n  outline: none;',
    detectedBy: KEYBOARD,
  },
  {
    // The contrast half rather than the presence half. The ring is still drawn
    // and still 2 px wide; it is drawn in the elevated surface colour, which is
    // 1.1:1 against the ground on the light theme. Only a measurement of the
    // rendered pixels can tell the difference.
    item: 'D4',
    name: 'the focus ring is spent in a colour that cannot clear 3:1',
    file: 'src/ui/tokens.css',
    find: '  --focus-ring-color: var(--bj-accent);',
    replace: '  --focus-ring-color: var(--bj-elevated);',
    detectedBy: KEYBOARD,
  },
  {
    // "Logical" as a property rather than as an opinion: the top bar keeps its
    // place in the DOM and is laid out last, so the tab order visits it first
    // and the page draws it below everything it precedes.
    item: 'D4',
    name: 'the top bar is laid out after the rows it comes before in the DOM',
    file: 'src/ui/chrome.css',
    find: '.bj-top {\n  display: flex;',
    replace: '.bj-top {\n  order: 2;\n  display: flex;',
    detectedBy: KEYBOARD,
  },
  {
    // D5's vacuity guard. The criterion's second clause is "suppressed only
    // where such a binding is present", and there is no binding, so a
    // suppression planted anywhere has to turn the spec red or the clause is
    // satisfied by a test that cannot see.
    item: 'D5',
    name: 'the context menu is suppressed on the whole document',
    file: 'src/ui/input.ts',
    find: "  document.addEventListener('keydown', onKeyDown);",
    replace:
      "  document.addEventListener('keydown', onKeyDown);\n" +
      "  document.addEventListener('contextmenu', (event) => {\n" +
      '    event.preventDefault();\n' +
      '  });',
    detectedBy: SECONDARY_POINTER,
  },
  {
    // The other half: a secondary binding that really does something. Every
    // control gains a right-press that performs its action, which is the exact
    // shape the criterion's first clause is about.
    item: 'D5',
    name: 'every control gains a secondary-button binding',
    file: 'src/ui/dom.ts',
    find: "  node.addEventListener('click', () => {",
    replace:
      "  node.addEventListener('contextmenu', () => {\n" +
      '    onPress();\n' +
      '  });\n' +
      "  node.addEventListener('click', () => {",
    detectedBy: SECONDARY_POINTER,
  },
  {
    item: 'D6',
    name: 'the play surface takes every gesture away with touch-action none',
    file: 'src/ui/chrome.css',
    find: '.bj-surface {\n  display: block;',
    replace: '.bj-surface {\n  touch-action: none;\n  display: block;',
    detectedBy: GESTURES,
  },
  {
    item: 'D6',
    name: 'the play-surface stage chains its overscroll into the document again',
    file: 'src/ui/chrome.css',
    find: '  overscroll-behavior: contain;',
    replace: '  overscroll-behavior: auto;',
    detectedBy: GESTURES,
  },
  {
    item: 'D6',
    name: 'the chip tray chains its overscroll into the back-navigation swipe',
    file: 'src/ui/chrome.css',
    find: '  overscroll-behavior-x: contain;',
    replace: '  overscroll-behavior-x: auto;',
    detectedBy: GESTURES,
  },
  {
    item: 'D6',
    name: 'the viewport meta caps pinch zoom and disables user scaling',
    file: 'index.html',
    find: '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
    replace:
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, ' +
      'maximum-scale=1, user-scalable=no" />',
    detectedBy: GESTURES,
  },
  {
    // The suppression form rather than the declaration form: `touch-action`
    // stays `auto` and the event is swallowed instead, which no computed style
    // can see.
    //
    // `{ passive: false }` is load bearing, and finding out why was worth the
    // entry on its own: a document-level `touchstart` listener is passive by
    // default on all three engines, so the first version of this mutation
    // called `preventDefault` and the browsers ignored it. The only way to
    // swallow a touch is to ask for the right to, which is what this plants.
    item: 'D6',
    name: 'a touch on the page is swallowed before the browser can act on it',
    file: 'src/ui/input.ts',
    find: "  document.addEventListener('keydown', onKeyDown);",
    replace:
      "  document.addEventListener('keydown', onKeyDown);\n" +
      "  document.addEventListener(\n" +
      "    'touchstart',\n" +
      '    (event) => {\n' +
      '      event.preventDefault();\n' +
      '    },\n' +
      '    { passive: false },\n' +
      '  );',
    detectedBy: GESTURES,
  },
];

/**
 * Mutations that add a file. This is the one that proves the claim in the item
 * itself: not that a fixture is rejected, but that a violating module dropped
 * into the real `src/core/` fails `npm run lint` and therefore the build.
 */
const ADDITIONS = [
  {
    item: 'M3',
    name: 'a Math.random() call is added to the real src/core/',
    file: 'src/core/__mutation__.ts',
    content: 'export const roll = (): number => Math.random();\n',
    detectedBy: LINT,
  },
  {
    item: 'M3',
    name: 'a render/ import is added to the real src/core/',
    file: 'src/core/__mutation__.ts',
    content: "import { drawFelt } from '../render/felt';\nexport { drawFelt };\n",
    detectedBy: LINT,
  },
  {
    item: 'M3',
    name: 'a canvas type is added to the real src/core/',
    file: 'src/core/__mutation__.ts',
    content: 'export function w(c: HTMLCanvasElement): number {\n  return c.width;\n}\n',
    detectedBy: LINT,
  },
  {
    item: 'M3',
    name: 'the violation arrives as .mts rather than .ts',
    file: 'src/core/__mutation__.mts',
    content: 'export const roll = (): number => Math.random();\n',
    detectedBy: LINT,
  },
  {
    item: 'M3',
    name: 'the violation arrives as .tsx rather than .ts',
    file: 'src/core/__mutation__.tsx',
    content: 'export const doc = (): string => document.title;\n',
    detectedBy: LINT,
  },
  {
    item: 'M3',
    name: 'a globalThis escape is added to the real src/core/',
    file: 'src/core/__mutation__.ts',
    content:
      'export const doc = (): unknown => globalThis[String(1) + "document"];\n',
    detectedBy: LINT,
  },
  {
    item: 'E1',
    name: 'a colour literal is added to a component stylesheet',
    file: 'src/ui/__mutation__.css',
    content: '.panel {\n  color: #c0ffee;\n}\n',
    detectedBy: UNIT,
  },
  {
    item: 'E1',
    name: 'a dimension literal is added to a component stylesheet',
    file: 'src/ui/__mutation__.css',
    content: '.panel {\n  margin: 13px;\n}\n',
    detectedBy: UNIT,
  },
  {
    item: 'E1',
    name: 'a colour literal is added to renderer code',
    file: 'src/render/__mutation__.ts',
    content: "export const felt = 'rgba(20, 80, 58, 0.5)';\n",
    detectedBy: UNIT,
  },
  {
    item: 'I3',
    name: 'a bare catch is added to the real src/storage/',
    file: 'src/storage/__mutation__.ts',
    content:
      'export function read(text: string): unknown {\n' +
      '  try {\n' +
      '    return JSON.parse(text);\n' +
      '  } catch {\n' +
      '    return null;\n' +
      '  }\n' +
      '}\n',
    detectedBy: UNIT,
  },
  {
    item: 'I3',
    name: 'a platform storage global is named outside the one seam',
    file: 'src/storage/__mutation__.ts',
    content: 'export const store = (): unknown => window.localStorage;\n',
    detectedBy: UNIT,
  },
  {
    item: 'E3',
    name: 'a second DPR application is added outside the surface wrapper',
    file: 'src/render/__mutation__.ts',
    content: 'export function toDevice(width: number, dpr: number): number {\n  return width * dpr;\n}\n',
    detectedBy: UNIT,
  },

  // ------------------------------------------------------------------
  // BJ-17: the source scans behind item `D1`'s checklist.
  //
  // Every one of these is an addition rather than an edit, because every claim
  // they break is about an **absence**: that no file under `src/` binds a
  // mouse-only or touch-only event, reads a pointer coordinate, captures a
  // pointer, binds a secondary button, takes a gesture away or removes a focus
  // indicator. A scanner that finds nothing is indistinguishable from a scanner
  // that cannot see, so a file carrying each is dropped into the real `src/ui/`
  // and the suite has to go red. It is the treatment `I3`'s two entries already
  // have, applied to six more absences.
  // ------------------------------------------------------------------
  {
    item: 'D1',
    name: 'a mouse-only handler path is added to the real src/ui/',
    file: 'src/ui/__mutation__.ts',
    content:
      'export function bind(node: HTMLElement, press: () => void): void {\n' +
      "  node.addEventListener('mousedown', press);\n" +
      '}\n',
    detectedBy: UNIT,
  },
  {
    item: 'D1',
    name: 'a touch-only handler path is added to the real src/ui/',
    file: 'src/ui/__mutation__.ts',
    content:
      'export function bind(node: HTMLElement, press: () => void): void {\n' +
      "  node.addEventListener('touchstart', press);\n" +
      '}\n',
    detectedBy: UNIT,
  },
  {
    item: 'D1',
    name: 'a forbidden pointer coordinate is read in the real src/ui/',
    file: 'src/ui/__mutation__.ts',
    content: 'export const at = (event: MouseEvent): number => event.offsetX;\n',
    detectedBy: UNIT,
  },
  {
    item: 'D1',
    name: 'a pointer capture is added to the real src/ui/',
    file: 'src/ui/__mutation__.ts',
    content:
      'export function grab(node: HTMLElement, pointer: number): void {\n' +
      '  node.setPointerCapture(pointer);\n' +
      '}\n',
    detectedBy: UNIT,
  },
  {
    item: 'D5',
    name: 'a secondary-button listener is added to the real src/ui/',
    file: 'src/ui/__mutation__.ts',
    content:
      'export function bind(node: HTMLElement, press: () => void): void {\n' +
      "  node.addEventListener('contextmenu', press);\n" +
      '}\n',
    detectedBy: UNIT,
  },
  {
    item: 'D6',
    name: 'a touch-action policy is added to a component stylesheet',
    file: 'src/ui/__mutation__.css',
    content: '.panel {\n  touch-action: none;\n}\n',
    detectedBy: UNIT,
  },
  {
    item: 'D4',
    name: 'a focus indicator is removed in a component stylesheet',
    file: 'src/ui/__mutation__.css',
    content: '.panel:focus-visible {\n  outline: none;\n}\n',
    detectedBy: UNIT,
  },
];

/**
 * The environment every gate below is measured in.
 *
 * A copy of this process's, with the preview server's reuse opt-in removed
 * rather than set to anything: an operator who exports it while iterating on a
 * spec would otherwise hand this harness a server, and a harness whose answer
 * depended on the shell it was started from would be reporting on that shell.
 */
const CHILD_ENV = { ...process.env };
delete CHILD_ENV.BJ_REUSE_SERVER;

/** Run a command and report only whether it succeeded. */
function passes(command) {
  try {
    execFileSync(process.execPath, [command.bin, ...command.argv], {
      cwd: PROJECT_ROOT,
      stdio: 'ignore',
      // Every browser invocation gets its own preview server, and that is a
      // correctness rule rather than hygiene. The server serves `dist/`, and
      // `dist/` is rebuilt by the command that starts it; a run that reused a
      // server left behind by the previous mutation would grade the previous
      // mutation's build and report this one UNDETECTED. `BJ-14` measured
      // exactly that, four times in one run, on a `vite preview` process that
      // outlived the run that spawned it.
      //
      // `playwright.config.ts` now refuses reuse unless it is asked for, so this
      // is belt and braces rather than the mechanism: what it adds is that an
      // operator who has the opt-in exported in their shell still gets a fresh
      // server for every entry in the ledger. A harness whose answer depended on
      // the environment it was started from would be reporting on that
      // environment rather than on the gates.
      env: CHILD_ENV,
    });
    return true;
  } catch (error) {
    // A non-zero exit is the signal this function exists to read. Anything
    // else is a real failure and is rethrown rather than swallowed, because a
    // mutation harness that silently reports "detected" when the command could
    // not even start would be the same defect it is here to prevent.
    if (error instanceof Error && 'status' in error) {
      return false;
    }
    throw error;
  }
}

const results = [];

function record(mutation, detected) {
  results.push({ ...mutation, detected });
  const verdict = detected ? 'detected  ' : 'UNDETECTED';
  console.log(`  ${verdict}  ${mutation.item}  ${mutation.name}`);
}

function runEdit(mutation) {
  const path = join(PROJECT_ROOT, mutation.file);
  const original = readFileSync(path, 'utf8');
  const occurrences = original.split(mutation.find).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `${mutation.file}: the mutation target appears ${String(occurrences)} times, expected exactly 1. ` +
        'The mutation has gone stale and is no longer testing what it claims.',
    );
  }
  try {
    writeFileSync(path, original.replace(mutation.find, mutation.replace));
    record(mutation, !passes(mutation.detectedBy));
  } finally {
    writeFileSync(path, original);
  }
}

function runAddition(mutation) {
  const path = join(PROJECT_ROOT, mutation.file);
  if (existsSync(path)) {
    throw new Error(`${mutation.file} already exists; refusing to overwrite it.`);
  }
  try {
    writeFileSync(path, mutation.content);
    record(mutation, !passes(mutation.detectedBy));
  } finally {
    rmSync(path, { force: true });
  }
}

function main() {
  console.log('Mutation validation for the automated gates built so far.');
  console.log('Each line breaks one thing and requires the named gate to go red.');
  console.log('');

  console.log('Baseline:');
  // Every command any mutation below is measured against, so a gate that is
  // already red cannot be read as a mutation being detected. BJ-15 added the
  // three browser specs to this list for exactly that reason: a stale preview
  // server or a broken build would otherwise report fifteen false detections.
  const commands = [UNIT, LINT, ...new Set(EDITS.concat(ADDITIONS).map((m) => m.detectedBy))];
  let baselineGreen = true;
  for (const command of new Set(commands)) {
    const green = passes(command);
    baselineGreen &&= green;
    console.log(`  ${green ? 'green' : 'RED  '}  ${command.label}`);
  }
  console.log('');
  if (!baselineGreen) {
    console.error('The unmutated tree is not green. Fix that before reading anything below.');
    process.exitCode = 1;
    return;
  }

  console.log('Mutations:');
  for (const mutation of EDITS) {
    runEdit(mutation);
  }
  for (const mutation of ADDITIONS) {
    runAddition(mutation);
  }

  const missed = results.filter((result) => !result.detected);
  console.log('');
  console.log(
    `${String(results.length - missed.length)} of ${String(results.length)} mutations detected.`,
  );
  if (missed.length > 0) {
    console.error('A gate survived its own removal. It is not gating anything.');
    process.exitCode = 1;
  }
}

/**
 * Run only when this file is the program, never on import.
 *
 * The harness edits live source files and restores them in a finally block, so
 * merely importing it must not start it: a module that rewrote `src/core/` as a
 * side effect of being read would leave a half-broken checkout behind any tool
 * that only wanted to look at the list, and the damage would look like someone
 * else's failing test. Node's standard entry-point comparison, on the resolved
 * path so that the argument's spelling does not decide it.
 *
 * The safety net for a run that was interrupted rather than imported is the
 * baseline check above: a leftover mutation makes the unmutated tree red, and
 * the script refuses to report anything at all until that is fixed.
 */
if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  main();
}
