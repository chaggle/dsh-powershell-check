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
import type { Context } from '@deepseek-ai/cordis';
import { type Lang } from './checker.ts';
export declare const name = "dsh-powershell-check";
export declare const inject: string[];
/** Plugin configuration: gate mode, output language, and analyzer depth. */
export interface PluginConfig {
    /** deny blocks pwsh calls with blocking violations; warn only logs them. */
    readonly mode?: 'deny' | 'warn';
    /** Language for deny reasons and warn logs. */
    readonly lang?: Lang;
    /**
     * builtin (default): the bundled R1-R19 static rules only.
     * psscriptanalyzer: additionally deep-checks every pwsh command with the
     * official PSScriptAnalyzer (needs the module on the host; degrades to
     * builtin when missing). ParseError/Error findings deny, warnings log.
     */
    readonly analyzer?: 'builtin' | 'psscriptanalyzer';
}
/**
 * Plugin entry: register the bundled skill provider and the pre-execute gate.
 */
export declare function apply(ctx: Context, config?: PluginConfig): void;
