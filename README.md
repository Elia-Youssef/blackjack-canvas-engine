# Blackjack

The buildable project. Requirements live one directory up in [SPEC.md](../SPEC.md); this file is only how to
build, run and verify what is here.

**State: parts `BJ-0` through `BJ-15`, with `BJ-14` built last.** The build order puts the DOM shell
before the motion that plays inside it, because the composed page is what motion is graded on.
The toolchain, the CI gates, the design tokens, and the whole
headless game: cards, hand evaluation, the seeded stream, the shoe, the dealer, settlement, the wallet
with the three tables and the betting arithmetic, the phase machine and its type unions, the round itself
with every player action and both side offers behind an availability gate, the house-rule record, the
strategy coach generated from that record and checked cell by cell against committed reference charts,
the session and lifetime statistics with the eleven milestones, the fifty-round hand history with its
per-round journal, and the one versioned browser-storage document the saved figures live in. `BJ-12`
closed the core phase without adding a module: a 50,000-round soak holds the four-term conservation
identity between every two frames with the defensive rebuild never firing, a seeded session replays an
identical transcript across runs and across both shoe sizes with the shoe's split stream proven
load-bearing, and the same seeded rounds transcribe identically from 15 to 1000 frames per second, held
to a derived wall-clock schedule, with the sequence of states and outcomes unchanged on an unstable
clock with zero and negative deltas. A complete round plays out headlessly from the
wager to the payout; the saved document is built and proven but not yet wired to a launch, because the
composition root is a later part. `BJ-13` added the play surface under `src/render/`: the surface
wrapper that owns the device-pixel-ratio backing store and the two ordered passes, the felt baked once
into an offscreen canvas with its rail, grain and printed house rules, cards with rank and suit indices
in both opposing corners and the classic centre pip layouts, and chip stacks in the conventional
denominational colours with a visible offset. Items `E3`, `E4` and `E5` are method D and close at the
demonstration session; what is merged here is the behaviour, its scene hooks in
`tests/browser/support/render-demo.ts`, and the automated armour under all three, at unit level against
a recording context and at browser level against real pixels on all three engines. `BJ-15` made the
game playable in a browser. `src/main.ts` is now the composition root: it builds the machine, the play
surface and the frame loop, and binds them to the DOM chrome under `src/ui/`. Every button, readout,
panel, overlay and label is a real DOM element, the canvas draws the felt, the cards and the chips and
nothing else, and no pointer coordinate is hit-tested against a chrome rectangle anywhere in the
source. The betting controls bind the wallet's rules rather than restating them: a chip whose
denomination alone exceeds `min(table maximum, balance)` renders disabled, a tap that would carry the
wager past that ceiling is rejected with the reason on screen and changes nothing, and Deal below the
table minimum is blocked rather than raised to it. SPEC 11's fourteen readouts sit in a row of their
own that no overlay can reach, SPEC 10's three overlays open over the play surface without pausing the
game, and SPEC 12's round result prints each hand's outcome, the rung that decided it, both hand
values, the chip delta, the insurance result and the coach's verdict. `BJ-14` gave that page its
motion. `src/render/animate.ts` holds every pacing constant in one block, consumed from the machine's
own record rather than restated, and one reduced-motion switch that every tween is written over: cards
travel from the shoe on an eased arc, the hole card flips through zero width, chips slide to the wager
spot and stack, the balance counts rather than snapping, and a winning hand pulses at a rate derived
from the accessibility flash ceiling itself. Under `prefers-reduced-motion` all of it is removed
entirely, including the panel and overlay transitions, while the sequence of states and the outcome are
unchanged; the flag is never seen by anything under `src/core/`. The Speed setting is the first real
control in Settings: Fast multiplies every pacing constant by 0.6, in both motion modes, mid-round
included, and changes no card and no outcome. Its persistence is not built here, and neither is the
reduced-motion setting SPEC 14 lists beside the query: both wait for `BJ-20`. Persistence is still not
wired: nothing imports `src/storage/`, because items `I4` and `I5` grade the reload flows there. See
[../../docs/BUILD-PLAN.md](../../docs/BUILD-PLAN.md) for what fills the rest and in what order.

## Prerequisites

The complete list. There is nothing else, and item `A1` is graded on that being true.

| Prerequisite | Required | Used for |
|---|---|---|
| Node.js | `>=20.19.0`, built and verified on 24.14.1 | Everything below |
| npm | bundled with Node, verified on 11.7.0 | Install from the lockfile |
| Python 3 | any 3.x | The documentation gate only. It has no other dependency and runs without `npm ci` |

No compiler toolchain, no global CLI, no Docker, no service, no account, no API key, no `.env` file, and no
configuration step between cloning and building.

