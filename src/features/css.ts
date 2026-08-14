/*
 * Linting stylesheets with `@eslint/css`, taught Tailwind's dialect wherever the project uses
 * it. Reads {@link ./tailwind.js} for that detection but never the other way round.
 */

import type { TypedFlatConfigItem } from '@antfu/eslint-config'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { GLOB_CSS } from '@antfu/eslint-config'
import { findProjectCssFiles, interopDefault } from '../utils.js'
import {
  findTailwindEntryPoints,
  isTailwindInConsumerDeps,
  resolveTailwindInstall,
  TAILWIND_CONFIG_NAMES,
} from './tailwind.js'

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
async function buildCssBlocks(
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
    dialect === undefined ? undefined : (await import('tailwind-csstree'))[dialect]

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

/**
 * The CSS blocks, or none when this project has no CSS to lint.
 *
 * Gated on the project actually owning a `.css` file rather than switched on unconditionally,
 * because loading the language plugin costs ~73ms and a repo with no CSS would pay it on every
 * lint for nothing. The scan behind that answer is shared with the Tailwind theme detection,
 * so asking costs nothing extra.
 */
export async function resolveCssBlocks(
  option: boolean | CssOptions | undefined,
): Promise<TypedFlatConfigItem[]> {
  if (option === false) {
    return []
  }
  if (option === undefined && findProjectCssFiles(process.cwd()).length === 0) {
    return []
  }

  return await buildCssBlocks(
    option === true || option === undefined ? {} : option,
    detectTailwindCssDialect(),
  )
}
