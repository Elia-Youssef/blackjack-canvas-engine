# Blackjack

The buildable project. Requirements live one directory up in [SPEC.md](../SPEC.md); this file is only how to
build, run and verify what is here.

**State: parts `BJ-0` through `BJ-12`.** The toolchain, the CI gates, the design tokens, and the whole
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
composition root is a later part. There is still nothing to look at: `src/render/` and `src/ui/` hold
the token layer and nothing else, nothing is drawn, and no core module is wired into the entry point.
See [../../docs/BUILD-PLAN.md](../../docs/BUILD-PLAN.md) for what fills them and in what order.

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
| `npm run test` | Vitest. Includes the boundary fixture assertion, the token layer against its two specs, hand evaluation against an independently written evaluator, the shuffle against a measured uniformity band, the dealer's policy against a hit-soft-17 control that must disagree on exactly the soft 17 hands, the peek result against structural leak assertions on both branches, the settlement ladder against three reordered ladders that must disagree on exactly the equal-naturals, both-bust and surrendered-against-a-natural cases and nowhere else, the tables and betting rules against eleven controls: a threshold-blind and an affordability-blind entry predicate, a lowest-first launch fallback, an unlock read off the current balance and one read off the balance plus what is still committed, a clamping chip tap, an unfloored Max and a Max that forgot the balance, both misreadings of Repeat, and a fabricated step list the conservation checker has to flag, and the phase machine over all 187 intent-and-phase cells against three misread legality tables that must disagree on exactly 170, 4 and 40 of them and a branch that peeks before it offers, which must disagree on exactly the Ace, the full round through the machine with split, double, surrender, insurance and even money each driven and each rejected by layer, the coach table against hand-written reference charts over all 8 rule combinations, 3,040 cells compared, the counters, the eleven milestones and the fifty-round history against double-count and naive-reload traps, and the versioned storage document against 73 corrupt fixtures, a real migration walk, a throwing write and a store that refuses to exist, each booting the game anyway, and the three BJ-12 harnesses: a 50,000-round soak auditing the four-term identity between every two observations with the three-term form failing as its negative control and the rebuild forced and proven to return no in-play card, seeded round transcripts reproduced across runs and across both shoe sizes with a sibling consumer proven unable to shift the deal, and the same seeded rounds transcribed at 15, 30, 60, 144, 240 and 1000 fps against a derived wall-clock schedule that must reject a per-frame stepper, with the sequence and outcomes unchanged on an unstable clock with zero and negative deltas |
| `npm run test:browser` | Playwright on Chromium, Firefox and WebKit against the built `dist/` |
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
    main.ts                  the bootstrap seam, and the one stylesheet import
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
    ui/                      DOM chrome. BJ-15 onward
      tokens.css             the design tokens. Item E1
    storage/                 the saved document and its store. Items I1, I2, I3. Wired at BJ-19
      document.ts            the one namespaced versioned document, exactly SPEC 13's set
      migrations.ts          the version walk: lossless where possible, clean discard where not
      persistence.ts         load, sanitise per field, write: boots the machine from any corruption
      store.ts               the storage probe: localStorage when usable, in-memory when it throws
  tests/
    unit/                    Vitest
      soak.test.ts           the 50,000-round soak against the four-term identity. Items H6, B5
      determinism.test.ts    seeded transcripts across runs and both shoe sizes. Item B16
      frame-independence.test.ts  the same rounds at 15 to 1000 fps on one schedule. Item M5
      reference/             second implementations, written from the spec, never importing src/
      support/               stacked shoes and storage fixtures for the tests that drive them
    browser/                 Playwright
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
