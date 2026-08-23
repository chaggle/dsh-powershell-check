---
name: powershell-check
description: Use before executing any PowerShell command or script - pwsh tool calls, generated .ps1 files, or PowerShell embedded in templates - to statically check it against the documented PowerShell pitfalls from the blog post "PowerShell 实战踩坑大全" and fix every flagged violation first.
whenToUse: Whenever PowerShell execution is involved - calling the pwsh tool (foreground or background), writing or generating a .ps1 file, or embedding PowerShell in a script or template string.
---

# PowerShell Execution Check (powershell-check)

## English

This skill is provided by the **@chaggle/dsh-powershell-check** plugin (native Cordis plugin + bundled skill provider). Once the plugin is mounted, **every pwsh tool call automatically passes the `tools/pre-execute` gate**: blocking violations (R2–R11) are denied with a fix-guidance reason; the advisory R1 passes. Use this skill outside the gate: when generating .ps1 files, embedding PowerShell in templates, checking script files, or looking up rules and fixes.

### Running the checker (manual)

The checker lives at scripts/check-pwsh.mjs in this skill directory (resourceBase). Three forms:

```text
# 1) Check a command string
node "<resourceBase>/scripts/check-pwsh.mjs" -- "<command>" [--lang en]

# 2) Check a .ps1 file (stdin mode)
Get-Content fix.ps1 -Raw | node "<resourceBase>/scripts/check-pwsh.mjs" - [--lang en]

# 3) Plugin self-test (run after every rule change)
node "<resourceBase>/scripts/check-pwsh.mjs" --selftest
```

Exit codes: 0 = PASS; 1 = FAIL (list with fixes); 2 = usage error / empty input.

### Rules (R1–R19, mapped to the blog sections)

| Rule | Level | Detects | Fix | Blog |
| --- | --- | --- | --- | --- |
| R1 | advisory | wsl/Windows feature queries without chcp 65001 | prefix `chcp 65001 | Out-Null` before Chinese output | 2-3. GBK mojibake |
| R2 | blocking | `$var:` followed by a colon (non-scope name) | use `${var}:`; `$env:` style scopes are exempt | 1-1. $var: parsing |
| R3 | blocking | `) ? ...` ternary shape | PS 5.1 has no ternary; use if/else assignment | 1-2. Ternary |
| R4 | blocking | `$WORD` followed by `.` or `` inside double quotes | use single quotes when `$` must stay literal | 2-1. $WINDOWS |
| R5 | blocking | Start-Process wrapping an external command | call `& exe` directly; watch -ArgumentList quoting | 3-1. Start-Process |
| R6 | blocking | `-FeatureName A, B` array form | loop with foreach, one name at a time | 4-1. FeatureName arrays |
| R7 | blocking | `/Dismount-Image` verb | use `/Unmount-Image` | 4-2. DISM verbs |
| R8 | blocking | RestoreHealth with /Source | source must be <= current build, or Windows Update | 4-3. Source version |
| R9 | blocking | curl -L combined with -C - | parallel `-r` ranges are faster | 3-4. CDN download |
| R10 | blocking | bare npm/npx/pnpm without the .cmd suffix | use npm.cmd / npx.cmd / pnpm.cmd explicitly | 3-2. ExecutionPolicy |
| R11 | blocking | `&&` / `||` chains (PS 5.1) | use `;`, `if ($LASTEXITCODE -eq 0)`, or separate lines | 1-3. Chain operators |
| R12 | advisory | ConvertTo-Json without -Depth (default 2 truncates nested data) | add `-Depth 100` (or a value matching the data) | 5-1. JSON depth |
| R13 | advisory | `$_` inside a foreach ($x in ...) loop | use the loop variable, or switch to ForEach-Object | 5-2. foreach $_ |
| R14 | blocking | single `=` as a comparison inside if/while | use `-eq` (`if ($x -eq 5)`) | 1-4. = vs -eq |
| R15 | advisory | PS 7+ only syntax (`-AsHashtable`, `-Parallel`, `-AsByteStream`, `??`, `?.`) | confirm the runtime or use 5.1 equivalents | 1-5. PS7-only syntax |
| R16 | advisory | cmd-style commands / `%VAR%` env syntax | use Remove-Item / Copy-Item / Move-Item / New-Item and `$env:VAR` | 3-3. cmd style |
| R17 | advisory | Write-Host output bypasses the pipeline | use Write-Output for capturable results | 2-4. Write-Host |
| R18 | advisory | mojibake artifacts in the checked text (UTF-8 .ps1 read as ANSI/GBK on PS 5.1) | save .ps1 files with Chinese as UTF-8 with BOM; read/check with `-Encoding UTF8` | 2-5. .ps1 encoding |
| R19 | advisory | `Remove-Item` with a positional FileSystemInfo object (no `-Path`/`-LiteralPath`/`.FullName`) | pass `-Path $items.FullName`, or pipe the items | 5-3. Remove-Item objects |

