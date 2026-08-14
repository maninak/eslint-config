/*
 * Type-aware linting: which tsconfig drives it, whether that tsconfig reaches `.vue` files,
 * and the surgery on antfu's blocks that follows from both answers.
 */

import type { OptionsTypescript, TypedFlatConfigItem } from '@antfu/eslint-config'
import path from 'node:path'
import { glob } from 'tinyglobby'
import { hasConsumerTsconfig, isInConsumerDeps } from '../utils.js'

/**
 * The `typescript` option, widened from antfu's so `tsconfigPath` may name several tsconfigs.
 * antfu accepts one string because it feeds it into `projectService.defaultProject`; an array
 * is what {@link switchToLegacyProjectMode} exists to honour.
 */
export type TypescriptOption =
  boolean | (Omit<OptionsTypescript, 'tsconfigPath'> & { tsconfigPath?: string | string[] })

/**
 * Returns the final list of tsconfig paths to drive type-aware linting, or `undefined` if
 * type-aware linting should stay off.
 *
 * Resolution order:
 * 1. If the consumer set `typescript: false`, return undefined (TS is being disabled
 * outright).
 * 2. If the consumer set `typescript.tsconfigPath` (string or string[]), use that.
 * 3. Otherwise auto-detect: a `tsconfig.json` at cwd plus `typescript` in the consumer's
 *    deps activates type-aware linting silently.
 */
export function resolveTsconfigPaths(
  typescriptOption: TypescriptOption | undefined,
): string[] | undefined {
  if (typescriptOption === false) {
    return undefined
  }
  const tsObject = typeof typescriptOption === 'object' ? typescriptOption : {}
  const explicit = tsObject.tsconfigPath

  if (Array.isArray(explicit)) {
    const paths = explicit.filter((item): item is string => item.length > 0)
    return paths.length > 0 ? paths : undefined
  }
  if (typeof explicit === 'string' && explicit.length > 0) {
    return [explicit]
  }

  return isInConsumerDeps('typescript') && hasConsumerTsconfig()
    ? ['./tsconfig.json']
    : undefined
}

/**
 * antfu v9 forwards `tsconfigPath` straight into `projectService.defaultProject`, which only
 * accepts a single string. When the consumer wants multiple non-standard-named tsconfigs,
 * we swap the type-aware parser blocks over to legacy `parserOptions.project`, which natively
 * accepts an array. Run in place after `antfu()` returns.
 */
export function switchToLegacyProjectMode(
  configs: TypedFlatConfigItem[],
  tsconfigPaths: string[],
): void {
  for (const block of configs) {
    const parserOptions = block.languageOptions?.['parserOptions'] as
      { projectService?: unknown; project?: unknown } | undefined
    if (parserOptions && 'projectService' in parserOptions) {
      delete parserOptions.projectService
      parserOptions.project = tsconfigPaths
    }
  }
}

/**
 * Why type-aware linting cannot reach this project's SFCs, worded for the consumer, or
 * `undefined` when it can. The caller decides whether that is fatal.
 *
 * A tsconfig whose `include` misses SFCs does not disable type-aware linting for them, it
 * makes every one report `was not found by the project service` as a parse error, so a
 * 138-SFC app answers with 138 opaque failures and no hint of the cause. Nuxt's generated
 * `.nuxt/tsconfig.json` covers `.vue`; a hand-rolled one frequently does not.
 *
 * Resolution goes through TypeScript itself, with the same `.vue` extension registration
 * typescript-eslint uses, because `include` entries name directories as often as globs and
 * pattern-matching them by hand gets the answer wrong either way. Reports nothing when the
 * project has no SFCs at all, where the option is merely redundant rather than misconfigured.
 */
