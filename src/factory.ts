import type {
  OptionsConfig,
  OptionsTypescript,
  TypedFlatConfigItem,
} from '@antfu/eslint-config'
import type { FilenameCaseOptions, RequireJsdocOptions, SortImportsOptions } from './config.js'
import path from 'node:path'
import antfu, { GLOB_TS, GLOB_TSX, GLOB_VUE } from '@antfu/eslint-config'
import { glob } from 'tinyglobby'
import { merge } from 'ts-deepmerge'
import buildConfig, {
  buildFilenameCaseBlocks,
  buildRequireJsdocBlocks,
  buildSortImportsBlock,
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
   * When true, extend type-aware linting to `.vue` single-file components, so rules needing
   * type information (`ts/no-unsafe-*`, `ts/no-misused-promises`,
   * `ts/restrict-template-expressions`, and the rest) run inside SFCs instead of stopping at
   * the `.vue` boundary.
   *
   * Three preconditions, which fail differently on purpose. Vue support must be on, else the
   * option is inapplicable and is ignored with a warning. Type-aware linting must be active,
   * meaning a resolved `tsconfig.json` (see `typescript.tsconfigPath`). And that tsconfig's
   * `include` must cover `.vue`: one that excludes them makes every SFC report "not found in
   * project" instead of linting, so that case throws with an actionable message rather than
   * emitting a flood of parser errors.
   *
   * Default: `false`. Turning it on surfaces every previously-invisible type error in your
   * SFCs at once, so it is opt-in until you are ready for that.
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
    vueTypeAware = false,
    ...antfuOptions
  } = options
  const jsdocBlocks = resolveRequireJsdocBlocks(requireJsdoc ?? requireJsdocInUtils)
  const sortImportsBlocks = sortImports ? [buildSortImportsBlock(sortImports)] : []
  const filenameCaseBlocks =
    filenameCase === false
      ? []
      : buildFilenameCaseBlocks(filenameCase === true ? {} : filenameCase)
  const [maninakOptions, ...maninakConfig] = buildConfig()
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
  if (vueTypeAware && !vueEnabled) {
    console.warn(
      `[@maninak/eslint-config] vueTypeAware is on, but Vue support is off (no "vue" or ` +
        `"nuxt" dependency was detected and "vue" was not passed), so there are no .vue ` +
        `files to lint type-aware. The option is being ignored.`,
    )
  }
  const typeAwareVue = vueTypeAware && vueEnabled && tsconfigPaths !== undefined
  if (typeAwareVue) {
    await assertTsconfigCoversVue(tsconfigPaths[0]!)
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
    ...sortImportsBlocks,
    ...nuxtConfigs,
    ...userConfigs,
  )

  dedupePluginRegistrations(configs)
  restoreUnicornRulesOnVue(configs)

  // Runs before the legacy switch below so both passes agree on which project mode is active.
  if (typeAwareVue) {
    giveVueBlockATypeScriptProject(configs, tsconfigPaths[0]!)
  }

  if (tsconfigPaths && tsconfigPaths.length > 1) {
    switchToLegacyProjectMode(configs, tsconfigPaths)
  }

  return configs
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
 * Throws when `tsconfigPath` does not pull `.vue` files into its program while the project
 * clearly has some.
 *
 * A tsconfig whose `include` misses SFCs does not disable type-aware linting for them, it
 * makes
 * every one report `was not found by the project service` as a parse error, so a 138-SFC app
 * answers with 138 opaque failures and no hint of the cause. Nuxt's generated
 * `.nuxt/tsconfig.json` covers `.vue`; a hand-rolled one frequently does not.
 *
 * Resolution goes through TypeScript itself, with the same `.vue` extension registration
 * typescript-eslint uses, because `include` entries name directories as often as globs and
 * pattern-matching them by hand gets the answer wrong either way. Stays silent when the
 * project
 * has no SFCs at all, where the option is merely redundant rather than misconfigured.
 */
async function assertTsconfigCoversVue(tsconfigPath: string): Promise<void> {
  let loaded
  try {
    loaded = (await import('typescript')).default
  } catch {
    console.warn(
      `[@maninak/eslint-config] vueTypeAware is on but "typescript" could not be imported, ` +
        `so whether "${tsconfigPath}" covers .vue files could not be checked.`,
    )

    return
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
    return // Let ESLint report an unreadable tsconfig in its own words.
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
    return
  }

  // Only now is a filesystem sweep worth its cost, and only to tell "misconfigured" apart
  // from "no SFCs yet".
  const sfcs = await glob(['**/*.vue'], {
    cwd: process.cwd(),
    ignore: ['**/node_modules/**', '**/dist/**', '**/.nuxt/**', '**/.output/**'],
  })
  if (sfcs.length === 0) {
    return
  }

  throw new Error(
    `[@maninak/eslint-config] vueTypeAware is on, but "${tsconfigPath}" does not include ` +
      `any of the ${sfcs.length} .vue files in this project, so each one would report ` +
      `"was not found by the project service" instead of linting. Add "**/*.vue" to that ` +
      `tsconfig's "include", point typescript.tsconfigPath at one that covers SFCs (Nuxt ` +
      `generates .nuxt/tsconfig.json), or set vueTypeAware: false.`,
  )
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
