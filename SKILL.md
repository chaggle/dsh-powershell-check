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

### Rules (R1–R11, mapped to the blog sections)

| Rule | Level | Detects | Fix | Blog |
| --- | --- | --- | --- | --- |
| R1 | advisory | wsl/Windows feature queries without chcp 65001 | prefix `chcp 65001 | Out-Null` before Chinese output | 1. GBK mojibake |
| R2 | blocking | `$var:` followed by a colon (non-scope name) | use `${var}:`; `$env:` style scopes are exempt | 2. $var: parsing |
| R3 | blocking | `) ? ...` ternary shape | PS 5.1 has no ternary; use if/else assignment | 3. Ternary |
| R4 | blocking | `$WORD` followed by `.` or `` inside double quotes | use single quotes when `$` must stay literal | 4. $WINDOWS |
| R5 | blocking | Start-Process wrapping an external command | call `& exe` directly; watch -ArgumentList quoting | 6. Start-Process |
| R6 | blocking | `-FeatureName A, B` array form | loop with foreach, one name at a time | 7. FeatureName arrays |
| R7 | blocking | `/Dismount-Image` verb | use `/Unmount-Image` | 8. DISM verbs |
| R8 | blocking | RestoreHealth with /Source | source must be <= current build, or Windows Update | 9. Source version |
| R9 | blocking | curl -L combined with -C - | parallel `-r` ranges are faster | 10. CDN download |
| R10 | blocking | bare npm/npx/pnpm without the .cmd suffix | use npm.cmd / npx.cmd / pnpm.cmd explicitly | 11. ExecutionPolicy |
| R11 | blocking | `&&` / `||` chains (PS 5.1) | use `;`, `if ($LASTEXITCODE -eq 0)`, or separate lines | 12. Chain operators |

### Writing rules for generated .ps1 (not covered by the checker)

- **JS template escaping**: when generating .ps1 from JS template strings, every `$` that must reach PowerShell needs `\$` (`$($var)`, `${attempt}` are interpolated by JS first);
- **PS string choice**: paths containing `$` or backslashes use single quotes, not double quotes;
- **Verify downloads**: sample before full download; check magic bytes (MZ/PDF/7z) and byte size;
- **Long tasks**: keep a log with Start-Transcript.

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

### 内置规则（R1–R11，与博客章节一一对应）

| 规则 | 级别 | 检测内容 | 修复 | 博客章节 |
| --- | --- | --- | --- | --- |
| R1 | 建议 | 涉及 wsl/Windows 功能查询但未见 chcp 65001 | 输出中文前先 `chcp 65001 | Out-Null`（或设置 Console 的 OutputEncoding） | 一、GBK 乱码 |
| R2 | 阻断 | $var: 形式的变量紧跟冒号（非作用域名） | 改 ${var}: 显式界定（$env: 等作用域除外） | 二、$var: 解析 |
| R3 | 阻断 | 右括号后跟问号的三元运算符形态 | PS 5.1 无三元，改 if/else 赋值 | 三、三元运算符 |
| R4 | 阻断 | 双引号内 $WORD 后跟点号或反斜杠（路径陷阱） | 需要字面 $ 的路径改用单引号 | 四、$WINDOWS 展开 |
| R5 | 阻断 | 使用 Start-Process 包装外部命令 | 直接 & exe 调用；注意 -ArgumentList 引号 | 六、Start-Process 坑 |
| R6 | 阻断 | Get-WindowsOptionalFeature 的 -FeatureName 传数组 | 用 foreach 逐个查询 | 七、FeatureName 数组 |
| R7 | 阻断 | 出现 /Dismount-Image 动词 | 用 /Unmount-Image | 八、DISM 动词 |
| R8 | 阻断 | RestoreHealth 与 /Source 同现 | 源版本须不高于当前系统，否则走 Windows Update | 九、源版本 |
| R9 | 阻断 | curl 同时带 -L 与 -C - | 分段 -r 并行下载更快 | 十、CDN 加速 |
| R10 | 阻断 | npm/npx/pnpm 不带 .cmd 后缀 | 显式用 npm.cmd / npx.cmd / pnpm.cmd（npm.ps1 被 ExecutionPolicy 拦截） | 十一、ExecutionPolicy |
| R11 | 阻断 | PS 5.1 出现 && / || 链式运算符 | 改分号或 if ($LASTEXITCODE -eq 0)；cmd/bash 内部除外 | 十二、链式运算符 |

### 生成 .ps1 的写作规则（检查器覆盖不到的写作侧）

- **JS 模板字符串转义**：在 JS 里用模板字符串生成 .ps1 时，所有想保留到 PS 的 $ 都要写成反斜杠加 $（$($var)、${attempt} 会被 JS 抢先插值，报 attempt is not defined 类错误）；
- **PS 字符串选型**：路径含 $ 或反斜杠时用单引号，不要用双引号；
- **下载文件后校验**：先小样后大样，校验魔数（MZ/PDF/7z）与字节大小再使用；
- **长任务**：用 Start-Transcript 留日志。

### 维护约定

- 发现新坑：**先给 src/checker.ts 的 RULES 加规则**（含 selftest 正反例），跑通 --selftest，再把规则补进博客文章与本表，保证工具与知识库同步；
- 改动检查器后必须 --selftest 全绿才可交付。

### 参考 / References

- 插件仓库 / Repository: https://github.com/chaggle/dsh-powershell-check
- 博客原文 / Blog post: https://chaggle.github.io/2026/08/14/powershell/powershell-pitfalls/
- 关联文章 / Related post: https://chaggle.github.io/2026/08/14/windows/wsl2-restore-on-stripped-windows/

