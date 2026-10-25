# @chaggle/dsh-powershell-check

一个原生 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：通过官方 `tools/pre-execute` 拦截点**自动拦截带 PowerShell 坑位的 `pwsh` 工具调用**，并内置 `powershell-check` 技能。坑位规则来自博客《[PowerShell 实战踩坑大全](https://chaggle.github.io/blog/2026/08/14/powershell-pitfalls/)》（GBK 乱码、`$var:` 解析、PS 5.1 三元运算符、双引号变量展开、JS 转义、Start-Process 引号与沙箱坑、`-FeatureName` 数组、DISM 动词、`RestoreHealth` 源版本、CDN 下载、`npm.cmd` 后缀、`&&`/`||` 链式）。

可作 profile 插件安装：`dsh plugin --profile <名称> add @chaggle/dsh-powershell-check`（或直接挂行，见[安装](#安装)）。

## 特性

- **自动门禁**：订阅官方 `tools/pre-execute` 拦截点，每次 `pwsh` 调用前自动静态检查；命中阻断级坑位（R2–R11、R14、R20）→ 返回 `deny`（deny reason 即修复指引）；建议级（R1、R12、R13、R15–R19、R21–R23）放行；`warn` 模式只记日志；
- **内置技能**：通过 `ctx.skills.registerProvider`（官方 `dsh-skill-badge` 同款写法）暴露 `powershell-check`，每个会话目录可见、可加载；
- **中英双语**：规则文本、CLI 输出（`--lang en|zh`）、deny reason 与文档均提供中英版本；
- **单一规则源**：规则引擎（`src/checker.ts`）被门禁与 CLI 共用，改一处全生效；
- **自检**：`--selftest` 内置 77 组正反例（R1–R23，聚焦 AI 生成脚本，含 R10 误报回归用例）。
- **真实组合验证**：`tests/plugin-load.spec.ts` 在真实 Cordis 上下文 + 真实 `@deepseek-ai/dsh-skill` 注册表上挂载本插件，它依赖的 DSH 服务一旦破坏性变更，在测试阶段就失败，而不是等到 harness 启动。

## 兼容性

基于 dsh `0.2.1-rc.3` 构建并验证。manifest 声明 `engines.dsh: ">=0.2.1-rc.3 <0.3.0"`，并把插件 import 的 DSH 包固定在 `^0.2.1-rc.3`（`@deepseek-ai/dsh-shell`、`dsh-skill`、`dsh-tools`；`@deepseek-ai/cordis` 为 `^4.0.5`）。安装与 profile 启动时的兼容性预检**先读 `engines.dsh`**，运行时不满足即拒绝并提示升级，而不是等插件行加载时才报错。

门禁覆盖所有以 `pwsh` 注册的工具——前台/后台工具与持久 shell 变体同名。

开发依赖树里固定了 `undici`、`zod` 两条 `overrides`：已发布的 dsh 版本解析出的版本命中了安全公告。两者都停留在各自的大版本内，且只作用于本仓库的 typecheck 与测试树；发布产物的运行时依赖仍然只有 host 提供的 peers。

## 安装

### 作为 profile 插件（推荐）

包声明了 `dsh.bundle`（patch 为 `./cordis.patch.yml`），可随 profile 安装：

```text
dsh plugin --profile <名称> add @chaggle/dsh-powershell-check
```

或在 profile 用户层 `$DSH_HOME/profiles/<名称>/cordis.patch.yml` 挂行：

```yaml
- insert:
    - id: dsh-powershell-check
      name: @chaggle/dsh-powershell-check
      config:
        mode: deny   # deny | warn
        lang: zh     # zh | en
```

从源码 checkout 启动的 harness，可发布包或将行指向本地克隆：

```text
git clone https://github.com/chaggle/dsh-powershell-check.git
# 再 junction/符号链接到 $DSH_HOME/profiles/node_modules/@chaggle/dsh-powershell-check
```

用户补丁层会被监听：对运行中的 `dsh web` 实例**热生效**（事务性 HMR），无需重启。

### 仅技能（不装门禁）

仓库根目录即技能包（`SKILL.md` + `scripts/`），克隆到任意技能根目录即可：

```text
git clone https://github.com/chaggle/dsh-powershell-check.git "$HOME/.dsh/skills/powershell-check"
```

## 配置

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `mode` | `deny` | `deny` 命中阻断级坑位直接拒绝；`warn` 只记日志放行 |
| `lang` | `zh` | deny reason 与日志语言：`zh` 或 `en` |
| `analyzer` | `builtin` | `builtin`：仅内置 R1–R23；`psscriptanalyzer`：额外用官方 PSScriptAnalyzer 对每条 pwsh 命令深检（宿主机需安装模块，缺模块自动降级内置）。Error/ParseError 拦截，Warning 记日志放行 |

## CLI

```text
node scripts/check-pwsh.mjs -- "命令原文" [--lang en]
Get-Content fix.ps1 -Raw | node scripts/check-pwsh.mjs - [--lang en]
node scripts/check-pwsh.mjs --selftest
```

退出码：0 = PASS；1 = FAIL（输出清单含修复）；2 = 用法错误。

## 规则

| 规则 | 级别 | 检测内容 | 博客章节 |
| --- | --- | --- | --- |
| R1 | 建议 | 涉及 wsl/Windows 功能查询但未见 `chcp 65001` | 2-3 |
| R2 | 阻断 | `$var:` 被解析成驱动器限定语法 | 1-1 |
| R3 | 阻断 | `) ? ...` 三元形态（PS 5.1） | 1-2 |
| R4 | 阻断 | 双引号内 `$WORD` 后跟 `.`/``（路径陷阱） | 2-1 |
| R5 | 阻断 | `Start-Process` 包装外部命令 | 3-1 |
| R6 | 阻断 | `-FeatureName A, B` 数组形式 | 4-1 |
| R7 | 阻断 | `/Dismount-Image` 动词 | 4-2 |
| R8 | 阻断 | `RestoreHealth` 源版本比系统新 | 4-3 |
| R9 | 阻断 | `curl -L` 与 `-C -` 组合 | 3-4 |
| R10 | 阻断 | 裸 `npm`/`npx`/`pnpm` 不带 `.cmd` 后缀 | 3-2 |
| R11 | 阻断 | `&&` / `||` 链式（PS 5.1） | 1-3 |
| R12 | 建议 | `ConvertTo-Json` 未指定 `-Depth`（默认 2 截断嵌套数据） | 5-1 |
| R13 | 建议 | `foreach` 循环体内使用 `$_` | 5-2 |
| R14 | 阻断 | `if`/`while` 条件里用单等号 `=` 当比较 | 1-4 |
| R15 | 建议 | PS 7+ 专属语法（`-AsHashtable`/`-Parallel`/`-AsByteStream`/`??`/`?.`） | 1-5 |
| R16 | 建议 | cmd 风格命令 / `%VAR%` 环境变量语法 | 3-3 |
| R17 | 建议 | `Write-Host` 输出不进管道 | 2-4 |
| R18 | 建议 | 检查文本出现乱码特征（PS 5.1 把无 BOM 的 UTF-8 .ps1 按 ANSI/GBK 解析） | 2-5 |
| R19 | 建议 | `Remove-Item` 位置参数传文件系统对象（无 `-Path`/`-LiteralPath`/`.FullName`） | 5-3 |
| R20 | 阻断 | `Invoke-RestMethod`/`-WebRequest` 用字符串 `-Body` 发非 ASCII（PS 5.1 会变成 `?`） | 6-1 |
| R21 | 建议 | `ConvertFrom-Json` 解析 lockfile 类 JSON（空键名在 PS 5.1 抛错） | 6-2 |
| R22 | 建议 | 管道喂原生程序 stdin 行协议（`git credential`/`git apply`/`openssl`/`gpg`） | 6-3 |
| R23 | 建议 | 原生命令带 `2>&1`（PS 5.1 把 stderr 变成 ErrorRecord） | 6-4 |

## PSScriptAnalyzer 深度检查

配置 `analyzer: psscriptanalyzer` 可在内置规则之上叠加官方 PowerShell 静态分析器。插件把命令文本写入临时 .ps1，经 harness hooks 桥同款的 `ctx.shell` 通道执行 `Invoke-ScriptAnalyzer`；探针先提升进程级执行策略为 Bypass（harness 默认 Restricted 启动 pwsh）。命中 Error/ParseError 级别 → 拒绝并附分析器消息；Warning → 记日志放行。

```powershell
# 宿主机一次性安装（PowerShell 5.1 或 7）：
Install-Module PSScriptAnalyzer -Scope CurrentUser -Force
```

权衡：每次深检都会起一个分析进程（模块加载约 1–3 秒），仅在需要更全覆盖时开启；模块缺失时插件记录一次日志并回落内置规则。实测备注：PSSA 在 5.1 宿主上不报 `&&`/`||`（由内置 R11 兜底），且 Severity 序列化为数字枚举（解析器两种形态都兼容）。

## 工作原理（官方扩展点）

Harness 的扩展面是其类型化拦截点：所谓「原生钩子」只是一个订阅规范生命周期事件、返回类型化 Decision 的普通 Cordis 插件——无外部 hooks 桥、无 `hook/*` 日志、无子进程边界。本插件用到两个官方入口：

1. `ctx.on(`tools/pre-execute`, (exec, next) => PreToolDecision)` — 工具执行前的瀑布门禁；
2. `ctx.skills.registerProvider(...)` — 向技能注册表贡献 bundled 技能。

## Model Experience

### Request context and condition

#### What the model sees

本插件不向提示词注入任何文本。技能通过标准会话技能目录暴露（`powershell-check`，见上文描述），可用 `skill` 工具加载；门禁拒绝 pwsh 调用时，模型在工具报错结果中看到 deny reason——即 `formatHits` 生成的修复指引。

#### Token effect

除工具报错反馈外无直接 token 影响：不新增、不改写提示词。deny reason 以有界错误载荷替换一次本应执行的工具结果。

#### KV Cache effect

插件不发布自己的 system-reminder 或目录文本；技能描述随技能消费方生成的会话目录走，不影响提示词前缀复用。deny reason 是逐次调用的错误结果，不改变请求前缀。

## 已知限制与待办

- **静态启发式**：规则基于模式匹配；R1 按设计为建议级，R4 可能标记有意的变量展开（修复文案注明了可忽略的情形）；
- **热载**：代码变更需运行中的 harness 重新导入插件（用户补丁行可热载，替换行时模块缓存重载）；
- **规则扩充**：新坑位先在 `src/checker.ts` 加规则（含 selftest 正反例），再同步进博客文章。

## License

MIT — 见 [LICENSE](LICENSE)。

