/**
 * Mutation validation for every automated gate this project has so far.
 *
 * One entry per gate, added by the part that builds it: `M3` and `A6` at BJ-0,
 * `E1` at BJ-1, `B1` at BJ-2, `B2` and `B3` at BJ-3, `B7` and `B8` at BJ-4,
 * `B13` and `B14` at BJ-5, `J1` and `J2` at BJ-6, `C2` at BJ-7, and `B6`, `B9`,
 * `B10`, `B11` and `B12` at BJ-8.
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
    item: 'B15',
    name: 'the double refuses at exactly the balance it needs',
    file: 'src/core/wallet.ts',
    find: '    if (increment > chips) {',
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
    find: '    if (equal > chips) {',
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
    item: 'C2',
    name: 'the wallet is consulted before the phase is asked',
    file: 'src/core/table.ts',
    find:
      '    if (!LEGAL[phase.kind].includes(intent.kind)) {\n' +
      "      return refused(intent.kind, 'phase', 'wrong-phase');\n" +
      '    }\n' +
      '    return perform(intent);',
    replace:
      '    const result = perform(intent);\n' +
      '    if (!LEGAL[phase.kind].includes(intent.kind)) {\n' +
      "      return refused(intent.kind, 'phase', 'wrong-phase');\n" +
      '    }\n' +
      '    return result;',
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
];

/** Run a command and report only whether it succeeded. */
function passes(command) {
  try {
    execFileSync(process.execPath, [command.bin, ...command.argv], {
      cwd: PROJECT_ROOT,
      stdio: 'ignore',
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
  const unitGreen = passes(UNIT);
  const lintGreen = passes(LINT);
  console.log(`  ${unitGreen ? 'green' : 'RED  '}  ${UNIT.label}`);
  console.log(`  ${lintGreen ? 'green' : 'RED  '}  ${LINT.label}`);
  console.log('');
  if (!unitGreen || !lintGreen) {
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
