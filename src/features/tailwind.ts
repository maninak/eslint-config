/*
 * Tailwind detection and rules: finding the installed Tailwind (however transitively), finding
 * the project's theme, and building the `better-tailwindcss` blocks around both.
 */

import type { TypedFlatConfigItem } from '@antfu/eslint-config'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { GLOB_SRC, GLOB_SVELTE, GLOB_VUE } from '@antfu/eslint-config'
import {
  findInstalledPackage,
  findProjectCssFiles,
  getWorkspacePackageDirs,
  interopDefault,
  isInConsumerDeps,
} from '../utils.js'

/*
 * Packages that mean the consumer writes Tailwind classes, even when `tailwindcss` itself is
 * never declared: `@nuxt/ui` v4 depends on Tailwind v4 and ships nothing but Tailwind-classed
 * components, and the two `@tailwindcss/*` build plugins are how a v4 project wires Tailwind
 * into vite or postcss. taiga-grove declares only `@nuxt/ui`, which is exactly why it had no
 * Tailwind linting at all: a bare `tailwindcss` check never saw it.
 */

const TAILWIND_CARRIERS = [
  'tailwindcss',
  '@tailwindcss/vite',
  '@tailwindcss/postcss',
  '@nuxt/ui',
]

/** Whether anything in the consumer's workspace implies Tailwind classes are being written. */
export function isTailwindInConsumerDeps(): boolean {
  return TAILWIND_CARRIERS.some((name) => isInConsumerDeps(name))
}

/**
 * Walks up from `startDir` looking for an installed `tailwindcss`, mirroring the node_modules
 * search the plugin itself does. Returns the package directory, or `undefined` if there is
 * none the plugin could load.
 *
 * Declared deps are the wrong question here: pnpm leaves a transitively-installed Tailwind
 * unlinked from any `node_modules` the consumer's cwd can see, so a project can depend on
 * Tailwind through `@nuxt/ui` and still have nothing here to find.
 */
export function findTailwindInstall(startDir: string): string | undefined {
  return findInstalledPackage('tailwindcss', startDir)
}

/** An installed Tailwind, and what the plugin needs in order to load the same one. */
export interface TailwindInstall {
  /** Directory of the installed `tailwindcss` package. */
  dir: string

  /**
   * What to hand the plugin as its `cwd`. Its resolver walks up from there, so this is the
   * consumer's own cwd whenever that works, and otherwise the package that carried Tailwind
   * in.
   */
  resolveFrom: string

  /** Major version read from the install, or `undefined` when it cannot be read. */
  major: number | undefined
}

/**
 * Finds a Tailwind the plugin can actually load, including one the consumer never declared.
 *
 * pnpm's strict layout leaves a transitively-installed Tailwind unlinked from anything the
 * consumer's cwd can see, so a project depending on Tailwind through `@nuxt/ui` has nothing to
 * resolve from its own root. That copy does exist, next to the carrier that pulled it in, so
 * when the cwd comes up empty we look again from each carrier. The plugin takes a `cwd` option
 * for exactly this ("the working directory to resolve tailwindcss and the config from"), which
 * lets us point its resolver at the copy we found instead of asking the consumer to declare a
 * dependency they do not otherwise use.
 *
 * The carrier directory is REALPATH'd before it is handed over, and that is load-bearing. pnpm
 * links carriers into the consumer's `node_modules` from a central store, and the plugin's
 * resolver walks up from the literal path it is given without resolving symlinks first: given
 * the link it climbs the consumer's tree and finds nothing, given the real path it climbs the
 * store and finds Tailwind. Both were tried against the plugin's own resolver.
 */
const tailwindInstallCache = new Map<string, TailwindInstall | undefined>()

export function resolveTailwindInstall(): TailwindInstall | undefined {
  const cacheKey = process.cwd()
  if (tailwindInstallCache.has(cacheKey)) {
    return tailwindInstallCache.get(cacheKey)
  }
  const found = findTailwindInstallUncached()
  tailwindInstallCache.set(cacheKey, found)

  return found
}