## Build and run

```bash
npm ci
npm run build
```

`dist/` is the whole deliverable: a directory of static files that any static host can serve from any
subdirectory. To look at it without installing anything else:

```bash
python3 -m http.server -d dist 8080
```

For development, `npm run dev` starts Vite with hot reload, and `npm run preview` serves the built `dist/`
on port 4173, which is the same server the browser gate uses.

## Verify

The merge gate, in the order CI runs it. Each one blocks. The two repository-wide gates come first, and
neither needs `npm ci`:

```bash
cd ../.. && python3 docs/verify-docs.py && python3 docs/verify-authorship.py
```

Then this project's gates:

```bash
npm run typecheck && npm run lint && npm run test && npm run test:browser && npm run verify:build
```

`npm run verify` chains `npm run verify:policy`, the repository-record gate that travels inside the
project, ahead of that second block; the two python gates stay workspace-level commands. Once per
machine, the browser gate needs its engines:

```bash
npx playwright install chromium firefox webkit
```

| Command | What it gates |
|---|---|
| `python3 docs/verify-docs.py` | The document set against itself. No dependencies, and it runs before anything is installed |
| `python3 docs/verify-authorship.py` | The repository record. See [../../docs/GITHUB.md](../../docs/GITHUB.md) section 7 |
| `npm run verify:policy` | The same record from inside the project, so CI can enforce it without the workspace documents |
| `npm run typecheck` | `tsc --noEmit`, strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` |
| `npm run lint` | ESLint, including the `core/` boundary and the `Math.random()` ban. Item `M3` |
| `npm run test` | Vitest. Includes the boundary fixture assertion, the token layer against its two specs, hand evaluation against an independently written evaluator, the shuffle against a measured uniformity band, the dealer's policy against a hit-soft-17 control that must disagree on exactly the soft 17 hands, the peek result against structural leak assertions on both branches, the settlement ladder against three reordered ladders that must disagree on exactly the equal-naturals, both-bust and surrendered-against-a-natural cases and nowhere else, the tables and betting rules against eleven controls: a threshold-blind and an affordability-blind entry predicate, a lowest-first launch fallback, an unlock read off the current balance and one read off the balance plus what is still committed, a clamping chip tap, an unfloored Max and a Max that forgot the balance, both misreadings of Repeat, and a fabricated step list the conservation checker has to flag, and the phase machine over all 187 intent-and-phase cells against three misread legality tables that must disagree on exactly 170, 4 and 40 of them and a branch that peeks before it offers, which must disagree on exactly the Ace, the full round through the machine with split, double, surrender, insurance and even money each driven and each rejected by layer, the coach table against hand-written reference charts over all 8 rule combinations, 3,040 cells compared, the counters, the eleven milestones and the fifty-round history against double-count and naive-reload traps, and the versioned storage document against 73 corrupt fixtures, a real migration walk, a throwing write and a store that refuses to exist, each booting the game anyway, and the three BJ-12 harnesses: a 50,000-round soak auditing the four-term identity between every two observations with the three-term form failing as its negative control and the rebuild forced and proven to return no in-play card, seeded round transcripts reproduced across runs and across both shoe sizes with a sibling consumer proven unable to shift the deal, and the same seeded rounds transcribed at 15, 30, 60, 144, 240 and 1000 fps against a derived wall-clock schedule that must reject a per-frame stepper, with the sequence and outcomes unchanged on an unstable clock with zero and negative deltas, and the BJ-13 render armour against a recording context: the pip layout table held to core's pip values with every layout symmetric under a half turn except the 7, both corner indices with the far one rotated, the face-down card proven to draw nothing it knows, the wager decomposition checked against an independent minimiser, the stack offset and per-denomination fills, the felt's four printed lines per table with the bake deterministic to the instruction and the per-frame path a single blit, the DPR backing store with fractional ratios, the two-pass frame order with explicit state at each pass top, and a directory scan keeping DPR arithmetic, clocks and randomness out of every render module but the surface wrapper |
| `npm run test:browser` | Playwright on Chromium, Firefox and WebKit against the built `dist/`. From BJ-13 it also rasterises the play surface for real: the test-time harness bundle draws the three demonstration scenes on a page canvas and the suite reads pixels back, holding the felt, rail and print to their tokens, the card margin to a measured 3:1 against all three felts, every denomination of the 680 wager visible in one stack, the backing store to integer and fractional device pixel ratios, and the felt bake byte-identical across two runs on each engine. From BJ-15 it also drives the shipped chrome: the Bronze betting screen through its own controls with nothing injected, and, through a test-time harness that never ships, a table SPEC 6 has not unlocked and a known deal, so the ceiling, the disabled chip, the floored Max, the blocked Deal and the four-term identity are all measured, every one of SPEC 11's fourteen readouts is required to have a rendered box that no open overlay intersects, and SPEC 12's round result is checked field by field against the round that actually happened . From BJ-14 it also grades the motion: one seeded round is driven under prefers-reduced-motion and again without it, every frame of both sampled, with no tween in flight and no lagging balance under the flag and both present without it, the overlay, panel and button durations read from the shipped stylesheet in each mode, and the screen sequence and round result required identical; the Speed setting is pressed through the Settings panel and the whole pacing table required to be its Normal table times 0.6 in both motion modes, with a real phase timed on the wall clock in the shipped page and a mid-round switch measured inside one round; and both arms of the peek are dealt through the demonstration hook and timed to the same constant |
| `npm run verify:build` | Two builds, hashed and compared. Item `A6`. Writes `artifacts/reports/build.md` |
| `npm run verify:mutations` | Not a gate. Breaks every gate above, one mutation per property it protects, and requires each break to be caught |

## The core/ boundary

Nothing under `src/core/` may import `render/`, `ui/` or `@js-games/engine/render`, touch a DOM, BOM or
canvas global in a value or a type position, or call `Math.random()`. This is item `M3`, severity Critical,
and it is what makes most of the acceptance sheet automatable rather than merely observable.

It is enforced by [tools/eslint-plugin-core-boundary](tools/eslint-plugin-core-boundary/README.md), wired up
in [eslint.config.js](eslint.config.js), and proved against a deliberately violating fixture in
`tests/lint/fixtures/core/` by `tests/unit/core-boundary.test.ts`. Inside `core/` the rule cannot be
switched off with an `eslint-disable` comment.

## Second implementations, in `tests/unit/reference/`

Some rules are cheap to state and easy to misread, and a test that encodes the same misreading as the code
agrees with it forever. Where that risk is real, the expected values come from a second implementation
written from [../SPEC.md](../SPEC.md) alone, living under `tests/unit/reference/` and importing nothing
from `src/`.

The first of them is `hand-evaluator.ts`, behind item `B1`. It searches every reading of the Aces in a hand,
where `src/core/hand.ts` uses the add-10-once shortcut SPEC 4.2 states; `tests/unit/hand-value.test.ts` runs
the two against each other over every ordered hand of up to five cards and well past that. See
[src/core/README.md](src/core/README.md) for the argument in full.

The second is `basic-strategy-charts.ts`, behind item `J3`: the committed reference charts, written by
hand against published basic strategy rather than derived from the generator, which
`tests/unit/strategy-coach.test.ts` compares cell by cell with the table the coach generates from the
house-rule record, across all 8 rule combinations.

## Design tokens

Every colour, size, spacing, radius and duration resolves through a token, and no component may carry a
literal value. This is item `E1`.

| File | What it is |
|---|---|
| [src/ui/tokens.css](src/ui/tokens.css) | The custom properties the chrome reads. Imported once, at the composition root |
| [src/render/tokens.ts](src/render/tokens.ts) | The same tokens as values, because a canvas context cannot take a `var()` |

**Neither file is a source of truth.** [../../docs/QUALITY-BAR.md](../../docs/QUALITY-BAR.md) section 15 is
the source for every number and [../SPEC.md](../SPEC.md) section 16 for every colour.
`tests/unit/tokens.test.ts` parses all four and fails if any two disagree, and it re-derives all 35
committed contrast ratios from the hexes themselves. Editing a colour to make something look better is a
test failure rather than a silent regression in `G2` and `E4`.

The record lives under `render/` so that the `core/` boundary rule already forbids the rules and the
simulation from reaching a presentation value. No second rule was needed.

## Layout

```
BlackJack/BlackJack/
  index.html                 the single page
  vite.config.ts             static output, relative base, no sourcemaps
  eslint.config.js           lint, and the home of the core/ gate
  tsconfig.json              strict, plus the checks strict does not turn on
  vitest.config.ts
  playwright.config.ts       Chromium, Firefox, WebKit, over the built dist/
  src/
    main.ts                  the composition root: machine, play surface, loop and chrome
    core/                    rules and simulation. Zero renderer, zero DOM. BJ-2 onward
      cards.ts               Rank, Suit, Card, the card factory, and rank values
      hand.ts                value, soft or hard, bust, natural, the pair test. Item B1
      rng.ts                 the seeded stream: nextFloat, nextInt, shuffle, split
      shoe.ts                composition, shuffle, cut card, defensive rebuild. Items B2, B3
      dealer.ts              the S17 policy, and the peek and its one-bit result. Items B7, B8
      settlement.ts          the nine-rung ladder, and the insurance net. Items B13, B14
      wallet.ts              chips, wagers, the three tables and betting. Items J1, J2
      types.ts               the Phase, Intent and hand unions of DESIGN 2. Item C2
      table.ts               the eleven phases, apply(intent), the queue, timers and journal. Item C2
      rules.ts               the house-rule record: decks, DAS, surrender, even money, split compare
      strategy.ts            the coach table generated from the rules record. Item J3
      statistics.ts          session and lifetime counters, and the eleven milestones. Item J6
      history.ts             the fifty-round hand history, read from the round journal. Item J5
    render/                  canvas play surface. BJ-13 onward
      tokens.ts              the renderer token record. Item E1
      animate.ts             the tween set, the pacing block, one reduced-motion switch. E6, E7, E9
      surface.ts             context, the one DPR backing store, the two ordered passes
      felt.ts                table ground, rail, grain, insurance divider, printed rules. Item E5
      card.ts                face, back, corner indices, centre pip layouts. Item E3
      chips.ts               denominations, wager decomposition, stacks. Item E4
      scene.ts               the arrangement, and the frame-to-frame state the tweens need
    ui/                      DOM chrome. BJ-15 onward
      tokens.css             the design tokens. Item E1
      chrome.css             the shell, the controls and the overlays, all through tokens
      dom.ts                 the element factory every component builds from. Item M1
      format.ts              Intl with an explicit locale list, per QUALITY-BAR 11
      text.ts                every sentence the chrome shows, including the refusal reasons
      state.ts               what the sync step is given, and what a control may ask for
      layout.ts              the three-row shell. The overlay row is what keeps C5 true
      loop.ts                the frame loop: timestamps in, one delta per frame out
      motion.ts              the one place the platform is asked for prefers-reduced-motion. Item E7
      chrome.ts              the DOM sync step of DESIGN 3, and where components are mounted
      components/            readouts, betting, actions, screens, round result, overlays
    storage/                 the saved document and its store. Items I1, I2, I3. Wired at BJ-20
      document.ts            the one namespaced versioned document, exactly SPEC 13's set
      migrations.ts          the version walk: lossless where possible, clean discard where not
      persistence.ts         load, sanitise per field, write: boots the machine from any corruption
      store.ts               the storage probe: localStorage when usable, in-memory when it throws
  tests/
    unit/                    Vitest
      soak.test.ts           the 50,000-round soak against the four-term identity. Items H6, B5
      determinism.test.ts    seeded transcripts across runs and both shoe sizes. Item B16
      frame-independence.test.ts  the same rounds at 15 to 1000 fps on one schedule. Item M5
      render-card.test.ts    E3 armour: layouts, corners, inks, the concealed back
      render-chips.test.ts   E4 armour: decomposition, offset, fills, the value glyph
      render-felt.test.ts    E5 armour: the printed lines, rail, grain, the one-blit frame
      render-surface.test.ts the DPR store, the pass order, the render directory scans
      motion.test.ts         the tween shapes, the Speed multiplier on the machine, the flash ceiling
      reference/             second implementations, written from the spec, never importing src/
      support/               stacked shoes, storage fixtures, and the recording canvas context
    browser/                 Playwright
      render-surface.spec.ts E3, E4 and E5 as rendered pixels, on all three engines
      betting.spec.ts        B15: the ceiling, the disabled chip, Max, Repeat, Deal, the identity
      overlays.spec.ts       C5: overlays measured clear of every readout, and state unchanged
      round-result.spec.ts   C8: outcome, reason, both values, delta, insurance, coach, balance
      reduced-motion.spec.ts E7: every animation removed, sequence and outcome identical
      speed-setting.spec.ts  E9: every pacing constant times 0.6, in both motion modes
      motion-demo.spec.ts    E6 armour: both arms of the peek, timed and compared
      support/render-demo.ts the demonstration scenes, bundled at test time, never shipped
      support/motion-demo.ts the E6 capture hook: the real game at a chosen seed, never shipped
    lint/fixtures/           the deliberately violating fixture, and its controls
  tools/
    eslint-plugin-core-boundary/
  scripts/
    build-fingerprint.mjs    hashing and comparison, pure, unit tested
    check-determinism.mjs    two builds, compared. Item A6
    check-repository-record.mjs  the repository record, run by CI from inside the project
    mutation-check.mjs       proves the gates above can fail
  packages/
    engine/                  extracted from this game at ENG-1. Deliberately empty
```

Three evidence artifacts are written outside this directory, to the repository root, because
[../ACCEPTANCE.md](../ACCEPTANCE.md) section 5 is where the evidence index lives and it puts them there:
`artifacts/reports/build.md`, `docs/review-checklists/build.md` and `docs/review-checklists/tokens.md`.
