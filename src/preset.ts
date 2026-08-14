import type antfu from '@antfu/eslint-config'
import type { TypedFlatConfigItem } from '@antfu/eslint-config'
import type { Config as PrettierConfig } from 'prettier'
import {
  GLOB_CSS,
  GLOB_JS,
  GLOB_JSON,
  GLOB_JSON5,
  GLOB_JSONC,
  GLOB_JSX,
  GLOB_SRC,
  GLOB_SVELTE,
  GLOB_TESTS,
  GLOB_TOML,
  GLOB_VUE,
} from '@antfu/eslint-config'
import pluginStylistic from '@stylistic/eslint-plugin'
import configPrettier from 'eslint-config-prettier'
import pluginJasmine from 'eslint-plugin-jasmine'
import pluginPrettier from 'eslint-plugin-prettier'
import { buildSortImportsOptions, SORT_IMPORTS_SEVERITY } from './features/sort-imports.js'
import compactReturn from './rules/compact-return.js'
import jsdocMaxLen from './rules/jsdoc-max-len.js'
import jsdocOneline from './rules/jsdoc-oneline.js'
import preferConciseAsyncArrow from './rules/prefer-concise-async-arrow.js'
import {
  getConsumerVueVersion,
  interopDefault,
  isInConsumerDeps,
  isVueAtLeast,
} from './utils.js'

const prettier = interopDefault(pluginPrettier)

/*
 * `eslint-plugin-prettier` types `configs` as a generic ESLint config map, so the recommended
 * entry's `rules` is not reachable through it. Asserted once here rather than at the use site.
 */
const prettierRecommendedRules = (
  prettier.configs?.['recommended'] as { rules?: Record<string, unknown> } | undefined
)?.rules

const prettierRulesFixingConflictsWithEslint = {
  ...interopDefault(configPrettier).rules,
}
delete prettierRulesFixingConflictsWithEslint['vue/html-self-closing']
/*
 * `curly` is in eslint-config-prettier's list because its `multi-line` and `multi-or-nest`
 * forms fight prettier over where a brace goes. The `all` form below does not: prettier keeps
 * whichever branch style you wrote, so it enforces nothing here and dropping the disable is
 * the only way `curly: 'all'` survives. Left in, this block silently switched braces off for
 * every file type the preset lints, since it is spread into a LATER block than the one
 * setting the rule.
 */
delete prettierRulesFixingConflictsWithEslint['curly']

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
  htmlWhitespaceSensitivity: 'css',
  /*
   * Markdown prose is soft-wrapped: one source line per paragraph, list item or blockquote,
   * however long. The reader's client wraps to the reader's width, and hard wrapping turns a
   * three-word edit into a reflow of every line after it. Prettier's own default is
   * `preserve`, which enforces nothing and lets a hand-wrapped paragraph drift out of shape
   * with every edit.
   *
   * Tables are governed differently: a row is already one line, so what changes is padding.
   * One wider than `printWidth` loses its column alignment, since it cannot be aligned inside
   * the line budget anyway; a narrower one keeps it.
   */
  proseWrap: 'never',
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
export default async function buildPreset(): Promise<
  [NonNullable<Parameters<typeof antfu>['0']>, ...TypedFlatConfigItem[]]
