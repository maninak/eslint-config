/* eslint-disable ts/no-unsafe-member-access */
/* eslint-disable ts/no-unsafe-assignment */

import type antfu from '@antfu/eslint-config'
import type { TypedFlatConfigItem } from '@antfu/eslint-config'
import type { Config as PrettierConfig } from 'prettier'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
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
import { globSync } from 'tinyglobby'
import compactReturn from './rules/compact-return.js'
import jsdocMaxLen from './rules/jsdoc-max-len.js'
import jsdocOneline from './rules/jsdoc-oneline.js'
import preferConciseAsyncArrow from './rules/prefer-concise-async-arrow.js'
import { getConsumerVueVersion, getWorkspacePackageDirs, isInConsumerDeps } from './utils.js'

const prettier = interopDefault(pluginPrettier)

const prettierRulesFixingConflictsWithEslint = {
  ...interopDefault(configPrettier).rules,
}
delete prettierRulesFixingConflictsWithEslint['vue/html-self-closing']

/**
 * One entry in `perfectionist/sort-imports`'s `groups`: a group name, or a bundle of names
 * that sort together.
 */
type ImportGroup = string | [string, ...string[]]

/** Severity for `perfectionist/sort-imports`, shared by the preset block and the builder. */
const SORT_IMPORTS_SEVERITY = 'warn' as const

/**
 * Import ordering, in one place so {@link buildSortImportsBlock} can extend it without a
 * consumer having to restate it. ESLint REPLACES a rule's options rather than merging them,
 * so a consumer adding a single custom group would otherwise have to copy every key here and
 * would silently stop tracking this preset the moment one of them changed.
 *
 * A function rather than a constant so every caller gets its own object, nested bundles
 * included. A shared literal here would be reachable from every `maninak()` result in the
 * process, and one mutation of it would follow into all of them.
 *
 * The return annotation is load-bearing twice over: it pins the scalars to their literal
 * types, and it contextually types each nested bundle as a tuple. Inferred, both widen to
 * `string` and `string[]`, which the typed rule signature rejects.
 */
