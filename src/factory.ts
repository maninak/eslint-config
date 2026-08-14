import type {
  OptionsConfig,
  OptionsTypescript,
  TypedFlatConfigItem,
} from '@antfu/eslint-config'
import type {
  CssOptions,
  FilenameCaseOptions,
  RequireJsdocOptions,
  SortImportsOptions,
  TailwindOptions,
} from './config.js'
import path from 'node:path'
import antfu, { GLOB_CSS, GLOB_TS, GLOB_TSX, GLOB_VUE } from '@antfu/eslint-config'
import { glob } from 'tinyglobby'
import { merge } from 'ts-deepmerge'
import buildConfig, {
  buildCssBlocks,
  buildFilenameCaseBlocks,
  buildRequireJsdocBlocks,
  buildSortImportsBlock,
  buildTailwindBlocks,
  detectTailwindCssDialect,
  detectTailwindTheme,
  findProjectCssFiles,
  findTailwindThemeProblem,
  isTailwindInConsumerDeps,
  resolveTailwindInstall,
} from './config.js'
import { hasConsumerTsconfig, isInConsumerDeps } from './utils.js'

/** Maninak-specific options layered on top of antfu's. All optional. */
export interface ManinakExtraOptions {
  /**
   * Require a JSDoc block on `export`ed functions, classes, and methods. `@param` and
   * `@returns` tags stay optional; a free-text description alone is enough of a contract.
   *
   * `true` enforces it in folders that conventionally hold reusable utilities (`utils/`,
   * `util/`, `lib/`, `helpers/`, and the same names as single files). Pass an object to name
   * your own globs or loosen the rule; see {@link RequireJsdocOptions}.
   *
   * Test files e.g. `*.test.*`, `*.spec.*`, anything under `test/`, are always exempt, even
   * when they match a glob you passed yourself.
   *
   * Default: `false`. Off by default to keep the preset lower friction.
   */
  requireJsdoc?: boolean | RequireJsdocOptions

  /**
   * @deprecated Renamed to `requireJsdoc`, which also accepts an options object. Still
   *   honoured, but ignored when `requireJsdoc` is set.
   */
  requireJsdocInUtils?: boolean

  /**
   * Enforce a filename casing convention: camelCase for `.ts`/`.js` modules, PascalCase for
   * `.vue` components. Pass an object to change either casing or to exempt more paths; see
   * {@link FilenameCaseOptions}.
   *
   * When `vue` or `nuxt` is a consumer dependency, paths whose filename is load-bearing under
   * file-based routing are exempt automatically (`pages/`, `layouts/`, `middleware/`,
   * `server/`, `app.vue`, `error.vue`, `*.config.*`, and dynamic segments like `[id].vue`),
   * because renaming one of those changes a route or breaks the framework.
   *
   * The rule reports without fixing: renaming a file on disk would break every import of it.
   *
   * Default: `false`. Turning it on in an existing repo reports every file that disagrees at
   * once, and each fix is a manual `git mv`.
   */
  filenameCase?: boolean | FilenameCaseOptions

  /**
   * Where the Tailwind CSS rules should read your theme from: `entryPoint` for a Tailwind v4
   * CSS entry point, `tailwindConfig` for a v3 config. See {@link TailwindOptions}.
   *
   * You should not normally need it. The rules come on by themselves when Tailwind is in the
   * workspace (including via `@nuxt/ui`, which carries Tailwind v4 without declaring it) and
   * the preset can find your theme: the one CSS file that does `@import "tailwindcss"` on v4,
   * or `tailwind.config.js` on v3. A Tailwind that only a dependency installed is found too,
   * so nothing has to be added to your `package.json` to make this work.
   *
   * Nothing is ever guessed, though. The plugin learns the project's theme from that file, and
   * given none it falls back to Tailwind's stock theme: it would enforce a class order the
   * project never configured and treat every themed class as unknown. So when a repo has
   * several files that could be the theme, or none, the rules stay off and the preset says
   * which it was. That is what this option settles. Pass `false` to switch the rules off.
   *
   * @example
   * ```ts
   * tailwind: { entryPoint: './apps/web/assets/css/main.css' },
   * ```
   */
  tailwind?: false | TailwindOptions

