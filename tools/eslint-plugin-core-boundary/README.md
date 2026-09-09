# eslint-plugin-core-boundary

The Blackjack architecture boundary, made enforceable. It is graded as item `M3`, severity Critical.

Nothing under a `core/` directory may:

1. import `render/`, `ui/` or the shared engine's renderer;
2. touch a DOM, BOM or canvas global, in a value or a type position;
3. call `Math.random()`.

## Rules

| Rule | Rejects |
|---|---|
| `no-forbidden-imports` | Any specifier with a `render` or `ui` path segment, and anything under `@js-games/engine/render`. Covers `import`, `export ... from`, dynamic `import()`, `require()`, `import x = require()` and `import('...')` in a type position. Specifiers written as **template literals with no expression** count, because every bundler resolves them statically. A **dynamic** specifier the rule cannot read, an interpolated template or a concatenation inside `import()` or `require()`, is refused outright rather than passed: there is no layer to classify, and Vite resolves the interpolated form and emits the chunk |
| `no-dom` | Any DOM, BOM or canvas global, by scope analysis. Covers value positions, type positions, `globalThis.x`, `self.x`, and a `/// <reference lib="dom" />` comment. **`globalThis` and `self` are refused outright**, whatever the property |
| `no-math-random` | `Math.random()`, `Math['random']()`, `const { random } = Math`, and **any capture of `Math` itself**: `const m = Math`, `f(Math)`, `Math[key]` |

**`no-forbidden-imports` reads one hop.** It judges the specifier written in the file it is given, not what
that module imports in turn, so a permitted import that itself re-exports from `render/` or `ui/` reaches
across the boundary without a report. No core module imports outside `core/` today, and the closure is
held by the module-graph walk in `tests/unit/core-boundary.test.ts`: a graph question rather than a lint
one.

Two of those refusals are broader than they first look, and both are deliberate.

**A dynamic specifier the rule cannot read is refused, not passed.** It is the same argument as the two
below: a gate that cannot classify what an import reaches has not checked it, and `import(`../${x}audio`)`
is a form a bundler really does resolve. Only the dynamic forms are refused this way. Every static form
carries a string literal by grammar, so an unreadable one there means the parser put the specifier
somewhere the rule did not look, which is a reason to keep reading rather than to report the file.

**`globalThis` and `self` are banned outright inside `core/`, not filtered by property.** A property-level
check cannot read `globalThis['doc' + 'ument']` or `Reflect.get(globalThis, 'document')`, so no list of
banned names closes that route. Banning the vehicle does. Nothing in a game core has a legitimate reason to
reach for either.

**Capturing `Math` is an error, not just calling `Math.random`.** `const m = Math; m.random()` puts the call
one hop beyond a rule that looks one hop. `Math.floor(x)` and `const { floor, min } = Math` are both still
fine, because a statically named member cannot hide `random`; `Math[key]` is not, because it can.

The DOM ban is a **denylist over `lib.dom.d.ts`, and is not exhaustive by construction**. That is stated in
`banned-globals.js` rather than implied. The outright `globalThis` ban and the inline-disable ban are the
two guards that do not depend on the list being complete.

Each rule takes `{ boundaryDir, allow }`. `boundaryDir` defaults to `core`. `allow` exists so that a future
part can justify one specific exception in the config, where it is reviewable, rather than switching a rule
off or disabling it inline.

## Three decisions that are load-bearing

**The rules decide for themselves whether a file is inside the boundary**, by looking for a `core` path
segment, instead of trusting a `files:` glob in the flat config. A glob is one edit away from silently
unscoping the whole gate, and a gate that has stopped applying looks exactly like a gate that passes. The
config still narrows the glob; the rules do not depend on it. `tests/lint/fixtures/outside/uses-dom.ts` is
the control: the same offences outside `core/` must be reported clean, because `render/` and `ui/` are
allowed to import each other and to touch the DOM.

**Globals are found by scope analysis, not by text.** A reference is reported only when it resolves to
nothing, or to a global with no definition anywhere in the program. A core module that declares or imports
its own `Event`, `Node` or `Image` type is left alone, and so is a parameter named `window`. An earlier
project verified the equivalent property by grep; `tests/lint/fixtures/core/clean.ts` is the file that shows
why that was not good enough.

**Inside `core/` the rule cannot be switched off inline.** `eslint.config.js` sets `noInlineConfig` for
`core/`, so an `eslint-disable-next-line` comment naming one of these rules has no effect. The Critical
architecture rule of the project should not be removable for a line, by anyone, with no review signal.

## Proving it can fail

A lint rule that cannot fail is not a gate.

- `tests/lint/fixtures/core/violations.ts` violates every branch of every rule. Each line carries an
  `@expect` marker naming the rule that must report on it.
- `tests/unit/core-boundary.test.ts` resolves `eslint.config.js` the way the command line does and asserts
  the match **in both directions**: every marked line is reported, and every reported line is marked. A
  fixture that drifts into proving something else fails the test.
- `npm run verify:mutations` breaks this gate one mutation per escape route and requires every break to be
  caught, including dropping a `Math.random()` call, a `render/` import and a canvas type into the real
  `src/core/` and requiring `npm run lint` to go red.