function findTailwindInstallUncached(): TailwindInstall | undefined {
  /*
   * A dependency declared by a sub-package is installed into that package's `node_modules`, so
   * a workspace has to be searched package by package. taiga-grove keeps `@nuxt/ui` under
   * `apps/web`, and searching only the cwd found nothing there.
   */
  const searchRoots = [process.cwd(), ...getWorkspacePackageDirs()]

  for (const root of searchRoots) {
    const dir = findTailwindInstall(root)
    if (dir) {
      return { dir, resolveFrom: root, major: readInstalledMajor(dir) }
    }
  }

  for (const root of searchRoots) {
    // `tailwindcss` itself is skipped: the loop above already answered it for every root.
    for (const carrier of TAILWIND_CARRIERS.filter((name) => name !== 'tailwindcss')) {
      const carrierDir = findInstalledPackage(carrier, root)
      if (!carrierDir) {
        continue
      }

      let resolveFrom: string
      try {
        resolveFrom = realpathSync(carrierDir)
      } catch {
        continue
      }

      const dir = findTailwindInstall(resolveFrom)
      if (dir) {
        return { dir, resolveFrom, major: readInstalledMajor(dir) }
      }
    }
  }

  return undefined
}

/** The major version of the package installed at `dir`, or `undefined` when unreadable. */
function readInstalledMajor(dir: string): number | undefined {
  try {
    const { version } = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
      version?: string
    }
    const major = Number.parseInt(version ?? '', 10)

    return Number.isNaN(major) ? undefined : major
  } catch {
    return undefined
  }
}

/** Filenames a Tailwind v3 theme can live in. */
export const TAILWIND_CONFIG_NAMES = [
  'tailwind.config.js',
  'tailwind.config.cjs',
  'tailwind.config.mjs',
  'tailwind.config.ts',
]

/*
 * The v4 entry point is the CSS file that pulls Tailwind in whole, with or without the
 * `source()`, `layer()` and `theme()` qualifiers v4 allows after the specifier. A partial
 * import (`@import "tailwindcss/utilities"`) deliberately does not match: a file taking one
 * layer is not where the theme is defined.
 */
