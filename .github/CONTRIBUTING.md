# Contribution rules

Every change reaches `main` through a short-lived branch and a pull request. Direct pushes, force pushes,
merge commits, and red merges are blocked by the repository ruleset.

## Branches

- `bj-<part>-<slug>` for a planned Blackjack build part
- `fix-<slug>` for a defect correction
- `docs-<slug>` for documentation only
- `ci-<slug>` for workflow and repository-policy changes

Human branch names are lowercase and hyphenated. Rebase a branch onto `main`; do not merge `main` into it.

## Commits

Use `<area>: <lowercase imperative summary>`, with `BJ-n`, `fix`, `docs`, `ci`, or `deps` as the area.
Keep the subject at or below 72 characters, add a body explaining why, and include exactly one line in
this form:

```text
Closes: None
```

Replace `None` with comma-separated acceptance item identifiers when the change closes them. Do not add
authorship trailers or provenance statements.

## Pull requests

Keep each pull request single-purpose. Complete the template, resolve every review conversation, and wait
for both required checks to pass. The repository uses squash merging only and deletes the source branch
after merge.

Required checks are:

- `Repository policy`
- `Blackjack gates`

Run the equivalent local gate before pushing:

```bash
npm ci
npx playwright install chromium firefox webkit
npm run verify
```
