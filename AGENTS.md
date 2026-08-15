# AGENTS.md

Working rules for agents editing this repository.

## Source of truth

- `src/checker.ts` is the single rules engine; the plugin gate and the CLI both use it.
- The rule set mirrors the blog post 《PowerShell 实战踩坑大全》 (source: chaggle/blog, source/_posts/powershell/powershell-pitfalls.md). Rule ids, blog sections, and the SKILL.md tables must stay in one-to-one correspondence.
- New pitfalls: add the rule to `src/checker.ts` RULES (with selftest cases), keep `--selftest` green, then update the blog post and both SKILL.md tables.

## Bilingual parity

- README.md (English) and README.zh.md (Simplified Chinese) carry equal authority; keep them in sync and re-record blob hashes in README.i18n.yaml (`git hash-object README.md README.zh.md`).
- Rule text in checker.ts ships title/fix for both `zh` and `en`; the CLI `--lang` flag and the plugin `lang` config select between them.

## Verification

```sh
npm run typecheck && npm test && npm run build && npm run selftest
```

- `lib/` (bundles + declarations) is tracked on purpose so github: installs do not rebuild inside the harness workspace; never commit `lib/types/**/*.js` intermediates.
- Version bumps go with a `v<semver>` tag.

