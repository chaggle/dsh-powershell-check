/**
 * PSScriptAnalyzer deep-check integration.
 *
 * Runs the official PowerShell static analyzer against the command text as a
 * temporary .ps1 file through the harness `ctx.shell` executor (the same seam
 * the hooks bridges use). The harness pwsh starts under Restricted policy, so
 * the probe first raises the process-scope policy to Bypass; on hosts without
 * the module the check degrades to the builtin rules.
 */

import { randomUUID } from 'node:crypto'
import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { Lang } from './checker.ts'

/** One finding emitted by Invoke-ScriptAnalyzer. */
export interface PssaFinding {
  readonly RuleName: string
  readonly Severity: string
  readonly Message: string
  readonly Line: number
  readonly Column: number
}

/** Outcome of one deep check: ok (analyzed), missing (module absent), failed (infra error). */
export interface PssaOutcome {
  readonly status: 'ok' | 'missing' | 'failed'
  readonly errors: PssaFinding[]
  readonly warnings: PssaFinding[]
  readonly detail?: string
}

const PSSA_MISSING = 'PSSA_MISSING'
const BOM = String.fromCharCode(0xFEFF)

/** Build the probe command: policy bypass, module check, analyze, JSON out. */
function buildPssaCommand(file: string): string {
  const quoted = '\'' + file.replace('\'', '\'\'') + '\''
  return [
    'Set-ExecutionPolicy -Scope Process Bypass -Force -ErrorAction SilentlyContinue',
    'if (-not (Get-Module -ListAvailable PSScriptAnalyzer -ErrorAction SilentlyContinue)) { ' + '\'' + PSSA_MISSING + '\'' + ' }',
    'else { $r = @(Invoke-ScriptAnalyzer -Path ' + quoted + ' -Severity Error,Warning -ErrorAction SilentlyContinue)',
    'if ($r.Count -eq 0) { ' + '\'' + '[]' + '\'' + ' }',
    'else { $r | Select-Object RuleName,Severity,Message,Line,Column | ConvertTo-Json -Depth 5 -Compress } }',
  ].join('; ')
}

/** Normalize PSSA severity (string like 'Warning' or numeric enum: 0=Information, 1=Warning, 2=Error, 3=ParseError). */
function severityKind(severity: string): 'error' | 'warning' | 'other' {
  const s = severity.toUpperCase()
  if (s === 'ERROR' || s === 'PARSEERROR' || s === '2' || s === '3') return 'error'
  if (s === 'WARNING' || s === '1') return 'warning'
  return 'other'
}

/** Parse the probe stdout into findings; unparseable output is a failed check. */
export function parsePssaJson(raw: string, stderr?: string): PssaOutcome {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { status: 'failed', errors: [], warnings: [], detail: (stderr || 'unparseable analyzer output: ' + raw.slice(0, 200)) }
  }
  const arr = Array.isArray(data) ? data : (data === null || data === undefined ? [] : [data])
  const errors: PssaFinding[] = []
  const warnings: PssaFinding[] = []
  for (const item of arr) {
    if (item === null || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const severity = String(rec.Severity ?? '')
    const finding: PssaFinding = {
      RuleName: String(rec.RuleName ?? ''),
      Severity: severity,
      Message: String(rec.Message ?? ''),
      Line: Number(rec.Line ?? 0),
      Column: Number(rec.Column ?? 0),
    }
    const kind = severityKind(severity)
    if (kind === 'error') errors.push(finding)
    else if (kind === 'warning') warnings.push(finding)
  }
  return { status: 'ok', errors, warnings }
}

/** Render findings for a deny reason or log line (bounded to 10 entries). */
export function formatPssaHits(findings: readonly PssaFinding[], lang: Lang): string {
  return findings.slice(0, 10).map((f) => {
    const loc = f.Line > 0 ? ` (L${f.Line}:C${f.Column})` : ''
    return '  [PSSA:' + f.Severity + '] ' + f.RuleName + loc + ': ' + f.Message
  }).join('' + NL)
}

/**
 * Deep-check one command with PSScriptAnalyzer through the shell executor.
 * Never throws: infra failures degrade to a `failed` outcome with a detail.
 */
export async function analyzeWithPssa(
  command: string,
  shell: ShellExecutor,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<PssaOutcome> {
  if (!command.trim()) return { status: 'ok', errors: [], warnings: [] }
  const file = join(tmpdir(), `dsh-pssa-${randomUUID()}.ps1`)
  try {
    writeFileSync(file, BOM + command, 'utf8')
    const request = { command: buildPssaCommand(file), timeoutMs: options.timeoutMs ?? 60_000, signal: options.signal }
    const result = await shell.run(shell.resolve(request))
    const stdout = result.stdout.text.trim()
    const stderr = result.stderr.text.trim()
    if (stdout === PSSA_MISSING) return { status: 'missing', errors: [], warnings: [] }
    if (stdout === '' && result.exitCode !== 0) {
      return { status: 'failed', errors: [], warnings: [], detail: (stderr || 'analyzer exited ' + String(result.exitCode)).slice(0, 300) }
    }
    return parsePssaJson(stdout, stderr)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { status: 'failed', errors: [], warnings: [], detail: message.slice(0, 300) }
  } finally {
    try { rmSync(file, { force: true }) } catch { /* best effort */ }
  }
}

const NL = String.fromCharCode(10)

