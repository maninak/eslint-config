import type { TypedFlatConfigItem } from '@antfu/eslint-config'
import antfu from '@antfu/eslint-config'
import merge from 'ts-deepmerge'
import buildConfig, { requireJsdocInUtilsBlocks } from './config.js'
import { isInConsumerDeps } from './utils.js'

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
 * installed, the official Nuxt flat config. Type-aware rules activate only when
 * the consumer passes a `tsconfigPath`; without it the config still works for
 * JavaScript-only or untyped TypeScript projects.
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
 * @example <caption>Enable type-aware linting by pointing at your tsconfig</caption>
 * ```ts
 * export default maninak({
 *   typescript: { tsconfigPath: './tsconfig.json' },
 * })
 * ```
 *
 * @example <caption>Opt in to JSDoc requirements for utility code</caption>
 * ```ts
 * export default maninak({
 *   typescript: { tsconfigPath: './tsconfig.json' },
 *   requireJsdocInUtils: true,
 * })
 * ```
 *
 * @example <caption>Append a project-specific block that overrides a rule</caption>
 * ```ts
 * export default maninak(
 *   { typescript: { tsconfigPath: './tsconfig.json' } },
 *   {
 *     files: ['src/legacy/**'],
 *     rules: { 'ts/no-explicit-any': 'off' },
 *   },
 * )
 * ```
 */
export async function maninak(
  options: Parameters<typeof antfu>['0'] & ManinakExtraOptions = {},
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

  return await antfu(
    merge(frameworkDefaults, maninakOptions, antfuOptions),
    ...maninakConfig,
    ...(requireJsdocInUtils ? requireJsdocInUtilsBlocks : []),
    ...nuxtConfigs,
    ...userConfigs,
  )
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
