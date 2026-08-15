---
name: powershell-check
description: Use before executing any PowerShell command or script - pwsh tool calls, generated .ps1 files, or PowerShell embedded in templates - to statically check it against the ten documented PowerShell pitfalls from the blog post "PowerShell 实战踩坑大全" and fix every flagged violation first.
whenToUse: Whenever PowerShell execution is involved - calling the pwsh tool (foreground or background), writing or generating a .ps1 file, or embedding PowerShell in a script or template string.
---

# PowerShell 执行检查（powershell-check）

本技能由插件 **dsh-powershell-check** 提供（官方形态：原生 Cordis 插件 + bundled 技能 provider）。插件安装后，**每次 pwsh 工具调用都会自动经过 `tools/pre-execute` 门禁**：命中 R2–R9 阻断级坑位 → 直接拒绝，deny reason 即为修复指引；仅命中 R1 建议级 → 放行。本技能用于门禁之外的场景：生成 .ps1、把命令嵌入模板、检查脚本文件，以及查阅规则与修复方法。

## 运行检查器（手动检查）

检查器位于本技能目录 scripts/check-pwsh.mjs（resourceBase 即本目录）。三种用法：

```text
# 1) 检查一段命令原文
node "<resourceBase>/scripts/check-pwsh.mjs" -- "<命令原文>"

# 2) 检查 .ps1 脚本文件（stdin 模式）
Get-Content fix.ps1 -Raw | node "<resourceBase>/scripts/check-pwsh.mjs" -

# 3) 插件自检（每次改规则后必须跑）
node "<resourceBase>/scripts/check-pwsh.mjs" --selftest
```

退出码：0 = PASS；1 = FAIL（见输出清单）；2 = 用法错误或空输入。

## 内置规则（R1–R11，与博客章节一一对应）

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

## 生成 .ps1 的写作规则（检查器覆盖不到的写作侧）

- **JS 模板字符串转义**：在 JS 里用模板字符串生成 .ps1 时，所有想保留到 PS 的 $ 都要写成反斜杠加 $（$($var)、${attempt} 会被 JS 抢先插值，报 attempt is not defined 类错误）；
- **PS 字符串选型**：路径含 $ 或反斜杠时用单引号，不要用双引号；
- **下载文件后校验**：先小样后大样，校验魔数（MZ/PDF/7z）与字节大小再使用；
- **长任务**：用 Start-Transcript 留日志。

## 维护约定

- 发现新坑：**先给 checker.js 的 RULES 加规则**（含 selftest 正反例），跑通 --selftest，再把规则补进博客文章《PowerShell 实战踩坑大全》，保证工具与知识库同步；
- 改动检查器后必须 --selftest 全绿才可交付。

## 参考

- 插件仓库：https://github.com/chaggle/dsh-powershell-check
- 博客原文：《[PowerShell 实战踩坑大全](https://chaggle.github.io/2026/08/14/powershell/powershell-pitfalls/)》
- 关联文章：《[在精简版 Windows 上恢复 WSL2](https://chaggle.github.io/2026/08/14/windows/wsl2-restore-on-stripped-windows/)》