  /**
   * Lints your `.css` files, which nothing else in this preset looks at.
   *
   * On by default wherever the project has any CSS at all, since the rules catch real defects
   * rather than style opinions: a misspelled property, a value no property accepts, a
   * duplicated `@import` or keyframe selector, an unmatchable selector, a malformed
   * `grid-template-areas`. When this project uses Tailwind, the parser is taught the Tailwind
   * dialect, so `@theme`, `@utility`, `@apply` and `@custom-variant` read as the CSS they are.
   *
   * Coverage is standalone `.css` files. `@eslint/css` has no way to reach an SFC's `<style>`
   * block, which stays the province of `eslint-plugin-vue-scoped-css`.
   *
   * Pass `false` to switch the rules off.
   *
   * @example
   * ```ts
   * css: { available: 'newly' }, // an app targeting current browsers
   * ```
   */
  css?: boolean | CssOptions

  /**
   * Extend the preset's import ordering with your own groups, without restating the ordering.
   *
   * ESLint replaces a rule's options rather than merging them, so adding one custom group by
   * hand means copying the preset's whole `groups` array plus `internalPattern`, `order`,
   * `type` and the newline keys, and that copy stops tracking this preset the moment any of
   * them changes. Each entry here says only what it is and where it goes; everything else
   * stays owned by the preset. See {@link SortImportsOptions}.
   *
   * @example
   * ```ts
   * sortImports: {
   *   customGroups: [
   *     {
   *       groupName: 'extension-internal',
   *       elementNamePattern: '^extension(?:Utils|Helpers)/',
   *       after: 'value-external',
   *     },
   *   ],
   * }
   * ```
   */
  sortImports?: SortImportsOptions

  /**
   * Extends type-aware linting to `.vue` single-file components, so rules needing type
   * information (`ts/no-unsafe-*`, `ts/no-misused-promises`,
   * `ts/restrict-template-expressions`, and the rest) run inside SFCs instead of stopping at
   * the `.vue` boundary.
   *
   * Default: `true`, but only where all three preconditions hold, each detected rather than
   * assumed. Vue support must be on. Type-aware linting must already be active, meaning a
   * resolved `tsconfig.json` (see `typescript.tsconfigPath`), so a repo that never opted into
   * type-aware linting is untouched by this. And that tsconfig's `include` must cover `.vue`:
   * one that excludes them makes every SFC report "not found in project" instead of linting.
   *
   * When a precondition fails, the default degrades: the preset says so once and leaves SFCs
   * linted as before, rather than failing a lint nobody asked it to fail. Setting this to
   * `true` by hand asks for it explicitly instead, and then an unmet precondition is a hard
   * error, since silently not doing what you asked for is the worse answer.
   *
   * Set `false` to switch it off. That is the lever to reach for on lint time: type-checking
   * SFC script blocks is the expensive part of a Vue lint.
   */
  vueTypeAware?: boolean
}

/**
 * Maninak's public options type. Extends antfu's `OptionsConfig` with `ManinakExtraOptions`
 * and widens `typescript.tsconfigPath` to accept a string array. antfu only accepts a single
 * string (it feeds it into `projectService.defaultProject`), but the maninak factory detects
 * an array and switches the resulting parser blocks to legacy `parserOptions.project` mode,
 * which natively accepts multiple paths.
 */
export type ManinakOptions = Omit<OptionsConfig, 'typescript'> &
  ManinakExtraOptions & {
    typescript?:
      | boolean
      | (Omit<OptionsTypescript, 'tsconfigPath'> & {
          tsconfigPath?: string | string[]
        })
  }

