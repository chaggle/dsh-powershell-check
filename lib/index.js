import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
//#region lib/types/checker.js
/**
* Static pitfall rules engine for PowerShell commands.
*
* Rules distilled from the blog post 'PowerShell 实战踩坑大全'
* (https://chaggle.github.io/2026/08/14/powershell/powershell-pitfalls/).
* Shared by the cordis plugin (src/index.ts) and the CLI (scripts/check-pwsh.mjs).
* Compiled by tsc + tsdown into lib/ (see tsdown.config.ts).
*/
const BS = String.fromCharCode(92);
/** R1 is an advisory (console-encoding hint); R2–R11 are blocking pitfalls. */
const KNOWN_SCOPES = [
	"env",
	"script",
	"global",
	"local",
	"private",
	"using",
	"function",
	"variable",
	"PSDefaultParameterValues",
	"PSScriptRoot",
	"PSCommandPath",
	"PID",
	"true",
	"false",
	"null"
];
function isWordChar(c) {
	return c >= "a" && c <= "z" || c >= "A" && c <= "Z" || c >= "0" && c <= "9" || c === "_";
}
function isLetter(c) {
	return c >= "a" && c <= "z" || c >= "A" && c <= "Z" || c === "_";
}
function hasWord(text, word) {
	const low = text.toLowerCase();
	const w = word.toLowerCase();
	let idx = 0;
	while ((idx = low.indexOf(w, idx)) >= 0) {
		const before = idx > 0 ? low[idx - 1] : "";
		const after = idx + w.length < low.length ? low[idx + w.length] : "";
		if (!isWordChar(before) && !isWordChar(after)) return true;
		idx += w.length;
	}
	return false;
}
/** Collect $name / ${name} variable occurrences. */
function findVars(cmd) {
	const res = [];
	for (let i = 0; i < cmd.length; i++) {
		if (cmd[i] !== "$") continue;
		if (cmd[i + 1] === "{") {
			let j = i + 2;
			while (j < cmd.length && (isWordChar(cmd[j]) || cmd[j] === ":")) j++;
			if (cmd[j] === "}") {
				res.push({
					start: i,
					end: j + 1,
					braced: true,
					name: cmd.slice(i + 2, j),
					followedBy: cmd[j + 1] || ""
				});
				i = j;
			}
			continue;
		}
		if (!isLetter(cmd[i + 1] || "")) continue;
		let j = i + 1;
		while (j < cmd.length && isWordChar(cmd[j])) j++;
		res.push({
			start: i,
			end: j,
			braced: false,
			name: cmd.slice(i + 1, j),
			followedBy: cmd[j] || ""
		});
		i = j - 1;
	}
	return res;
}
function r1Gbk(cmd) {
	if (!(hasWord(cmd, "wsl") || cmd.includes("Get-WindowsOptionalFeature") || cmd.includes("Enable-WindowsOptionalFeature") || cmd.includes("RestoreHealth") || cmd.includes("Cleanup-Image") || cmd.includes("/Get-"))) return false;
	if (hasWord(cmd, "chcp") || cmd.includes("65001") || /OutputEncoding/.test(cmd)) return false;
	return true;
}
function r2VarColon(cmd) {
	for (const v of findVars(cmd)) {
		if (v.braced) continue;
		if (v.followedBy === ":" && KNOWN_SCOPES.indexOf(v.name) < 0) return true;
	}
	return false;
}
function r3Ternary(cmd) {
	for (let i = 0; i < cmd.length - 1; i++) {
		if (cmd[i] !== ")") continue;
		let j = i + 1;
		while (j < cmd.length && (cmd[j] === " " || cmd[j] === "	" || cmd[j] === "\r")) j++;
		if (cmd[j] === "?") return true;
	}
	return false;
}
/** R4: a $WORD inside a double-quoted string followed by a dot or a backslash (path trap). */
function r4DollarInDoubleQuotedPath(cmd) {
	const lines = cmd.split("\n");
	for (const ln of lines) {
		let inDQ = false;
		for (let i = 0; i < ln.length; i++) {
			const ch = ln[i];
			if (ch === "\"") {
				inDQ = !inDQ;
				continue;
			}
			if (ch !== "$" || !inDQ) continue;
			if (ln[i + 1] === "{") continue;
			if (!isLetter(ln[i + 1] || "")) continue;
			let j = i + 1;
			while (j < ln.length && isWordChar(ln[j])) j++;
			const followed = ln[j] || "";
			if (followed === "." || followed === BS) return true;
			i = j - 1;
		}
	}
	return false;
}
function r5StartProcess(cmd) {
	return hasWord(cmd, "Start-Process");
}
function r6FeatureNameArray(cmd) {
	const lines = cmd.split("\n");
	for (const ln of lines) {
		if (!ln.includes("Get-WindowsOptionalFeature")) continue;
		const k = ln.indexOf("-FeatureName");
		if (k < 0) continue;
		if (ln.slice(k + 12).includes(",")) return true;
	}
	return false;
}
function r7DismountImage(cmd) {
	return cmd.toLowerCase().includes("/dismount-image");
}
function r8RestoreHealthSource(cmd) {
	const lines = cmd.split("\n");
	for (const ln of lines) if (ln.includes("RestoreHealth") && ln.toLowerCase().includes("/source")) return true;
	return false;
}
function r9CurlResume(cmd) {
	const lines = cmd.split("\n");
	for (const ln of lines) {
		if (!ln.toLowerCase().includes("curl")) continue;
		if (ln.includes("-L") && (ln.includes("-C -") || ln.includes("-C-"))) return true;
	}
	return false;
}
/** R10: npm/npx/pnpm invoked without the .cmd suffix — PowerShell blocks npm.ps1 (ExecutionPolicy). */
function r10NpmCmd(cmd) {
	const names = [
		"npm",
		"npx",
		"pnpm"
	];
	const allowedBefore = " ;|&" + String.fromCharCode(9);
	for (const name of names) for (let i = 0; i < cmd.length; i++) {
		const prev = i > 0 ? cmd[i - 1] : "";
		if (prev !== "" && allowedBefore.indexOf(prev) < 0) continue;
		if (cmd.slice(i, i + name.length).toLowerCase() !== name) continue;
		const after = i + name.length < cmd.length ? cmd[i + name.length] : "";
		if (after === ".") continue;
		if (after !== "" && after !== " " && after !== "\"" && after !== "'" && after !== "	") continue;
		return true;
	}
	return false;
}
/** R11: && / || chain operators do not exist in Windows PowerShell 5.1 (PS 7+ only). */
function r11NoAndOr(cmd) {
	const lines = cmd.split("\n");
	for (const ln of lines) {
		if (hasWord(ln, "bash") || hasWord(ln, "zsh") || hasWord(ln, "sh")) continue;
		const low = ln.toLowerCase();
		if (low.includes("cmd /c") || low.includes("cmd.exe /c")) continue;
		let q = null;
		for (let i = 0; i < ln.length - 1; i++) {
			const ch = ln[i];
			if (ch === "\"" || ch === "'") {
				if (q === null) q = ch;
				else if (q === ch && ln[i - 1] !== "`") q = null;
				continue;
			}
			if (q !== null) continue;
			if (ch === "&" && ln[i + 1] === "&" || ch === "|" && ln[i + 1] === "|") return true;
		}
	}
	return false;
}
function r12JsonDepth(cmd) {
	const lines = cmd.split("\n");
	for (const ln of lines) {
		if (!ln.includes("ConvertTo-Json")) continue;
		if (ln.includes("-Depth")) continue;
		return true;
	}
	return false;
}
function r13UnderscoreInForeach(cmd) {
	const low = cmd.toLowerCase();
	if (!low.includes("foreach (") || !cmd.includes("$_")) return false;
	if (low.includes("foreach-object")) return false;
	return true;
}
function r14AssignmentAsComparison(cmd) {
	const openers = [
		"if (",
		"while (",
		"elseif ("
	];
	for (let i = 0; i < cmd.length; i++) {
		let matched = false;
		for (const op of openers) if (cmd.startsWith(op, i)) {
			matched = true;
			break;
		}
		if (!matched) continue;
		let depth = 0;
		let j = i;
		for (; j < cmd.length; j++) {
			const ch = cmd[j];
			if (ch === "(") depth++;
			else if (ch === ")") {
				depth--;
				if (depth === 0) break;
			}
		}
		const inner = cmd.slice(i, j + 1);
		let q = null;
		for (let k = 0; k < inner.length - 1; k++) {
			const ch = inner[k];
			if (ch === "\"" || ch === "'") {
				if (q === null) q = ch;
				else if (q === ch && inner[k - 1] !== "`") q = null;
				continue;
			}
			if (q !== null) continue;
			if (ch !== "=") continue;
			const prev = k > 0 ? inner[k - 1] : "";
			const next = inner[k + 1];
			if ("=!<>+-*/%".includes(prev)) continue;
			if (next === "=") continue;
			return true;
		}
		i = j;
	}
	return false;
}
function r15Ps7OnlySyntax(cmd) {
	return [
		"-AsHashtable",
		"-AsByteStream",
		"-Parallel",
		"??",
		"?."
	].some((t) => cmd.includes(t));
}
function r16CmdStyle(cmd) {
	const lines = cmd.split("\n");
	const tokens = [
		"del ",
		"copy ",
		"move ",
		"mkdir "
	];
	for (const ln of lines) {
		const low = ln.toLowerCase();
		if (low.includes("cmd /c") || low.includes("cmd.exe /c")) continue;
		if (hasWord(ln, "bash") || hasWord(ln, "sh")) continue;
		for (const t of tokens) if (low.startsWith(t) || low.includes("; " + t) || low.includes("| " + t) || low.includes("& " + t)) return true;
		for (let i = 0; i < ln.length; i++) {
			if (ln[i] !== "%") continue;
			if (!isLetter(ln[i + 1] || "")) continue;
			let j = i + 1;
			while (j < ln.length && isWordChar(ln[j])) j++;
			if (ln[j] === "%") return true;
		}
	}
	return false;
}
function r17WriteHost(cmd) {
	return hasWord(cmd, "Write-Host");
}
/** Pitfall rules: R1/R12/R13/R15/R16/R17 advisory, the rest blocking. */
const RULES = [
	{
		id: "R1",
		severity: "advisory",
		title: "中文输出可能 GBK 乱码",
		titleEn: "Possible GBK mojibake for Chinese console output",
		blog: "§一",
		test: r1Gbk,
		fix: "命令涉及 wsl/Windows 功能查询且未见 chcp：输出中文前先 `chcp 65001 | Out-Null`（或设置 [Console]::OutputEncoding）。",
		fixEn: "Commands touching wsl/Windows feature queries without chcp: prefix `chcp 65001 | Out-Null` (or set [Console]::OutputEncoding) before reading Chinese output."
	},
	{
		id: "R2",
		severity: "blocking",
		title: "$var: 被解析成驱动器限定变量",
		titleEn: "$var: parsed as a drive-qualified variable",
		blog: "§二",
		test: r2VarColon,
		fix: "`$attempt:` 会被当成 `$env:Path` 式作用域语法，改为 `${attempt}:` 显式界定。",
		fixEn: "`$attempt:` is parsed as scope/drive syntax (like $env:Path); use `${attempt}:` to delimit explicitly."
	},
	{
		id: "R3",
		severity: "blocking",
		title: "PowerShell 5.1 没有三元运算符",
		titleEn: "PowerShell 5.1 has no ternary operator",
		blog: "§三",
		test: r3Ternary,
		fix: "`($a -gt 0) ? \"yes\" : \"no\"` 在 PS 5.1 解析报错；改用 `$v = if ($a -gt 0) { \"yes\" } else { \"no\" }`。",
		fixEn: "`($a -gt 0) ? \"yes\" : \"no\"` is a parse error in PS 5.1; use `$v = if ($a -gt 0) { \"yes\" } else { \"no\" }`."
	},
	{
		id: "R4",
		severity: "blocking",
		title: "双引号里的 $变量 被展开（路径陷阱）",
		titleEn: "Double-quoted $var expanded (path trap)",
		blog: "§四",
		test: r4DollarInDoubleQuotedPath,
		fix: "双引号内 $WORD 后跟 . 或 \\ 时路径中的 $ 会被展开（如 \"C:\\$WINDOWS.~BT\\Sources\\...\"）；需要字面 $ 的路径改用单引号。确属展开意图可忽略。",
		fixEn: "Inside double quotes a $WORD followed by . or \\ is expanded (e.g. \"C:\\$WINDOWS.~BT\\Sources\\...\"); use single quotes when the $ must stay literal. Ignore when expansion is intended."
	},
	{
		id: "R5",
		severity: "blocking",
		title: "Start-Process 包装外部命令",
		titleEn: "Start-Process wrapping an external command",
		blog: "§六",
		test: r5StartProcess,
		fix: "-ArgumentList 不会自动加引号（路径含空格碎参数）；后台 Start-Process curl 下载会内容损坏。能直接调用就别包一层：`& curl.exe ...`。",
		fixEn: "-ArgumentList does not quote automatically (paths with spaces break); background Start-Process curl downloads came out corrupted. Call `& curl.exe ...` directly instead of wrapping."
	},
	{
		id: "R6",
		severity: "blocking",
		title: "Get-WindowsOptionalFeature 的 FeatureName 不支持数组",
		titleEn: "Get-WindowsOptionalFeature -FeatureName does not take arrays",
		blog: "§七",
		test: r6FeatureNameArray,
		fix: "`-FeatureName A, B` 报 Cannot convert System.Object[]；用 `foreach ($n in \"A\",\"B\") { ... -FeatureName $n }`。",
		fixEn: "`-FeatureName A, B` fails with Cannot convert System.Object[]; loop: `foreach ($n in \"A\",\"B\") { ... -FeatureName $n }`."
	},
	{
		id: "R7",
		severity: "blocking",
		title: "DISM 动词 /Dismount-Image 不存在",
		titleEn: "DISM verb /Dismount-Image does not exist",
		blog: "§八",
		test: r7DismountImage,
		fix: "正确动词是 `/Unmount-Image`，否则报 错误:87 且 wim 一直挂载占空间。",
		fixEn: "The correct verb is `/Unmount-Image`; /Dismount-Image errors (错误:87) and leaves the wim mounted."
	},
	{
		id: "R8",
		severity: "blocking",
		title: "RestoreHealth 源版本可能比系统新",
		titleEn: "RestoreHealth source may be newer than the current build",
		blog: "§九",
		test: r8RestoreHealthSource,
		fix: "0x800f0915 = 修复源比当前系统新；源要求同版本或更旧，或走 Windows Update。",
		fixEn: "0x800f0915 means the fix source is newer than the current system; use a source of the same or older build, or Windows Update."
	},
	{
		id: "R9",
		severity: "blocking",
		title: "curl -L 与 -C - 组合可能拖慢 CDN 下载",
		titleEn: "curl -L with -C - can slow CDN downloads",
		blog: "§十",
		test: r9CurlResume,
		fix: "部分 CDN 上 `curl -L` 与 `-C -` 组合会拖慢速度；优先 HEAD 拿 Content-Length → 分段 `-r` 并行 → copy /b 合并。",
		fixEn: "On some CDNs `curl -L` combined with `-C -` is slow; prefer HEAD for Content-Length, parallel `-r` ranges, then copy /b merge."
	},
	{
		id: "R10",
		severity: "blocking",
		title: "npm/npx/pnpm 不带 .cmd 后缀（npm.ps1 被 ExecutionPolicy 拦截）",
		titleEn: "npm/npx/pnpm invoked without the .cmd suffix (npm.ps1 blocked by ExecutionPolicy)",
		blog: "§十一",
		test: r10NpmCmd,
		fix: "PowerShell 默认禁止运行脚本，PATH 里的 npm.ps1 加载报错（running scripts is disabled）；显式用 `npm.cmd run ...` / `npx.cmd ...` / `pnpm.cmd ...`。",
		fixEn: "PowerShell blocks script execution, so the npm.ps1 on PATH fails (running scripts is disabled); explicitly use `npm.cmd run ...` / `npx.cmd ...` / `pnpm.cmd ...`."
	},
	{
		id: "R11",
		severity: "blocking",
		title: "PowerShell 5.1 没有 && / || 链式运算符",
		titleEn: "PowerShell 5.1 has no && / || chain operators",
		blog: "§十二",
		test: r11NoAndOr,
		fix: "`a && b` 在 PS 5.1 解析报错（PS 7+ 才支持）；改用 `a; b`、`if ($LASTEXITCODE -eq 0) { b }` 或分行执行。cmd/bash 内部除外。",
		fixEn: "`a && b` is a parse error in PS 5.1 (PS 7+ only); use `a; b`, `if ($LASTEXITCODE -eq 0) { b }`, or separate lines. cmd/bash contexts are exempt."
	},
	{
		id: "R12",
		severity: "advisory",
		title: "ConvertTo-Json 未指定 -Depth（默认 2 截断嵌套数据）",
		titleEn: "ConvertTo-Json without -Depth (default depth 2 truncates nested data)",
		blog: "§十三",
		test: r12JsonDepth,
		fix: "AI 生成的 JSON 序列化常被静默截断：默认深度只有 2 层。显式加 `-Depth 100`（或按数据实际深度设值）。",
		fixEn: "AI-generated JSON serialization is silently truncated: the default depth is only 2. Add `-Depth 100` (or a value matching your data)."
	},
	{
		id: "R13",
		severity: "advisory",
		title: "foreach 循环体内使用 $_（不是循环变量）",
		titleEn: "$_ used inside a foreach ($x in ...) loop (not the loop variable)",
		blog: "§十四",
		test: r13UnderscoreInForeach,
		fix: "在 `foreach ($f in $files)` 里循环变量是 `$f`，`$_` 是外层管道的当前对象或 $null；改用循环变量，或换 `ForEach-Object { $_ }`。",
		fixEn: "Inside `foreach ($f in $files)` the loop variable is `$f`; `$_` is the enclosing pipeline item or $null. Use the loop variable, or switch to `ForEach-Object { $_ }`."
	},
	{
		id: "R14",
		severity: "blocking",
		title: "if/while 条件里用单等号 = 当比较",
		titleEn: "Single = used as a comparison inside if/while conditions",
		blog: "§十五",
		test: r14AssignmentAsComparison,
		fix: "`if ($x = 5)` 是赋值不是比较（条件恒真）——AI 常把 `=` 当 `==`；PS 比较用 `-eq`：`if ($x -eq 5)`。",
		fixEn: "`if ($x = 5)` assigns instead of comparing (always truthy) — AI often uses `=` like `==`; PowerShell comparisons use `-eq`: `if ($x -eq 5)`."
	},
	{
		id: "R15",
		severity: "advisory",
		title: "PowerShell 7+ 专属语法（5.1 不兼容）",
		titleEn: "PowerShell 7+ only syntax (not compatible with 5.1)",
		blog: "§十六",
		test: r15Ps7OnlySyntax,
		fix: "`-AsHashtable`、`ForEach-Object -Parallel`、`-AsByteStream`、`??`、`?.` 都是 PS 7+ 才有；目标机若是 5.1 会直接报错。确认运行环境或改用 5.1 等价写法（如 `-Encoding Byte`）。",
		fixEn: "`-AsHashtable`, `ForEach-Object -Parallel`, `-AsByteStream`, `??`, `?.` are PS 7+ only; on a 5.1 host they fail outright. Confirm the runtime or use the 5.1 equivalent (e.g. `-Encoding Byte`)."
	},
	{
		id: "R16",
		severity: "advisory",
		title: "cmd 风格命令/环境变量混入（del/copy/move/mkdir、%VAR%）",
		titleEn: "cmd-style commands or %VAR% env syntax mixed into PowerShell",
		blog: "§十七",
		test: r16CmdStyle,
		fix: "裸 `del`/`copy`/`move`/`mkdir` 是 cmd 风格（参数语义与 PowerShell cmdlet 不同），`%VAR%` 在 PS 中不会展开；改用 `Remove-Item`/`Copy-Item`/`Move-Item`/`New-Item` 与 `$env:VAR`。",
		fixEn: "Bare `del`/`copy`/`move`/`mkdir` are cmd-style (flag semantics differ from PS cmdlets) and `%VAR%` does not expand in PowerShell; use `Remove-Item`/`Copy-Item`/`Move-Item`/`New-Item` and `$env:VAR`."
	},
	{
		id: "R17",
		severity: "advisory",
		title: "Write-Host 输出不进管道（AI 常用来「打印」结果）",
		titleEn: "Write-Host output bypasses the pipeline (AI often prints results with it)",
		blog: "§十八",
		test: r17WriteHost,
		fix: "`Write-Host` 只写控制台，下游 `|` 捕获不到；需要输出/捕获结果用 `Write-Output`（或直接表达式）。进度提示才用 Write-Host。",
		fixEn: "`Write-Host` writes only to the console; downstream `|` cannot capture it. Use `Write-Output` (or a bare expression) when the result must be captured; Write-Host is only for progress display."
	}
];
/** Run every rule against one command and return the matching rule objects. */
function run(cmd) {
	return RULES.filter((r) => r.test(cmd));
}
/** Gate view: split matches into blocking (R2–R11, R14) and advisory buckets. */
function check(cmd) {
	const all = run(cmd);
	return {
		blocking: all.filter((r) => r.severity === "blocking"),
		advisory: all.filter((r) => r.severity === "advisory"),
		all
	};
}
/** Render matched rules in the requested language, for deny reasons and CLI output. */
function formatHits(hits, lang = "zh") {
	return hits.map((r) => "  [" + r.id + "] " + (lang === "en" ? r.titleEn : r.title) + "（" + r.blog + "）" + NL$1 + "      " + (lang === "en" ? r.fixEn : r.fix)).join("" + NL$1);
}
const NL$1 = String.fromCharCode(10);
//#endregion
//#region lib/types/invariant.js
/**
* Config validation for dsh-powershell-check.
* Kept as its own module so tsdown emits a companion lib/invariant.js bundle,
* mirroring the official package layout (index + invariant).
*/
/** Validate and default the plugin config; throws on unknown values. */
function normalizeConfig(config) {
	return {
		mode: config.mode === "warn" ? "warn" : "deny",
		lang: config.lang === "en" ? "en" : "zh"
	};
}
//#endregion
//#region lib/types/index.js
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
const name = "dsh-powershell-check";
const inject = ["skills"];
const PROVIDER_NAME = "dsh-powershell-check";
const SKILL_BODY_URL = new URL("../SKILL.md", import.meta.url);
const RESOURCE_BASE = {
	kind: "directory",
	path: fileURLToPath(new URL("../", import.meta.url))
};
const CANDIDATE = {
	name: "powershell-check",
	description: "Use before executing any PowerShell command or script — pwsh tool calls, generated .ps1 files, or PowerShell embedded in templates — to statically check it against the documented PowerShell pitfalls from the blog post \"PowerShell 实战踩坑大全\" and fix every flagged violation first.",
	invocation: {
		modelInvocable: true,
		userInvocable: true
	},
	provider: PROVIDER_NAME,
	source: "bundled",
	resourceBase: RESOURCE_BASE,
	rank: 600,
	locator: SKILL_BODY_URL
};
const provider = {
	name: PROVIDER_NAME,
	list: () => Promise.resolve([CANDIDATE]),
	async get(_candidate) {
		return {
			name: CANDIDATE.name,
			description: CANDIDATE.description,
			invocation: CANDIDATE.invocation,
			provider: CANDIDATE.provider,
			source: CANDIDATE.source,
			resourceBase: RESOURCE_BASE,
			content: await readFile(SKILL_BODY_URL, "utf8")
		};
	}
};
/** Extract the PowerShell command text from a pwsh tool call. */
function commandOf(exec) {
	const args = exec.arguments;
	if (!args || typeof args !== "object") return "";
	const command = args.command;
	return typeof command === "string" ? command : "";
}
/**
* Plugin entry: register the bundled skill provider and the pre-execute gate.
*/
function apply(ctx, config = {}) {
	const { mode, lang } = normalizeConfig(config);
	ctx.skills.registerProvider(() => provider);
	ctx.on("tools/pre-execute", async (exec, next) => {
		if (exec.name !== "pwsh") return next();
		const command = commandOf(exec);
		if (!command.trim()) return next();
		const { blocking, advisory } = check(command);
		if (mode === "warn") {
			const hits = [...blocking, ...advisory];
			if (hits.length > 0 && ctx.logger) ctx.logger.warn("[powershell-check] " + hits.length + (lang === "en" ? " known PowerShell pitfalls (warn mode, allowed): " : " 个已知 PowerShell 坑位（warn 模式，放行）：") + NL + formatHits(hits, lang));
			return next();
		}
		if (blocking.length === 0) return next();
		const note = advisory.length > 0 ? NL + (lang === "en" ? "Also " + advisory.length + " advisory item(s) (R1 GBK mojibake, non-blocking)." : "另有 " + advisory.length + " 条建议（R1 GBK 乱码，不影响执行）。") : "";
		return {
			kind: "deny",
			reason: (lang === "en" ? "powershell-check: " + blocking.length + " known PowerShell pitfall(s) detected; fix before retrying:" : "powershell-check: 检测到 " + blocking.length + " 个已知 PowerShell 坑位，请先修复后再执行：") + NL + formatHits(blocking, lang) + note
		};
	});
}
const NL = String.fromCharCode(10);
//#endregion
export { apply, inject, name };