### Writing rules for generated .ps1 (not covered by the checker)

- **JS template escaping**: when generating .ps1 from JS template strings, every `$` that must reach PowerShell needs `\$` (`$($var)`, `${attempt}` are interpolated by JS first);
- **PS string choice**: paths containing `$` or backslashes use single quotes, not double quotes;
- **Verify downloads**: sample before full download; check magic bytes (MZ/PDF/7z) and byte size;
- **Long tasks**: keep a log with Start-Transcript.

### PSScriptAnalyzer deep check

With the plugin configured as `analyzer: psscriptanalyzer`, every pwsh command is additionally deep-checked by the official PSScriptAnalyzer (Error/ParseError deny, warnings log). The module must be installed on the host (`Install-Module PSScriptAnalyzer -Scope CurrentUser -Force`); when missing the plugin degrades to the builtin rules.

### Maintenance

- New pitfall: **add the rule to src/checker.ts RULES first** (with selftest cases), run `--selftest`, then mirror it in the blog post and this table — tool and knowledge base stay in sync;
- Every rule change must leave `--selftest` green.

---

## 中文

本技能由 **@chaggle/dsh-powershell-check** 插件提供（原生 Cordis 插件 + bundled 技能 provider）。插件安装后，**每次 pwsh 工具调用都会自动经过 `tools/pre-execute` 门禁**：命中 R2–R11 阻断级坑位 → 直接拒绝（deny reason 即修复指引）；仅命中 R1 建议级 → 放行。本技能用于门禁之外的场景：生成 .ps1、把命令嵌入模板、检查脚本文件，以及查阅规则与修复方法。

### 运行检查器（手动检查）

检查器位于本技能目录 scripts/check-pwsh.mjs（resourceBase 即本目录）。三种用法：

```text
# 1) 检查一段命令原文
node "<resourceBase>/scripts/check-pwsh.mjs" -- "<命令原文>" [--lang en]

# 2) 检查 .ps1 脚本文件（stdin 模式）
Get-Content fix.ps1 -Raw | node "<resourceBase>/scripts/check-pwsh.mjs" - [--lang en]

# 3) 插件自检（每次改规则后必须跑）
node "<resourceBase>/scripts/check-pwsh.mjs" --selftest
```

退出码：0 = PASS；1 = FAIL（输出清单含修复）；2 = 用法错误或空输入。

### 内置规则（R1–R19，与博客章节一一对应）