/**
 * Build the final ESLint flat config array using the maninak preset.
 *
 * Wraps antfu's factory with the maninak ruleset and, when the consumer has Nuxt
 * installed, the official Nuxt flat config. Type-aware rules activate automatically
 * when a `tsconfig.json` exists at cwd, or when an explicit `typescript.tsconfigPath`
 * is provided. `tsconfigPath` accepts a string or a string array (useful when some
 * tsconfigs use non-standard names that TypeScript's project service won't discover).
 *
 * @param options Same shape as antfu's options, extended with maninak-specific knobs (see
 *   {@link ManinakExtraOptions}). Common antfu keys: `typescript`, `vue`, `react`, `svelte`,
 *   `stylistic`, `ignores`. Maninak's defaults (e.g. `stylistic: false`, rule overrides)
 *   deep-merge with what you pass; your values win on conflict.
 * @param userConfigs Additional flat-config items appended after maninak's
 *   blocks, so they override everything that came before.
 *
 * @example <caption>Minimal usage in `eslint.config.mjs`</caption>
 * ```ts
 * import maninak from '@maninak/eslint-config'
 *
 * export default maninak()
 * ```
 *
 * @example <caption>Multiple tsconfigs when non-standard names rule out auto-discovery</caption>
 * ```ts
 * export default maninak({
 *   typescript: {
 *     tsconfigPath: ['./tsconfig.json', './test/tsconfig.wdio.json'],
 *   },
 * })
 * ```
 *
 * @example <caption>Append a project-specific block that overrides a rule</caption>
 * ```ts
 * export default maninak(
 *   {},
 *   {
 *     files: ['src/legacy/**'],
 *     rules: { 'ts/no-explicit-any': 'off' },
 *   },
 * )
 * ```
 *
 * @example <caption>Opt in to JSDoc requirements for utility code</caption>
 * ```ts
 * export default maninak({
 *   requireJsdoc: true,
 * })
 * ```
 *
 * @example <caption>Enforce filename casing</caption>
 * ```ts
 * export default maninak({
 *   filenameCase: true,
 * })
 * ```
 *
 * @example <caption>Require JSDoc on your own directories, as errors</caption>
 * ```ts
 * export default maninak({
 *   requireJsdoc: {
 *     files: ['src/domain/**', 'src/services/**'],
 *     severity: 'error',
 *   },
 * })
 * ```
 */
