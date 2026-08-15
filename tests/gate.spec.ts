import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/index.ts'

type Listener = (exec: { name: string; arguments: unknown }, next: () => Promise<{ kind: string }>) => Promise<{ kind: string; reason?: string }>

interface FakeHarness {
  ctx: Context
  listeners: Record<string, Listener[]>
  providers: Array<{ list: () => Promise<Array<{ name: string; source: string; resourceBase: { kind: string } }>>; get: (c: unknown) => Promise<{ content: string }> }>
  logs: string[]
}

function fakeCtx(): FakeHarness {
  const listeners: Record<string, Listener[]> = {}
  const providers: FakeHarness['providers'] = []
  const logs: string[] = []
  const ctx = {
    logger: { warn: (m: string) => logs.push(m) },
    on: (event: string, fn: Listener) => { (listeners[event] ||= []).push(fn) },
    skills: { registerProvider: (factory: () => unknown) => providers.push(factory() as never) },
  }
  return { ctx: ctx as unknown as Context, listeners, providers, logs }
}

async function gate(h: FakeHarness, exec: { name: string; arguments: unknown }) {
  const listener = h.listeners['tools/pre-execute']?.[0]
  let called = false
  const next = async () => { called = true; return { kind: 'allow' } }
  const decision = listener ? await listener(exec, next) : { kind: 'allow' }
  return { decision, called }
}

describe('tools/pre-execute gate', () => {
  it('denies pwsh calls with blocking violations (zh default)', async () => {
    const h = fakeCtx()
    apply(h.ctx)
    const r = await gate(h, { name: 'pwsh', arguments: { command: '"attempt $attempt: downloading..."' } })
    expect(r.decision.kind).toBe('deny')
    expect(r.decision.reason).toContain('[R2]')
    expect(r.decision.reason).toContain('${attempt}:')
    expect(r.called).toBe(false)
  })

  it('denies with English reason under lang: en', async () => {
    const h = fakeCtx()
    apply(h.ctx, { lang: 'en' })
    const r = await gate(h, { name: 'pwsh', arguments: { command: '"attempt $attempt: downloading..."' } })
    expect(r.decision.kind).toBe('deny')
    expect(r.decision.reason).toContain('known PowerShell pitfall(s) detected')
    expect(r.decision.reason).toContain('drive-qualified variable')
  })

  it('allows clean pwsh commands', async () => {
    const h = fakeCtx()
    apply(h.ctx)
    const r = await gate(h, { name: 'pwsh', arguments: { command: 'git status --short --branch' } })
    expect(r.decision.kind).toBe('allow')
    expect(r.called).toBe(true)
  })

  it('allows advisory-only (R1) commands', async () => {
    const h = fakeCtx()
    apply(h.ctx)
    const r = await gate(h, { name: 'pwsh', arguments: { command: 'wsl --status' } })
    expect(r.decision.kind).toBe('allow')
  })

  it('leaves non-pwsh tools untouched', async () => {
    const h = fakeCtx()
    apply(h.ctx)
    const r = await gate(h, { name: 'bash', arguments: { command: 'rm -rf /' } })
    expect(r.decision.kind).toBe('allow')
    expect(r.called).toBe(true)
  })

  it('warn mode allows and logs violations', async () => {
    const h = fakeCtx()
    apply(h.ctx, { mode: 'warn' })
    const r = await gate(h, { name: 'pwsh', arguments: { command: '"attempt $attempt: downloading..."' } })
    expect(r.decision.kind).toBe('allow')
    expect(r.called).toBe(true)
    expect(h.logs.length).toBe(1)
    expect(h.logs[0]).toContain('[R2]')
  })
})

describe('bundled skill provider', () => {
  it('registers the powershell-check skill and loads its body', async () => {
    const h = fakeCtx()
    apply(h.ctx)
    expect(h.providers.length).toBe(1)
    const skill = h.providers[0]!
    const listed = await skill.list()
    expect(listed.length).toBe(1)
    expect(listed[0]!.name).toBe('powershell-check')
    expect(listed[0]!.source).toBe('bundled')
    expect(listed[0]!.resourceBase.kind).toBe('directory')
    const def = await skill.get(listed[0])
    expect(typeof def.content).toBe('string')
    expect(def.content).toContain('powershell-check')
  })
})

