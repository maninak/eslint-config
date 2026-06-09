import type {
  OptionsConfig,
  OptionsTypescript,
  TypedFlatConfigItem,
} from '@antfu/eslint-config'
import antfu from '@antfu/eslint-config'
import merge from 'ts-deepmerge'
import buildConfig, { requireJsdocInUtilsBlocks } from './config.js'
import { hasConsumerTsconfig, isInConsumerDeps } from './utils.js'

/**
 * Maninak-specific options layered on top of antfu's. All optional.
 */
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
  options: OptionsConfig & ManinakExtraOptions = {},
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

  if (tsconfigPaths && tsconfigPaths.length > 1) {
    switchToLegacyProjectMode(configs, tsconfigPaths)
  }

  return configs
}

/**
 * Returns the final list of tsconfig paths to drive type-aware linting, or `undefined` if
 * type-aware linting should stay off.
 *
 * Resolution order:
 * 1. If the consumer set `typescript: false`, return undefined (TS is being disabled outright).
 * 2. If the consumer set `typescript.tsconfigPath` (string or string[]), use that.
 * 3. Otherwise auto-detect: a `tsconfig.json` at cwd plus `typescript` in the consumer's
 *    deps activates type-aware linting silently.
 */
function resolveTsconfigPaths(
  typescriptOption: OptionsConfig['typescript'],
): string[] | undefined {
  if (typescriptOption === false) {
    return undefined
  }
  const tsObject: OptionsTypescript =
    typeof typescriptOption === 'object' ? typescriptOption : {}
  const explicit = (tsObject as { tsconfigPath?: unknown }).tsconfigPath

  if (Array.isArray(explicit)) {
    const paths = explicit.filter(
      (item): item is string => typeof item === 'string' && item.length > 0,
    )

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
    return arr.filter((block) => !block?.plugins?.['import'])
  } catch {
    // @nuxt/eslint-config not installed; skip silently
    return []
  }
}
