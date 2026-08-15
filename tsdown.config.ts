import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

const root = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  peerDependencies?: Record<string, string>
  dependencies?: Record<string, string>
}

const shared = {
  outDir: 'lib',
  format: ['esm'] as const,
  platform: 'node' as const,
  target: 'es2024',
  fixedExtension: false,
  outputOptions: { codeSplitting: false },
  dts: false,
  clean: false,
  deps: {
    neverBundle: [...Object.keys(pkg.peerDependencies ?? {}), ...Object.keys(pkg.dependencies ?? {})],
  },
}

/** Build the plugin entry, checker engine, and invariant companion as independent bundles. */
export default defineConfig([
  { entry: ['lib/types/index.js'], ...shared },
  { entry: ['lib/types/checker.js'], ...shared },
  { entry: ['lib/types/invariant.js'], ...shared },
])