function buildSortImportsOptions(): {
  internalPattern: string[]
  groups: ImportGroup[]
  newlinesBetween: 'ignore'
  newlinesInside: 'ignore'
  order: 'asc'
  type: 'natural'
} {
  return {
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
  }
}

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
export default async function buildConfig() {
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
          // reads better as a one-liner than the brace-wrapped block the rule otherwise demands.
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
        // preference (see `ts/consistent-type-imports` below) AND with `perfectionist/sort-imports`,
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
          ...(pluginVueScopedCss.configs.recommended as TypedFlatConfigItem[]),
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
              ...(resolvedVueVersion >= 3.5 ? { 'vue/prefer-use-template-ref': 'warn' } : {}),

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

/*
 * Packages that mean the consumer writes Tailwind classes, even when `tailwindcss` itself is
 * never declared: `@nuxt/ui` v4 depends on Tailwind v4 and ships nothing but Tailwind-classed
 * components, and the two `@tailwindcss/*` build plugins are how a v4 project wires Tailwind
 * into vite or postcss. taiga-grove declares only `@nuxt/ui`, which is exactly why it had no
 * Tailwind linting at all: a bare `tailwindcss` check never saw it.
 */
const TAILWIND_CARRIERS = [
  'tailwindcss',
  '@tailwindcss/vite',
  '@tailwindcss/postcss',
  '@nuxt/ui',
]

/** Whether anything in the consumer's workspace implies Tailwind classes are being written. */
export function isTailwindInConsumerDeps(): boolean {
  return TAILWIND_CARRIERS.some((name) => isInConsumerDeps(name))
}

/**
 * Walks up from `startDir` looking for an installed package, mirroring the `node_modules`
 * search node itself does. Returns the package directory, or `undefined` when nothing up the
 * tree has one. `name` may be scoped (`@nuxt/ui`).
 */
function findInstalledPackage(name: string, startDir: string): string | undefined {
  let dir = path.resolve(startDir)

  while (true) {
    const candidate = path.join(dir, 'node_modules', ...name.split('/'), 'package.json')
    if (existsSync(candidate)) {
      return path.dirname(candidate)
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      return undefined
    }
    dir = parent
  }
}

/**
 * Walks up from `startDir` looking for an installed `tailwindcss`, mirroring the node_modules
 * search the plugin itself does. Returns the package directory, or `undefined` if there is
 * none the plugin could load.
 *
 * Declared deps are the wrong question here: pnpm leaves a transitively-installed Tailwind
 * unlinked from any `node_modules` the consumer's cwd can see, so a project can depend on
 * Tailwind through `@nuxt/ui` and still have nothing here to find.
 */
export function findTailwindInstall(startDir: string): string | undefined {
  return findInstalledPackage('tailwindcss', startDir)
}

/** An installed Tailwind, and what the plugin needs in order to load the same one. */
export interface TailwindInstall {
  /** Directory of the installed `tailwindcss` package. */
  dir: string

  /**
   * What to hand the plugin as its `cwd`. Its resolver walks up from there, so this is the
   * consumer's own cwd whenever that works, and otherwise the package that carried Tailwind
   * in.
   */
  resolveFrom: string

  /** Major version read from the install, or `undefined` when it cannot be read. */
  major: number | undefined
}

/**
 * Finds a Tailwind the plugin can actually load, including one the consumer never declared.
 *
 * pnpm's strict layout leaves a transitively-installed Tailwind unlinked from anything the
 * consumer's cwd can see, so a project depending on Tailwind through `@nuxt/ui` has nothing to
 * resolve from its own root. That copy does exist, next to the carrier that pulled it in, so
 * when the cwd comes up empty we look again from each carrier. The plugin takes a `cwd` option
 * for exactly this ("the working directory to resolve tailwindcss and the config from"), which
 * lets us point its resolver at the copy we found instead of asking the consumer to declare a
 * dependency they do not otherwise use.
 *
 * The carrier directory is REALPATH'd before it is handed over, and that is load-bearing. pnpm
 * links carriers into the consumer's `node_modules` from a central store, and the plugin's
 * resolver walks up from the literal path it is given without resolving symlinks first: given
 * the link it climbs the consumer's tree and finds nothing, given the real path it climbs the
 * store and finds Tailwind. Both were tried against the plugin's own resolver.
 */
const tailwindInstallCache = new Map<string, TailwindInstall | undefined>()

export function resolveTailwindInstall(): TailwindInstall | undefined {
  const cacheKey = process.cwd()
  if (tailwindInstallCache.has(cacheKey)) {
    return tailwindInstallCache.get(cacheKey)
  }
  const found = findTailwindInstallUncached()
  tailwindInstallCache.set(cacheKey, found)

  return found
}

function findTailwindInstallUncached(): TailwindInstall | undefined {
  /*
   * A dependency declared by a sub-package is installed into that package's `node_modules`, so
   * a workspace has to be searched package by package. taiga-grove keeps `@nuxt/ui` under
   * `apps/web`, and searching only the cwd found nothing there.
   */
  const searchRoots = [process.cwd(), ...getWorkspacePackageDirs()]

  for (const root of searchRoots) {
    const dir = findTailwindInstall(root)
    if (dir) {
      return { dir, resolveFrom: root, major: readInstalledMajor(dir) }
    }
  }

  for (const root of searchRoots) {
    // `tailwindcss` itself is skipped: the loop above already answered it for every root.
    for (const carrier of TAILWIND_CARRIERS.filter((name) => name !== 'tailwindcss')) {
      const carrierDir = findInstalledPackage(carrier, root)
      if (!carrierDir) {
        continue
      }

      let resolveFrom: string
      try {
        resolveFrom = realpathSync(carrierDir)
      } catch {
        continue
      }

      const dir = findTailwindInstall(resolveFrom)
      if (dir) {
        return { dir, resolveFrom, major: readInstalledMajor(dir) }
      }
    }
  }

  return undefined
}

/** The major version of the package installed at `dir`, or `undefined` when unreadable. */
function readInstalledMajor(dir: string): number | undefined {
  try {
    const { version } = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
      version?: string
    }
    const major = Number.parseInt(version ?? '', 10)

    return Number.isNaN(major) ? undefined : major
  } catch {
    return undefined
  }
}

