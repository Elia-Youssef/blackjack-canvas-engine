# @js-games/engine

Deliberately empty.

Blackjack is built first and whole, and this package is **extracted from what Blackjack actually needed**
at part `ENG-1`, not designed up front. The predicted modules (`loop`, `render`, `input`, `layout`,
`storage`, `audio`, `a11y`, `format`, `tokens`, `rng`) are a plan, not an API.

What exists here today is the package boundary and one subpath, `@js-games/engine/render`, which the
`core/` boundary lint rule names as forbidden. The rule has to be able to name the renderer before the
renderer exists, or the first import of it would land unlinted.

Do not add speculative modules here. Extraction remains scheduled for parts `ENG-1` and `ENG-2`.
