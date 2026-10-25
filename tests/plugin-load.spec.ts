/**
 * Real-composition load test.
 *
 * Mounts the plugin on a real Cordis context together with the real skill
 * registry from `@deepseek-ai/dsh-skill`, so a breaking change in the DSH
 * services this plugin consumes (skill provider registration, the
 * `tools/pre-execute` waterfall, the bundled SKILL.md resource base) fails
 * here instead of at harness boot.
 */

import { describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as plugin from '../src/index.ts'

/** Stand-in for the `ctx.shell` service the plugin injects (the gate never executes). */
class StubShell extends Service {
  constructor(ctx: Context) {
    super(ctx, 'shell')
  }
}

/** Mount the plugin over a real context; returns the plugin fiber for disposal checks. */
async function mount(): Promise<{ ctx: Context; fiber: { dispose: () => Promise<void> } }> {
  const ctx = new Context()
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(StubShell)
  const fiber = ctx.plugin(plugin)
  await fiber
  return { ctx, fiber }
}

/** Run one call through the registered `tools/pre-execute` waterfall. */
async function gate(ctx: Context, exec: { name: string; arguments: unknown }) {
  let called = false
  const next = async () => { called = true; return { kind: 'allow' } }
  const decision = await ctx.events.waterfall('tools/pre-execute', exec, next)
  return { decision, called }
}

describe('plugin on a real harness context', () => {
  it('registers the bundled skill with the live registry', async () => {
    const { ctx } = await mount()
    const skills = ctx.skills
    const listed = await skills.list()
    const entry = listed.find(skill => skill.name === 'powershell-check')
    expect(entry).toBeDefined()
    expect(entry?.source).toBe('bundled')
    expect(entry?.provider).toBe('dsh-powershell-check')
    expect(entry?.invocation).toEqual({ modelInvocable: true, userInvocable: true })
    expect(entry?.resourceBase?.kind).toBe('directory')

    const definition = await skills.get('powershell-check')
    expect(definition?.content).toContain('powershell-check')
    expect(definition?.content).toContain('R23')
  })

  it('denies a blocking pitfall and allows a clean call', async () => {
    const { ctx } = await mount()
    const denied = await gate(ctx, { name: 'pwsh', arguments: { command: '"attempt $attempt: downloading"' } })
    expect(denied.decision.kind).toBe('deny')
    expect(denied.decision.reason).toContain('[R2]')
    expect(denied.called).toBe(false)

    const allowed = await gate(ctx, { name: 'pwsh', arguments: { command: 'git status --short' } })
    expect(allowed.decision.kind).toBe('allow')
    expect(allowed.called).toBe(true)
  })

  it('withdraws the skill when the plugin fiber disposes', async () => {
    const { ctx, fiber } = await mount()
    const skills = ctx.skills
    expect((await skills.list()).some(skill => skill.name === 'powershell-check')).toBe(true)
    await fiber.dispose()
    expect((await skills.list()).some(skill => skill.name === 'powershell-check')).toBe(false)
  })
})
