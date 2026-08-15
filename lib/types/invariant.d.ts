/**
 * Config validation for dsh-powershell-check.
 * Kept as its own module so tsdown emits a companion lib/invariant.js bundle,
 * mirroring the official package layout (index + invariant).
 */
import type { Lang } from './checker.ts';
import type { PluginConfig } from './index.ts';
export interface NormalizedConfig {
    readonly mode: 'deny' | 'warn';
    readonly lang: Lang;
}
/** Validate and default the plugin config; throws on unknown values. */
export declare function normalizeConfig(config: PluginConfig): NormalizedConfig;
