#!/usr/bin/env node
/**
 * CLI wrapper around the shared rules engine (checker.js).
 *
 * Usage:
 *   node check-pwsh.mjs -- "<command text>"
 *   Get-Content fix.ps1 -Raw | node check-pwsh.mjs -
 *   node check-pwsh.mjs --selftest
 *
 * Exit codes: 0 = PASS, 1 = FAIL (violations found), 2 = usage error / empty input.
 */
'use strict'

import fs from 'node:fs'
import { run, formatHits, selftest } from '../../checker.js'

function main() {
  const args = process.argv.slice(2)
  if (args.indexOf('--selftest') >= 0) return selftest()
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
    console.log('[powershell-check] PASS — 未发现已知 PowerShell 坑位')
    return 0
  }
  console.log('[powershell-check] FAIL — 发现 ' + hits.length + ' 个已知坑位（博客《PowerShell 实战踩坑大全》）：')
  console.log(formatHits(hits))
  console.log('')
  console.log('请先修复以上问题再执行；确属误报时，在工具调用说明中注明 powershell-check 的判定理由。')
  return 1
}

process.exit(main())

