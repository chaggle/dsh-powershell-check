/**
 * dsh-powershell-check — native DeepSeek Harness plugin.
 *
 * Gates every `pwsh` tool call against the PowerShell pitfalls from the blog
 * post 'PowerShell 实战踩坑大全' via the official `tools/pre-execute`
 * interception point, and registers the bundled `powershell-check` skill.
 *
 * A native hook is an ordinary Cordis plugin subscribing to the canonical
 * lifecycle events (see the interception extension-points design in the
 * deepseek-harness repo) — no external hooks bridge, no hook/* log, no
 * subprocess boundary. Anything the Claude Code / Codex hook bridges can do,
 * this plugin does directly with full ctx and typed decisions.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { SkillCandidate, SkillDefinition, SkillProvider } from '@deepseek-ai/dsh-skill'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import { check, formatHits, type Lang } from './checker.ts'
import { normalizeConfig } from './invariant.ts'
import { analyzeWithPssa, formatPssaHits } from './pssa.ts'

export const name = 'dsh-powershell-check'
export const inject = ['skills', 'shell']

/** Plugin configuration: gate mode, output language, and analyzer depth. */
export interface PluginConfig {
  /** deny blocks pwsh calls with blocking violations; warn only logs them. */
  readonly mode?: 'deny' | 'warn'
  /** Language for deny reasons and warn logs. */
  readonly lang?: Lang
  /**
   * builtin (default): the bundled R1-R19 static rules only.
   * psscriptanalyzer: additionally deep-checks every pwsh command with the
   * official PSScriptAnalyzer (needs the module on the host; degrades to
   * builtin when missing). ParseError/Error findings deny, warnings log.
   */
  readonly analyzer?: 'builtin' | 'psscriptanalyzer'
}

const PROVIDER_NAME = 'dsh-powershell-check'
// Relative to the package root in both the src/ source tree and the built
// lib/ output (../SKILL.md from lib/index.js is the package root).
const SKILL_BODY_URL = new URL('../SKILL.md', import.meta.url)
const RESOURCE_BASE = { kind: 'directory', path: fileURLToPath(new URL('../', import.meta.url)) } as const
const DESCRIPTION = 'Use before executing any PowerShell command or script — pwsh tool calls, generated .ps1 files, or PowerShell embedded in templates — to statically check it against the documented PowerShell pitfalls from the blog post "PowerShell 实战踩坑大全" and fix every flagged violation first.'
const CANDIDATE: SkillCandidate = {
  name: 'powershell-check',
  description: DESCRIPTION,
  invocation: { modelInvocable: true, userInvocable: true },
  provider: PROVIDER_NAME,
  source: 'bundled',
  resourceBase: RESOURCE_BASE,
  rank: 600,
  locator: SKILL_BODY_URL,
}

const provider: SkillProvider = {
  name: PROVIDER_NAME,
  list: () => Promise.resolve([CANDIDATE]),
  async get(_candidate: SkillCandidate): Promise<SkillDefinition> {
    return {
      name: CANDIDATE.name,
      description: CANDIDATE.description,
      invocation: CANDIDATE.invocation,
      provider: CANDIDATE.provider,
      source: CANDIDATE.source,
      resourceBase: RESOURCE_BASE,
      content: await readFile(SKILL_BODY_URL, 'utf8'),
    }
  },
}

/** Extract the PowerShell command text from a pwsh tool call. */
function commandOf(exec: ToolExecution): string {
  const args = exec.arguments
  if (!args || typeof args !== 'object') return ''
  const command = (args as Record<string, unknown>).command
  return typeof command === 'string' ? command : ''
}

/**
 * Plugin entry: register the bundled skill provider and the pre-execute gate.
 */
export function apply(ctx: Context, config: PluginConfig = {}): void {
  const { mode, lang } = normalizeConfig(config)

  ctx.skills.registerProvider(() => provider)

  ctx.on('tools/pre-execute', async (exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> => {
    if (exec.name !== 'pwsh') return next()
    const command = commandOf(exec)
    if (!command.trim()) return next()
    const { blocking, advisory } = check(command)

    if (mode === 'warn') {
      const hits = [...blocking, ...advisory]
      if (hits.length > 0 && ctx.logger) {
        ctx.logger.warn('[powershell-check] ' + hits.length + (lang === 'en' ? ' known PowerShell pitfalls (warn mode, allowed): ' : ' 个已知 PowerShell 坑位（warn 模式，放行）：') + NL + formatHits(hits, lang))
      }
      return next()
    }

    if (blocking.length === 0) {
      // Deep check: optional PSScriptAnalyzer pass when configured.
      if (config.analyzer === 'psscriptanalyzer' && ctx.shell) {
        const outcome = await analyzeWithPssa(command, ctx.shell as ShellExecutor)
        if (outcome.status === 'missing') {
          ctx.logger?.info?.('[powershell-check] PSScriptAnalyzer not installed; using builtin rules only')
        } else if (outcome.status === 'failed') {
          ctx.logger?.warn?.('[powershell-check] PSScriptAnalyzer deep check failed (degraded to builtin): ' + (outcome.detail ?? ''))
        } else if (outcome.errors.length > 0) {
          const header = lang === 'en'
            ? 'powershell-check: PSScriptAnalyzer deep check found ' + outcome.errors.length + ' error(s); fix before retrying:'
            : 'powershell-check: PSScriptAnalyzer 深度检查发现 ' + outcome.errors.length + ' 个错误，请先修复后再执行：'
          const warnNote = outcome.warnings.length > 0
            ? NL + (lang === 'en' ? 'Also ' + outcome.warnings.length + ' warning(s) — check them if the result still looks wrong.' : '另有 ' + outcome.warnings.length + ' 条警告，若结果仍异常请一并检查。')
            : ''
          return { kind: 'deny', reason: header + NL + formatPssaHits(outcome.errors, lang) + warnNote }
        } else if (outcome.warnings.length > 0) {
          ctx.logger?.warn?.('[powershell-check] PSScriptAnalyzer warnings (' + outcome.warnings.length + '):' + NL + formatPssaHits(outcome.warnings, lang))
        }
      }
      return next()
    }
    const note = advisory.length > 0
      ? NL + (lang === 'en' ? 'Also ' + advisory.length + ' advisory item(s) (R1 GBK mojibake, non-blocking).' : '另有 ' + advisory.length + ' 条建议（R1 GBK 乱码，不影响执行）。')
      : ''
    const header = lang === 'en'
      ? 'powershell-check: ' + blocking.length + ' known PowerShell pitfall(s) detected; fix before retrying:'
      : 'powershell-check: 检测到 ' + blocking.length + ' 个已知 PowerShell 坑位，请先修复后再执行：'
    return {
      kind: 'deny',
      reason: header + NL + formatHits(blocking, lang) + note,
    }
  })
}

const NL = String.fromCharCode(10)