export async function maninak(
  options: ManinakOptions = {},
  ...userConfigs: Parameters<typeof antfu>['1'][]
): Promise<TypedFlatConfigItem[]> {
  const {
    filenameCase = false,
    sortImports,
    requireJsdoc,
    requireJsdocInUtils = false,
    vueTypeAware = true,
    tailwind,
    css,
    ...antfuOptions
  } = options
  /*
   * Whether the consumer asked for SFC type-awareness by name, as opposed to getting it by
   * default. The two fail differently on purpose: an option someone set should fail loudly
   * when it cannot be honoured, and one they never mentioned should never fail their lint.
   */
  const vueTypeAwareRequested = options.vueTypeAware === true
  const jsdocBlocks = resolveRequireJsdocBlocks(requireJsdoc ?? requireJsdocInUtils)
  const sortImportsBlocks = sortImports ? [buildSortImportsBlock(sortImports)] : []
  const filenameCaseBlocks =
    filenameCase === false
      ? []
      : buildFilenameCaseBlocks(filenameCase === true ? {} : filenameCase)
  const tailwindBlocks = await resolveTailwindBlocks(tailwind)
  const cssBlocks = await resolveCssBlocks(css)
  const [maninakOptions, ...maninakConfig] = await buildConfig()
  const nuxtConfigs = isInConsumerDeps('nuxt') ? await getNuxtConfigs() : []
  const frameworkDefaults = {
    vue: isInConsumerDeps('vue') || isInConsumerDeps('nuxt'),
    svelte: isInConsumerDeps('svelte'),
    react: isInConsumerDeps('react') || isInConsumerDeps('next'),
  }

  const baseOptions = merge(frameworkDefaults, maninakOptions, antfuOptions)
  const tsconfigPaths = resolveTsconfigPaths(antfuOptions.typescript)
  /*
   * Vue support has to be on for any of this to mean anything: without it antfu builds no
   * `.vue` block, so there is nothing to make type-aware. Gating here rather than letting
   * `giveVueBlockATypeScriptProject` throw keeps a repo that has no Vue at all from having
   * its whole lint fail over an option that is merely inapplicable to it.
   */
  const vueEnabled = Boolean(baseOptions.vue)
  if (vueTypeAwareRequested && !vueEnabled) {
    console.warn(
      `[@maninak/eslint-config] vueTypeAware is on, but Vue support is off (no "vue" or ` +
        `"nuxt" dependency was detected and "vue" was not passed), so there are no .vue ` +
        `files to lint type-aware. The option is being ignored.`,
    )
  }
  /*
   * The tsconfig SFC type-awareness would run against, or `undefined` when a precondition
   * rules it out. Carrying the path rather than a boolean keeps it narrowed at the two later
   * uses, which a reassignable flag cannot do.
   */
  const typeAwareTsconfig =
    vueTypeAware && vueEnabled && tsconfigPaths !== undefined ? tsconfigPaths[0]! : undefined
  let typeAwareVue = typeAwareTsconfig !== undefined
  if (typeAwareTsconfig !== undefined) {
    const problem = await findVueTypeAwareProblem(typeAwareTsconfig)
    if (problem) {
      if (vueTypeAwareRequested) {
        throw new Error(`[@maninak/eslint-config] ${problem}`)
      }
      console.warn(
        `[@maninak/eslint-config] type-aware linting stops at the .vue boundary here: ` +
          `${problem} Pass vueTypeAware: false to silence this.`,
      )
      typeAwareVue = false
    }
  }
  const tsconfigOverride = tsconfigPaths
    ? {
        typescript: {
          tsconfigPath: tsconfigPaths[0],
          // antfu's default omits `.vue`, so the type-aware rules block never matches an SFC.
          ...(typeAwareVue ? { filesTypeAware: [GLOB_TS, GLOB_TSX, GLOB_VUE] } : {}),
        },
      }
    : {}

  const configs = await antfu(
    merge(baseOptions, tsconfigOverride),
    ...maninakConfig,
    ...jsdocBlocks,
    ...filenameCaseBlocks,
    ...tailwindBlocks,
    ...cssBlocks,
    ...sortImportsBlocks,
    ...nuxtConfigs,
    ...userConfigs,
  )

  dedupePluginRegistrations(configs)
  restoreUnicornRulesOnVue(configs)
  if (cssBlocks.length > 0) {
    keepJavascriptBlocksOffCss(configs)
  }

  // Runs before the legacy switch below so both passes agree on which project mode is active.
  if (typeAwareVue && typeAwareTsconfig !== undefined) {
    giveVueBlockATypeScriptProject(configs, typeAwareTsconfig)
  }

  if (tsconfigPaths && tsconfigPaths.length > 1) {
    switchToLegacyProjectMode(configs, tsconfigPaths)
  }

  return configs
}

/**
 * The CSS blocks, or none when this project has no CSS to lint.
 *
 * Gated on the project actually owning a `.css` file rather than switched on unconditionally,
 * because loading the language plugin costs ~73ms and a repo with no CSS would pay it on every
 * lint for nothing. The scan behind that answer is shared with the Tailwind theme detection,
 * so asking costs nothing extra.
 */
