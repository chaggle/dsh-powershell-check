# dsh-powershell-check

DeepSeek Harness 原生插件：**自动拦截带 PowerShell 坑位的 pwsh 工具调用**，并内置 `powershell-check` 技能。

坑位规则来自博客《[PowerShell 实战踩坑大全](https://chaggle.github.io/2026/08/14/powershell/powershell-pitfalls/)》（GBK 乱码、`$var:` 解析、PS 5.1 三元运算符、双引号变量展开、JS 转义、Start-Process 引号与沙箱坑、FeatureName 数组、DISM 动词、RestoreHealth 源版本、CDN 下载加速）。

## 特性

- **自动门禁**：订阅官方 `tools/pre-execute` 拦截点，每次 `pwsh` 工具调用前自动静态检查；命中 R2–R9 阻断级坑位 → 返回 `deny`（deny reason 即修复指引，模型看到报错后修复重试）；仅 R1 建议级 → 放行；
- **内置技能**：通过 `ctx.skills.registerProvider`（官方 `dsh-skill-badge` 同款写法）暴露 `powershell-check` 技能，会话目录可见、可加载；
- **单规则源**：规则引擎 `checker.js` 由插件门禁与 CLI 共用，改一处即全生效；
- **自检**：`--selftest` 内置 20 组正反例。

## 安装

这是一个原生 Cordis 插件（纯 ESM、零运行时依赖、无需构建）。两种装法：

### 方式一：Harness profile（推荐）

```text
# 1. 把本仓库克隆到任意位置（或发布到 npm 后直接依赖包名）
git clone https://github.com/chaggle/dsh-powershell-check.git

# 2. 在 $DSH_HOME/profiles/<你的profile>/package.json 的 dependencies 中加入本插件，
#    并把插件行追加到该 profile 的 cordis.patch.yml：
- name: dsh-powershell-check

# 3. 重启 dsh（或触发配置热载）后生效
```

### 方式二：仅启用技能（不装门禁）

把 `assets/` 目录复制到任意技能根目录：

```text
# 用户级（所有项目可用）
git clone https://github.com/chaggle/dsh-powershell-check.git "$HOME/.dsh/skills/powershell-check"

# 或项目级（仅当前项目）
git clone https://github.com/chaggle/dsh-powershell-check.git <项目根>/.dsh/skills/powershell-check
```

## 配置

| 配置项 | 默认 | 说明 |
| --- | --- | --- |
| `mode` | `deny` | `deny`：命中阻断级坑位直接拒绝；`warn`：只记日志放行 |

```yaml
- name: dsh-powershell-check
  config:
    mode: warn   # 先观察再收紧
```

## 手动检查（CLI）

```text
node assets/scripts/check-pwsh.mjs -- "要执行的命令原文"
Get-Content fix.ps1 -Raw | node assets/scripts/check-pwsh.mjs -
node assets/scripts/check-pwsh.mjs --selftest
```

## 工作原理（官方扩展点）

Harness 的扩展面是类型化拦截点（见 harness 仓库 `interception-extension-points` 设计）：所谓「原生钩子」只是一个订阅规范生命周期事件的普通 Cordis 插件，返回类型化 Decision，无需外部 hooks 桥、无 `hook/*` 日志、无子进程边界。本插件用到的两个官方入口：

1. `ctx.on('tools/pre-execute', (exec, next) => PreToolDecision)` — 工具执行前的瀑布门禁；
2. `ctx.skills.registerProvider(...)` — 向技能注册表贡献 bundled 技能。

## 验证

```text
pnpm selftest   # 规则引擎 20 组正反例
pnpm smoke      # 伪造 ctx 的端到端冒烟：门禁拒绝/放行/告警 + 技能 provider
```

## 维护约定

发现新坑：先给 `checker.js` 的 `RULES` 加规则（含 selftest 正反例），跑通 `--selftest`，再把规则补进博客《PowerShell 实战踩坑大全》，保证工具与知识库同步。

## License

MIT

