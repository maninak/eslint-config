import type {
  OptionsConfig,
  OptionsTypescript,
  TypedFlatConfigItem,
} from '@antfu/eslint-config'
import antfu, { GLOB_VUE } from '@antfu/eslint-config'
import { merge } from 'ts-deepmerge'
import buildConfig, { requireJsdocInUtilsBlocks } from './config.js'
import { hasConsumerTsconfig, isInConsumerDeps } from './utils.js'

/** Maninak-specific options layered on top of antfu's. All optional. */
export interface ManinakExtraOptions {
  /**
   * When true, require a JSDoc block on `export`ed functions, classes, and methods in folders
   * that conventionally hold reusable utilities e.g. `utils/`, `lib/`, etc.
   * `@param` and `@returns` tags stay optional; a free-text description alone is enough
   * of a contract.
   *
   * Test files e.g. `*.test.*`, `*.spec.*`, are always exempt even when their path matches one
   * of the utility globs.
   *
   * Default: `false`. Off by default to keep the preset lower friction.
   */
  requireJsdocInUtils?: boolean
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
 *   requireJsdocInUtils: true,
 * })
 * ```
 */
export async function maninak(
  options: ManinakOptions = {},
  ...userConfigs: Parameters<typeof antfu>['1'][]
): Promise<TypedFlatConfigItem[]> {
  const { requireJsdocInUtils = false, ...antfuOptions } = options
  const [maninakOptions, ...maninakConfig] = buildConfig()
  const nuxtConfigs = isInConsumerDeps('nuxt') ? await getNuxtConfigs() : []
  const frameworkDefaults = {
    vue: isInConsumerDeps('vue') || isInConsumerDeps('nuxt'),
    svelte: isInConsumerDeps('svelte'),
    react: isInConsumerDeps('react') || isInConsumerDeps('next'),
  }

  const tsconfigPaths = resolveTsconfigPaths(antfuOptions.typescript)
  const tsconfigOverride = tsconfigPaths
    ? { typescript: { tsconfigPath: tsconfigPaths[0] } }
    : {}

  const configs = await antfu(
    merge(frameworkDefaults, maninakOptions, antfuOptions, tsconfigOverride),
    ...maninakConfig,
    ...(requireJsdocInUtils ? requireJsdocInUtilsBlocks : []),
    ...nuxtConfigs,
    ...userConfigs,
  )

  dedupePluginRegistrations(configs)
  restoreUnicornRulesOnVue(configs)

  if (tsconfigPaths && tsconfigPaths.length > 1) {
    switchToLegacyProjectMode(configs, tsconfigPaths)
  }

  return configs
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
 * Rewrites blocks by replacing them in `configs` rather than editing them in place: some come
 * from module-level singletons (a plugin's exported `configs.recommended`, this preset's own
 * jsdoc blocks), and editing those would leak into every later `maninak()` call in the
 * process.
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

/** Name of the antfu block whose unicorn rules {@link restoreUnicornRulesOnVue} mirrors. */
const ANTFU_UNICORN_BLOCK_NAME = 'antfu/unicorn/rules'

/**
 * Re-applies antfu's unicorn rules to single-file components.
 *
 * antfu v9.3 scoped that block to `**\/*.?([cm])[jt]s?(x)`, which correctly stopped the rules
 * leaking onto JSON and TOML but also stopped them reaching `.vue`, where a Vue or Nuxt
 * consumer keeps most of its code. Nothing errors when that happens: 14 rules including
 * `unicorn/error-message`, `unicorn/throw-new-error` and `unicorn/prefer-node-protocol` simply
 * stop running. The mirrored block is inserted directly after the source so every later block,
 * `maninak/prettier-vue` above all, still overrides it.
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
      | { projectService?: unknown; project?: unknown }
      | undefined
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
