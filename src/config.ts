/* eslint-disable ts/no-unsafe-member-access */
/* eslint-disable ts/no-unsafe-assignment */

import type antfu from '@antfu/eslint-config'
import type { TypedFlatConfigItem } from '@antfu/eslint-config'
import type { Config as PrettierConfig } from 'prettier'
import {
  GLOB_JS,
  GLOB_JSON,
  GLOB_JSON5,
  GLOB_JSONC,
  GLOB_JSX,
  GLOB_TESTS,
  GLOB_TSX,
  GLOB_VUE,
} from '@antfu/eslint-config'
import { FlatCompat } from '@eslint/eslintrc'
import pluginStylistic from '@stylistic/eslint-plugin'
import pluginJasmine from 'eslint-plugin-jasmine'
import pluginPrettier from 'eslint-plugin-prettier'
import pluginVueScopedCss from 'eslint-plugin-vue-scoped-css'
import { getConsumerVueVersion, isInConsumerDeps } from './utils.js'

const prettier = interopDefault(pluginPrettier)

const prettierRulesFixingConflictsWithEslint = {
  ...interopDefault(import('eslint-config-prettier')).rules,
}
delete prettierRulesFixingConflictsWithEslint['vue/html-self-closing']

const maxColumnsPerLine = 95

const prettierConfig: PrettierConfig = {
  printWidth: maxColumnsPerLine,
  useTabs: false,
  tabWidth: 2,
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  quoteProps: 'consistent',
  arrowParens: 'always',
  htmlWhitespaceSensitivity: 'ignore',
}

/**
 * Builds the maninak rule preset. Returns a tuple `[maninakOptionsForAntfu, ...flatBlocks]`:
 * the first element is the options object passed to antfu's factory, the rest are flat-config
 * items appended after antfu has run.
 *
 * Exported as a function (not a static array) so that gates which depend on the consumer's
 * environment, like `isInConsumerDeps('vue')` and `isInConsumerDeps('tailwindcss')`, evaluate
 * lazily on every `maninak()` call. A static array would freeze those gates at module-load
 * time, which works fine in real consumer setups but breaks tests that run multiple specs
 * under different cwds.
 */
