# DEVELOPING.md

## Layout

```text
src/index.ts          # cordis plugin: tools/pre-execute gate + skill provider
src/checker.ts        # rules engine (R1-R23, bilingual), shared by gate and CLI
src/pssa.ts           # optional PSScriptAnalyzer deep check through ctx.shell
src/invariant.ts      # config normalization
scripts/check-pwsh.mjs# CLI wrapper around the built lib/checker.js
tests/                # vitest specs (rules battery, pssa, fake-ctx gate, real-composition load)
cordis.patch.yml      # dsh.bundle patch: inserts the plugin row
SKILL.md              # bundled skill body (bilingual)
```

## Commands

```sh
npm ci                # install dev deps (typescript, tsdown, vitest, @deepseek-ai peers)
npm run typecheck     # tsc --noEmit
npm test              # vitest run (tests/**/*.spec.ts)
npm run build         # tsc -p tsconfig.build.json && tsdown (emits lib/)
npm run selftest      # node scripts/check-pwsh.mjs --selftest (needs build)
npm run verify        # the full chain above
```

## Build notes

- Two-stage build mirrors the official package standard: tsc emits declarations and
  JS intermediates into lib/types/, tsdown bundles each entry into lib/*.js with
  peers externalized. `lib/types/**/*.js` is gitignored; lib/index.js,
  lib/checker.js, lib/invariant.js and lib/types/**/*.d.ts are tracked.
- The plugin reads ./SKILL.md relative to import.meta.url; the same relative path
  works from src/ and from built lib/ (../SKILL.md).

## Gate behavior

`mode: deny` (default) returns `{ kind: deny, reason }` from tools/pre-execute for
pwsh calls with blocking violations; `mode: warn` logs via ctx.logger and allows.
`lang` selects the reason language (zh default, en available).

