/* The factory's public options type, and the maninak-specific options it adds to antfu's. */

import type { OptionsConfig } from '@antfu/eslint-config'
import type { CssOptions } from './features/css.js'
import type { FilenameCaseOptions } from './features/filename-case.js'
import type { RequireJsdocOptions } from './features/jsdoc.js'
import type { SortImportsOptions } from './features/sort-imports.js'
import type { TailwindOptions } from './features/tailwind.js'
import type { TypescriptOption } from './features/type-aware.js'

/** Maninak-specific options layered on top of antfu's. All optional. */
export interface ManinakExtraOptions {
  /**
   * Require a JSDoc block on `export`ed functions, classes and methods. A free-text
   * description alone satisfies it; `@param` and `@returns` stay optional.
   *
   * `true` enforces it under the conventional utility folders (`utils/`, `lib/`, `helpers/`
   * and friends). Test files are always exempt. See {@link RequireJsdocOptions} to name your
   * own globs. Default `false`.
   */
  requireJsdoc?: boolean | RequireJsdocOptions

  /**
   * @deprecated Renamed to `requireJsdoc`, which also accepts an options object. Still
   *   honoured, but ignored when `requireJsdoc` is set.
   */
  requireJsdocInUtils?: boolean

  /**
   * Enforce a filename casing convention: camelCase for `.ts`/`.js`, PascalCase for `.vue`.
   * Vue and Nuxt routing paths are exempt automatically. See {@link FilenameCaseOptions}.
   *
   * Reports without fixing, since renaming a file would break every import of it. Default
   * `false`: turning it on in an existing repo reports every disagreeing file at once, and
   * each fix is a manual `git mv`.
   */
  filenameCase?: boolean | FilenameCaseOptions

  /**
   * Where the Tailwind rules read your theme from: `entryPoint` for a v4 CSS entry point,
   * `tailwindConfig` for a v3 config. See {@link TailwindOptions}. `false` switches them off.
   *
   * You should not normally need it. The rules come on by themselves once the preset finds
   * both Tailwind in your workspace and exactly one theme file. Reach for this only when it
   * reports that several files could be the theme, or that none is, since guessing would
   * enforce a class order the project never configured.
   *
   * @example
   * ```ts
   * tailwind: { entryPoint: './apps/web/assets/css/main.css' },
   * ```
   */
  tailwind?: false | TailwindOptions

  /**
   * Lints your `.css` files, which nothing else in this preset looks at: a misspelled
   * property, a value no property accepts, a duplicate `@import`, a malformed
   * `grid-template-areas`. Taught the Tailwind dialect where the project uses it.
   *
   * On by default wherever the project has any CSS, `false` to switch it off. Coverage is
   * standalone `.css`; SFC `<style>` blocks stay with `eslint-plugin-vue-scoped-css`.
   *
   * @example
   * ```ts
   * css: { available: 'newly' }, // an app targeting current browsers
   * ```
   */
  css?: boolean | CssOptions

  /**
   * Extend the preset's import ordering with your own groups, without restating the ordering.
   *
   * ESLint replaces a rule's options rather than merging them, so adding one group by hand
   * means copying the preset's entire ordering, and that copy stops tracking this preset the
   * moment any of it changes. Each entry here says only what it is and where it goes. See
   * {@link SortImportsOptions}.
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
   * Extends type-aware linting into `.vue` SFCs, so `ts/no-unsafe-*` and the other rules
   * needing type information stop skipping the files holding most of a Vue app's code.
   *
   * Default `true`, but only where three detected preconditions hold: Vue support is on, a
   * `tsconfig.json` resolved, and that tsconfig's `include` covers `.vue`. When one fails the
   * preset warns once and leaves SFCs as they were. Setting `true` by hand asks explicitly,
   * and then an unmet precondition is a hard error instead.
   *
   * `false` switches it off, which is the lever to reach for on lint time: type-checking SFC
   * script blocks is the expensive part of a Vue lint.
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
    typescript?: TypescriptOption
  }
