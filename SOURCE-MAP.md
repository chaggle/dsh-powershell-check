# dsh-powershell-check source map

This package is an original work: every file in `src/` is `new` — there is no
upstream port and therefore no per-file mapping. The rule set derives from the
blog post [PowerShell 实战踩坑大全](https://chaggle.github.io/blog/2026/08/14/powershell-pitfalls/)
and from the DeepSeek Harness extension-point documentation (`tools/pre-execute`,
`ctx.skills.registerProvider`), both cited in NOTICE.

| Target (this package) | Upstream | Status |
| --- | --- | --- |
| src/index.ts | — | new |
| src/checker.ts | — | new |
| src/invariant.ts | — | new |
| scripts/check-pwsh.mjs | — | new |
| tests/*.spec.ts | — | new |

本包为原创作品：`src/` 下所有文件均为 `new`（无上游移植，故无逐文件映射）。
规则集源自博客文章《PowerShell 实战踩坑大全》与 DeepSeek Harness 官方扩展点文档
（`tools/pre-execute`、`ctx.skills.registerProvider`），出处见 NOTICE。