export async function findVueTypeAwareProblem(
  tsconfigPath: string,
): Promise<string | undefined> {
  let loaded
  try {
    loaded = (await import('typescript')).default
  } catch {
    console.warn(
      `[@maninak/eslint-config] "typescript" could not be imported, so whether ` +
        `"${tsconfigPath}" covers .vue files could not be checked. Type-aware linting of ` +
        `SFCs is being left on; if every SFC reports "was not found by the project ` +
        `service", that is why.`,
    )

    return undefined
  }
  // Re-bound as a const so the narrowed module type survives into the closure below; a `let`
  // widens back to `any` there.
  const typescript = loaded

  const absolute = path.resolve(process.cwd(), tsconfigPath)
  // Wrapped rather than passed bare: `sys.readFile` is a method, and handing it over unbound
  // would strip its `this`.
  const configFile = typescript.readConfigFile(absolute, (file) =>
    typescript.sys.readFile(file),
  )
  if (configFile.error) {
    return undefined // Let ESLint report an unreadable tsconfig in its own words.
  }

  const parsed = typescript.parseJsonConfigFileContent(
    configFile.config,
    typescript.sys,
    path.dirname(absolute),
    undefined,
    absolute,
    undefined,
    [
      {
        extension: '.vue',
        isMixedContent: true,
        scriptKind: typescript.ScriptKind.Deferred,
      },
    ],
  )
  if (parsed.fileNames.some((file) => file.endsWith('.vue'))) {
    return undefined
  }

  // Only now is a filesystem sweep worth its cost, and only to tell "misconfigured" apart
  // from "no SFCs yet".
  const sfcs = await glob(['**/*.vue'], {
    cwd: process.cwd(),
    ignore: ['**/node_modules/**', '**/dist/**', '**/.nuxt/**', '**/.output/**'],
  })
  if (sfcs.length === 0) {
    return undefined
  }

  return (
    `"${tsconfigPath}" does not include any of the ${sfcs.length} .vue files in this ` +
    `project, so each one would report "was not found by the project service" instead of ` +
    `linting. Add "**/*.vue" to that tsconfig's "include", or point typescript.tsconfigPath ` +
    `at one that covers SFCs (Nuxt generates .nuxt/tsconfig.json).`
  )
}

/** Name of the antfu block that parses `.vue`, which needs a project to resolve types. */
const ANTFU_VUE_BLOCK_NAME = 'antfu/vue/rules'

/**
 * Points the Vue block's inner TypeScript parser at the consumer's tsconfig.
 *
 * antfu configures that block with `vue-eslint-parser` wrapping `@typescript-eslint/parser`
 * and `extraFileExtensions: ['.vue']`, but sets neither `projectService` nor `project`.
 * Without
 * one, matching an SFC to a type-aware rule only makes typescript-eslint bail with "you have
 * used a rule which requires type information, but don't have parserOptions set to generate
 * type information for this file". Mirrors the shape antfu builds for its own type-aware
 * parser so both resolve the same program.
 *
 * Throws when the block is missing: the caller asked for type-aware SFCs, and silently not
 * delivering them is the very failure this option exists to end.
 */
export function giveVueBlockATypeScriptProject(
  configs: TypedFlatConfigItem[],
  tsconfigPath: string,
): void {
  const block = configs.find((item) => item.name === ANTFU_VUE_BLOCK_NAME)
  const parserOptions = block?.languageOptions?.['parserOptions'] as
    Record<string, unknown> | undefined

  if (!parserOptions) {
    throw new Error(
      `[@maninak/eslint-config] vueTypeAware is on, but no "${ANTFU_VUE_BLOCK_NAME}" block ` +
        `with a parser was found, so .vue files would silently keep skipping every ` +
        `type-aware rule. Check that vue support is enabled and that the installed ` +
        `@antfu/eslint-config still ships that block.`,
    )
  }

  parserOptions['projectService'] = {
    allowDefaultProject: ['./*.js'],
    defaultProject: tsconfigPath,
  }
  parserOptions['tsconfigRootDir'] = process.cwd()
}
