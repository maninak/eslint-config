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
   * Require a JSDoc block on `export`ed functions, classes, and methods. `@param` and
   * `@returns` tags stay optional; a free-text description alone is enough of a contract.
   *
   * `true` enforces it in folders that conventionally hold reusable utilities (`utils/`,
   * `util/`, `lib/`, `helpers/`, and the same names as single files). Pass an object to name
   * your own globs or loosen the rule; see {@link RequireJsdocOptions}.
   *
   * Test files e.g. `*.test.*`, `*.spec.*`, anything under `test/`, are always exempt, even
   * when they match a glob you passed yourself.
   *
   * Default: `false`. Off by default to keep the preset lower friction.
   */
  requireJsdoc?: boolean | RequireJsdocOptions

  /**
   * @deprecated Renamed to `requireJsdoc`, which also accepts an options object. Still
   *   honoured, but ignored when `requireJsdoc` is set.
   */
  requireJsdocInUtils?: boolean

  /**
   * Enforce a filename casing convention: camelCase for `.ts`/`.js` modules, PascalCase for
   * `.vue` components. Pass an object to change either casing or to exempt more paths; see
   * {@link FilenameCaseOptions}.
   *
   * When `vue` or `nuxt` is a consumer dependency, paths whose filename is load-bearing under
   * file-based routing are exempt automatically (`pages/`, `layouts/`, `middleware/`,
   * `server/`, `app.vue`, `error.vue`, `*.config.*`, and dynamic segments like `[id].vue`),
   * because renaming one of those changes a route or breaks the framework.
   *
   * The rule reports without fixing: renaming a file on disk would break every import of it.
   *
   * Default: `false`. Turning it on in an existing repo reports every file that disagrees at
   * once, and each fix is a manual `git mv`.
   */
  filenameCase?: boolean | FilenameCaseOptions

  /**
   * Where the Tailwind CSS rules should read your theme from: `entryPoint` for a Tailwind v4
   * CSS entry point, `tailwindConfig` for a v3 config. See {@link TailwindOptions}.
   *
   * You should not normally need it. The rules come on by themselves when Tailwind is in the
   * workspace (including via `@nuxt/ui`, which carries Tailwind v4 without declaring it) and
   * the preset can find your theme: the one CSS file that does `@import "tailwindcss"` on v4,
   * or `tailwind.config.js` on v3. A Tailwind that only a dependency installed is found too,
   * so nothing has to be added to your `package.json` to make this work.
   *
   * Nothing is ever guessed, though. The plugin learns the project's theme from that file, and
   * given none it falls back to Tailwind's stock theme: it would enforce a class order the
   * project never configured and treat every themed class as unknown. So when a repo has
   * several files that could be the theme, or none, the rules stay off and the preset says
   * which it was. That is what this option settles. Pass `false` to switch the rules off.
   *
   * @example
   * ```ts
   * tailwind: { entryPoint: './apps/web/assets/css/main.css' },
   * ```
   */
  tailwind?: false | TailwindOptions

  /**
   * Lints your `.css` files, which nothing else in this preset looks at.
   *
   * On by default wherever the project has any CSS at all, since the rules catch real defects
   * rather than style opinions: a misspelled property, a value no property accepts, a
   * duplicated `@import` or keyframe selector, an unmatchable selector, a malformed
   * `grid-template-areas`. When this project uses Tailwind, the parser is taught the Tailwind
   * dialect, so `@theme`, `@utility`, `@apply` and `@custom-variant` read as the CSS they are.
   *
   * Coverage is standalone `.css` files. `@eslint/css` has no way to reach an SFC's `<style>`
   * block, which stays the province of `eslint-plugin-vue-scoped-css`.
   *
   * Pass `false` to switch the rules off.
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
   * ESLint replaces a rule's options rather than merging them, so adding one custom group by
   * hand means copying the preset's whole `groups` array plus `internalPattern`, `order`,
   * `type` and the newline keys, and that copy stops tracking this preset the moment any of
   * them changes. Each entry here says only what it is and where it goes; everything else
   * stays owned by the preset. See {@link SortImportsOptions}.
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
   * Extends type-aware linting to `.vue` single-file components, so rules needing type
   * information (`ts/no-unsafe-*`, `ts/no-misused-promises`,
   * `ts/restrict-template-expressions`, and the rest) run inside SFCs instead of stopping at
   * the `.vue` boundary.
   *
   * Default: `true`, but only where all three preconditions hold, each detected rather than
   * assumed. Vue support must be on. Type-aware linting must already be active, meaning a
   * resolved `tsconfig.json` (see `typescript.tsconfigPath`), so a repo that never opted into
   * type-aware linting is untouched by this. And that tsconfig's `include` must cover `.vue`:
   * one that excludes them makes every SFC report "not found in project" instead of linting.
   *
   * When a precondition fails, the default degrades: the preset says so once and leaves SFCs
   * linted as before, rather than failing a lint nobody asked it to fail. Setting this to
   * `true` by hand asks for it explicitly instead, and then an unmet precondition is a hard
   * error, since silently not doing what you asked for is the worse answer.
   *
   * Set `false` to switch it off. That is the lever to reach for on lint time: type-checking
   * SFC script blocks is the expensive part of a Vue lint.
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
