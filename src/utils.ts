import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * True when `name` is declared in the consumer's `package.json` as a regular, dev, or peer
 * dependency. We deliberately do not walk `node_modules`: under pnpm's strict layout, maninak's
 * own transitive deps (e.g. `react` riding in via eslint-plugin-vue, or `tailwindcss` riding
 * in as a peer-auto-install of eslint-plugin-tailwindcss) leak into resolution checks and
 * produce false positives. The consumer's declared deps are the authoritative answer for
 * "does the user intend to lint this kind of file".
 */
export function isInConsumerDeps(name: string): boolean {
  const pkg = readConsumerPackageJson()
  if (!pkg) {
    return false
  }

  return (
    name in (pkg.dependencies ?? {}) ||
    name in (pkg.devDependencies ?? {}) ||
    name in (pkg.peerDependencies ?? {})
  )
}

const DEFAULT_VUE_VERSION_TARGET = 3.5

/**
 * Returns a numeric Vue major.minor version inferred from the consumer's `package.json` `vue`
 * (or `nuxt`) dependency range, or {@link DEFAULT_VUE_VERSION_TARGET} when nothing is
 * declared.
 *
 * The number is intentionally lossy: only the first two components are kept (3.5, 3.4, 3.0,
 * 2.7 etc.) because that's all the version-gated rule sections need to distinguish. Build
 * metadata, patch versions, pre-release tags, and prefixes (`^`, `~`, `>=`, `workspace:`,
 * `npm:`) are stripped before parsing.
 *
 * Auto-detection is just a default. Consumers who want a different gating can override any
 * rule in their own `eslint.config.mjs` by appending a config block that re-sets the rule.
 */
export function getConsumerVueVersion(): number {
  const pkg = readConsumerPackageJson()
  if (!pkg) {
    return DEFAULT_VUE_VERSION_TARGET
  }
  const range =
    pkg.dependencies?.['vue'] ??
    pkg.devDependencies?.['vue'] ??
    pkg.peerDependencies?.['vue'] ??
    pkg.dependencies?.['nuxt'] ??
    pkg.devDependencies?.['nuxt']
  if (!range) {
    return DEFAULT_VUE_VERSION_TARGET
  }
  const match = /(\d+)\.(\d+)/.exec(range)
  if (!match) {
    return DEFAULT_VUE_VERSION_TARGET
  }

  return Number.parseFloat(`${match[1]}.${match[2]}`)
}

interface PackageJsonDeps {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

function readConsumerPackageJson(): PackageJsonDeps | undefined {
  try {
    return JSON.parse(
      readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
    ) as PackageJsonDeps
  } catch {
    return undefined
  }
}

/** True when the consumer's cwd has a `tsconfig.json` at its root. */
export function hasConsumerTsconfig(): boolean {
  return existsSync(path.join(process.cwd(), 'tsconfig.json'))
}