| 规则 | 级别 | 检测内容 | 修复 | 博客章节 |
| --- | --- | --- | --- | --- |
| R1 | 建议 | 涉及 wsl/Windows 功能查询但未见 chcp 65001 | 输出中文前先 `chcp 65001 | Out-Null`（或设置 Console 的 OutputEncoding） | 2-3、GBK 乱码 |
| R2 | 阻断 | $var: 形式的变量紧跟冒号（非作用域名） | 改 ${var}: 显式界定（$env: 等作用域除外） | 1-1、$var: 解析 |
| R3 | 阻断 | 右括号后跟问号的三元运算符形态 | PS 5.1 无三元，改 if/else 赋值 | 1-2、三元运算符 |
| R4 | 阻断 | 双引号内 $WORD 后跟点号或反斜杠（路径陷阱） | 需要字面 $ 的路径改用单引号 | 2-1、$WINDOWS 展开 |
| R5 | 阻断 | 使用 Start-Process 包装外部命令 | 直接 & exe 调用；注意 -ArgumentList 引号 | 3-1、Start-Process 坑 |
| R6 | 阻断 | Get-WindowsOptionalFeature 的 -FeatureName 传数组 | 用 foreach 逐个查询 | 4-1、FeatureName 数组 |
| R7 | 阻断 | 出现 /Dismount-Image 动词 | 用 /Unmount-Image | 4-2、DISM 动词 |
| R8 | 阻断 | RestoreHealth 与 /Source 同现 | 源版本须不高于当前系统，否则走 Windows Update | 4-3、源版本 |
| R9 | 阻断 | curl 同时带 -L 与 -C - | 分段 -r 并行下载更快 | 3-4、CDN 加速 |
| R10 | 阻断 | npm/npx/pnpm 不带 .cmd 后缀 | 显式用 npm.cmd / npx.cmd / pnpm.cmd（npm.ps1 被 ExecutionPolicy 拦截） | 3-2、ExecutionPolicy |
| R11 | 阻断 | PS 5.1 出现 && / || 链式运算符 | 改分号或 if ($LASTEXITCODE -eq 0)；cmd/bash 内部除外 | 1-3、链式运算符 |
| R12 | 建议 | ConvertTo-Json 未指定 -Depth（默认 2 截断嵌套数据） | 显式加 -Depth 100（或按数据实际深度设值） | 5-1、JSON 深度 |
| R13 | 建议 | foreach 循环体内使用 $_ | 用循环变量，或换 ForEach-Object { $_ } | 5-2、foreach 的 $_ |
| R14 | 阻断 | if/while 条件里用单等号 = 当比较 | 用 -eq（if ($x -eq 5)） | 1-4、= 与 -eq |
| R15 | 建议 | PS 7+ 专属语法（-AsHashtable/-Parallel/-AsByteStream/??/?.) | 确认运行环境或用 5.1 等价写法 | 1-5、PS7+ 语法 |
| R16 | 建议 | cmd 风格命令/%VAR% 环境变量语法 | 用 Remove-Item/Copy-Item/Move-Item/New-Item 与 $env:VAR | 3-3、cmd 风格 |
| R17 | 建议 | Write-Host 输出不进管道 | 需捕获结果用 Write-Output | 2-4、Write-Host |
| R18 | 建议 | 检查文本出现乱码特征（UTF-8 无 BOM 的 .ps1 被 PS 5.1 按 ANSI/GBK 解析） | 含中文的 .ps1 保存为 UTF-8 with BOM；读取/检查用 -Encoding UTF8 | 2-5、.ps1 编码 |
| R19 | 建议 | Remove-Item 位置参数传文件系统对象（无 -Path/-LiteralPath/.FullName） | 用 -Path $items.FullName 传完整路径，或管道传入 | 5-3、Remove-Item 对象 |

### 生成 .ps1 的写作规则（检查器覆盖不到的写作侧）

- **JS 模板字符串转义**：在 JS 里用模板字符串生成 .ps1 时，所有想保留到 PS 的 $ 都要写成反斜杠加 $（$($var)、${attempt} 会被 JS 抢先插值，报 attempt is not defined 类错误）；
- **PS 字符串选型**：路径含 $ 或反斜杠时用单引号，不要用双引号；
- **下载文件后校验**：先小样后大样，校验魔数（MZ/PDF/7z）与字节大小再使用；
- **长任务**：用 Start-Transcript 留日志。

### PSScriptAnalyzer 深度检查

插件配置 `analyzer: psscriptanalyzer` 后，每条 pwsh 命令还会被官方 PSScriptAnalyzer 深检（Error/ParseError 拦截，Warning 记日志）。宿主机需安装模块（`Install-Module PSScriptAnalyzer -Scope CurrentUser -Force`）；缺失时自动回落内置规则。

### 维护约定

- 发现新坑：**先给 src/checker.ts 的 RULES 加规则**（含 selftest 正反例），跑通 --selftest，再把规则补进博客文章与本表，保证工具与知识库同步；
- 改动检查器后必须 --selftest 全绿才可交付。

### 参考 / References

- 插件仓库 / Repository: https://github.com/chaggle/dsh-powershell-check
- 博客原文 / Blog post: https://chaggle.github.io/2026/08/14/powershell/powershell-pitfalls/
- 关联文章 / Related post: https://chaggle.github.io/2026/08/14/windows/wsl2-restore-on-stripped-windows/