export default function buildConfig() {
  const resolvedVueVersion = getConsumerVueVersion()

  return [
    {
      ignores: ['static', '.*', '!.*.*', 'LICENCE'],
      stylistic: false,
      typescript: {
        // Rules that do NOT require type information (applied to all TS files,
        // regardless of whether `tsconfigPath` is set by the consumer).
        overrides: {
          /*
           * Rules implemented by `@typescript-eslint` follow, in antfu v9 definition order.
           * Only rules that deviate from antfu's defaults are listed here.
           * ==================================================================================
           */

          // antfu default: ['error', { minimumDescriptionLength: 3, ... }]. Maninak turns off
          // (ts-expect-error and ts-ignore are sometimes the pragmatic escape hatch).
          'ts/ban-ts-comment': 'off',

          // antfu default: ['error', 'type']. Maninak prefers interface for structural types.
          'ts/consistent-type-definitions': ['warn', 'interface'],

          // antfu default: off. Maninak enforces inline type imports.
          'ts/consistent-type-imports': [
            'warn',
            { disallowTypeAnnotations: false, fixStyle: 'inline-type-imports' },
          ],

          // antfu does not enforce a function style. Maninak prefers `function foo() {}` over
          // `const foo = () => {}` for top-level/named declarations.
          'func-style': ['warn', 'declaration', { allowArrowFunctions: false }],

          'no-nested-ternary': 'warn',
          'complexity': ['warn', { max: 25 }],

          // antfu default: off. Maninak warns on explicit `any` (not dangerous, just noisy).
          'ts/no-explicit-any': 'warn',

          // antfu default: off. Maninak treats this as a design smell, not urgent, so warn.
          'ts/no-extraneous-class': 'warn',

          // antfu default: off.
          'ts/no-import-type-side-effects': 'warn',

          // antfu default: off. Maninak treats redundant overloads as a design smell, so warn.
          'ts/unified-signatures': 'warn',

          // antfu default: off. Maninak turns off (managed by unused-imports plugin instead).
          'ts/no-unused-vars': 'off',

          /*
           * Rules below have no antfu default (maninak additions)
           * ==================================================================================
           */

          'ts/array-type': ['warn', { default: 'array', readonly: 'array' }],

          'ts/explicit-member-accessibility': 'warn',

          'ts/prefer-for-of': 'warn', // style preference, not dangerous

          'ts/member-ordering': 'warn',

          'ts/no-inferrable-types': 'off',

          'ts/no-this-alias': 'off',

          'ts/naming-convention': [
            'warn',
            {
              selector: 'interface',
              format: ['PascalCase'],
              custom: { regex: '^I[A-Z]', match: false },
            },
            {
              selector: 'variable',
              format: ['camelCase', 'UPPER_CASE'],
              leadingUnderscore: 'allow',
              trailingUnderscore: 'allow',
            },
            { selector: 'typeLike', format: ['PascalCase'] },
          ],

          'ts/no-extra-non-null-assertion': 'warn',

          'ts/prefer-function-type': 'warn',

          // overrides to antfu's defaults
          'ts/indent': 'off',
          'ts/consistent-type-assertions': [
            'warn',
            { assertionStyle: 'as', objectLiteralTypeAssertions: 'allow-as-parameter' },
          ],
        },

        // Rules that REQUIRE type information. Antfu v9 places these in a separate config
        // block (antfu/typescript/rules-type-aware) that only activates when the consumer
        // passes `tsconfigPath`. The overrides here are merged into that block.
        // Putting them in `overrides` above would have no effect.
        overridesTypeAware: {
          // antfu default: error. Off in maninak: fire-and-forget is a frequent legitimate
          // pattern in this codebase's domain (extension activation, UI side effects), and
          // the rule's noise on intentional cases outweighed its catch rate for accidental ones.
          'ts/no-floating-promises': 'off',

          // antfu default: error.
          'ts/promise-function-async': 'warn',

          // antfu default: error. Fixable, but the auto-fix often inserts noisy String()
          // conversions; downgrade to warn so the dev sees it and decides.
          'ts/restrict-template-expressions': 'warn',

          // antfu default: ['error', 'in-try-catch']. Maninak uses 'always' (always explicit
          // about async/await).
          'ts/return-await': ['warn', 'always'],

          // antfu default: ['error', { ... }]. The rule catches real bugs but rejects
          // idiomatic `if (str)` for nullable strings/numbers/booleans, which dominates
          // a typical codebase. Relax those variants and downgrade to warn.
          'ts/strict-boolean-expressions': [
            'warn',
            {
              allowString: true,
              allowNumber: true,
              allowNullableBoolean: true,
              allowNullableString: true,
              allowNullableNumber: true,
              allowNullableObject: true,
              // Keep `if (any)` flagged: an any-typed condition really is a hole worth seeing.
              allowAny: false,
            },
          ],

          // Type-aware additions not in antfu's defaults (all fixable, so warn).
          'ts/require-array-sort-compare': 'warn',
          'ts/prefer-readonly': 'warn',
          'ts/no-unnecessary-qualifier': 'warn',
          'ts/no-duplicate-type-constituents': 'warn',
          'ts/no-confusing-void-expression': 'warn',
        },
      },
    },
    {
      rules: {
        // antfu's pnpm plugin enforces shellEmulator: true and trustPolicy: "no-downgrade"
        // via this rule. The trust-policy demand rejects legitimate dependency updates
        // (eslint-config-prettier@9.1.2 was the trigger). Opt out globally.
        'pnpm/yaml-enforce-settings': 'off',
        // antfu enables this for jsonc files. Key order in tsconfig.json (and similar) is
        // conventional and not alphabetical, and the rule fights that convention.
        'jsonc/sort-keys': 'off',
        // antfu default: ['error', 'top-level']. Conflicts with our inline-type-imports
        // preference (see `ts/consistent-type-imports` below) AND with `perfectionist/sort-imports`,
        // which sorts top-level type-imports as a separate group. Turn off and let
        // `ts/consistent-type-imports` enforce the inline style on new code.
        'import/consistent-type-specifier-style': 'off',
      },
    },
    {
      plugins: {
        // antfu v9 with `stylistic: false` does not register the @stylistic plugin, but
        // we still need it for `style/member-delimiter-style` further below.
        style: interopDefault(pluginStylistic),
      },
      rules: {
        /*
         * Rules native to ESLint follow, antfu-overrides first then maninak additions
         * ====================================================================================
         */

        // overrides to antfu's defaults
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        'no-unused-expressions': [
          'warn',
          {
            allowShortCircuit: true,
            allowTernary: true,
            allowTaggedTemplates: true,
            enforceForJSX: true,
          },
        ],
        // Disabling antfu/curly lets `curly: 'all'` win unopposed. Net behavior: unchanged.
        'antfu/curly': 'off',
        'curly': ['warn', 'all'],
        'no-debugger': 'warn',
        'prefer-const': ['warn', { destructuring: 'all', ignoreReadBeforeAssign: true }],
        'no-restricted-syntax': [
          'error',
          {
            selector: 'TSEnumDeclaration',
            message:
              "Don't declare enums. See alternative: https://twitter.com/maninak_/status/1448344698704343040",
          },
          // LabeledStatement and WithStatement are archaic and dangerous constructs
          'LabeledStatement',
          'WithStatement',
        ],

        // maninak additions follow
        'no-confusing-arrow': ['warn', { allowParens: true }],
        'no-extra-boolean-cast': 'warn',
        'padding-line-between-statements': [
          'warn',
          { blankLine: 'always', prev: '*', next: 'return' },
          { blankLine: 'always', prev: 'directive', next: '*' },
          { blankLine: 'always', prev: '*', next: 'multiline-block-like' },
          // relax for co-located early return ifs
          { blankLine: 'any', prev: '*', next: 'if' },
          // relax for co-located vars set by loops
          { blankLine: 'any', prev: 'singleline-let', next: 'multiline-block-like' },
          { blankLine: 'any', prev: 'singleline-const', next: 'for' },
          { blankLine: 'any', prev: 'singleline-const', next: 'while' },
          { blankLine: 'any', prev: 'singleline-const', next: 'do' },
        ],
        'id-length': ['warn', { min: 2, max: 50, exceptions: ['i', 'j', 'x', 'y', 'z', '_'] }],
        'max-len': [
          'warn',
          {
            code: maxColumnsPerLine,
            tabWidth: 2,
            ignoreComments: true,
            ignoreTrailingComments: true,
            ignoreTemplateLiterals: true, // TODO: remove once prettier resolves https://github.com/prettier/prettier/issues/3368
            ignoreRegExpLiterals: true,
            ignoreUrls: true,
          },
        ],
        // convention violation (import lodash properly), not a dangerous error, so warn
        'no-restricted-imports': [
          'warn',
          {
            paths: [
              {
                name: 'lodash',
                message:
                  "Instead use `import [module] from 'lodash/[module]'`, or `import {[module]} from 'lodash-es'` (latter is preferable if possible).\nMore info: https://www.labnol.org/code/import-lodash-211117",
              },
            ],
          },
        ],
        'space-before-function-paren': [
          'warn',
          { anonymous: 'always', named: 'never', asyncArrow: 'always' },
        ],
        'prefer-exponentiation-operator': 'warn',
        'prefer-rest-params': 'warn',
        'prefer-spread': 'warn',
        'prefer-template': 'warn',
        'template-curly-spacing': 'warn',
        'arrow-parens': ['warn', 'always', { requireForBlockBody: true }],
        'spaced-comment': [
          'warn',
          'always',
          {
            line: { markers: ['/'], exceptions: ['/', '#'] },
            block: { markers: ['!'], exceptions: ['*'], balanced: true },
          },
        ],
        'consistent-return': 'warn',
        'complexity': ['warn', 40],
        'require-await': 'warn',
        'max-statements-per-line': 'warn',
        'no-empty': ['warn', { allowEmptyCatch: true }],
        'no-multiple-empty-lines': ['warn', { max: 1, maxBOF: 0, maxEOF: 1 }],
        'no-useless-return': 'warn',
        'no-undef-init': 'warn',

        /*
         * Rules from `perfectionist` (exposed as `perfectionist/` in antfu v9) follow
         * ====================================================================================
         * Replaces the former `import/order` + native `sort-imports` combo:
         *   - `perfectionist/sort-imports` = `import/order` (statement-level grouping & ordering)
         *   - `perfectionist/sort-named-imports` = `sort-imports { ignoreDeclarationSort: true }`
         *     (specifier-level sorting within a single import statement)
         * `internalPattern` replicates the old `import/order` pathGroups for `@/` and `~/` aliases.
         * All four rules are fixable, so warn.
         */
        'perfectionist/sort-imports': [
          'warn',
          {
            internalPattern: ['^@/', '^~/'],
            groups: [
              'type-import',
              ['type-parent', 'type-sibling', 'type-index', 'type-internal'],
              'value-builtin',
              'value-external',
              'value-internal',
              ['value-parent', 'value-sibling', 'value-index'],
              'side-effect',
              'ts-equals-import',
              'unknown',
            ],
            newlinesBetween: 'ignore',
            newlinesInside: 'ignore',
            order: 'asc',
            type: 'natural',
          },
        ],
        'perfectionist/sort-named-imports': ['warn', { order: 'asc', type: 'natural' }],
        'perfectionist/sort-named-exports': ['warn', { order: 'asc', type: 'natural' }],
        'perfectionist/sort-exports': ['warn', { order: 'asc', type: 'natural' }],

        /*
         * Rules from `eslint-plugin-unused-imports` follow
         * ====================================================================================
         */
        'unused-imports/no-unused-imports': 'warn',
        'unused-imports/no-unused-vars': [
          'warn',
          {
            vars: 'all',
            varsIgnorePattern: '^_',
            args: 'after-used',
            argsIgnorePattern: '^_',
          },
        ],

        /*
         * Rules from `eslint-plugin-antfu` follow
         * ====================================================================================
         */
        'antfu/if-newline': 'warn',
        'antfu/import-dedupe': 'warn',
        'antfu/top-level-function': 'warn',
        'antfu/consistent-chaining': 'warn', // new in antfu-plugin v3
        'antfu/consistent-list-newline': 'warn', // new in antfu-plugin v3
        // antfu/curly is declared at the top of this rules block (near its sibling curly rule)

        /*
         * Rules from `eslint-plugin-react` (jsx-quotes is a native ESLint rule, exposed here for clarity)
         * ====================================================================================
         */
        'jsx-quotes': ['warn', 'prefer-double'],

        /*
         * Rules from `eslint-plugin-n` (exposed as `node/` in antfu v9) follow
         * ====================================================================================
         */
        // antfu v9 default: off . maninak enforces use of global process over importing it
        'node/prefer-global/process': ['warn', 'always'],

        /*
         * Rules from `@stylistic/eslint-plugin` (exposed as `style/` in antfu v9) follow.
         * Since maninak uses `stylistic: false`, antfu enables none of these by default.
         * ====================================================================================
         */
        // `ts/member-delimiter-style` was removed from @typescript-eslint v8 and moved here.
        // Fixable, so warn.
        'style/member-delimiter-style': [
          'warn',
          {
            multiline: { delimiter: 'none', requireLast: true },
            singleline: { delimiter: 'semi', requireLast: false },
          },
        ],
      },
    },
    {
      /*
       * Rules for non-Vue files
       * ======================================================================================
       */
      files: ['**/*'],
      ignores: [GLOB_VUE],
      plugins: { prettier },
      rules: {
        ...prettierRulesFixingConflictsWithEslint,
        ...prettier.configs.recommended.rules,
        'prettier/prettier': ['warn', prettierConfig],
      },
    },
    {
      /*
       * Prettier parser override for known files that use JSONC semantics (trailing commas,
       * comments) despite the `.json` extension.
       * ======================================================================================
       */
      files: ['**/tsconfig*.json', '**/jsconfig*.json', '**/.vscode/*.json'],
      rules: { 'prettier/prettier': ['warn', { ...prettierConfig, parser: 'jsonc' }] },
    },
    {
      /*
       * Rules for shared utility function files
       * ======================================================================================
       */
      files: ['**/utils/**/*.ts', '**/util/**/*.ts'],
      rules: {
        'ts/explicit-function-return-type': [
          'warn',
          {
            allowExpressions: true,
            allowConciseArrowFunctionExpressionsStartingWithVoid: true, // eslint-disable-line id-length
            allowIIFEs: true,
          },
        ],
      },
    },
    {
      /*
       * Rules for test files
       * ======================================================================================
       * `eslint-plugin-jasmine` rules are used despite the name: these specific rules are
       * framework-agnostic and work with any expect()-style API (Vitest, WDIO, Jest, Playwright,
       * Mocha+Chai, Jasmine, etc.).
       */
      files: [...GLOB_TESTS],
      plugins: { jasmine: interopDefault(pluginJasmine) },
      rules: {
        'jasmine/new-line-before-expect': 'warn',
        'jasmine/new-line-between-declarations': 'warn',

        // overrides to antfu's defaults:
        // test titles are natural-language sentences; uppercase first letter is correct grammar
        'test/prefer-lowercase-title': 'off',
        // fixable (renames test() to it()), so warn
        'test/consistent-test-it': ['warn', { fn: 'it' }],
      },
    },
    {
      /*
       * Rules for JavaScript config files (e.g. .eslintrc.js, vite.config.js)
       * ======================================================================================
       */
      files: ['**/.*.js', '**/*.config.js'],
      rules: {
        'ts/no-var-requires': 'off',
      },
    },
    {
      /*
       * Rules for plain JavaScript files
       * ========================================================================================
       */
      files: [GLOB_JS, GLOB_JSX],
      rules: {
        'ts/no-var-requires': 'off',
        'ts/explicit-function-return-type': 'off',
        // Disable type-unsafe rules for JS files (no TypeScript type information available)
        'ts/no-unsafe-assignment': 'off',
        'ts/no-unsafe-argument': 'off',
        'ts/no-unsafe-member-access': 'off',
        'ts/no-unsafe-call': 'off',
        'ts/no-unsafe-return': 'off',
      },
    },
    {
      /*
       * Rules for ECMAScript module files
       * ======================================================================================
       */
      files: ['**/*.esm', '**/*.mts'],
      rules: {
        'ts/no-var-requires': 'error',
      },
    },
    {
      /*
       * Rules for TypeScript type declaration files
       * ======================================================================================
       */
      files: ['**/*.d.ts'],
      rules: {
        'id-length': 'off',
        'ts/no-explicit-any': 'off',
        'unused-imports/no-unused-imports': 'off',
        'unused-imports/no-unused-vars': 'off',
      },
    },
    {
      /*
       * Rules for JSON-type files
       * ======================================================================================
       */
      files: [GLOB_JSON, GLOB_JSON5, GLOB_JSONC],
      rules: {
        'max-len': 'off',
      },
    },
    ...(isInConsumerDeps('vue')
      ? (pluginVueScopedCss.configs.recommended as TypedFlatConfigItem[])
      : []),
    // FlatCompat below is used exclusively for plugins that do not yet support ESLint flat config:
    // eslint-plugin-prettier-vue and eslint-plugin-tailwindcss.
    // TODO: Migrate each block to native flat config once the underlying plugin publishes flat support.
    /* eslint-disable ts/no-explicit-any -- FlatCompat is loose-typed; tightening would require manual schemas. */
    ...(new FlatCompat().config({
      root: true,
      overrides: [
        ...((isInConsumerDeps('vue')
          ? [
              {
                /*
                 * Rules for Vue single-file components
                 * ============================================================================
                 */
                files: [GLOB_VUE],
                extends: ['plugin:prettier-vue/recommended'],
                parser: 'vue-eslint-parser',
                parserOptions: { parser: '@typescript-eslint/parser' },
                rules: {
                  '@typescript-eslint/explicit-member-accessibility': 'off',

                  'vue-scoped-css/no-deprecated-v-enter-v-leave-class': 'error',
                  'vue-scoped-css/require-selector-used-inside': 'warn',
                  'vue-scoped-css/v-deep-pseudo-style': 'error',
                  'vue-scoped-css/v-global-pseudo-style': 'error',
                  'vue-scoped-css/v-slotted-pseudo-style': 'error',

                  'vue/html-self-closing': [
                    'warn',
                    {
                      html: { void: 'always', normal: 'never', component: 'always' },
                      svg: 'always',
                      math: 'always',
                    },
                  ],

                  'prettier-vue/prettier': ['warn', prettierConfig],

                  // overrides to antfu's defaults
                  'vue/max-attributes-per-line': ['warn', { singleline: 5 }],
                  'vue/no-v-html': 'error',
                  'vue/require-prop-types': 'warn',
                  'vue/require-default-prop': 'warn',
                  'vue/multi-word-component-names': 'warn',
                  'vue/prefer-import-from-vue': 'warn',
                  'vue/no-v-text-v-html-on-component': 'warn',
                  'vue/no-setup-props-reactivity-loss': 'warn',
                  'vue/block-order': ['warn', { order: ['script', 'template', 'style'] }],
                  'vue/block-tag-newline': [
                    'warn',
                    { singleline: 'always', multiline: 'always' },
                  ],
                  'vue/component-name-in-template-casing': ['warn', 'PascalCase'],
                  'vue/component-options-name-casing': ['warn', 'PascalCase'],
                  'vue/custom-event-name-casing': ['warn', 'camelCase'],
                  'vue/define-macros-order': [
                    'warn',
                    { order: ['defineProps', 'defineEmits'] },
                  ],
                  'vue/html-comment-content-spacing': [
                    'warn',
                    'always',
                    { exceptions: ['-'] },
                  ],
                  'vue/no-restricted-v-bind': ['warn', '/^v-/'],
                  'vue/no-useless-v-bind': 'warn',
                  'vue/no-unused-refs': 'warn',
                  'vue/prefer-separate-static-class': 'warn',

                  /*
                   * Version-agnostic Vue rules
                   * Apply on any Vue major; useful for both Options API and Composition API.
                   * --------------------------------------------------------------------------
                   */
                  'vue/no-unused-properties': [
                    'warn',
                    {
                      deepData: true,
                      groups: ['props', 'data', 'computed', 'methods', 'setup'],
                    },
                  ],
                  'vue/no-undef-components': 'warn',
                  'vue/no-undef-properties': 'warn',
                  'vue/max-template-depth': ['warn', { maxDepth: 8 }],
                  'vue/no-required-prop-with-default': ['warn', { autofix: false }],
                  'vue/html-button-has-type': [
                    'warn',
                    { button: true, submit: true, reset: true },
                  ],

                  /*
                   * Vue 3+ rules
                   * Type-based macros and the composition API. Auto-detected from the consumer's
                   * `vue` (or `nuxt`) dep range; manually override the rule level in your own
                   * `eslint.config.mjs` for a Vue 2 codebase if needed.
                   * --------------------------------------------------------------------------
                   */
                  ...(resolvedVueVersion >= 3
                    ? {
                        'vue/define-props-declaration': ['warn', 'type-based'],
                        'vue/define-emits-declaration': ['warn', 'type-based'],
                        'vue/no-unused-emit-declarations': 'warn',
                        'vue/component-api-style': ['warn', ['script-setup']],
                        'vue/prefer-define-options': 'warn',
                        'vue/require-typed-ref': 'warn',
                      }
                    : {}),

                  /*
                   * Vue 3.5+ rules
                   * Rules that require APIs introduced in Vue 3.5 (e.g. `useTemplateRef`).
                   * --------------------------------------------------------------------------
                   */
                  ...(resolvedVueVersion >= 3.5
                    ? { 'vue/prefer-use-template-ref': 'warn' }
                    : {}),

                  'vue/array-bracket-spacing': ['warn', 'never'],
                  'vue/arrow-spacing': ['warn', { before: true, after: true }],
                  'vue/block-spacing': ['warn', 'always'],
                  'vue/brace-style': ['warn', 'stroustrup', { allowSingleLine: true }],
                  'vue/comma-dangle': ['warn', 'always-multiline'],
                  'vue/comma-spacing': ['warn', { before: false, after: true }],
                  'vue/comma-style': ['warn', 'last'],
                  'vue/dot-location': ['warn', 'property'],
                  'vue/dot-notation': ['warn', { allowKeywords: true }],
                  'vue/eqeqeq': ['warn', 'smart'],
                  'vue/key-spacing': ['warn', { beforeColon: false, afterColon: true }],
                  'vue/keyword-spacing': ['warn', { before: true, after: true }],
                  'vue/no-empty-pattern': 'warn',
                  'vue/no-extra-parens': ['warn', 'functions'],
                  'vue/no-irregular-whitespace': 'warn',
                  'vue/object-curly-newline': ['warn', { multiline: true, consistent: true }],
                  'vue/object-curly-spacing': ['warn', 'always'],
                  'vue/object-property-newline': [
                    'warn',
                    { allowAllPropertiesOnSameLine: true },
                  ],
                  'vue/object-shorthand': [
                    'warn',
                    'always',
                    { ignoreConstructors: false, avoidQuotes: true },
                  ],
                  'vue/operator-linebreak': ['warn', 'before'],
                  'vue/prefer-template': 'warn',
                  'vue/quote-props': ['warn', 'consistent-as-needed'],
                  'vue/space-in-parens': ['warn', 'never'],
                  'vue/space-infix-ops': 'warn',
                  'vue/space-unary-ops': ['warn', { words: true, nonwords: false }],
                  'vue/template-curly-spacing': 'warn',
                },
              },
            ]
          : []) as any[]),
        ...((isInConsumerDeps('tailwindcss')
          ? [
              {
                /*
                 * Rules for front-end component files (Vue, JSX, TSX)
                 * ============================================================================
                 */
                files: [GLOB_VUE, GLOB_JSX, GLOB_TSX],
                extends: ['plugin:tailwindcss/recommended'],
                plugins: ['tailwindcss'],
                rules: {
                  'tailwindcss/no-custom-classname': 'off',
                },
              },
            ]
          : []) as any[]),
      ] as any[],
    }) as TypedFlatConfigItem[]),
    /* eslint-enable ts/no-explicit-any */
  ] satisfies [Parameters<typeof antfu>['0'], ...TypedFlatConfigItem[]]
}

