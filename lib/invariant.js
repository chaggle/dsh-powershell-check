// lib/types/invariant.js
/**
* Config validation for dsh-powershell-check.
* Kept as its own module so tsdown emits a companion lib/invariant.js bundle,
* mirroring the official package layout (index + invariant).
*/
/** Validate and default the plugin config; throws on unknown values. */
function normalizeConfig(config) {
	return {
		mode: config.mode === "warn" ? "warn" : "deny",
		lang: config.lang === "en" ? "en" : "zh",
		analyzer: config.analyzer === "psscriptanalyzer" ? "psscriptanalyzer" : "builtin"
	};
}
export { normalizeConfig };
