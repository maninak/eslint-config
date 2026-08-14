import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { globSync } from 'tinyglobby'
import { parse as parseYaml } from 'yaml'

interface PackageJsonDeps {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  workspaces?: string[] | { packages?: string[] }
}

function readPackageJsonAt(dir: string): PackageJsonDeps | undefined {
  try {
    return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as PackageJsonDeps
  } catch {
    return undefined
  }
}

/**
 * The workspace package globs a monorepo declares, read from `pnpm-workspace.yaml`
 * (`packages`) or, failing that, the root `package.json` `workspaces` field (array or
 * `{ packages }`). A `pnpm-workspace.yaml` that carries only other settings (e.g.
 * `allowBuilds`) yields no globs, so a single-package consumer is treated exactly as before.
 */
function getWorkspaceGlobs(root: string, rootPkg: PackageJsonDeps | undefined): string[] {
  const pnpmWorkspacePath = path.join(root, 'pnpm-workspace.yaml')
  if (existsSync(pnpmWorkspacePath)) {
    try {
      const parsed = parseYaml(readFileSync(pnpmWorkspacePath, 'utf8')) as
        { packages?: unknown } | undefined
      if (Array.isArray(parsed?.packages)) {
        return parsed.packages.filter((glob): glob is string => typeof glob === 'string')
      }
    } catch {
      // Malformed yaml: fall through to the package.json `workspaces` field.
    }
  }

  const workspaces = rootPkg?.workspaces
  if (Array.isArray(workspaces)) {
    return workspaces.filter((glob): glob is string => typeof glob === 'string')
  }
  if (workspaces && Array.isArray(workspaces.packages)) {
    return workspaces.packages.filter((glob): glob is string => typeof glob === 'string')
  }

  return []
}

/** A `package.json` in the consumer's workspace, and the directory it sits in. */
interface WorkspacePackage {
  dir: string
  pkg: PackageJsonDeps
}

const workspaceDepsCache = new Map<string, WorkspacePackage[]>()

/**
 * Every `package.json` in the consumer's workspace: the root one plus each sub-package
 * reachable through the workspace globs, each with its directory. Cached per cwd (detection
 * runs once per `maninak()` call, and several framework checks share the same scan).
 *
 * We read DECLARED deps only and never walk `node_modules`. Under pnpm's strict layout
 * maninak's own transitive deps leak into resolution (e.g. `react` riding in via
 * eslint-plugin-vue, or `tailwindcss` as a peer-auto-install of the Tailwind plugin); a
 * resolvability check would turn those into false positives. The consumer's declared deps,
 * anywhere in the workspace, are the authoritative answer for "does the user intend to lint
 * this kind of file".
 */
function getWorkspacePackages(): WorkspacePackage[] {
  const root = process.cwd()
  const cached = workspaceDepsCache.get(root)
  if (cached) {
    return cached
  }

  const rootPkg = readPackageJsonAt(root)
  const result: WorkspacePackage[] = rootPkg ? [{ dir: root, pkg: rootPkg }] : []

  const globs = getWorkspaceGlobs(root, rootPkg)
  if (globs.length > 0) {
    // Positive globs select package dirs; a `!`-prefixed glob (pnpm negation) is an ignore.
    const positive = globs
      .filter((glob) => !glob.startsWith('!'))
      .map((glob) => `${glob}/package.json`)
    const negative = globs
      .filter((glob) => glob.startsWith('!'))
      .map((glob) => `${glob.slice(1)}/package.json`)

    try {
      const matches = globSync(positive, {
        cwd: root,
        ignore: ['**/node_modules/**', ...negative],
        absolute: true,
      })

      for (const match of matches) {
        const dir = path.dirname(match)
        const pkg = readPackageJsonAt(dir)
        if (pkg) {
          result.push({ dir, pkg })
        }
      }
    } catch {
      // Glob failure degrades gracefully to root-only detection.
    }
  }

  workspaceDepsCache.set(root, result)

  return result
}

function getWorkspacePackageJsons(): PackageJsonDeps[] {
  return getWorkspacePackages().map(({ pkg }) => pkg)
}

/**
 * Every directory in the consumer's workspace that holds a `package.json`, nearest first.
 *
 * A dependency declared by a sub-package is installed into THAT package's `node_modules`, not
 * the workspace root's, so anything resolving a consumer's dependency has to search from each
 * of these rather than from the cwd alone. taiga-grove keeps `@nuxt/ui` in `apps/web`, where a
 * root-only search finds nothing at all.
 */
export function getWorkspacePackageDirs(): string[] {
  return getWorkspacePackages().map(({ dir }) => dir)
}

function isDeclaredIn(pkg: PackageJsonDeps, name: string): boolean {
  return (
    name in (pkg.dependencies ?? {}) ||
    name in (pkg.devDependencies ?? {}) ||
    name in (pkg.peerDependencies ?? {})
  )
}