// eslint-disable-next-line ts/no-explicit-any
function interopDefault(module: any) {
  // eslint-disable-next-line ts/no-unsafe-return
  return module?.default ?? module
}

export const requireJsdocInUtilsBlocks: TypedFlatConfigItem[] = [
  {
    name: 'maninak/jsdoc-required-in-utility-code',
    files: [
      '**/utils/**/*.{ts,tsx,js,jsx,mts,mjs,cts,cjs}',
      '**/util/**/*.{ts,tsx,js,jsx,mts,mjs,cts,cjs}',
      '**/lib/**/*.{ts,tsx,js,jsx,mts,mjs,cts,cjs}',
      '**/helpers/**/*.{ts,tsx,js,jsx,mts,mjs,cts,cjs}',
      '**/utils.{ts,tsx,js,jsx,mts,mjs,cts,cjs}',
      '**/util.{ts,tsx,js,jsx,mts,mjs,cts,cjs}',
      '**/lib.{ts,tsx,js,jsx,mts,mjs,cts,cjs}',
      '**/helpers.{ts,tsx,js,jsx,mts,mjs,cts,cjs}',
    ],
    rules: {
      'jsdoc/require-jsdoc': [
        'warn',
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
          },
        },
      ],
      'jsdoc/require-description': 'warn',
    },
  },
  {
    name: 'maninak/jsdoc-disabled-in-tests',
    files: [
      '**/*.{test,spec,unit}.{ts,tsx,js,jsx,mts,mjs,cts,cjs}',
      '**/test/**',
      '**/tests/**',
      '**/__tests__/**',
      '**/__specs__/**',
      '**/specs/**',
    ],
    rules: {
      'jsdoc/require-jsdoc': 'off',
    },
  },
]
