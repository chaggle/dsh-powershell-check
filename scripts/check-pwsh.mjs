#!/usr/bin/env node
/**
 * CLI wrapper around the shared rules engine (built lib/checker.js).
 *
 * Usage:
 *   node check-pwsh.mjs -- "<command text>" [--lang en|zh]
 *   Get-Content fix.ps1 -Raw | node check-pwsh.mjs - [--lang en]
 *   node check-pwsh.mjs --selftest
 *
 * Exit codes: 0 = PASS, 1 = FAIL (violations found), 2 = usage error / empty input.
 */
'use strict'

import fs from 'node:fs'
import { run, formatHits, selftest } from '../lib/checker.js'

function pickLang(args) {
  const i = args.indexOf('--lang')
  if (i >= 0 && args[i + 1] === 'en') return { args: args.slice(0, i).concat(args.slice(i + 2)), lang: 'en' }
  return { args, lang: 'zh' }
}

function main() {
  let args = process.argv.slice(2)
  if (args.indexOf('--selftest') >= 0) return selftest()
  const picked = pickLang(args)
  args = picked.args
  const lang = picked.lang
  let cmd = ''
  const dash = args.indexOf('--')
  if (dash >= 0) {
    cmd = args.slice(dash + 1).join(' ')
  } else if (args.length > 0 && args[0] !== '-') {
    cmd = args.join(' ')
  } else {
    try { cmd = fs.readFileSync(0, 'utf8') } catch (e) { cmd = '' }
  }
  if (!cmd.trim()) {
    console.error('[powershell-check] empty input. Usage: node check-pwsh.mjs -- "<command>" | Get-Content x.ps1 -Raw | node check-pwsh.mjs -')
    return 2
  }
  const hits = run(cmd)
  if (hits.length === 0) {
    console.log(lang === 'en' ? '[powershell-check] PASS — no known PowerShell pitfalls found' : '[powershell-check] PASS — 未发现已知 PowerShell 坑位')
    return 0
  }
  const header = lang === 'en'
    ? '[powershell-check] FAIL — ' + hits.length + ' known pitfall(s) found (blog post "PowerShell 实战踩坑大全"):'
    : '[powershell-check] FAIL — 发现 ' + hits.length + ' 个已知坑位（博客《PowerShell 实战踩坑大全》）：'
  const tail = lang === 'en'
    ? 'Fix the flagged issues before executing; if a flag is a false positive, note the powershell-check reasoning in the tool call.'
    : '请先修复以上问题再执行；确属误报时，在工具调用说明中注明 powershell-check 的判定理由。'
  console.log(header)
  console.log(formatHits(hits, lang))
  console.log('')
  console.log(tail)
  return 1
}

process.exit(main())