/**
 * True when `name` is declared as a regular, dev, or peer dependency anywhere in the
 * consumer's workspace: the root `package.json` or any sub-package reachable through the
 * workspace globs. This lets a plain `maninak()` enable Vue/Nuxt/Svelte/React config when the
 * framework lives in a sub-package (e.g. `apps/web`) rather than the workspace root.
 */
export function isInConsumerDeps(name: string): boolean {
  return getWorkspacePackageJsons().some((pkg) => isDeclaredIn(pkg, name))
}

const DEFAULT_VUE_VERSION_TARGET = 3.5

/**
 * Returns a numeric Vue major.minor version inferred from the `vue` (or `nuxt`) dependency
 * range declared anywhere in the consumer's workspace, or {@link DEFAULT_VUE_VERSION_TARGET}
 * when nothing is declared.
 *
 * The number is intentionally lossy: only the first two components are kept (3.5, 3.4, 3.0,
 * 2.7 etc.) because that's all the version-gated rule sections need to distinguish. Build
 * metadata, patch versions, pre-release tags, and prefixes (`^`, `~`, `>=`, `workspace:`,
 * `npm:`) are stripped before parsing.
 *
 * Auto-detection is just a default. Consumers who want different gating can override any rule
 * in their own `eslint.config.mjs` by appending a config block that re-sets the rule.
 */
export function getConsumerVueVersion(): number {
  for (const pkg of getWorkspacePackageJsons()) {
    const range =
      pkg.dependencies?.['vue'] ??
      pkg.devDependencies?.['vue'] ??
      pkg.peerDependencies?.['vue'] ??
      pkg.dependencies?.['nuxt'] ??
      pkg.devDependencies?.['nuxt']
    if (!range) {
      continue
    }
    const match = /(\d+)\.(\d+)/.exec(range)
    if (match) {
      return Number.parseFloat(`${match[1]}.${match[2]}`)
    }
  }

  return DEFAULT_VUE_VERSION_TARGET
}

/** True when the consumer's cwd has a `tsconfig.json` at its root. */
export function hasConsumerTsconfig(): boolean {
  return existsSync(path.join(process.cwd(), 'tsconfig.json'))
}

/*
 * Where a project's own CSS is never found: dependencies, build output, and caches. Scanning
 * them would be slow and would surface a bundled copy of somebody else's entry point as if it
 * were this project's theme.
 */
const THEME_SCAN_IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/vendor/**',
  '**/.git/**',
  '**/.cache/**',
  '**/.nuxt/**',
  '**/.output/**',
  '**/.next/**',
  '**/.svelte-kit/**',
  '**/.vercel/**',
  '**/.netlify/**',
]

const projectCssCache = new Map<string, string[]>()

/**
 * Every CSS file the project owns, as absolute paths, dependencies and build output excluded.
 *
 * Cached per cwd because two features ask: the Tailwind theme scan reads these looking for the
 * entry point, and the CSS rules ask only whether there are any. One walk of the tree answers
 * both, which matters on a monorepo where it costs ~45ms.
 */
export function findProjectCssFiles(root: string): string[] {
  const cached = projectCssCache.get(root)
  if (cached) {
    return cached
  }

  let files: string[]
  try {
    files = globSync(['**/*.css'], { cwd: root, ignore: THEME_SCAN_IGNORE, absolute: true })
    files.sort()
  } catch {
    // A glob failure degrades to "found nothing", which every caller already explains.
    files = []
  }
  projectCssCache.set(root, files)

  return files
}

/**
 * A package's directory, found by walking `node_modules` up from `startDir` the way Node
 * itself resolves. Deliberately not `require.resolve`, which needs an entry point the package
 * may not expose; a `package.json` is enough to know it is installed and to read its version.
 */
export function findInstalledPackage(name: string, startDir: string): string | undefined {
  let dir = path.resolve(startDir)
  while (true) {
    const candidate = path.join(dir, 'node_modules', ...name.split('/'), 'package.json')
    if (existsSync(candidate)) {
      return path.dirname(candidate)
    }

    const parent = path.dirname(dir)
    if (parent === dir) {
      return undefined
    }
    dir = parent
  }
}

/**
 * Unwraps a CJS/ESM interop `{ default }` wrapper, which plugin packages vary on.
 *
 * Generic rather than `any`-returning so the unwrapped plugin keeps its type at every call
 * site: an `any` here would silently disable every `ts/no-unsafe-*` check downstream of it.
 */
export function interopDefault<T>(module: T): T extends { default: infer D } ? D : T {
  const wrapper = module as { default?: unknown } | null | undefined
  return (wrapper?.default ?? module) as T extends { default: infer D } ? D : T
}
