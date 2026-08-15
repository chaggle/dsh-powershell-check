import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/index.ts'
import { analyzeWithPssa, formatPssaHits, parsePssaJson } from '../src/pssa.ts'

/** Fake shell executor: returns a canned stdout for every probe. */
function fakeShell(stdout: string, exitCode = 0) {
  return {
    resolve: (request: unknown) => request as never,
    run: async () => ({ exitCode, stdout: { text: stdout }, stderr: { text: '' } }) as never,
  }
}

describe('parsePssaJson', () => {
  it('splits Error/ParseError vs Warning', () => {
    const raw = JSON.stringify([
      { RuleName: 'PSUseBOMForUnicodeEncodedFile', Severity: 'Warning', Message: 'w1', Line: 1, Column: 1 },
      { RuleName: 'ParseError', Severity: 'ParseError', Message: 'missing token', Line: 2, Column: 5 },
      { RuleName: 'PSAvoidAssignmentInCondition', Severity: 'Error', Message: 'e1', Line: 3, Column: 1 },
    ])
    const out = parsePssaJson(raw)
    expect(out.status).toBe('ok')
    expect(out.errors.map((f) => f.RuleName)).toEqual(['ParseError', 'PSAvoidAssignmentInCondition'])
    expect(out.warnings.map((f) => f.RuleName)).toEqual(['PSUseBOMForUnicodeEncodedFile'])
  })

  it('normalizes numeric severities (real Invoke-ScriptAnalyzer shape)', () => {
    const raw = JSON.stringify([
      { RuleName: 'PSAvoidUsingWriteHost', Severity: 1, Message: 'w1', Line: 1, Column: 1 },
      { RuleName: 'PSUseDeclaredVarsMoreThanAssignments', Severity: 2, Message: 'e1', Line: 1, Column: 1 },
      { RuleName: 'ParseError', Severity: 3, Message: 'p1', Line: 1, Column: 1 },
    ])
    const out = parsePssaJson(raw)
    expect(out.errors.map((f) => f.RuleName)).toEqual(['PSUseDeclaredVarsMoreThanAssignments', 'ParseError'])
    expect(out.warnings.map((f) => f.RuleName)).toEqual(['PSAvoidUsingWriteHost'])
  })

  it('treats empty array as clean', () => {
    const out = parsePssaJson('[]')
    expect(out.status).toBe('ok')
    expect(out.errors).toEqual([])
    expect(out.warnings).toEqual([])
  })

  it('flags unparseable output as failed with detail', () => {
    const out = parsePssaJson('not json', 'stderr hint')
    expect(out.status).toBe('failed')
    expect(out.detail).toContain('stderr hint')
  })
})

describe('formatPssaHits', () => {
  it('renders rule name, location, and message', () => {
    const text = formatPssaHits([{ RuleName: 'ParseError', Severity: 'ParseError', Message: 'boom', Line: 2, Column: 3 }], 'zh')
    expect(text).toContain('[PSSA:ParseError]')
    expect(text).toContain('(L2:C3)')
    expect(text).toContain('boom')
  })
})

describe('analyzeWithPssa', () => {
  it('returns findings from the executor stdout', async () => {
    const shell = fakeShell(JSON.stringify([{ RuleName: 'ParseError', Severity: 'ParseError', Message: 'bad token', Line: 1, Column: 1 }]))
    const out = await analyzeWithPssa('git commit && git push', shell as never)
    expect(out.status).toBe('ok')
    expect(out.errors.length).toBe(1)
    expect(out.errors[0]!.RuleName).toBe('ParseError')
  })

  it('degrades when the module is missing', async () => {
    const shell = fakeShell('PSSA_MISSING')
    const out = await analyzeWithPssa('Write-Output hi', shell as never)
    expect(out.status).toBe('missing')
  })

  it('never throws on executor failure', async () => {
    const shell = {
      resolve: (request: unknown) => request as never,
      run: async () => { throw new Error('executor down') },
    }
    const out = await analyzeWithPssa('Write-Output hi', shell as never)
    expect(out.status).toBe('failed')
    expect(out.detail).toContain('executor down')
  })
})

describe('gate with analyzer: psscriptanalyzer', () => {
  function fakeCtx(shellStdout: string) {
    const listeners: Record<string, Array<(exec: unknown, next: () => unknown) => unknown>> = {}
    const logs: string[] = []
    const ctx = {
      logger: { warn: (m: string) => logs.push(m), info: (m: string) => logs.push(m) },
      on: (event: string, fn: (exec: unknown, next: () => unknown) => unknown) => { (listeners[event] ||= []).push(fn) },
      skills: { registerProvider: () => undefined },
      shell: {
        resolve: (request: unknown) => request as never,
        run: async () => ({ exitCode: 0, stdout: { text: shellStdout }, stderr: { text: '' } }) as never,
      },
    }
    return { ctx: ctx as unknown as Context, listeners, logs }
  }

  async function gate(ctx: Context, listeners: Record<string, Array<(exec: unknown, next: () => unknown) => unknown>>, exec: { name: string; arguments: unknown }) {
    const listener = listeners['tools/pre-execute']?.[0] as (exec: unknown, next: () => unknown) => Promise<{ kind: string; reason?: string }>
    const next = async () => ({ kind: 'allow' })
    return listener ? listener(exec, next) : { kind: 'allow' }
  }

  it('denies when PSSA reports an error, with bilingual reason', async () => {
    const payload = JSON.stringify([{ RuleName: 'ParseError', Severity: 'ParseError', Message: 'missing token', Line: 1, Column: 1 }])
    const h = fakeCtx(payload)
    apply(h.ctx, { analyzer: 'psscriptanalyzer', lang: 'en' })
    const d = await gate(h.ctx, h.listeners, { name: 'pwsh', arguments: { command: '$a = 1 +' } }) as { kind: string; reason?: string }
    expect(d.kind).toBe('deny')
    expect(d.reason).toContain('PSScriptAnalyzer deep check found 1 error(s)')
    expect(d.reason).toContain('[PSSA:ParseError]')
  })

  it('allows clean commands and logs warnings only', async () => {
    const payload = JSON.stringify([{ RuleName: 'PSAvoidUsingWriteHost', Severity: 'Warning', Message: 'w', Line: 1, Column: 1 }])
    const h = fakeCtx(payload)
    apply(h.ctx, { analyzer: 'psscriptanalyzer' })
    const d = await gate(h.ctx, h.listeners, { name: 'pwsh', arguments: { command: 'Write-Output hi' } })
    expect(d.kind).toBe('allow')
    expect(h.logs.some((m) => m.includes('PSAvoidUsingWriteHost'))).toBe(true)
  })

  it('missing module degrades gracefully to builtin', async () => {
    const h = fakeCtx('PSSA_MISSING')
    apply(h.ctx, { analyzer: 'psscriptanalyzer' })
    const d = await gate(h.ctx, h.listeners, { name: 'pwsh', arguments: { command: 'git status --short' } })
    expect(d.kind).toBe('allow')
    expect(h.logs.some((m) => m.includes('not installed'))).toBe(true)
  })

  it('builtin mode never invokes the shell executor', async () => {
    const h = fakeCtx('should not be used')
    apply(h.ctx)
    const d = await gate(h.ctx, h.listeners, { name: 'pwsh', arguments: { command: 'git status --short' } })
    expect(d.kind).toBe('allow')
    expect(h.logs.length).toBe(0)
  })
})

