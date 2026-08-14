/* The `requireJsdoc` option: which files, and which node kinds, must carry a JSDoc block. */

import type { TypedFlatConfigItem } from '@antfu/eslint-config'

/** Node kinds `jsdoc/require-jsdoc` can demand a block on. */

export type JsdocNodeKind =
  | 'ArrowFunctionExpression'
  | 'ClassDeclaration'
  | 'FunctionDeclaration'
  | 'FunctionExpression'
  | 'MethodDefinition'

/** Shape of the object form of the factory's `requireJsdoc` option. */
export interface RequireJsdocOptions {
  /**
   * Globs to enforce on, REPLACING the utility-code defaults. Pass this when the reusable API
   * lives somewhere the defaults do not reach, e.g. a domain-module or monorepo-package
   * layout.
   */
  files?: string[]

  /** Globs enforced IN ADDITION to whatever `files` resolves to (defaults included). */
  extraFiles?: string[]

  /** When true, only `export`ed declarations need a block. Default: `true`. */
  publicOnly?: boolean

  /**
   * Which node kinds require a block. Merges over the default, which demands one on the three
   * declaration kinds and exempts function and arrow expressions.
   */
  require?: Partial<Record<JsdocNodeKind, boolean>>

  /** When true, a block must carry a free-text description, not just tags. Default: `true`. */
  description?: boolean

  /** Severity for both rules. Default: `'warn'`. */
  severity?: 'error' | 'warn'
}

const JSDOC_EXTENSIONS = '{ts,tsx,js,jsx,mts,mjs,cts,cjs}'

/**
 * Folders and filenames that conventionally hold reusable utilities. Used when the caller
 * names no `files` of its own.
 */
export const DEFAULT_JSDOC_FILES: string[] = [
  `**/utils/**/*.${JSDOC_EXTENSIONS}`,
  `**/util/**/*.${JSDOC_EXTENSIONS}`,
  `**/lib/**/*.${JSDOC_EXTENSIONS}`,
  `**/helpers/**/*.${JSDOC_EXTENSIONS}`,
  `**/utils.${JSDOC_EXTENSIONS}`,
  `**/util.${JSDOC_EXTENSIONS}`,
  `**/lib.${JSDOC_EXTENSIONS}`,
  `**/helpers.${JSDOC_EXTENSIONS}`,
]

const DEFAULT_JSDOC_REQUIRE: Record<JsdocNodeKind, boolean> = {
  FunctionDeclaration: true,
  MethodDefinition: true,
  ClassDeclaration: true,
  ArrowFunctionExpression: false,
  FunctionExpression: false,
}

/*
 * Test files stay exempt whatever `files` the caller passes: a spec's own helpers are read
 * alongside the assertions that use them, so a required block there is pure friction.
 */
const JSDOC_TEST_EXEMPTIONS = [
  `**/*.{test,spec,unit}.${JSDOC_EXTENSIONS}`,
  '**/test/**',
  '**/tests/**',
  '**/__tests__/**',
  '**/__specs__/**',
  '**/specs/**',
]

/**
 * Builds the block that requires JSDoc on exported declarations, followed by the block that
 * exempts test files. Order matters: the exemption must come second to win.
 *
 * @param options Which globs to enforce on and how strictly. See {@link RequireJsdocOptions}.
 */
function buildRequireJsdocBlocks(options: RequireJsdocOptions = {}): TypedFlatConfigItem[] {
  const {
    files = DEFAULT_JSDOC_FILES,
    extraFiles = [],
    publicOnly = true,
    require: requireKinds,
    description = true,
    severity = 'warn',
  } = options

  return [
    {
      name: 'maninak/jsdoc-required-in-utility-code',
      files: [...files, ...extraFiles],
      rules: {
        'jsdoc/require-jsdoc': [
          severity,
          {
            publicOnly,
            require: { ...DEFAULT_JSDOC_REQUIRE, ...requireKinds },
          },
        ],
        ...(description ? { 'jsdoc/require-description': severity } : {}),
      },
    },
    {
      name: 'maninak/jsdoc-disabled-in-tests',
      files: JSDOC_TEST_EXEMPTIONS,
      rules: {
        'jsdoc/require-jsdoc': 'off',
        'jsdoc/require-description': 'off',
      },
    },
  ]
}

/**
 * Turns the `requireJsdoc` option into the flat-config blocks that enforce it, or into nothing
 * when it is off.
 */
export function resolveRequireJsdocBlocks(
  option: boolean | RequireJsdocOptions,
): TypedFlatConfigItem[] {
  if (option === false) {
    return []
  }

  return buildRequireJsdocBlocks(option === true ? {} : option)
}
