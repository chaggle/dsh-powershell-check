# Changelog

## 0.6.1 — 2026-10-25

- **适配 dsh 0.2.1-rc.3**（npm `next` 通道，与 deepseek-harness master 同版本）：
  - `peerDependencies` / `devDependencies` 中的 `@deepseek-ai/dsh-{shell,skill,tools}` 对齐 `^0.2.1-rc.3`，`@deepseek-ai/cordis` 对齐 `^4.0.5`；旧范围 `^0.2.0-rc.2` 不覆盖 0.2.1 的预发布版本，兼容性预检会拒绝该插件行；
  - 新增 `engines.dsh: ">=0.2.1-rc.3 <0.3.0"`：自 dsh 0.2.1-alpha.3 起，兼容性预检**优先读 `engines.dsh`**（声明了它就不再读 DSH peer 范围），显式写明支持的运行时区间；
  - 复核插件消费的扩展点，0.2.0-rc.2 → 0.2.1-rc.3 无破坏性变更：`tools/pre-execute` 瀑布仍是 `(exec, next) => PreToolDecision`、`ctx.skills.registerProvider(control => provider)`、`ctx.shell.resolve/execute` 与 `execution.result()` 均未变；
  - 新增真实组合加载测试 `tests/plugin-load.spec.ts`：在真实 Cordis 上下文里挂载真实 `@deepseek-ai/dsh-skill` 注册表，验证技能注册与正文加载、`tools/pre-execute` 的拒绝/放行、以及插件 fiber 释放后 provider 撤销；
  - 重建 `lib/`（rolldown 区域注释格式更新，无行为变更）；typecheck / vitest（27 例）/ build / selftest（77 例）全绿；
- **dsh 0.2.1-rc.3 compatibility**: DSH peers realigned to `^0.2.1-rc.3` and `@deepseek-ai/cordis` to `^4.0.5` (the old `^0.2.0-rc.2` range excludes 0.2.1 prereleases, so the compatibility preflight would reject the row); `engines.dsh: ">=0.2.1-rc.3 <0.3.0"` added because dsh 0.2.1-alpha.3+ reads `engines.dsh` first and ignores DSH peer ranges once it is declared. The consumed extension points were re-checked against the new source: `tools/pre-execute` (`(exec, next) => PreToolDecision`), `ctx.skills.registerProvider(control => provider)`, and `ctx.shell.resolve/execute` + `execution.result()` are unchanged. New real-composition test mounts the plugin beside the real skill registry and covers skill registration, deny/allow, and provider withdrawal on fiber disposal. `lib/` rebuilt; typecheck, vitest, build, and selftest are green.

## 0.6.0 — 2026-10-17

- **新增 R20–R23**（源自一次真实仓库维护会话：GitHub API 批量操作 + 依赖升级 + 分支合并）：
  - **R20（阻断）Invoke-RestMethod / Invoke-WebRequest 用字符串 `-Body` 发非 ASCII**：PS 5.1 按默认代码页把字符串编成字节，中文到服务端变成 `?`（静默数据损坏）；改为 `-Body ([System.Text.Encoding]::UTF8.GetBytes($json))`。实测把 GitHub 告警驳回说明写成 `???????`，只能先 reopen 再以 UTF-8 字节重发。
  - **R21（建议）`ConvertFrom-Json` 解析 package-lock.json 抛 name 无效**：lockfile v3 的 `packages[""]` 是空属性名，PS 5.1 无法把空键转成对象（`Cannot process argument because the value of argument name is not valid`）；仅大小写不同的重复键是另一条 duplicated keys 报错。这类文件改用 node 解析。
  - **R22（建议）管道喂原生程序 stdin 会丢空行**：`@('protocol=https','host=github.com','') | git credential fill` 报 "refusing to work with credential missing protocol field"；改用 `cmd /c "... < in.txt > out.txt"` 文件重定向。
  - **R23（建议）原生命令的 `2>&1` 把 stderr 变成 ErrorRecord**：输出里出现 `NativeCommandError` 包裹，`$ErrorActionPreference='Stop'` 下直接终止；只看 stdout 用 `2>$null`，要合并则先设 Continue 再转字符串。
- **修复 R10 误报**：R10 原先对整段命令原文匹配，字符串里出现的 `npm`/`npx`/`pnpm` 也被拦截（`Write-Output '--- npm audit summary ---'`、`git commit -m 'chore: pnpm ...'` 各被误 deny 一次）。新增 `maskStrings()`，R5/R10/R16/R17 只在字符串之外匹配，并补了对应正反例。
- `--selftest` 60 → 77 组；vitest 24 个用例、typecheck、build 全绿。
- **New R20–R23 + R10 false-positive fix** (from a real repo-maintenance session: GitHub API batch operations, dependency upgrade, branch merge). PS 5.1 encodes a string HTTP body with the default code page (Chinese arrives as `?`), `ConvertFrom-Json` chokes on package-lock.json's empty root key, PowerShell pipelines corrupt native stdin line protocols, and `2>&1` wraps native stderr in ErrorRecords. R10 no longer flags npm/npx/pnpm words quoted inside strings (`maskStrings()`); selftest 60 → 77 cases.

