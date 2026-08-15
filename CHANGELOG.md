# Changelog

## 0.4.0 — 2026-08-15

- **新增 AI 生成脚本规则 R12–R17**（调研 GitHub/网页同类插件后沉淀）：R12 `ConvertTo-Json` 缺 `-Depth` 截断（PowerShell #5604 系列）、R13 `foreach` 内误用 `$_`、R14 `if/while` 单等号当比较、R15 PS 7+ 专属语法（`-AsHashtable`/`-Parallel`/`-AsByteStream`/`??`/`?.`）、R16 cmd 风格命令与 `%VAR%` 语法（对照 opencode windows-shell-reliability）、R17 `Write-Host` 输出不进管道；
- 规则 R1–R17：阻断级 R2–R11、R14，其余建议级；自检扩至 51 例全绿，vitest 12 例全绿；
- **调研结论**：dsh 生态（awesome-dsh-plugin 287 插件）与通用 AI agent 生态暂无同类「AI PowerShell 坑位门禁」插件；相邻工具为官方 PSScriptAnalyzer（通用 linter）与 Copilot/harness 通用 hooks；
- **New rules R12–R17 for AI-generated scripts** (from ecosystem research): JSON -Depth truncation, foreach $_ misuse, = vs -eq, PS 7+ only syntax, cmd-style/%VAR% mixing, Write-Host pipeline bypass; selftest now 51 cases.


## 0.3.0 — 2026-08-15

- **发布标准对齐 dsh-tianshu-tui**：scoped 包名 `@chaggle/dsh-powershell-check`、`dsh.bundle.patch` + 自带 `cordis.patch.yml`（`dsh plugin --profile <n> add @chaggle/dsh-powershell-check` 即可安装）、TS 源码 + tsc/tsdown 双阶段构建（lib/ 提交入库，github 安装免重建）、`peerDependencies` 对齐 `@deepseek-ai/*` rc 范围、`NOTICE`/`SOURCE-MAP.md`/`README.i18n.yaml`、vitest 测试、CI（node 22/24 矩阵）、`v<semver>` 标签；
- **中英双语**：规则文本、CLI `--lang en|zh`、插件 `lang` 配置、README.md/README.zh.md 配对、SKILL.md 双语正文；
- **协议 MIT**（用户指定）；
- 规则 R1–R11 不变，自检 31 例全绿，vitest 12 例全绿。
- **Standard-aligned with dsh-tianshu-tui**: scoped package name, `dsh.bundle.patch` + bundled `cordis.patch.yml`, TS source with the tsc+tsdown two-stage build (lib/ committed for github installs), `@deepseek-ai/*` rc peer ranges, `NOTICE`/`SOURCE-MAP.md`/`README.i18n.yaml`, vitest specs, CI matrix, `v<semver>` tags; **bilingual** rule text/CLI/docs; **MIT license**.


## 0.2.0 — 2026-08-15

- **规则同步**：吸收博客沉淀的 R10（npm/npx/pnpm 必须显式带 `.cmd` 后缀，npm.ps1 被 ExecutionPolicy 拦截）与 R11（PowerShell 5.1 无 `&&` / `||` 链式运算符）两条新规则；自检扩至 31 组正反例；
- **技能包布局**：`SKILL.md` 与 `scripts/` 移至仓库根目录，`git clone` 到任意技能根目录（`~/.dsh/skills/` 或 `<项目>/.dsh/skills/`）即装即用；
- **全局启用**：已在 web profile 的 `cordis.patch.yml` 插入插件行并热生效——`tools/pre-execute` 门禁对每次 pwsh 调用自动检查，命中 R2–R11 阻断级坑位直接 deny（deny reason 即修复指引），R1 建议级放行；
- **门禁活体验证**：真实拦截 R2 违规命令并给出修复指引；干净命令与修复后命令正常放行；
- 文档同步（README/SKILL.md 规则范围 R2–R11、31 组自检说明）。

## 0.1.0 — 2026-08-15

- 首个版本：原生 Cordis 插件（`tools/pre-execute` 门禁 + `ctx.skills.registerProvider` bundled 技能），规则 R1–R9 源自博客《PowerShell 实战踩坑大全》；
- 纯 ESM、零运行时依赖、无构建；CLI（`scripts/check-pwsh.mjs`）与门禁共用 `checker.js` 单一规则源；
- 冒烟测试（伪造 ctx 端到端）与 20 组规则自检。