async function resolveCssBlocks(
  option: boolean | CssOptions | undefined,
): Promise<TypedFlatConfigItem[]> {
  if (option === false) {
    return []
  }
  if (option === undefined && findProjectCssFiles(process.cwd()).length === 0) {
    return []
  }

  return await buildCssBlocks(
    option === true || option === undefined ? {} : option,
    detectTailwindCssDialect(),
  )
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
async function resolveTailwindBlocks(
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

/**
 * Turns the `requireJsdoc` option into the flat-config blocks that enforce it, or into nothing
 * when it is off.
 */
function resolveRequireJsdocBlocks(
  option: boolean | RequireJsdocOptions,
): TypedFlatConfigItem[] {
  if (option === false) {
    return []
  }

  return buildRequireJsdocBlocks(option === true ? {} : option)
}

/**
 * Drops a plugin registration that would collide with one an earlier block already made under
 * the same key, keeping the rest of the offending block intact.
 *
 * Flat config throws `Cannot redefine plugin "x"` when two blocks register DISTINCT objects
 * under one key, and two copies of the same plugin package resolved at different versions are
 * distinct objects. antfu and `@nuxt/eslint-config` both register `ts` and `vue`, so whenever
 * their transitive plugin versions fail to dedupe in the store, every Nuxt consumer's lint
 * dies on the first file. Stripping the later registration leaves the winning plugin to serve
 * that prefix, which is safe only because the rules stay checked below.
 *
 * A rule whose prefix was stripped and which the winning plugin does not implement is deleted
 * and reported on stderr, rather than left to fail later as an opaque flat-config error.
 *
 * Rewrites blocks by replacing them in `configs` rather than editing them in place: some are
 * module-level singletons, a plugin's exported `configs.recommended` above all, and editing
 * those would leak into every later `maninak()` call in the process.
 */
function dedupePluginRegistrations(configs: TypedFlatConfigItem[]): void {
  const winners = new Map<string, unknown>()
  const strippedPrefixes = new Set<string>()

  configs.forEach((block, index) => {
    let survivors: NonNullable<TypedFlatConfigItem['plugins']> | undefined

    for (const [key, plugin] of Object.entries(block.plugins ?? {})) {
      const winner = winners.get(key)
      if (winner === undefined) {
        winners.set(key, plugin)
        continue
      }
      if (winner !== plugin) {
        survivors ??= { ...block.plugins }
        delete survivors[key]
        strippedPrefixes.add(key)
      }
    }

    if (survivors) {
      configs[index] = { ...block, plugins: survivors }
    }
  })

  if (strippedPrefixes.size === 0) {
    return
  }

  const dropped: string[] = []
  configs.forEach((block, index) => {
    let survivors: NonNullable<TypedFlatConfigItem['rules']> | undefined

    for (const [ruleName, entry] of Object.entries(block.rules ?? {})) {
      const separator = ruleName.indexOf('/')
      const prefix = separator === -1 ? '' : ruleName.slice(0, separator)
      if (!strippedPrefixes.has(prefix) || isRuleOff(entry)) {
        continue
      }
      const winner = winners.get(prefix) as { rules?: Record<string, unknown> } | undefined
      if (!winner?.rules?.[ruleName.slice(separator + 1)]) {
        survivors ??= { ...block.rules }
        delete survivors[ruleName]
        dropped.push(`${ruleName} (from block "${block.name ?? 'unnamed'}")`)
      }
    }

    if (survivors) {
      configs[index] = { ...block, rules: survivors }
    }
  })

  if (dropped.length > 0) {
    console.warn(
      `[@maninak/eslint-config] Two plugins were registered under the same key ` +
        `(${[...strippedPrefixes].join(', ')}); the first registration won. These rules are ` +
        `not implemented by it and were dropped:\n  ${dropped.join('\n  ')}`,
    )
  }
}

/**
 * Why type-aware linting cannot reach this project's SFCs, worded for the consumer, or
 * `undefined` when it can. The caller decides whether that is fatal.
 *
 * A tsconfig whose `include` misses SFCs does not disable type-aware linting for them, it
 * makes every one report `was not found by the project service` as a parse error, so a
 * 138-SFC app answers with 138 opaque failures and no hint of the cause. Nuxt's generated
 * `.nuxt/tsconfig.json` covers `.vue`; a hand-rolled one frequently does not.
 *
 * Resolution goes through TypeScript itself, with the same `.vue` extension registration
 * typescript-eslint uses, because `include` entries name directories as often as globs and
 * pattern-matching them by hand gets the answer wrong either way. Reports nothing when the
 * project has no SFCs at all, where the option is merely redundant rather than misconfigured.
 */
async function findVueTypeAwareProblem(tsconfigPath: string): Promise<string | undefined> {
  let loaded
  try {
    loaded = (await import('typescript')).default
  } catch {
    console.warn(
      `[@maninak/eslint-config] "typescript" could not be imported, so whether ` +
        `"${tsconfigPath}" covers .vue files could not be checked. Type-aware linting of ` +
        `SFCs is being left on; if every SFC reports "was not found by the project ` +
        `service", that is why.`,
    )

    return undefined
  }
  // Re-bound as a const so the narrowed module type survives into the closure below; a `let`
  // widens back to `any` there.
  const typescript = loaded

  const absolute = path.resolve(process.cwd(), tsconfigPath)
  // Wrapped rather than passed bare: `sys.readFile` is a method, and handing it over unbound
  // would strip its `this`.
  const configFile = typescript.readConfigFile(absolute, (file) =>
    typescript.sys.readFile(file),
  )
  if (configFile.error) {
    return undefined // Let ESLint report an unreadable tsconfig in its own words.
  }

  const parsed = typescript.parseJsonConfigFileContent(
    configFile.config,
    typescript.sys,
    path.dirname(absolute),
    undefined,
    absolute,
    undefined,
    [
      {
        extension: '.vue',
        isMixedContent: true,
        scriptKind: typescript.ScriptKind.Deferred,
      },
    ],
  )
  if (parsed.fileNames.some((file) => file.endsWith('.vue'))) {
    return undefined
  }

  // Only now is a filesystem sweep worth its cost, and only to tell "misconfigured" apart
  // from "no SFCs yet".
  const sfcs = await glob(['**/*.vue'], {
    cwd: process.cwd(),
    ignore: ['**/node_modules/**', '**/dist/**', '**/.nuxt/**', '**/.output/**'],
  })
  if (sfcs.length === 0) {
    return undefined
  }

  return (
    `"${tsconfigPath}" does not include any of the ${sfcs.length} .vue files in this ` +
    `project, so each one would report "was not found by the project service" instead of ` +
    `linting. Add "**/*.vue" to that tsconfig's "include", or point typescript.tsconfigPath ` +
    `at one that covers SFCs (Nuxt generates .nuxt/tsconfig.json).`
  )
}

/**
 * Stops the JavaScript-shaped config blocks claiming `.css` files.
 *
 * A flat-config block with no `files` key applies to every file that gets linted, and antfu
 * ships about ten of them carrying some 200 JS rules between them. That is harmless while the
 * only extra languages are JSON, YAML and TOML, whose parsers produce an ESTree-shaped AST the
 * rules simply never match against. CSS is not parsed, it is a LANGUAGE, and its `SourceCode`
 * has no `getAllComments`: core rules do not fail to match on it, they throw while loading, so
 * `no-irregular-whitespace` alone takes down the lint of any CSS file. Verified before and
 * after.
 *
 * Blocks that already scope themselves with `files` are left alone, and so is a bare
 * global-ignore entry, where adding to `ignores` would exclude CSS from the lint entirely
 * rather than from one block.
 */
function keepJavascriptBlocksOffCss(configs: TypedFlatConfigItem[]): void {
  for (const config of configs) {
    if (config.files) {
      continue
    }
    const keys = Object.keys(config).filter((key) => key !== 'name')
    if (keys.length === 1 && keys[0] === 'ignores') {
      continue
    }
    config.ignores = [...(config.ignores ?? []), GLOB_CSS]
  }
}

/** Name of the antfu block that parses `.vue`, which needs a project to resolve types. */
const ANTFU_VUE_BLOCK_NAME = 'antfu/vue/rules'

/**
 * Points the Vue block's inner TypeScript parser at the consumer's tsconfig.
 *
 * antfu configures that block with `vue-eslint-parser` wrapping `@typescript-eslint/parser`
 * and `extraFileExtensions: ['.vue']`, but sets neither `projectService` nor `project`.
 * Without
 * one, matching an SFC to a type-aware rule only makes typescript-eslint bail with "you have
 * used a rule which requires type information, but don't have parserOptions set to generate
 * type information for this file". Mirrors the shape antfu builds for its own type-aware
 * parser so both resolve the same program.
 *
 * Throws when the block is missing: the caller asked for type-aware SFCs, and silently not
 * delivering them is the very failure this option exists to end.
 */
function giveVueBlockATypeScriptProject(
  configs: TypedFlatConfigItem[],
  tsconfigPath: string,
): void {
  const block = configs.find((item) => item.name === ANTFU_VUE_BLOCK_NAME)
  const parserOptions = block?.languageOptions?.['parserOptions'] as
    Record<string, unknown> | undefined

  if (!parserOptions) {
    throw new Error(
      `[@maninak/eslint-config] vueTypeAware is on, but no "${ANTFU_VUE_BLOCK_NAME}" block ` +
        `with a parser was found, so .vue files would silently keep skipping every ` +
        `type-aware rule. Check that vue support is enabled and that the installed ` +
        `@antfu/eslint-config still ships that block.`,
    )
  }

  parserOptions['projectService'] = {
    allowDefaultProject: ['./*.js'],
    defaultProject: tsconfigPath,
  }
  parserOptions['tsconfigRootDir'] = process.cwd()
}

/** Name of the antfu block whose unicorn rules {@link restoreUnicornRulesOnVue} mirrors. */
const ANTFU_UNICORN_BLOCK_NAME = 'antfu/unicorn/rules'

/**
 * Re-applies antfu's unicorn rules to single-file components.
 *
 * antfu v9.3 scoped that block to `**\/*.?([cm])[jt]s?(x)`, which correctly stopped the rules
 * leaking onto JSON and TOML but also stopped them reaching `.vue`, where a Vue or Nuxt
 * consumer keeps most of its code. Nothing errors when that happens: every rule in that
 * block, `unicorn/error-message`, `unicorn/throw-new-error` and `unicorn/prefer-node-protocol`
 * among them, simply stops running. The mirrored block is inserted directly after the source,
 * so every later block, `maninak/prettier-vue` above all, still overrides it.
 *
 * No-ops once antfu's own glob covers `.vue` again, and reports on stderr if the source block
 * is gone, since a silent no-op here is the exact regression this exists to prevent.
 */
function restoreUnicornRulesOnVue(configs: TypedFlatConfigItem[]): void {
  const index = configs.findIndex((block) => block.name === ANTFU_UNICORN_BLOCK_NAME)
  if (index === -1) {
    console.warn(
      `[@maninak/eslint-config] Expected an eslint config block named ` +
        `"${ANTFU_UNICORN_BLOCK_NAME}" to mirror onto .vue files, but found none. Vue files ` +
        `may be missing unicorn rules; this preset needs updating for the installed ` +
        `@antfu/eslint-config.`,
    )

    return
  }

  const source = configs[index]
  const sourceFiles = Array.isArray(source?.files) ? source.files : []
  const coversVue = sourceFiles.some(
    (glob) => typeof glob === 'string' && glob.includes('vue'),
  )
  if (coversVue || !source?.rules) {
    return
  }

  configs.splice(index + 1, 0, {
    name: 'maninak/unicorn/vue',
    files: [GLOB_VUE],
    rules: { ...source.rules },
  })
}

/** Whether a flat-config rule entry is switched off, in any of the shapes ESLint accepts. */
function isRuleOff(entry: unknown): boolean {
  const severity = Array.isArray(entry) ? (entry as unknown[])[0] : entry
  return severity === 'off' || severity === 0
}

/**
 * Returns the final list of tsconfig paths to drive type-aware linting, or `undefined` if
 * type-aware linting should stay off.
 *
 * Resolution order:
 * 1. If the consumer set `typescript: false`, return undefined (TS is being disabled
 * outright).
 * 2. If the consumer set `typescript.tsconfigPath` (string or string[]), use that.
 * 3. Otherwise auto-detect: a `tsconfig.json` at cwd plus `typescript` in the consumer's
 *    deps activates type-aware linting silently.
 */
function resolveTsconfigPaths(
  typescriptOption: ManinakOptions['typescript'],
): string[] | undefined {
  if (typescriptOption === false) {
    return undefined
  }
  const tsObject = typeof typescriptOption === 'object' ? typescriptOption : {}
  const explicit = tsObject.tsconfigPath

  if (Array.isArray(explicit)) {
    const paths = explicit.filter((item): item is string => item.length > 0)
    return paths.length > 0 ? paths : undefined
  }
  if (typeof explicit === 'string' && explicit.length > 0) {
    return [explicit]
  }

  return isInConsumerDeps('typescript') && hasConsumerTsconfig()
    ? ['./tsconfig.json']
    : undefined
}

/**
 * antfu v9 forwards `tsconfigPath` straight into `projectService.defaultProject`, which only
 * accepts a single string. When the consumer wants multiple non-standard-named tsconfigs,
 * we swap the type-aware parser blocks over to legacy `parserOptions.project`, which natively
 * accepts an array. Run in place after `antfu()` returns.
 */
function switchToLegacyProjectMode(
  configs: TypedFlatConfigItem[],
  tsconfigPaths: string[],
): void {
  for (const block of configs) {
    const parserOptions = block.languageOptions?.['parserOptions'] as
      { projectService?: unknown; project?: unknown } | undefined
    if (parserOptions && 'projectService' in parserOptions) {
      delete parserOptions.projectService
      parserOptions.project = tsconfigPaths
    }
  }
}

async function getNuxtConfigs(): Promise<Parameters<typeof antfu>['1'][]> {
  try {
    const { createConfigForNuxt } = await import('@nuxt/eslint-config/flat')
    const configs = await createConfigForNuxt({})
    const arr = Array.isArray(configs) ? configs : [configs]

    // Nuxt's config registers `eslint-plugin-import`; antfu v9 already registers a
    // different fork (`eslint-plugin-import-x` / `eslint-plugin-import-lite`) under
    // the same `import` key. Flat config rejects two distinct plugin objects under
    // one key, so we drop the offending nuxt block and let antfu's import rules
    // continue to apply.
    return arr.filter((block) => !block?.plugins?.['import']).map(makeNuxtGlobsWorkspaceWide)
  } catch {
    // @nuxt/eslint-config not installed; skip silently
    return []
  }
}

/**
 * Nuxt's generated config anchors its convention-file globs at the lint root (the `pages/`,
 * `layouts/`, `components/` dirs, and `error.vue` / `app.vue`). When the Nuxt app lives in a
 * workspace sub-package (e.g. `apps/web`) those globs never match `apps/web/pages/...`, so the
 * exemptions they carry, like turning `vue/multi-word-component-names` off for `pages/` and
 * `error.vue`, silently fail and the convention files (whose names Nuxt dictates and the user
 * cannot rename) get flagged. Prefixing each glob not already globstar-anchored with a
 * leading globstar makes it match the Nuxt dirs at any depth; a leading globstar matches
 * zero segments too, so a Nuxt app at the lint root still matches. These blocks only relax
 * rules for the convention files, so broadening the match is safe.
 */
function makeNuxtGlobsWorkspaceWide<T extends { files?: unknown }>(block: T): T {
  if (!Array.isArray(block.files)) {
    return block
  }

  const files = (block.files as unknown[]).map((glob) =>
    typeof glob === 'string' && !glob.startsWith('**/') && !glob.startsWith('/')
      ? `**/${glob}`
      : glob,
  )

  return { ...block, files }
}
