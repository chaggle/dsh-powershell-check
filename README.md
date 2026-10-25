# @chaggle/dsh-powershell-check

A native [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that **gates every `pwsh` tool call** against the PowerShell pitfalls documented in the blog post [PowerShell 实战踩坑大全](https://chaggle.github.io/blog/2026/08/14/powershell-pitfalls/) (GBK console mojibake, `$var:` parsing, PS 5.1 ternary, double-quoted variable expansion, JS escaping, Start-Process quoting and sandbox traps, `-FeatureName` arrays, DISM verbs, `RestoreHealth` source versions, CDN downloads, `npm.cmd` suffix, `&&`/`||` chains), and bundles the `powershell-check` skill.

Installable as a profile plugin: `dsh plugin --profile <name> add @chaggle/dsh-powershell-check` (or mount the row directly — see [Install](#install)).

## Features

- **Automatic gate** — subscribes to the official `tools/pre-execute` interception point; every `pwsh` call is statically checked before execution. Blocking violations (R2–R11, R14, R20) return a `deny` whose reason IS the fix guidance; advisory hits (R1, R12, R13, R15–R19, R21–R23) pass through. `warn` mode only logs.
- **Bundled skill** — exposes `powershell-check` through `ctx.skills.registerProvider` (the `dsh-skill-badge` pattern), visible and loadable in every session catalog.
- **Bilingual** — rule text, CLI output (`--lang en|zh`), deny reasons, and docs ship in English and Simplified Chinese.
- **Single rule source** — the rules engine (`src/checker.ts`) is shared by the gate and the CLI; update once, both follow.
- **Self-test** — `--selftest` runs a 77-case positive/negative battery (R1–R23, AI-generated-script focused, including the false-positive regressions for R10).
- **Verified on real composition** — `tests/plugin-load.spec.ts` mounts the plugin on a real Cordis context with the real `@deepseek-ai/dsh-skill` registry, so a breaking change in the DSH services it consumes fails the test suite instead of harness boot.

## Compatibility

Built and verified against dsh `0.2.1-rc.3`. The manifest declares `engines.dsh: ">=0.2.1-rc.3 <0.3.0"` and pins the DSH packages the plugin imports (`@deepseek-ai/dsh-shell`, `@deepseek-ai/dsh-skill`, `@deepseek-ai/dsh-tools`, all `^0.2.1-rc.3`; `@deepseek-ai/cordis` `^4.0.5`). Install and profile startup read `engines.dsh` first, so a runtime outside that range is refused with an upgrade prompt instead of failing while the row loads.

The gate covers every tool registered as `pwsh` — the foreground/background tool and the persistent-shell variant share that name.

The development tree pins two `overrides` (`undici`, `zod`) because the published dsh releases resolve versions covered by security advisories. Both stay inside their current major version and apply only to this repository's typecheck and test tree; the published package's runtime dependencies remain the host-provided peers.

## Install

### As a profile plugin (recommended)

The package declares `dsh.bundle` (patch: `./cordis.patch.yml`), so it is installable per profile:

```text
dsh plugin --profile <name> add @chaggle/dsh-powershell-check
```

or add the row to your profile layer `$DSH_HOME/profiles/<name>/cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-powershell-check
      name: @chaggle/dsh-powershell-check
      config:
        mode: deny   # deny | warn
        lang: zh     # zh | en
```

If the harness was launched from a checkout, either publish the package or point the row at a local clone:

```text
git clone https://github.com/chaggle/dsh-powershell-check.git
# then junction/symlink it into $DSH_HOME/profiles/node_modules/@chaggle/dsh-powershell-check
```

User patch layers are watched: the change hot-applies to a running `dsh web` instance (transactional HMR) without a restart.

### Skill only (no gate)

The repository root is a skill bundle (`SKILL.md` + `scripts/`); clone it into any skill root:

```text
git clone https://github.com/chaggle/dsh-powershell-check.git "$HOME/.dsh/skills/powershell-check"
```

## Configuration

| Key | Default | Meaning |
| --- | --- | --- |
| `mode` | `deny` | `deny` blocks pwsh calls with blocking violations; `warn` logs and allows |
| `lang` | `zh` | Language of deny reasons and warn logs: `zh` or `en` |
| `analyzer` | `builtin` | `builtin`: bundled R1–R23 rules only. `psscriptanalyzer`: additionally deep-checks every pwsh command with the official PSScriptAnalyzer (install the module on the host; degrades to builtin when missing). Error/ParseError findings deny, warnings are logged |

## CLI

```text
node scripts/check-pwsh.mjs -- "command text" [--lang en]
Get-Content fix.ps1 -Raw | node scripts/check-pwsh.mjs - [--lang en]
node scripts/check-pwsh.mjs --selftest
```

Exit codes: 0 = PASS, 1 = FAIL (violations listed with fixes), 2 = usage error.

## Rules

| Rule | Level | Detects | Blog section |
| --- | --- | --- | --- |
| R1 | advisory | wsl/Windows feature queries without `chcp 65001` | §1-1-3 |
| R2 | blocking | `$var:` parsed as drive-qualified syntax | §1-1 |
| R3 | blocking | `) ? ...` ternary shape (PS 5.1) | §1-2 |
| R4 | blocking | `$WORD` followed by `.`/`` inside double quotes (path trap) | §1-1-1 |
| R5 | blocking | `Start-Process` wrapping an external command | §1-2-1 |
| R6 | blocking | `-FeatureName A, B` array form | §1-1-1-1 |
| R7 | blocking | `/Dismount-Image` verb | §1-1-1-2 |
| R8 | blocking | `RestoreHealth` with a newer source | §1-1-1-3 |
| R9 | blocking | `curl -L` combined with `-C -` | §1-2-4 |
| R10 | blocking | bare `npm`/`npx`/`pnpm` without the `.cmd` suffix | §1-2-2 |
| R11 | blocking | `&&` / `||` chains (PS 5.1) | §1-3 |
| R12 | advisory | `ConvertTo-Json` without `-Depth` (default 2 truncates nested data) | §5-1 |
| R13 | advisory | `$_` inside a `foreach ($x in ...)` loop | §5-2 |
| R14 | blocking | single `=` as a comparison inside `if`/`while` | §1-4 |
| R15 | advisory | PS 7+ only syntax (`-AsHashtable`/`-Parallel`/`-AsByteStream`/`??`/`?.`) | §1-5 |
| R16 | advisory | cmd-style commands / `%VAR%` env syntax | §1-2-3 |
| R17 | advisory | `Write-Host` output bypasses the pipeline | §1-1-4 |
| R18 | advisory | mojibake artifacts in the checked text (UTF-8 .ps1 read as ANSI/GBK on PS 5.1) | §2-5 |
| R19 | advisory | `Remove-Item` with a positional FileSystemInfo object (no `-Path`/`-LiteralPath`/`.FullName`) | §5-3 |
| R20 | blocking | `Invoke-RestMethod`/`-WebRequest` with a string `-Body` carrying non-ASCII (PS 5.1 sends `?`) | §6-1 |
| R21 | advisory | `ConvertFrom-Json` on lockfile-class JSON (empty property name throws on PS 5.1) | §6-2 |
| R22 | advisory | piping strings into a native stdin line protocol (`git credential`, `git apply`, `openssl`, `gpg`) | §6-3 |
| R23 | advisory | `2>&1` on a native command (stderr becomes ErrorRecords on PS 5.1) | §6-4 |

## PSScriptAnalyzer deep check

Set `analyzer: psscriptanalyzer` to add the official PowerShell static analyzer on top of the builtin rules. The plugin runs `Invoke-ScriptAnalyzer` against the command text (as a temp .ps1) through the same `ctx.shell` seam the harness hooks bridges use; the probe raises the process-scope execution policy to Bypass first (the harness starts pwsh under Restricted). Findings with severity Error/ParseError deny the call with the analyzer messages; warnings are logged and allowed.

```powershell
# one-time, on the host (PowerShell 5.1 or 7):
Install-Module PSScriptAnalyzer -Scope CurrentUser -Force
```

Trade-offs: each deep check spawns an analyzer pass (module load ~1–3 s), so enable it only when the extra coverage is worth the latency; when the module is absent the plugin logs once and falls back to the builtin rules. Empirical notes from this project: PSSA does not flag `&&`/`||` on a 5.1 host (the builtin R11 covers that) and serializes Severity as a numeric enum (the parser handles both forms).

## How it works (official extension points)

The harness extension surface is its typed interception points: a "native hook" is an ordinary Cordis plugin subscribing to canonical lifecycle events and returning typed decisions — no external hooks bridge, no `hook/*` log, no subprocess boundary. This plugin uses two entries:

1. `ctx.on(`tools/pre-execute`, (exec, next) => PreToolDecision)` — the pre-execution waterfall gate;
2. `ctx.skills.registerProvider(...)` — contributes the bundled skill to the registry.

## Model Experience

### Request context and condition

#### What the model sees

Nothing is injected into prompts by this plugin. The skill is exposed through the standard session skill catalog (`powershell-check`, description above) and can be loaded with the `skill` tool. When the gate denies a pwsh call, the model sees the deny reason in the tool error result — that reason is the fix guidance generated by `formatHits`.

#### Token effect

Zero direct token effect outside tool-error feedback: no prompt text is added or rewritten. The deny reason replaces a would-be tool result with a bounded error payload.

#### KV Cache effect

The plugin publishes no system-reminder or catalog text of its own; the skill description rides the session catalog produced by the skill consumer, so prompt-prefix reuse is unaffected. Deny reasons are per-call error results and do not change the request prefix.

## Known Limitations and Deferred Work

- **Static heuristics** — rules are pattern-based; R1 is advisory by design and R4 may flag intended variable expansion (the fix text says when to ignore).
- **Live reload** — code changes require the running harness to re-import the plugin (user-patch rows hot-reload; the module cache reloads on row replacement).
- **Rule count** — R10/R11 cover the ExecutionPolicy and `&&`/`||` traps; new pitfalls should be added to `src/checker.ts` with selftest cases, then mirrored in the blog post.

## License

MIT — see [LICENSE](LICENSE).