/*
 * Where a project's own CSS is never found: dependencies, build output, and caches. Scanning
 * them would be slow and would surface a bundled copy of somebody else's entry point as if it
 * were this project's theme.
 */
const THEME_SCAN_IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/vendor/**',
  '**/.git/**',
  '**/.cache/**',
  '**/.nuxt/**',
  '**/.output/**',
  '**/.next/**',
  '**/.svelte-kit/**',
  '**/.vercel/**',
  '**/.netlify/**',
]

/** Filenames a Tailwind v3 theme can live in. */
const TAILWIND_CONFIG_NAMES = [
  'tailwind.config.js',
  'tailwind.config.cjs',
  'tailwind.config.mjs',
  'tailwind.config.ts',
]

/*
 * The v4 entry point is the CSS file that pulls Tailwind in whole, with or without the
 * `source()`, `layer()` and `theme()` qualifiers v4 allows after the specifier. A partial
 * import (`@import "tailwindcss/utilities"`) deliberately does not match: a file taking one
 * layer is not where the theme is defined.
 */
const IMPORTS_TAILWIND = /@import\s+(?:url\(\s*)?["']tailwindcss["']/

/** A project's Tailwind theme, as an absolute path in whichever form its major uses. */
export interface TailwindTheme {
  entryPoint?: string
  tailwindConfig?: string
}

/** What a scan for the project's theme turned up. */
export interface TailwindThemeDetection {
  /** The theme, when exactly one candidate was found. */
  theme?: TailwindTheme

  /** Every CSS file that imports Tailwind. Longer than one means the theme is ambiguous. */
  entryPoints: string[]
}

/**
 * Finds the project's Tailwind theme instead of asking for it, which is how the rest of this
 * preset behaves and what consumers expect.
 *
 * A v3 theme is a config file with a known name at the root. A v4 theme is whichever CSS file
 * imports Tailwind, which can only be found by reading them, so this globs the project's CSS
 * and looks inside. Exactly one hit is the answer. Several is a genuinely ambiguous project
 * and stays the caller's problem to disambiguate, because picking one at random would lint
 * every other app in the repo against the wrong theme, silently.
 *
 * `major` decides which form to prefer when a project carries both, e.g. a v4 codebase keeping
 * a legacy `tailwind.config.js` around for `@config`.
 */
export function detectTailwindTheme(major: number | undefined): TailwindThemeDetection {
  const root = process.cwd()
  const tailwindConfig = TAILWIND_CONFIG_NAMES.map((name) => path.join(root, name)).find(
    (candidate) => existsSync(candidate),
  )

  if (major === 3 && tailwindConfig) {
    return { theme: { tailwindConfig }, entryPoints: [] }
  }

  const entryPoints = findTailwindEntryPoints(root)
  if (entryPoints.length === 1) {
    return { theme: { entryPoint: entryPoints[0]! }, entryPoints }
  }
  if (entryPoints.length === 0 && tailwindConfig) {
    return { theme: { tailwindConfig }, entryPoints }
  }

  return { entryPoints }
}

const projectCssCache = new Map<string, string[]>()

/**
 * Every CSS file the project owns, as absolute paths, dependencies and build output excluded.
 *
 * Cached per cwd because two features ask: the Tailwind theme scan reads these looking for the
 * entry point, and the CSS rules ask only whether there are any. One walk of the tree answers
 * both, which matters on a monorepo where it costs ~45ms.
 */
export function findProjectCssFiles(root: string): string[] {
  const cached = projectCssCache.get(root)
  if (cached) {
    return cached
  }

  let files: string[]
  try {
    files = globSync(['**/*.css'], { cwd: root, ignore: THEME_SCAN_IGNORE, absolute: true })
    files.sort()
  } catch {
    // A glob failure degrades to "found nothing", which every caller already explains.
    files = []
  }
  projectCssCache.set(root, files)

  return files
}

/** Every CSS file under `root` that pulls Tailwind in whole, as absolute paths. */
function findTailwindEntryPoints(root: string): string[] {
  return findProjectCssFiles(root).filter((file) => {
    try {
      return IMPORTS_TAILWIND.test(stripCssComments(readFileSync(file, 'utf8')))
    } catch {
      return false
    }
  })
}

/** Blanks comments, so a commented-out import does not read as the project's entry point. */
function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Where the Tailwind rules should read your theme from. Give at most one, whichever matches
 * your Tailwind major; given neither, the preset finds it.
 *
 * Nothing is ever guessed. The plugin reads your theme from this file, and given nothing it
 * falls back to Tailwind's stock theme: it would then enforce a class order the project never
 * configured and call every themed class unknown. So detection either finds exactly one answer
 * or reports that it could not, and these options are how you settle it when it could not.
 */
export interface TailwindOptions {
  /**
   * Tailwind v4: path to the CSS entry point that pulls Tailwind in, relative to the
   * consumer's cwd, e.g. `'apps/web/assets/css/main.css'` for a file starting
   * `@import "tailwindcss"`.
   */
  entryPoint?: string

  /**
   * Tailwind v3: path to the `tailwind.config.js` that defines the theme, relative to the
   * consumer's cwd. The plugin can also find this by itself, but a found-or-else-stock-theme
   * search is exactly the silent wrong answer this option exists to rule out.
   */
  tailwindConfig?: string
}

/**
 * Why the Tailwind rules cannot run against `theme`, worded for the consumer, or `undefined`
 * when they can. The caller decides whether that is fatal: a theme the consumer configured by
 * hand should fail loudly, one the preset detected should only warn.
 *
 * This runs before any rule does, because the failure it guards against is not a rule quietly
 * switching itself off. It is an uncaught throw from inside the plugin, part-way through a
 * lint, with a stack trace about `enhanced-resolve` and no hint of what to change.
 */
export function findTailwindThemeProblem(theme: TailwindTheme): string | undefined {
  /*
   * Spelled out rather than `Object.entries`, whose fallback overload types the value as `any`
   * on an interface with no index signature, quietly costing the check its type safety.
   */
  const given: [key: string, value: string | undefined][] = [
    ['entryPoint', theme.entryPoint],
    ['tailwindConfig', theme.tailwindConfig],
  ]

  for (const [key, value] of given) {
    if (value === undefined) {
      continue
    }
    const absolute = path.resolve(process.cwd(), value)
    if (!existsSync(absolute)) {
      return (
        `tailwind.${key} is "${value}", which does not exist (resolved to "${absolute}"). ` +
        `Point it at the file that defines your Tailwind theme, or pass "tailwind: false" to ` +
        `switch the Tailwind rules off.`
      )
    }
  }

  /*
   * A v4 entry point pulls Tailwind in with `@import "tailwindcss"`, and Tailwind's own loader
   * resolves that import relative to the FILE, not to anything we can redirect: the plugin's
   * `cwd` reaches its version check and its v3 config loader, but not this. So a copy of
   * Tailwind that only a dependency installed satisfies everything except the one import that
   * matters, and the lint dies on it.
   */
  if (theme.entryPoint !== undefined) {
    const entryPoint = path.resolve(process.cwd(), theme.entryPoint)
    if (!findTailwindInstall(path.dirname(entryPoint))) {
      const shown = path.relative(process.cwd(), entryPoint)

      return (
        `"${shown}" imports Tailwind, but no "tailwindcss" can be resolved from the directory ` +
        `it lives in. Tailwind resolves that import relative to the file itself, so a copy ` +
        `carried in by another package (@nuxt/ui and friends) does not satisfy it however it ` +
        `is installed. Add "tailwindcss" to the devDependencies of the package that owns ` +
        `"${shown}", or pass "tailwind: false" to switch the Tailwind rules off.`
      )
    }
  }

  return undefined
}

/**
 * Builds the Tailwind CSS blocks: the plugin's `recommended` set, plus the two rules this
 * preset switches off.
 *
 * `enforce-consistent-line-wrapping` is off because it rewraps class strings across lines,
 * which is formatting, and formatting here belongs to prettier; leaving both on puts two
 * fixers on the same attribute. `no-unknown-classes` is off because a real project mixes
 * Tailwind utilities with its own class names, and this preset has never demanded otherwise.
 *
 * @param options Where the project's Tailwind theme lives. See {@link TailwindOptions}.
 * @param install The Tailwind to lint against. See {@link resolveTailwindInstall}.
 */
export async function buildTailwindBlocks(
  options: TailwindOptions,
  install: TailwindInstall,
): Promise<TypedFlatConfigItem[]> {
  const { entryPoint, tailwindConfig } = options
  if (!entryPoint && !tailwindConfig) {
    throw new Error(
      `[@maninak/eslint-config] tailwind needs to know where your theme lives: pass ` +
        `"entryPoint" with your Tailwind v4 CSS entry point, or "tailwindConfig" with your ` +
        `Tailwind v3 config path. Pass "tailwind: false" to switch the rules off instead.`,
    )
  }

  /*
   * Fail loudly rather than letting the plugin fall back to the stock theme or die mid-lint.
   * Callers that can degrade instead ask {@link findTailwindThemeProblem} first; reaching here
   * with a broken theme means nobody did, and silence would be the worst of the three.
   */
  const problem = findTailwindThemeProblem(options)
  if (problem) {
    throw new Error(`[@maninak/eslint-config] ${problem}`)
  }

  const settings: Record<string, string> = { cwd: install.resolveFrom }
  for (const [key, value] of Object.entries({ entryPoint, tailwindConfig })) {
    if (value !== undefined) {
      settings[key] = path.resolve(process.cwd(), value)
    }
  }

  /*
   * Imported here rather than at module scope so that only a consumer who actually switched
   * the Tailwind rules on pays the ~93ms it costs to load. Deliberately after the checks
   * above, so a misconfigured path still fails fast without loading anything.
   */
  const pluginBetterTailwind = interopDefault(
    interopDefault(await import('eslint-plugin-better-tailwindcss')),
  )
  const recommended = pluginBetterTailwind.configs.recommended as TypedFlatConfigItem

  /*
   * The plugin's `recommended` set carries no `files`, so ESLint would apply it to every file
   * the preset lints, TOML, JSON and YAML included. Those hold no class strings, and running
   * seven rules over their ASTs is at best wasted work on every lint.
   */
  const files = [GLOB_SRC, GLOB_VUE, GLOB_SVELTE]

  return [
    {
      ...recommended,
      name: 'maninak/tailwindcss',
      files,
      settings: { 'better-tailwindcss': settings },
    },
    {
      name: 'maninak/tailwindcss/overrides',
      files,
      rules: {
        'better-tailwindcss/enforce-consistent-line-wrapping': 'off',
        'better-tailwindcss/no-unknown-classes': 'off',
      },
    },
  ]
}

/**
 * Which Tailwind dialect this project's CSS is written in, or `undefined` when it writes plain
 * CSS.
 *
 * Keyed on what the stylesheets actually contain rather than on whether `tailwindcss`
 * resolves, because those come apart exactly where it matters: a repo whose entry point says
 * `@import "tailwindcss"` while the package is unresolvable still has Tailwind at-rules in it,
 * and handing that file the stock parser is a fatal parse error rather than a missed rule.
 */
export function detectTailwindCssDialect(): 'tailwind3' | 'tailwind4' | undefined {
  const root = process.cwd()

  // A file importing Tailwind whole is v4 syntax by definition, installed or not.
  if (findTailwindEntryPoints(root).length > 0) {
    return 'tailwind4'
  }
  if (!isTailwindInConsumerDeps()) {
    return undefined
  }

  const major = resolveTailwindInstall()?.major
  if (major !== undefined) {
    return major <= 3 ? 'tailwind3' : 'tailwind4'
  }

  /*
   * Nothing installed to ask, so fall back to the shape of the project. A `tailwind.config.js`
   * with no v4 entry point is the v3 layout; anything else is likelier v4, which is current.
   */
  const hasV3Config = TAILWIND_CONFIG_NAMES.some((name) => existsSync(path.join(root, name)))

  return hasV3Config ? 'tailwind3' : 'tailwind4'
}

/**
 * How the CSS rules should be tuned. Given nothing, they run with `use-baseline` at its own
 * default, which is the conservative choice.
 */
export interface CssOptions {
  /**
   * How new a CSS feature may be before `css/use-baseline` objects to it.
   *
   * `'widely'` (the default) means available across the major engines for 30 months, which is
   * what a site with a long browser tail wants. `'newly'` means available everywhere but only
   * recently, which is what an app targeting current browsers wants: it stops the rule
   * reporting things like `anchor-name` and `field-sizing` that are perfectly safe there.
   */
  available?: 'widely' | 'newly'
}

/**
 * Builds the CSS blocks: `@eslint/css`'s `recommended` set over `.css` files, taught the
 * Tailwind dialect when this project uses Tailwind.
 *
 * CSS was linted by nothing at all before this. It is a real gap rather than a stylistic one:
 * these rules catch a misspelled property, a value no property accepts, a duplicated `@import`
 * or keyframe selector, an unmatchable selector and a malformed `grid-template-areas`, none of
 * which any other tool in this preset can see.
 *
 * The coverage is standalone `.css` only. `@eslint/css` parses a whole file as CSS and has no
 * processor for extracting an SFC's `<style>` block, so a Vue app's scoped styles stay with
 * `eslint-plugin-vue-scoped-css`. Verified, not assumed: pointing this language at a `.vue`
 * file fails on the `<template>` with "Selector is expected".
 *
 * @param options How strict `use-baseline` should be. See {@link CssOptions}.
 * @param dialect Tailwind dialect this project's CSS is written in, or `undefined` for plain
 * CSS.
 */
export async function buildCssBlocks(
  options: CssOptions,
  dialect: 'tailwind3' | 'tailwind4' | undefined,
): Promise<TypedFlatConfigItem[]> {
  const { available = 'widely' } = options

  /*
   * Imported here rather than at module scope so that only a consumer who actually has CSS
   * pays the ~73ms it costs to load, the same bargain the Vue and Tailwind plugins get.
   */
  const pluginCss = interopDefault(await import('@eslint/css'))

  /*
   * Tailwind's at-rules are not CSS, and the stock parser rejects them outright rather than
   * skipping them: a v4 entry point dies on `@custom-variant dark (&:where(.dark, .dark *))`
   * at parse time, which takes every rule in that file down with it. `tailwind-csstree`
   * teaches the parser the dialect, and `eslint-plugin-better-tailwindcss` already declares
   * `@eslint/css` an optional peer, so this pairing is one its authors anticipated.
   */
  const customSyntax =
    dialect === undefined
      ? undefined
      : // eslint-disable-next-line ts/no-explicit-any
        ((await import('tailwind-csstree'))[dialect] as any)

  const recommended = pluginCss.configs.recommended as { rules: Record<string, unknown> }

  return [
    {
      name: 'maninak/css',
      files: [GLOB_CSS],
      language: 'css/css',
      /*
       * Tolerant parsing, because these rules are on by DEFAULT. A stylesheet run through
       * PostCSS plugins, CSS modules or some other extension is ordinary in a real project and
       * unknown to this parser, and in strict mode one such file is a fatal parse error that
       * reports nothing else. Recoverable errors are the ones browsers fix silently anyway, so
       * skipping them costs little and keeps every other rule reporting.
       */
      languageOptions: {
        tolerant: true,
        ...(customSyntax === undefined ? {} : { customSyntax }),
      },
      plugins: { css: pluginCss },
      rules: {
        // `recommended` ships everything as an error; this preset reports, it does not block.
        ...Object.fromEntries(Object.keys(recommended.rules).map((rule) => [rule, 'warn'])),
        'css/use-baseline': ['warn', { available }],

        /*
         * A stylesheet that reads `var(--token)` cannot prove the token exists, because the
         * file defining it is a different file and each is linted alone. Left on, the rule
         * reports every cross-file custom property a design-token setup has: 116 of taiga
         * grove's 116 findings were this, and none of them was a defect.
         */
        'css/no-invalid-properties': ['warn', { allowUnknownVariables: true }],

        /*
         * `tailwind-csstree` parses `@utility` but carries no descriptor table for its body,
         * so this rule calls every declaration inside one an unknown descriptor. A `@utility`
         * body is ordinary CSS, so that is the rule being wrong, and it would be wrong about
         * every custom utility a project defines.
         */
        ...(customSyntax === undefined ? {} : { 'css/no-invalid-at-rules': 'off' }),
      },
    },
  ] as TypedFlatConfigItem[]
}

// eslint-disable-next-line ts/no-explicit-any
function interopDefault(module: any) {
  // eslint-disable-next-line ts/no-unsafe-return
  return module?.default ?? module
}

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
export function buildRequireJsdocBlocks(
  options: RequireJsdocOptions = {},
): TypedFlatConfigItem[] {
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

/**
 * A perfectionist custom import group, plus where it lands among the preset's groups.
 *
 * Every key other than `after` and `before` is passed through to
 * `perfectionist/sort-imports`'s own `customGroups`, so anything that rule accepts works here
 * (`elementNamePattern`, `modifiers`, `selector`, and the rest).
 */
export interface CustomImportGroup {
  [key: string]: unknown

  /** Name referenced in the ordering. Must not collide with a built-in group name. */
  groupName: string

  /** Place this group immediately after the named built-in group. */
  after?: string

  /** Place this group immediately before the named built-in group. */
  before?: string
}

/** Shape of the object form of the factory's `sortImports` option. */
export interface SortImportsOptions {
  /** Custom groups to splice into the preset's ordering. */
  customGroups?: CustomImportGroup[]

  /** Replaces the preset's `internalPattern` when given. */
  internalPattern?: string[]
}

/**
 * Returns the index in `groups` of the entry named `target`, looking inside nested arrays
 * (the preset bundles related groups, e.g. `['value-parent', 'value-sibling', ...]`).
 *
 * @returns the index, or `-1` when no entry carries that name.
 */
function findGroupIndex(groups: readonly ImportGroup[], target: string): number {
  return groups.findIndex((entry) =>
    Array.isArray(entry) ? entry.includes(target) : entry === target,
  )
}

/**
 * Builds the block that re-declares `perfectionist/sort-imports` with extra custom groups
 * spliced into the preset's ordering.
 *
 * Throws when a group names an `after`/`before` target that no preset group carries, because
 * the alternative is appending it somewhere arbitrary and leaving the consumer to wonder why
 * their ordering never took effect.
 *
 * @param options Custom groups and their placement. See {@link SortImportsOptions}.
 */
export function buildSortImportsBlock(options: SortImportsOptions): TypedFlatConfigItem {
  const { customGroups = [], internalPattern } = options
  const base = buildSortImportsOptions()
  // Spliced into below rather than copied: `base` is this call's own object, so mutating its
  // groups touches nothing else.
  const { groups } = base
  const passthrough: Record<string, unknown>[] = []

  for (const group of customGroups) {
    if (findGroupIndex(groups, group.groupName) !== -1) {
      throw new Error(
        `[@maninak/eslint-config] sortImports: custom group "${group.groupName}" collides ` +
          `with a group already in the ordering. Pick a name of your own; this option adds ` +
          `groups, it does not replace them.`,
      )
    }

    const { after, before, ...rest } = group
    const target = after ?? before
    if (target !== undefined) {
      const index = findGroupIndex(groups, target)
      if (index === -1) {
        throw new Error(
          `[@maninak/eslint-config] sortImports: custom group "${group.groupName}" asks to be ` +
            `placed ${after !== undefined ? 'after' : 'before'} "${target}", which is not one ` +
            `of the preset's import groups.`,
        )
      }
      groups.splice(after !== undefined ? index + 1 : index, 0, group.groupName)
    } else {
      // No placement given: just before `unknown`, which is the catch-all and must stay last.
      const fallback = findGroupIndex(groups, 'unknown')
      groups.splice(fallback === -1 ? groups.length : fallback, 0, group.groupName)
    }
    passthrough.push(rest)
  }

  const ruleOptions = {
    ...base,
    ...(internalPattern ? { internalPattern } : {}),
    groups,
    ...(passthrough.length ? { customGroups: passthrough } : {}),
  }

  // Cast at the boundary: a custom group's fields are handed to the plugin verbatim, so they
  // are typed `unknown` here by design and cannot match its generated option type field by
  // field. The plugin validates them against its own schema at lint time.
  const sortImportsRules: Record<string, unknown> = {
    'perfectionist/sort-imports': [SORT_IMPORTS_SEVERITY, ruleOptions],
  }

  return {
    name: 'maninak/sort-imports',
    files: [GLOB_SRC, GLOB_VUE, GLOB_SVELTE],
    rules: sortImportsRules as TypedFlatConfigItem['rules'],
  }
}
