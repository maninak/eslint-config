/* The `filenameCase` option: enforcing one casing convention on source filenames. */

import type { TypedFlatConfigItem } from '@antfu/eslint-config'
import { GLOB_VUE } from '@antfu/eslint-config'
import { isInConsumerDeps } from '../utils.js'

/** Casing conventions `unicorn/filename-case` can enforce. */

export type FilenameCase = 'camelCase' | 'kebabCase' | 'pascalCase' | 'snakeCase'

/** Shape of the object form of the factory's `filenameCase` option. */
export interface FilenameCaseOptions {
  /**
   * Casing for `.ts`, `.mts`, `.cts`, `.js`, `.mjs` and `.cjs` files, or `false` to leave them
   * unchecked. Default: `'camelCase'`.
   *
   * `.tsx` and `.jsx` are never checked: one repo legitimately holds PascalCase components and
   * camelCase hooks under the same extension, so no single casing is right for them.
   */
  ts?: FilenameCase | false

  /** Casing for `.vue` files, or `false` to leave them unchecked. Default: `'pascalCase'`. */
  vue?: FilenameCase | false

  /** Extra globs exempt from the check, on top of the framework carve-outs. */
  ignore?: string[]

  /** Severity for both blocks. Default: `'error'`. */
  severity?: 'error' | 'warn'
}

/*
 * Paths whose FILENAME is load-bearing under Vue/Nuxt file-based conventions: renaming one
 * changes a route or URL, or stops the framework finding the file at all. Applied only when
 * `vue` or `nuxt` is a consumer dependency, so a plain TS repo keeps the check everywhere.
 *
 * The last glob covers dynamic route segments (`[id].vue`, `[...slug].vue`); its backslash
 * escapes minimatch's character-class syntax so the bracket is matched literally.
 */
const FRAMEWORK_FILENAME_EXEMPTIONS = [
  '**/pages/**',
  '**/layouts/**',
  '**/middleware/**',
  '**/server/**',
  '**/app.vue',
  '**/error.vue',
  '**/*.config.{ts,mts,cts,js,mjs,cjs}',
  '**/*\\[*',
]

const GLOB_FILENAME_CASE_TS = '**/*.{ts,mts,cts,js,mjs,cjs}'

/**
 * Builds the blocks that enforce a filename casing convention, one for the JS/TS family and
 * one for `.vue`.
 *
 * The rule cannot autofix, since renaming a file on disk would break every import of it, so
 * both blocks only report; the fix is a manual `git mv` plus an import rewrite.
 *
 * @param options Which casing per extension, and what to exempt. See
 *   {@link FilenameCaseOptions}.
 */
export function buildFilenameCaseBlocks(
  options: FilenameCaseOptions = {},
): TypedFlatConfigItem[] {
  const { ts = 'camelCase', vue = 'pascalCase', ignore = [], severity = 'error' } = options
  const usesFileBasedConventions = isInConsumerDeps('vue') || isInConsumerDeps('nuxt')
  const ignores = [
    ...(usesFileBasedConventions ? FRAMEWORK_FILENAME_EXEMPTIONS : []),
    ...ignore,
  ]

  return [
    ...(ts
      ? ([
          {
            name: 'maninak/filename-case/script',
            files: [GLOB_FILENAME_CASE_TS],
            ignores,
            rules: { 'unicorn/filename-case': [severity, { case: ts }] },
          },
        ] satisfies TypedFlatConfigItem[])
      : []),
    ...(vue
      ? ([
          {
            name: 'maninak/filename-case/vue',
            files: [GLOB_VUE],
            ignores,
            rules: { 'unicorn/filename-case': [severity, { case: vue }] },
          },
        ] satisfies TypedFlatConfigItem[])
      : []),
  ]
}
