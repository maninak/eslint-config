import type { TypedFlatConfigItem } from '@antfu/eslint-config'
import type { ManinakOptions } from './options.js'
import antfu, { GLOB_TS, GLOB_TSX, GLOB_VUE } from '@antfu/eslint-config'
import { merge } from 'ts-deepmerge'
import { resolveCssBlocks } from './features/css.js'
import { buildFilenameCaseBlocks } from './features/filename-case.js'
import { resolveRequireJsdocBlocks } from './features/jsdoc.js'
import { getNuxtConfigs } from './features/nuxt.js'
import { buildSortImportsBlock } from './features/sort-imports.js'
import { resolveTailwindBlocks } from './features/tailwind.js'
import {
  findVueTypeAwareProblem,
  giveVueBlockATypeScriptProject,
  resolveTsconfigPaths,
  switchToLegacyProjectMode,
} from './features/type-aware.js'
import {
  dedupePluginRegistrations,
  keepJavascriptBlocksOffCss,
  restoreUnicornRulesOnVue,
} from './patch-antfu.js'
import buildPreset from './preset.js'
import { isInConsumerDeps } from './utils.js'

export type { ManinakExtraOptions, ManinakOptions } from './options.js'

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
  /*
   * Serial on purpose. These four are independent and `Promise.all` looks like the obvious
   * win, but the cost is module EVALUATION, which node does synchronously once a specifier
   * resolves, so nothing overlaps: measured on a Vue + Tailwind + CSS fixture, parallel came
   * out at 885-1167ms against 895-911ms serial. Do not re-chase this without a new axis.
   */
  const tailwindBlocks = await resolveTailwindBlocks(tailwind)
  const cssBlocks = await resolveCssBlocks(css)
  const [maninakOptions, ...maninakConfig] = await buildPreset()
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
   * The tsconfigs SFC type-awareness would run against, or `undefined` when a precondition
   * rules it out. Carrying the paths rather than a boolean keeps them narrowed at the two
   * later uses, which a reassignable flag cannot do.
   */
  const typeAwarePaths =
    vueTypeAware && vueEnabled && tsconfigPaths !== undefined ? tsconfigPaths : undefined
  let typeAwareVue = typeAwarePaths !== undefined
  if (typeAwarePaths !== undefined) {
    const problem = await findVueTypeAwareProblem(typeAwarePaths)
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
  if (typeAwareVue && typeAwarePaths !== undefined) {
    giveVueBlockATypeScriptProject(configs, typeAwarePaths[0]!)
  }

  if (tsconfigPaths && tsconfigPaths.length > 1) {
    switchToLegacyProjectMode(configs, tsconfigPaths)
  }

  return configs
}
