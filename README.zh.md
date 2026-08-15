# @chaggle/dsh-powershell-check

一个原生 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：通过官方 `tools/pre-execute` 拦截点**自动拦截带 PowerShell 坑位的 `pwsh` 工具调用**，并内置 `powershell-check` 技能。坑位规则来自博客《[PowerShell 实战踩坑大全](https://chaggle.github.io/2026/08/14/powershell/powershell-pitfalls/)》（GBK 乱码、`$var:` 解析、PS 5.1 三元运算符、双引号变量展开、JS 转义、Start-Process 引号与沙箱坑、`-FeatureName` 数组、DISM 动词、`RestoreHealth` 源版本、CDN 下载、`npm.cmd` 后缀、`&&`/`||` 链式）。

可作 profile 插件安装：`dsh plugin --profile <名称> add @chaggle/dsh-powershell-check`（或直接挂行，见[安装](#安装)）。

## 特性

- **自动门禁**：订阅官方 `tools/pre-execute` 拦截点，每次 `pwsh` 调用前自动静态检查；命中 R2–R11 阻断级坑位 → 返回 `deny`（deny reason 即修复指引）；R1 建议级放行；`warn` 模式只记日志；
- **内置技能**：通过 `ctx.skills.registerProvider`（官方 `dsh-skill-badge` 同款写法）暴露 `powershell-check`，每个会话目录可见、可加载；
- **中英双语**：规则文本、CLI 输出（`--lang en|zh`）、deny reason 与文档均提供中英版本；
- **单一规则源**：规则引擎（`src/checker.ts`）被门禁与 CLI 共用，改一处全生效；
- **自检**：`--selftest` 内置 31 组正反例。

## 安装

### 作为 profile 插件（推荐）

包声明了 `dsh.bundle.patch` 并自带 `cordis.patch.yml`，可随 profile 安装：

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
| R1 | 建议 | 涉及 wsl/Windows 功能查询但未见 `chcp 65001` | 一、GBK 乱码 |
| R2 | 阻断 | `$var:` 被解析成驱动器限定语法 | 二 |
| R3 | 阻断 | `) ? ...` 三元形态（PS 5.1） | 三 |
| R4 | 阻断 | 双引号内 `$WORD` 后跟 `.`/``（路径陷阱） | 四 |
| R5 | 阻断 | `Start-Process` 包装外部命令 | 六 |
| R6 | 阻断 | `-FeatureName A, B` 数组形式 | 七 |
| R7 | 阻断 | `/Dismount-Image` 动词 | 八 |
| R8 | 阻断 | `RestoreHealth` 源版本比系统新 | 九 |
| R9 | 阻断 | `curl -L` 与 `-C -` 组合 | 十 |
| R10 | 阻断 | 裸 `npm`/`npx`/`pnpm` 不带 `.cmd` 后缀 | 十一、ExecutionPolicy |
| R11 | 阻断 | `&&` / `||` 链式（PS 5.1） | 十二 |

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

