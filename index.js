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
'use strict'

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { check, formatHits } from './checker.js'

export const name = 'dsh-powershell-check'
export const inject = ['skills']

const PROVIDER_NAME = 'dsh-powershell-check'
const SKILL_BODY_URL = new URL('./assets/SKILL.md', import.meta.url)
const RESOURCE_BASE = { kind: 'directory', path: fileURLToPath(new URL('./assets/', import.meta.url)) }
const DESCRIPTION = 'Use before executing any PowerShell command or script — pwsh tool calls, generated .ps1 files, or PowerShell embedded in templates — to statically check it against the ten documented PowerShell pitfalls from the blog post "PowerShell 实战踩坑大全" and fix every flagged violation first.'
const CANDIDATE = {
  name: 'powershell-check',
  description: DESCRIPTION,
  invocation: { modelInvocable: true, userInvocable: true },
  provider: PROVIDER_NAME,
  source: 'bundled',
  resourceBase: RESOURCE_BASE,
  rank: 600,
  locator: SKILL_BODY_URL,
}

const provider = {
  name: PROVIDER_NAME,
  list: () => Promise.resolve([CANDIDATE]),
  async get() {
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
function commandOf(exec) {
  const args = exec.arguments
  if (!args || typeof args !== 'object') return ''
  const command = args.command
  return typeof command === 'string' ? command : ''
}

/**
 * Plugin entry: register the bundled skill provider and the pre-execute gate.
 * @param {object} [config] - { mode: 'deny' | 'warn' } — deny blocks calls with
 *   blocking violations (default); warn only logs them.
 */
export function apply(ctx, config = {}) {
  const mode = config.mode === 'warn' ? 'warn' : 'deny'

  ctx.skills.registerProvider(() => provider)

  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.name !== 'pwsh') return next()
    const command = commandOf(exec)
    if (!command.trim()) return next()
    const { blocking, advisory } = check(command)

    if (mode === 'warn') {
      const hits = [...blocking, ...advisory]
      if (hits.length > 0 && ctx.logger) {
        ctx.logger.warn('[powershell-check] ' + hits.length + ' 个已知 PowerShell 坑位（warn 模式，放行）：' + NL + formatHits(hits))
      }
      return next()
    }

    if (blocking.length === 0) return next()
    const note = advisory.length > 0
      ? NL + '另有 ' + advisory.length + ' 条建议（R1 GBK 乱码，不影响执行）。'
      : ''
    return {
      kind: 'deny',
      reason: 'powershell-check: 检测到 ' + blocking.length + ' 个已知 PowerShell 坑位，请先修复后再执行：' + NL + formatHits(blocking) + note,
    }
  })
}

const NL = String.fromCharCode(10)

