/**
 * PSScriptAnalyzer deep-check integration.
 *
 * Runs the official PowerShell static analyzer against the command text as a
 * temporary .ps1 file through the harness `ctx.shell` executor (the same seam
 * the hooks bridges use). The harness pwsh starts under Restricted policy, so
 * the probe first raises the process-scope policy to Bypass; on hosts without
 * the module the check degrades to the builtin rules.
 */
import type { ShellExecutor } from '@deepseek-ai/dsh-shell';
import type { Lang } from './checker.ts';
/** One finding emitted by Invoke-ScriptAnalyzer. */
export interface PssaFinding {
    readonly RuleName: string;
    readonly Severity: string;
    readonly Message: string;
    readonly Line: number;
    readonly Column: number;
}
/** Outcome of one deep check: ok (analyzed), missing (module absent), failed (infra error). */
export interface PssaOutcome {
    readonly status: 'ok' | 'missing' | 'failed';
    readonly errors: PssaFinding[];
    readonly warnings: PssaFinding[];
    readonly detail?: string;
}
/** Parse the probe stdout into findings; unparseable output is a failed check. */
export declare function parsePssaJson(raw: string, stderr?: string): PssaOutcome;
/** Render findings for a deny reason or log line (bounded to 10 entries). */
export declare function formatPssaHits(findings: readonly PssaFinding[], lang: Lang): string;
/**
 * Deep-check one command with PSScriptAnalyzer through the shell executor.
 * Never throws: infra failures degrade to a `failed` outcome with a detail.
 */
export declare function analyzeWithPssa(command: string, shell: ShellExecutor, options?: {
    timeoutMs?: number;
    signal?: AbortSignal;
}): Promise<PssaOutcome>;
