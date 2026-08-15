/**
 * dsh-powershell-check — static pitfall rules engine for PowerShell commands.
 *
 * Rules distilled from the blog post 'PowerShell 实战踩坑大全'
 * (https://chaggle.github.io/2026/08/14/powershell/powershell-pitfalls/).
 * Shared by the cordis plugin (index.js) and the CLI (assets/scripts/check-pwsh.mjs).
 */

'use strict'

const BS = String.fromCharCode(92)

/** R1 is an advisory (console-encoding hint); R2–R9 are blocking pitfalls. */
const KNOWN_SCOPES = ['env', 'script', 'global', 'local', 'private', 'using', 'function', 'variable', 'PSDefaultParameterValues', 'PSScriptRoot', 'PSCommandPath', 'PID', 'true', 'false', 'null']

function isWordChar(c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' }
function isLetter(c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' }
function hasWord(text, word) {
  const low = text.toLowerCase()
  const w = word.toLowerCase()
  let idx = 0
  while ((idx = low.indexOf(w, idx)) >= 0) {
    const before = idx > 0 ? low[idx - 1] : ''
    const after = idx + w.length < low.length ? low[idx + w.length] : ''
    if (!isWordChar(before) && !isWordChar(after)) return true
    idx += w.length
  }
  return false
}

/** Collect $name / ${name} variable occurrences. */
function findVars(cmd) {
  const res = []
  for (let i = 0; i < cmd.length; i++) {
    if (cmd[i] !== '$') continue
    if (cmd[i + 1] === '{') {
      let j = i + 2
      while (j < cmd.length && (isWordChar(cmd[j]) || cmd[j] === ':')) j++
      if (cmd[j] === '}') { res.push({ start: i, end: j + 1, braced: true, name: cmd.slice(i + 2, j), followedBy: cmd[j + 1] || '' }); i = j }
      continue
    }
    if (!isLetter(cmd[i + 1] || '')) continue
    let j = i + 1
    while (j < cmd.length && isWordChar(cmd[j])) j++
    res.push({ start: i, end: j, braced: false, name: cmd.slice(i + 1, j), followedBy: cmd[j] || '' })
    i = j - 1
  }
  return res
}

function r1Gbk(cmd) {
  const producesText = hasWord(cmd, 'wsl') || cmd.includes('Get-WindowsOptionalFeature') || cmd.includes('Enable-WindowsOptionalFeature') || cmd.includes('RestoreHealth') || cmd.includes('Cleanup-Image') || cmd.includes('/Get-')
  if (!producesText) return false
  if (hasWord(cmd, 'chcp') || cmd.includes('65001') || /OutputEncoding/.test(cmd)) return false
  return true
}
function r2VarColon(cmd) {
  for (const v of findVars(cmd)) {
    if (v.braced) continue
    if (v.followedBy === ':' && KNOWN_SCOPES.indexOf(v.name) < 0) return true
  }
  return false
}
function r3Ternary(cmd) {
  for (let i = 0; i < cmd.length - 1; i++) {
    if (cmd[i] !== ')') continue
    let j = i + 1
    while (j < cmd.length && (cmd[j] === ' ' || cmd[j] === '\t' || cmd[j] === '\r')) j++
    if (cmd[j] === '?') return true
  }
  return false
}
/** R4: a $WORD inside a double-quoted string followed by a dot or a backslash (path trap). */
function r4DollarInDoubleQuotedPath(cmd) {
  const lines = cmd.split('\n')
  for (const ln of lines) {
    let inDQ = false
    for (let i = 0; i < ln.length; i++) {
      const ch = ln[i]
      if (ch === '"') { inDQ = !inDQ; continue }
      if (ch !== '$' || !inDQ) continue
      if (ln[i + 1] === '{') continue
      if (!isLetter(ln[i + 1] || '')) continue
      let j = i + 1
      while (j < ln.length && isWordChar(ln[j])) j++
      const followed = ln[j] || ''
      if (followed === '.' || followed === BS) return true
      i = j - 1
    }
  }
  return false
}
function r5StartProcess(cmd) { return hasWord(cmd, 'Start-Process') }
function r6FeatureNameArray(cmd) {
  const lines = cmd.split('\n')
  for (const ln of lines) {
    if (!ln.includes('Get-WindowsOptionalFeature')) continue
    const k = ln.indexOf('-FeatureName')
    if (k < 0) continue
    if (ln.slice(k + 12).includes(',')) return true
  }
  return false
}
function r7DismountImage(cmd) { return cmd.toLowerCase().includes('/dismount-image') }
function r8RestoreHealthSource(cmd) {
  const lines = cmd.split('\n')
  for (const ln of lines) {
    if (ln.includes('RestoreHealth') && ln.toLowerCase().includes('/source')) return true
  }
  return false
}
function r9CurlResume(cmd) {
  const lines = cmd.split('\n')
  for (const ln of lines) {
    const low = ln.toLowerCase()
    if (!low.includes('curl')) continue
    if (ln.includes('-L') && (ln.includes('-C -') || ln.includes('-C-'))) return true
  }
  return false
}
// R10: npm/npx/pnpm invoked without the .cmd suffix — PowerShell blocks
// npm.ps1 (running scripts is disabled / ExecutionPolicy) while npm.cmd runs.
function r10NpmCmd(cmd) {
  const names = ['npm', 'npx', 'pnpm']
  const allowedBefore = ' ;|&' + String.fromCharCode(9)
  for (const name of names) {
    for (let i = 0; i < cmd.length; i++) {
      const prev = i > 0 ? cmd[i - 1] : ''
      if (prev !== '' && allowedBefore.indexOf(prev) < 0) continue
      if (cmd.slice(i, i + name.length).toLowerCase() !== name) continue
      const after = i + name.length < cmd.length ? cmd[i + name.length] : ''
      if (after === '.') continue
      if (after !== '' && after !== ' ' && after !== '"' && after !== '\'' && after !== '\t') continue
      return true
    }
  }
  return false
}
// R11: && / || chain operators do not exist in Windows PowerShell 5.1 (PS 7+ only).
function r11NoAndOr(cmd) {
  const lines = cmd.split('\n')
  for (const ln of lines) {
    // cmd.exe / bash contexts have their own valid && / || — skip those lines
    if (hasWord(ln, 'bash') || hasWord(ln, 'zsh') || hasWord(ln, 'sh')) continue
    const low = ln.toLowerCase()
    if (low.includes('cmd /c') || low.includes('cmd.exe /c')) continue
    let q = null
    for (let i = 0; i < ln.length - 1; i++) {
      const ch = ln[i]
      if (ch === '"' || ch === '\'') {
        if (q === null) q = ch
        else if (q === ch && ln[i - 1] !== '`') q = null
        continue
      }
      if (q !== null) continue
      if ((ch === '&' && ln[i + 1] === '&') || (ch === '|' && ln[i + 1] === '|')) return true
    }
  }
  return false
}

/**【power 坑位规则表：R1 建议级，R2–R9 阻断级】**/
export const RULES = [
  { id: 'R1', severity: 'advisory', title: '中文输出可能 GBK 乱码', blog: '§一', test: r1Gbk,
    fix: '命令涉及 wsl/Windows 功能查询且未见 chcp：输出中文前先 `chcp 65001 | Out-Null`（或设置 [Console]::OutputEncoding）。' },
  { id: 'R2', severity: 'blocking', title: '$var: 被解析成驱动器限定变量', blog: '§二', test: r2VarColon,
    fix: '`$attempt:` 会被当成 `$env:Path` 式作用域语法，改为 `${attempt}:` 显式界定。' },
  { id: 'R3', severity: 'blocking', title: 'PowerShell 5.1 没有三元运算符', blog: '§三', test: r3Ternary,
    fix: '`($a -gt 0) ? "yes" : "no"` 在 PS 5.1 解析报错；改用 `$v = if ($a -gt 0) { "yes" } else { "no" }`。' },
  { id: 'R4', severity: 'blocking', title: '双引号里的 $变量 被展开（路径陷阱）', blog: '§四', test: r4DollarInDoubleQuotedPath,
    fix: '双引号内 $WORD 后跟 . 或 \\ 时路径中的 $ 会被展开（如 "C:\\$WINDOWS.~BT\\Sources\\..."）；需要字面 $ 的路径改用单引号。确属展开意图可忽略。' },
  { id: 'R5', severity: 'blocking', title: 'Start-Process 包装外部命令', blog: '§六', test: r5StartProcess,
    fix: '-ArgumentList 不会自动加引号（路径含空格碎参数）；后台 Start-Process curl 下载会内容损坏。能直接调用就别包一层：`& curl.exe ...`。' },
  { id: 'R6', severity: 'blocking', title: 'Get-WindowsOptionalFeature 的 FeatureName 不支持数组', blog: '§七', test: r6FeatureNameArray,
    fix: '`-FeatureName A, B` 报 Cannot convert System.Object[]；用 `foreach ($n in "A","B") { ... -FeatureName $n }`。' },
  { id: 'R7', severity: 'blocking', title: 'DISM 动词 /Dismount-Image 不存在', blog: '§八', test: r7DismountImage,
    fix: '正确动词是 `/Unmount-Image`，否则报 错误:87 且 wim 一直挂载占空间。' },
  { id: 'R8', severity: 'blocking', title: 'RestoreHealth 源版本可能比系统新', blog: '§九', test: r8RestoreHealthSource,
    fix: '0x800f0915 = 修复源比当前系统新；源要求同版本或更旧，或走 Windows Update。' },
  { id: 'R9', severity: 'blocking', title: 'curl -L 与 -C - 组合可能拖慢 CDN 下载', blog: '§十', test: r9CurlResume,
    fix: '部分 CDN 上 `curl -L` 与 `-C -` 组合会拖慢速度；优先 HEAD 拿 Content-Length → 分段 `-r` 并行 → copy /b 合并。' },
  { id: 'R10', severity: 'blocking', title: 'npm/npx/pnpm 不带 .cmd 后缀（npm.ps1 被 ExecutionPolicy 拦截）', blog: '§十一', test: r10NpmCmd,
    fix: 'PowerShell 默认禁止运行脚本，PATH 里的 npm.ps1 加载报错（running scripts is disabled）；显式用 `npm.cmd run ...` / `npx.cmd ...` / `pnpm.cmd ...`。' },
  { id: 'R11', severity: 'blocking', title: 'PowerShell 5.1 没有 && / || 链式运算符', blog: '§十二', test: r11NoAndOr,
    fix: '`a && b` 在 PS 5.1 解析报错（PS 7+ 才支持）；改用 `a; b`、`if ($LASTEXITCODE -eq 0) { b }` 或分行执行。cmd/bash 内部除外。' },
]

/** Run every rule against one command and return the matching rule objects. */
export function run(cmd) {
  return RULES.filter((r) => r.test(cmd))
}

/**
 * Gate view: split matches into blocking (R2–R9) and advisory (R1) buckets.
 * The plugin denies on blocking violations; advisory-only commands pass.
 */
export function check(cmd) {
  const all = run(cmd)
  return {
    blocking: all.filter((r) => r.severity === 'blocking'),
    advisory: all.filter((r) => r.severity === 'advisory'),
    all,
  }
}

/** One-line rendering of matched rules, used for deny reasons and CLI output. */
export function formatHits(hits) {
  return hits.map((r) => '  [' + r.id + '] ' + r.title + '（' + r.blog + '）' + NL + '      ' + r.fix).join('' + NL)
}

/** Self-test battery; every case must match its expected rule ids. */
export function selftest() {
  const cases = [
    { label: 'clean', cmd: 'Write-Output "hello"', expect: [] },
    { label: 'R2 var-colon', cmd: '"attempt $attempt: downloading..."', expect: ['R2'] },
    { label: 'R2 scope ok', cmd: 'Write-Output "$env:Path"', expect: [] },
    { label: 'R2 braced ok', cmd: '"attempt ${attempt}: downloading..."', expect: [] },
    { label: 'R3 ternary', cmd: '$v = ($a -gt 0) ? "yes" : "no"', expect: ['R3'] },
    { label: 'R3 fixed', cmd: '$v = if ($a -gt 0) { "yes" } else { "no" }', expect: [] },
    { label: 'R4 windows path', cmd: 'Get-Content "$WINDOWS.~BT.file"', expect: ['R4'] },
    { label: 'R4 realistic full path', cmd: 'Get-Content "C:\\$WINDOWS.~BT\\Sources\\Panther\\setupact.log"', expect: ['R4'] },
    { label: 'R4 single-quoted ok', cmd: "Get-Content \'C:\\$WINDOWS.~BT\\Sources\\Panther\\setupact.log\'", expect: [] },
    { label: 'R5 start-process', cmd: 'Start-Process curl.exe -ArgumentList "-o a.iso https://x" -Wait', expect: ['R5'] },
    { label: 'R5 direct ok', cmd: '& curl.exe -o a.iso https://x', expect: [] },
    { label: 'R6 array', cmd: 'Get-WindowsOptionalFeature -Online -FeatureName A, B', expect: ['R1', 'R6'] },
    { label: 'R6 loop ok', cmd: 'foreach ($n in "A","B") { Get-WindowsOptionalFeature -Online -FeatureName $n }', expect: ['R1'] },
    { label: 'R7 dismount', cmd: 'dism /Mount-Wim ... ; dism /Dismount-Image /MountPath:X', expect: ['R7'] },
    { label: 'R7 unmount ok', cmd: 'dism /Unmount-Image /MountPath:X /Commit', expect: [] },
    { label: 'R8 restorehealth', cmd: 'dism /Online /Cleanup-Image /RestoreHealth /Source:WIM:install.wim:1', expect: ['R1', 'R8'] },
    { label: 'R9 curl resume', cmd: 'curl -L -C - -o x.iso https://cd.example/x.iso', expect: ['R9'] },
    { label: 'R9 plain ok', cmd: 'curl -o x.iso https://cd.example/x.iso', expect: [] },
    { label: 'R10 npm bare', cmd: 'npm run build', expect: ['R10'] },
    { label: 'R10 npm.cmd ok', cmd: 'npm.cmd run build', expect: [] },
    { label: 'R10 npx bare', cmd: 'npx hexo version', expect: ['R10'] },
    { label: 'R10 pnpm bare', cmd: 'pnpm run publish', expect: ['R10'] },
    { label: 'R10 variable ok', cmd: 'Write-Output $npmConfig', expect: [] },
    { label: 'R10 uppercase ok', cmd: 'NPM.CMD run build', expect: [] },
    { label: 'R11 and-or', cmd: 'git commit && git push', expect: ['R11'] },
    { label: 'R11 semicolon ok', cmd: 'git commit; git push', expect: [] },
    { label: 'R11 cmd-skip ok', cmd: 'cmd /c copy /b a+b+c out && del a', expect: [] },
    { label: 'R11 string ok', cmd: 'Write-Output "a && b"', expect: [] },
    { label: 'R11 pipe ok', cmd: 'git diff | Select-String x', expect: [] },
    { label: 'R1 gbk', cmd: 'wsl --status', expect: ['R1'] },
    { label: 'R1 fixed', cmd: 'chcp 65001 | Out-Null; wsl --status', expect: [] },
  ]
  let failures = 0
  for (const c of cases) {
    const got = run(c.cmd).map((r) => r.id).sort().join(',')
    const want = c.expect.slice().sort().join(',')
    const ok = got === want
    if (!ok) failures++
    console.log((ok ? '  PASS' : '  FAIL') + '  ' + c.label + '  got=[' + got + '] want=[' + want + ']')
  }
  console.log('')
  if (failures === 0) { console.log('[powershell-check] selftest: all ' + cases.length + ' cases pass'); return 0 }
  console.log('[powershell-check] selftest: ' + failures + '/' + cases.length + ' cases FAILED')
  return 1
}

const NL = String.fromCharCode(10)