> {
  const resolvedVueVersion = getConsumerVueVersion()
  const hasVue = isInConsumerDeps('vue')
  /*
   * Loaded only for a consumer that has Vue, because these two cost ~290ms to import and a
   * repo without Vue never gets the blocks below that use them. Each unwrap mirrors exactly
   * what the static default import it replaced produced, so the blocks are unchanged.
   */
  const pluginVueScopedCss = hasVue
    ? interopDefault(await import('eslint-plugin-vue-scoped-css'))
    : undefined
  // eslint-disable-next-line ts/no-unsafe-assignment
  const pluginPrettierVue = hasVue
    ? interopDefault(interopDefault(await import('eslint-plugin-prettier-vue')))
    : undefined

  return [
    {
      ignores: ['static', '.*', '!.*.*', 'LICENCE', 'pnpm-workspace.yaml'],
      stylistic: false,
      typescript: {
        // Rules that do NOT require type information (applied to all TS files,
        // regardless of whether `tsconfigPath` is set by the consumer).
        overrides: {
          /*
           * Rules implemented by `@typescript-eslint` (exposed as `ts/` in antfu) follow.
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

          'ts/no-explicit-any': 'warn', // antfu default: off.
          'ts/no-extraneous-class': 'warn', // antfu default: off.
          'ts/no-import-type-side-effects': 'warn', // antfu default: off.
          'ts/unified-signatures': 'warn', // antfu default: off.
          'ts/no-unused-vars': 'off', // antfu default: off. Managed by unused-imports plugin instead.

          /*
           * Rules below have no antfu default (maninak additions)
           * ==================================================================================
           */

          'ts/array-type': ['warn', { default: 'array', readonly: 'array' }],
          'ts/explicit-member-accessibility': 'warn',
          'ts/prefer-for-of': 'warn',
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

        overridesTypeAware: {
          // antfu default: error. Off in maninak: fire-and-forget is a frequent legitimate
          // pattern in this codebase's domain (extension activation, UI side effects), and
          // the rule's noise on intentional cases outweighed its catch rate for accidents.
          'ts/no-floating-promises': 'off',

          // antfu default: error.
          'ts/promise-function-async': 'warn',

          // antfu default: error. Fixable, but the auto-fix often inserts noisy String()
          // conversions; downgrade to warn so the dev sees it and decides.
          'ts/restrict-template-expressions': 'warn',

          // antfu default: ['error', 'in-try-catch']. Maninak uses 'always' (always explicit
          // about async/await).
          'ts/return-await': ['warn', 'always'],

          // Disabled: the rule's `allow*` options don't compose over union types, so a
          // legitimately-written `if (!errorCode)` where
          // `errorCode: string | number | undefined` still fires even with allowNullableString
          // + allowNullableNumber options set.This creates noise without safety benefit, since
          // `ts/no-unnecessary-condition` catches the genuinely problematic cases
          // (always-true/always-false), while `ts/no-unsafe-member-access`
          // and friends catch `any`-typed conditions.
          'ts/strict-boolean-expressions': 'off',

          // Type-aware additions not in antfu's defaults (all fixable, so warn).
          'ts/require-array-sort-compare': 'warn',
          'ts/prefer-readonly': 'warn',
          'ts/no-unnecessary-qualifier': 'warn',
          'ts/no-duplicate-type-constituents': 'warn',
          // `ignoreArrowShorthand` permits the common `() => sideEffectReturningVoid()`
          // form (e.g. `{ dispose: () => watcher.close() }`), which is unambiguous and
          // reads better as a one-liner than the brace-wrapped block the rule demands.
          'ts/no-confusing-void-expression': ['warn', { ignoreArrowShorthand: true }],
        },
      },
    },
    {
      rules: {
        // antfu's pnpm plugin enforces shellEmulator: true and trustPolicy: "no-downgrade"
        // via this rule. The trust-policy demand rejects legitimate dependency updates.
        'pnpm/yaml-enforce-settings': 'off',
        // antfu enables this for jsonc files. Key order in tsconfig.json (and similar) is
        // conventional and not alphabetical, and the rule fights that convention.
        'jsonc/sort-keys': 'off',
        // antfu default: ['error', 'top-level']. Conflicts with our inline-type-imports
        // preference (see `ts/consistent-type-imports` below) AND with `sort-imports`,
        // which sorts top-level type-imports as a separate group. Turn off and let
        // `ts/consistent-type-imports` enforce the inline style on new code.
        'import/consistent-type-specifier-style': 'off',
      },
    },
    {
      /*
       * Every rule below reads a JavaScript AST or JavaScript comment syntax, so the block is
       * restricted to JS-family files. Left unrestricted it also reached the TOML, YAML, JSON
       * and markdown files the base preset lints, where `spaced-comment` read a TOML `#` line
       * as an unbalanced block comment and demanded a space before a block-comment terminator
       * on every Cargo manifest. Markdown code fences keep these rules: they lint as virtual
       * files whose names end in a real JS/TS extension.
       */
      files: [GLOB_SRC, GLOB_VUE, GLOB_SVELTE],
      plugins: {
        // antfu with `stylistic: false` does not register the @stylistic plugin, but
        // we still need it for `style/member-delimiter-style` further below.
        style: interopDefault(pluginStylistic),
        // A single registration for every custom maninak rule. Separate `maninak` plugin
        // objects under one key conflict in flat config, so all custom rules live here.
        maninak: {
          rules: {
            'prefer-concise-async-arrow': preferConciseAsyncArrow,
            'compact-return': compactReturn,
            'jsdoc-oneline': jsdocOneline,
            'jsdoc-max-len': jsdocMaxLen,
          },
        },
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
        // Disabling antfu/curly lets `curly: 'all'` win unopposed.
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
        // Blank-line-before-return is owned by `maninak/compact-return` (declared below), not
        // by padding-line. The custom rule requires a blank before return in normal bodies AND
        // forbids one in compact two-statement bodies. Keeping that policy in padding-line too
        // would make the two fixers fight over the compact case and never converge.
        'maninak/compact-return': 'warn',
        'padding-line-between-statements': [
          'warn',
          { blankLine: 'always', prev: 'directive', next: '*' },
          { blankLine: 'always', prev: '*', next: 'multiline-block-like' },
          // Relax for co-located early return ifs
          { blankLine: 'any', prev: '*', next: 'if' },
          // Relax for co-located vars set by loops
          { blankLine: 'any', prev: 'singleline-let', next: 'multiline-block-like' },
          { blankLine: 'any', prev: 'singleline-const', next: 'for' },
          { blankLine: 'any', prev: 'singleline-const', next: 'while' },
          { blankLine: 'any', prev: 'singleline-const', next: 'do' },
          // Relax for co-located declarations used in functions
          // e.g. defining a let/const/type/interface that gets used in the following func
          // We blanket allow (`prev: '*'`) because there's no dedicated STATEMENT_TYPE
          // for type/interface declarations...
          { blankLine: 'any', prev: '*', next: 'function' },
          // ...so immediately we restore requiring blank line for common things
          { blankLine: 'always', prev: 'class', next: 'function' },
          { blankLine: 'always', prev: 'function', next: 'function' },
          { blankLine: 'always', prev: 'expression', next: 'function' },
          { blankLine: 'always', prev: 'multiline-expression', next: 'function' },
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
            ignorePattern: '^\\s*:?(?:class|style)=".+"',
          },
        ],
        'no-restricted-imports': [
          'error',
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
        // Flag `async () => { await expr }` and auto-fix to `async () => await expr`. Prettier
        // always expands block bodies to multiline; the concise form stays on one line.
        'maninak/prefer-concise-async-arrow': 'warn',
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
        // A `let` that is read but never assigned is always undefined, so every read is a bug.
        // Needs eslint >= 9.27.
        'no-unassigned-vars': 'error',
        // Re-throwing without `cause` drops the original error and the stack behind it, which
        // is exactly the context needed to diagnose the failure. Needs eslint >= 9.35.
        // `requireCatchParameter` stays off so a deliberate `catch {}` is still allowed.
        'preserve-caught-error': ['error', { requireCatchParameter: false }],

        /*
         * Rules from `eslint-plugin-unicorn` follow
         * ====================================================================================
         */
        // antfu 9.3 flipped `checkNaN` off. The global `isNaN` coerces first, so
        // `isNaN('foo')` is true while `Number.isNaN('foo')` is false. Restored at
        // antfu's pre-9.3 severity.
        'unicorn/prefer-number-properties': [
          'error',
          { checkInfinity: false, checkNaN: true },
        ],

        /*
         * Rules from `perfectionist` follow
         * ====================================================================================
         */
        'perfectionist/sort-imports': [SORT_IMPORTS_SEVERITY, buildSortImportsOptions()],
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
        // Collapse a description-only JSDoc block to a single line `/** text */` when it fits
        // the print width, normalizing interior spacing. The official jsdoc plugin's
        // `multiline-blocks` leaves single-line blocks with stray interior spaces intact, so
        // this owns the whole normalization to guarantee every variant converges identically.
        'maninak/jsdoc-oneline': ['warn', { maxColumns: maxColumnsPerLine }],
        // Wrap any JSDoc line past the print width onto continuation lines. `max-len` sets
        // `ignoreComments: true`, so comments get no width enforcement otherwise; this fills
        // that gap with a fixer. Split-only (never joins), so it cannot loop against
        // `jsdoc-oneline` above, which only collapses blocks already within the width.
        'maninak/jsdoc-max-len': ['warn', { maxColumns: maxColumnsPerLine }],
        'antfu/if-newline': 'warn',
        'antfu/import-dedupe': 'warn',
        'antfu/top-level-function': 'warn',
        'antfu/consistent-chaining': 'off', // conflict with prettier
        'antfu/consistent-list-newline': ['warn', { CallExpression: false }], // conflict with prettier
        // antfu/curly is declared at the top of this rules block (near its sibling curly rule)

        /*
         * Rules from `eslint-plugin-n` (exposed as `node/` in antfu) follow
         * ====================================================================================
         */
        // antfu default: off . maninak enforces use of global process over importing it
        'node/prefer-global/process': ['warn', 'always'],

        /*
         * Rules from `@stylistic/eslint-plugin` (exposed as `style/` in antfu) follow.
         * Since maninak uses `stylistic: false`, antfu enables none of these by default.
         * ====================================================================================
         */
        // `ts/member-delimiter-style` was removed from @typescript-eslint v8 and moved here.
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
      ignores: [GLOB_VUE, GLOB_SVELTE, GLOB_TOML, GLOB_CSS],
      plugins: { prettier },
      rules: {
        ...prettierRulesFixingConflictsWithEslint,
        ...prettierRecommendedRules,
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
       * framework-agnostic and work with any expect()-style API (Vitest, WDIO, Jest,
       * Mocha+Chai, Jasmine, etc.).
       */
      files: [...GLOB_TESTS],
      // eslint-disable-next-line ts/no-unsafe-assignment
      plugins: { jasmine: interopDefault(pluginJasmine) },
      rules: {
        'jasmine/new-line-before-expect': 'warn',
        'jasmine/new-line-between-declarations': 'warn',

        // overrides to antfu's defaults:
        // test titles are natural-language sentences; an uppercase first letter is right
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
       * ======================================================================================
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
    /*
     * Rules for Vue single-file components
     * ========================================================================================
     */
    ...(hasVue
      ? ([
          ...(pluginVueScopedCss!.configs.recommended as TypedFlatConfigItem[]),
          {
            name: 'maninak/vue-scoped-css/overrides',
            files: [GLOB_VUE],
            rules: {
              'vue-scoped-css/no-unused-selector': 'off', // alias of require-selector-used-inside
              'vue-scoped-css/no-deprecated-v-enter-v-leave-class': 'error',
              'vue-scoped-css/require-selector-used-inside': 'warn',
              'vue-scoped-css/v-deep-pseudo-style': 'error',
              'vue-scoped-css/v-global-pseudo-style': 'error',
              'vue-scoped-css/v-slotted-pseudo-style': 'error',
            },
          },
        ] satisfies TypedFlatConfigItem[])
      : []),
    ...(hasVue
      ? ([
          {
            name: 'maninak/prettier-vue',
            files: [GLOB_VUE],
            // eslint-disable-next-line ts/no-unsafe-assignment
            plugins: { 'prettier-vue': pluginPrettierVue },
            rules: {
              ...prettierRulesFixingConflictsWithEslint,
              'prettier-vue/prettier': ['warn', prettierConfig],
            },
          },
          {
            name: 'maninak/vue/rules',
            files: [GLOB_VUE],
            rules: {
              // overrides to antfu's defaults
              'vue/html-self-closing': [
                'warn',
                {
                  html: { void: 'always', normal: 'never', component: 'always' },
                  svg: 'always',
                  math: 'always',
                },
              ],
              'vue/no-v-html': 'error',
              'vue/require-prop-types': 'warn',
              'vue/require-default-prop': 'warn',
              // The following rules are in eslint-config-prettier's Vue section (all `off`)
              // but antfu's vue() config re-enables several of them because they don't use
              // prettier. We disable explicitly so prettier-vue handles all Vue template
              // formatting without circular fix conflicts.
              'vue/html-indent': 'off',
              'vue/html-closing-bracket-newline': 'off',
              'vue/multiline-html-element-content-newline': 'off',
              'vue/singleline-html-element-content-newline': 'off',
              'vue/max-attributes-per-line': 'off',
              'vue/block-tag-newline': 'off',
              'vue/operator-linebreak': 'off',
              'vue/quote-props': 'off',

              'vue/multi-word-component-names': 'warn',
              'vue/prefer-import-from-vue': 'warn',
              'vue/no-dupe-keys': 'error',
              'vue/no-v-text-v-html-on-component': 'warn',
              'vue/no-setup-props-reactivity-loss': 'warn',
              'vue/block-order': ['warn', { order: ['script', 'template', 'style'] }],
              'vue/component-name-in-template-casing': ['warn', 'PascalCase'],
              'vue/component-options-name-casing': ['warn', 'PascalCase'],
              'vue/custom-event-name-casing': ['warn', 'camelCase'],
              'vue/define-macros-order': ['warn', { order: ['defineProps', 'defineEmits'] }],
              'vue/html-comment-content-spacing': ['warn', 'always', { exceptions: ['-'] }],
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
              // Nuxt auto-imports its built-ins (NuxtLink, NuxtPage, ...) and every component
              // under `components/`, none of which this rule can see, so under Nuxt it only
              // false-positives. Turn it off there; the real restore is the `@nuxt/eslint`
              // module, whose generated flat config registers the auto-imported components.
              // In non-Nuxt Vue projects the rule stays on, where it is genuinely useful.
              'vue/no-undef-components': isInConsumerDeps('nuxt') ? 'off' : 'warn',
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
              ...(isVueAtLeast(resolvedVueVersion, 3, 0)
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
              ...(isVueAtLeast(resolvedVueVersion, 3, 5)
                ? { 'vue/prefer-use-template-ref': 'warn' }
                : {}),

              // Vue equivalents of native JS logic rules
              'vue/dot-notation': ['warn', { allowKeywords: true }],
              'vue/eqeqeq': ['warn', 'smart'],
              'vue/no-empty-pattern': 'warn',
              'vue/no-irregular-whitespace': 'warn',
              'vue/object-shorthand': [
                'warn',
                'always',
                { ignoreConstructors: false, avoidQuotes: true },
              ],
              'vue/prefer-template': 'warn',
            },
          },
        ] satisfies TypedFlatConfigItem[])
      : []),
  ] satisfies [Parameters<typeof antfu>['0'], ...TypedFlatConfigItem[]]
}