const IMPORTS_TAILWIND = /@import\s+(?:url\(\s*)?["']tailwindcss["']/

/** A project's Tailwind theme, as an absolute path in whichever form its major uses. */
export interface TailwindTheme {
  entryPoint?: string
  tailwindConfig?: string
}

/** What a scan for the project's theme turned up. */
export interface TailwindThemeDetection {
  /** The theme, when exactly one candidate was found. */
  theme?: TailwindTheme

  /** Every CSS file that imports Tailwind. Longer than one means the theme is ambiguous. */
  entryPoints: string[]
}

/**
 * Finds the project's Tailwind theme instead of asking for it, which is how the rest of this
 * preset behaves and what consumers expect.
 *
 * A v3 theme is a config file with a known name at the root. A v4 theme is whichever CSS file
 * imports Tailwind, which can only be found by reading them, so this globs the project's CSS
 * and looks inside. Exactly one hit is the answer. Several is a genuinely ambiguous project
 * and stays the caller's problem to disambiguate, because picking one at random would lint
 * every other app in the repo against the wrong theme, silently.
 *
 * `major` decides which form to prefer when a project carries both, e.g. a v4 codebase keeping
 * a legacy `tailwind.config.js` around for `@config`.
 */
export function detectTailwindTheme(major: number | undefined): TailwindThemeDetection {
  const root = process.cwd()
  const tailwindConfig = TAILWIND_CONFIG_NAMES.map((name) => path.join(root, name)).find(
    (candidate) => existsSync(candidate),
  )

  if (major === 3 && tailwindConfig) {
    return { theme: { tailwindConfig }, entryPoints: [] }
  }

  const entryPoints = findTailwindEntryPoints(root)
  if (entryPoints.length === 1) {
    return { theme: { entryPoint: entryPoints[0]! }, entryPoints }
  }
  if (entryPoints.length === 0 && tailwindConfig) {
    return { theme: { tailwindConfig }, entryPoints }
  }

  return { entryPoints }
}

/*
 * Every CSS file under `root` that pulls Tailwind in whole, as absolute paths.
 *
 * Deliberately NOT memoized, though two features ask within one config build. Measured on a
 * 600-stylesheet tree: caching the result came out at 725-742ms against 719-738ms uncached,
 * so the second pass costs nothing the page cache does not already absorb. The file listing
 * underneath IS cached, because that walk is the part that is not free.
 */
export function findTailwindEntryPoints(root: string): string[] {
  return findProjectCssFiles(root).filter((file) => {
    try {
      return IMPORTS_TAILWIND.test(stripCssComments(readFileSync(file, 'utf8')))
    } catch {
      return false
    }
  })
}

/** Blanks comments, so a commented-out import does not read as the project's entry point. */
function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Where the Tailwind rules should read your theme from. Give at most one, whichever matches
 * your Tailwind major; given neither, the preset finds it.
 *
 * Nothing is ever guessed. The plugin reads your theme from this file, and given nothing it
 * falls back to Tailwind's stock theme: it would then enforce a class order the project never
 * configured and call every themed class unknown. So detection either finds exactly one answer
 * or reports that it could not, and these options are how you settle it when it could not.
 */
export interface TailwindOptions {
  /**
   * Tailwind v4: path to the CSS entry point that pulls Tailwind in, relative to the
   * consumer's cwd, e.g. `'apps/web/assets/css/main.css'` for a file starting
   * `@import "tailwindcss"`.
   */
  entryPoint?: string

  /**
   * Tailwind v3: path to the `tailwind.config.js` that defines the theme, relative to the
   * consumer's cwd. The plugin can also find this by itself, but a found-or-else-stock-theme
   * search is exactly the silent wrong answer this option exists to rule out.
   */
  tailwindConfig?: string
}

/**
 * Why the Tailwind rules cannot run against `theme`, worded for the consumer, or `undefined`
 * when they can. The caller decides whether that is fatal: a theme the consumer configured by
 * hand should fail loudly, one the preset detected should only warn.
 *
 * This runs before any rule does, because the failure it guards against is not a rule quietly
 * switching itself off. It is an uncaught throw from inside the plugin, part-way through a
 * lint, with a stack trace about `enhanced-resolve` and no hint of what to change.
 */
export function findTailwindThemeProblem(theme: TailwindTheme): string | undefined {
  /*
   * Spelled out rather than `Object.entries`, whose fallback overload types the value as `any`
   * on an interface with no index signature, quietly costing the check its type safety.
   */
  const given: [key: string, value: string | undefined][] = [
    ['entryPoint', theme.entryPoint],
    ['tailwindConfig', theme.tailwindConfig],
  ]

  for (const [key, value] of given) {
    if (value === undefined) {
      continue
    }
    const absolute = path.resolve(process.cwd(), value)
    if (!existsSync(absolute)) {
      return (
        `tailwind.${key} is "${value}", which does not exist (resolved to "${absolute}"). ` +
        `Point it at the file that defines your Tailwind theme, or pass "tailwind: false" to ` +
        `switch the Tailwind rules off.`
      )
    }
  }

  /*
   * A v4 entry point pulls Tailwind in with `@import "tailwindcss"`, and Tailwind's own loader
   * resolves that import relative to the FILE, not to anything we can redirect: the plugin's
   * `cwd` reaches its version check and its v3 config loader, but not this. So a copy of
   * Tailwind that only a dependency installed satisfies everything except the one import that
   * matters, and the lint dies on it.
   */
  if (theme.entryPoint !== undefined) {
    const entryPoint = path.resolve(process.cwd(), theme.entryPoint)
    if (!findTailwindInstall(path.dirname(entryPoint))) {
      const shown = path.relative(process.cwd(), entryPoint)

      return (
        `"${shown}" imports Tailwind, but no "tailwindcss" can be resolved from the directory ` +
        `it lives in. Tailwind resolves that import relative to the file itself, so a copy ` +
        `carried in by another package (@nuxt/ui and friends) does not satisfy it however it ` +
        `is installed. Add "tailwindcss" to the devDependencies of the package that owns ` +
        `"${shown}", or pass "tailwind: false" to switch the Tailwind rules off.`
      )
    }
  }

  return undefined
}

/**
 * Builds the Tailwind CSS blocks: the plugin's `recommended` set, plus the two rules this
 * preset switches off.
 *
 * `enforce-consistent-line-wrapping` is off because it rewraps class strings across lines,
 * which is formatting, and formatting here belongs to prettier; leaving both on puts two
 * fixers on the same attribute. `no-unknown-classes` is off because a real project mixes
 * Tailwind utilities with its own class names, and this preset has never demanded otherwise.
 *
 * @param options Where the project's Tailwind theme lives. See {@link TailwindOptions}.
 * @param install The Tailwind to lint against. See {@link resolveTailwindInstall}.
 */
async function buildTailwindBlocks(
  options: TailwindOptions,
  install: TailwindInstall,
): Promise<TypedFlatConfigItem[]> {
  const { entryPoint, tailwindConfig } = options
  if (!entryPoint && !tailwindConfig) {
    throw new Error(
      `[@maninak/eslint-config] tailwind needs to know where your theme lives: pass ` +
        `"entryPoint" with your Tailwind v4 CSS entry point, or "tailwindConfig" with your ` +
        `Tailwind v3 config path. Pass "tailwind: false" to switch the rules off instead.`,
    )
  }

  /*
   * Fail loudly rather than letting the plugin fall back to the stock theme or die mid-lint.
   * Callers that can degrade instead ask {@link findTailwindThemeProblem} first; reaching here
   * with a broken theme means nobody did, and silence would be the worst of the three.
   */
  const problem = findTailwindThemeProblem(options)
  if (problem) {
    throw new Error(`[@maninak/eslint-config] ${problem}`)
  }

  const settings: Record<string, string> = { cwd: install.resolveFrom }
  for (const [key, value] of Object.entries({ entryPoint, tailwindConfig })) {
    if (value !== undefined) {
      settings[key] = path.resolve(process.cwd(), value)
    }
  }

  /*
   * Imported here rather than at module scope so that only a consumer who actually switched
   * the Tailwind rules on pays the ~93ms it costs to load. Deliberately after the checks
   * above, so a misconfigured path still fails fast without loading anything.
   */
  const pluginBetterTailwind = interopDefault(
    interopDefault(await import('eslint-plugin-better-tailwindcss')),
  )
  const recommended = pluginBetterTailwind.configs.recommended as TypedFlatConfigItem

  /*
   * The plugin's `recommended` set carries no `files`, so ESLint would apply it to every file
   * the preset lints, TOML, JSON and YAML included. Those hold no class strings, and running
   * seven rules over their ASTs is at best wasted work on every lint.
   */
  const files = [GLOB_SRC, GLOB_VUE, GLOB_SVELTE]

  return [
    {
      ...recommended,
      name: 'maninak/tailwindcss',
      files,
      settings: { 'better-tailwindcss': settings },
    },
    {
      name: 'maninak/tailwindcss/overrides',
      files,
      rules: {
        'better-tailwindcss/enforce-consistent-line-wrapping': 'off',
        'better-tailwindcss/no-unknown-classes': 'off',
      },
    },
  ]
}

/**
 * The Tailwind blocks, or none plus a one-off explanation.
 *
 * Saying nothing when Tailwind is clearly in use would leave a repo quietly unlinted, which is
 * how taiga-grove ended up with ~1500 unchecked class attributes: it carries Tailwind through
 * `@nuxt/ui` and never declared `tailwindcss`, so nothing ever switched the rules on and
 * nothing ever said why.
 *
 * Detection does the asking now. A theme the preset can find on its own is one the consumer
 * should not have to write down, so the rules come on by themselves and the options exist for
 * the cases detection reports it could not settle.
 *
 * An explicitly-configured theme still fails loudly, because the consumer asked for these
 * rules by name and silently not running them would be the worse answer. A DETECTED one only
 * ever warns: nobody asked for it, so a repo that cannot support it should still lint.
 */
export async function resolveTailwindBlocks(
  option: false | TailwindOptions | undefined,
): Promise<TypedFlatConfigItem[]> {
  if (option === false) {
    return []
  }

  const explicitTheme =
    option && (option.entryPoint ?? option.tailwindConfig) ? option : undefined
  if (!explicitTheme && !isTailwindInConsumerDeps()) {
    return []
  }

  const install = resolveTailwindInstall()
  if (!install) {
    const message =
      `[@maninak/eslint-config] the Tailwind rules need a "tailwindcss" they can load, and ` +
      `none could be resolved from "${process.cwd()}" nor from any installed package that ` +
      `carries one. The plugin reads your theme through the installed Tailwind, and given ` +
      `none it disables every rule, so the linting would silently not happen. Install your ` +
      `dependencies, or pass "tailwind: false" to switch the rules off.`
    if (explicitTheme) {
      throw new Error(message)
    }
    console.warn(message)

    return []
  }

  const { theme, entryPoints } = explicitTheme
    ? { entryPoints: [], theme: explicitTheme }
    : detectTailwindTheme(install.major)

  if (theme) {
    const problem = findTailwindThemeProblem(theme)
    if (!problem) {
      return await buildTailwindBlocks(theme, install)
    }
    if (explicitTheme) {
      throw new Error(`[@maninak/eslint-config] ${problem}`)
    }
    console.warn(
      `[@maninak/eslint-config] the Tailwind rules are off: ${problem} They would otherwise ` +
        `have come on by themselves, having found your theme.`,
    )

    return []
  }

  console.warn(
    entryPoints.length > 1
      ? `[@maninak/eslint-config] Tailwind CSS is in this workspace, but which file defines ` +
          `your theme is ambiguous, so the Tailwind rules are off: ${describeEntryPoints(entryPoints)} ` +
          `all import Tailwind. Linting every one of them against whichever was picked would ` +
          `enforce a class order the others never configured. Say which with ` +
          `tailwind: { entryPoint: './path/to/app.css' }, or pass tailwind: false to switch ` +
          `the rules off.`
      : `[@maninak/eslint-config] Tailwind CSS is in this workspace, but nothing defining ` +
          `your theme was found, so the Tailwind rules are off: no CSS file imports Tailwind ` +
          `and there is no tailwind.config.js at the root. Linting against Tailwind's stock ` +
          `theme would enforce a class order this project never configured. Pass ` +
          `tailwind: { entryPoint: './path/to/app.css' } on v4 or ` +
          `tailwind: { tailwindConfig: './tailwind.config.js' } on v3, or pass tailwind: false ` +
          `to switch the rules off.`,
  )

  return []
}

/** The ambiguous entry points, relative and capped, so the warning stays readable. */
function describeEntryPoints(entryPoints: string[]): string {
  const shown = entryPoints
    .slice(0, 5)
    .map((file) => `"${path.relative(process.cwd(), file)}"`)
  const rest = entryPoints.length - shown.length

  return rest > 0 ? `${shown.join(', ')} and ${rest} more` : shown.join(', ')
}
