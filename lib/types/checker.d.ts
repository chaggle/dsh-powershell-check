/**
 * Static pitfall rules engine for PowerShell commands.
 *
 * Rules distilled from the blog post 'PowerShell 实战踩坑大全'
 * (https://chaggle.github.io/blog/2026/08/14/powershell-pitfalls/).
 * Shared by the cordis plugin (src/index.ts) and the CLI (scripts/check-pwsh.mjs).
 * Compiled by tsc + tsdown into lib/ (see tsdown.config.ts).
 */
/** Output language for rule text. */
export type Lang = 'zh' | 'en';
/** One pitfall rule. */
export interface Rule {
    readonly id: string;
    readonly severity: 'advisory' | 'blocking';
    readonly title: string;
    readonly titleEn: string;
    readonly fix: string;
    readonly fixEn: string;
    readonly blog: string;
    readonly test: (cmd: string) => boolean;
}
/** Gate view of one check: blocking (denied) vs advisory (allowed) matches. */
export interface CheckResult {
    readonly blocking: Rule[];
    readonly advisory: Rule[];
    readonly all: Rule[];
}
/** Pitfall rules: R1/R12/R13/R15/R16/R17 advisory, the rest blocking. */
export declare const RULES: readonly Rule[];
/** Run every rule against one command and return the matching rule objects. */
export declare function run(cmd: string): Rule[];
/** Gate view: split matches into blocking (R2–R11, R14) and advisory buckets. */
export declare function check(cmd: string): CheckResult;
/** Render matched rules in the requested language, for deny reasons and CLI output. */
export declare function formatHits(hits: readonly Rule[], lang?: Lang): string;
/** Self-test battery; every case must match its expected rule ids. */
export declare function selftest(): number;
