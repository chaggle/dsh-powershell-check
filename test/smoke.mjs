#!/usr/bin/env node
/**
 * Smoke test: drive the plugin with a fake ctx (no harness needed) and verify
 * the pre-execute gate decisions plus the bundled skill provider.
 */
'use strict'

import { apply } from '../index.js'
import { selftest } from '../checker.js'

const NL = String.fromCharCode(10)

function fakeCtx() {
  const listeners = {}
  const providers = []
  const logs = []
  const ctx = {
    logger: { warn: (m) => logs.push(m) },
    on: (event, fn) => { (listeners[event] ||= []).push(fn) },
    skills: { registerProvider: (factory) => providers.push(factory()) },
  }
  return { ctx, listeners, providers, logs }
}

async function gate(listeners, exec) {
  const listener = listeners['tools/pre-execute'][0]
  let called = false
  const next = async () => { called = true; return { kind: 'allow' } }
  const decision = await listener(exec, next)
  return { decision, called }
}

let failures = 0
function assert(cond, msg) {
  if (!cond) { failures++; console.log('FAIL  ' + msg) } else { console.log('PASS  ' + msg) }
}

// --- gate: deny mode ---
const a = fakeCtx()
apply(a.ctx)
assert(a.providers.length === 1, 'skill provider registered')

const bad = await gate(a.listeners, { name: 'pwsh', arguments: { command: '"attempt $attempt: downloading..."' } })
assert(bad.decision.kind === 'deny', 'pwsh with R2 violation is denied')
assert(bad.decision.reason.includes('[R2]'), 'deny reason lists R2 with fix')
assert(bad.called === false, 'deny does not call next()')

const good = await gate(a.listeners, { name: 'pwsh', arguments: { command: 'git status --short --branch' } })
assert(good.decision.kind === 'allow' && good.called === true, 'clean pwsh command allowed')

const adv = await gate(a.listeners, { name: 'pwsh', arguments: { command: 'wsl --status' } })
assert(adv.decision.kind === 'allow', 'advisory-only (R1) command allowed')

const other = await gate(a.listeners, { name: 'bash', arguments: { command: 'rm -rf /' } })
assert(other.decision.kind === 'allow' && other.called === true, 'non-pwsh tool untouched')

// --- gate: warn mode ---
const w = fakeCtx()
apply(w.ctx, { mode: 'warn' })
const wg = await gate(w.listeners, { name: 'pwsh', arguments: { command: '"attempt $attempt: downloading..."' } })
assert(wg.decision.kind === 'allow' && wg.called === true, 'warn mode allows and calls next()')
assert(w.logs.length === 1 && w.logs[0].includes('[R2]'), 'warn mode logs the violation with rule id')

// --- skill provider ---
const skill = a.providers[0]
const listed = await skill.list()
assert(listed.length === 1 && listed[0].name === 'powershell-check', 'skill candidate name is powershell-check')
assert(listed[0].source === 'bundled' && listed[0].resourceBase.kind === 'directory', 'skill source/resourceBase shape')
const def = await skill.get(listed[0])
assert(typeof def.content === 'string' && def.content.includes('powershell-check'), 'skill body loads from assets/SKILL.md')

// --- checker selftest ---
assert(selftest() === 0, 'checker selftest all pass')

console.log(failures === 0 ? '' + NL + 'smoke: ALL PASS' : '' + NL + 'smoke: ' + failures + ' FAILURES')
process.exit(failures === 0 ? 0 : 1)