## 0.5.3 — 2026-09-29

- **适配 dsh 0.2.0-rc.2**：`ctx.shell` 的执行入口由 `run(spec)` 收敛为 `execute(spec)` + `execution.result()`，PSScriptAnalyzer 深度检查路径同步更新——0.1.7 起 `run` 已不存在，该路径抛错后被 catch 静默降级为内置规则；
- `peerDependencies` / `devDependencies` 中的 `@deepseek-ai/dsh-{shell,skill,tools}` 对齐 `^0.2.0-rc.2`，dsh 启动时的兼容性预检不再拒绝该插件行（原 `^0.1.0-rc.6` 不覆盖 0.2.0-rc.2）；
- typecheck / vitest / build / selftest 全绿。
- **dsh 0.2.0-rc.2 compatibility**: the `ctx.shell` entry converged from `run(spec)` to `execute(spec)` + `execution.result()`, and the PSScriptAnalyzer deep-check path follows it — on 0.1.7+ `run` no longer existed, so that path threw and was caught into a silent degrade to the builtin rules. Peer ranges realigned to `^0.2.0-rc.2` so the dsh compatibility preflight admits the plugin row.

## 0.5.2 — 2026-08-24

- **新增 R18 / R19**（博客文章新增 2-5、5-3 两节，源自 Frosti 迁移实战）：
  - R18 `.ps1 文件编码`：PS 5.1 把无 BOM 的 UTF-8 .ps1 按 ANSI(GBK) 解析，中文变乱码、引号失衡直接 ParserError（本次 deploy-blog.ps1 实战翻车点）；检测输入文本中的 UTF-8→GBK 乱码特征字符（含 `锟斤拷`、U+FFFD）；
  - R19 `Remove-Item 对象解析`：PS 5.1 把位置参数传入的文件系统对象经 ToString() 转成 -Path，DirectoryInfo 只返回目录名、相对当前目录解析 → `Cannot find path '<cwd>\<name>'`；修复 `-Path $items.FullName` 或管道；
  - 两条均为建议级（advisory）；selftest 60 例全绿、vitest 24 例全绿；README/SKILL 双语规则表与章节引用同步（R18→§2-5、R19→§5-3）；
- **New rules R18/R19** from Frosti migration battle reports: BOM-less UTF-8 .ps1 misdecoded as ANSI/GBK on PS 5.1 (ParserError from unbalanced quotes), and Remove-Item resolving positional FileSystemInfo objects against the CWD; selftest now 60 cases, all green.

## 0.5.1 — 2026-08-15

- **博客文章重组**：18 个坑位按主题重排为五组（① 语法与解析 ② 字符串/转义/输出 ③ 外部命令与进程 ④ Windows 组件与 DISM ⑤ 数据与迭代），小节编号 x-y 并标注 R 编号，文末新增规则总表；
- **全链路章节引用同步**：checker.ts、SKILL.md（EN/ZH）、README（EN/ZH）、博客技能脚本与 SKILL.md 的"博客章节"列统一为 §x-y（R1→§2-3、R2→§1-1 … R17→§2-4）；
- 规则与行为不变：selftest 51 例、vitest 24 例全绿。
- **Blog article reorganized**: 18 pitfalls regrouped into five themes with x-y section ids and an R-number map; all section references synced across checker.ts, SKILL.md, README, and the blog skill (R1→§2-3 … R17→§2-4).


## 0.5.0 — 2026-08-15

- **PSScriptAnalyzer 深度检查**：新增 `analyzer: psscriptanalyzer` 配置——经官方 `ctx.shell` seam（hooks 桥同款）对每条 pwsh 命令跑 `Invoke-ScriptAnalyzer`（临时 .ps1 + BOM，进程级 ExecutionPolicy Bypass 兼容 harness 沙箱）；Error/ParseError 拦截并附分析器消息，Warning 记日志放行；模块缺失自动降级内置规则；
- **实测适配**（PowerShell 5.1 + PSSA 1.25.0）：Severity 序列化为数字枚举（0/1/2/3），解析器两种形态兼容；PSSA 不报 `&&`/`||`（内置 R11 兜底）；
- 新增 `@deepseek-ai/dsh-shell` peer/dev 依赖；vitest 24 例（新增 pssa.spec 11 例）、selftest 51 例全绿；
- **PSScriptAnalyzer deep check**: optional `analyzer: psscriptanalyzer` gate pass through `ctx.shell`; Error/ParseError deny, warnings log, missing-module degrade; verified on PS 5.1 + PSSA 1.25 (numeric severity enum handled).


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