/*
 * Repairs applied to the config array antfu returns, in place. Each one exists because a
 * block antfu ships is wrong for a consumer shape it did not anticipate, so none of them can
 * be expressed as another block appended to the end.
 */

import type { TypedFlatConfigItem } from '@antfu/eslint-config'
import { GLOB_CSS, GLOB_VUE } from '@antfu/eslint-config'

/**
 * Drops a plugin registration that would collide with one an earlier block already made under
 * the same key, keeping the rest of the offending block intact.
 *
 * Flat config throws `Cannot redefine plugin "x"` when two blocks register DISTINCT objects
 * under one key, and two copies of the same plugin package resolved at different versions are
 * distinct objects. antfu and `@nuxt/eslint-config` both register `ts` and `vue`, so whenever
 * their transitive plugin versions fail to dedupe in the store, every Nuxt consumer's lint
 * dies on the first file. Stripping the later registration leaves the winning plugin to serve
 * that prefix, which is safe only because the rules stay checked below.
 *
 * A rule whose prefix was stripped and which the winning plugin does not implement is deleted
 * and reported on stderr, rather than left to fail later as an opaque flat-config error.
 *
 * Rewrites blocks by replacing them in `configs` rather than editing them in place: some are
 * module-level singletons, a plugin's exported `configs.recommended` above all, and editing
 * those would leak into every later `maninak()` call in the process.
 */
export function dedupePluginRegistrations(configs: TypedFlatConfigItem[]): void {
  const winners = new Map<string, unknown>()
  const strippedPrefixes = new Set<string>()

  configs.forEach((block, index) => {
    let survivors: NonNullable<TypedFlatConfigItem['plugins']> | undefined

    for (const [key, plugin] of Object.entries(block.plugins ?? {})) {
      const winner = winners.get(key)
      if (winner === undefined) {
        winners.set(key, plugin)
        continue
      }
      if (winner !== plugin) {
        survivors ??= { ...block.plugins }
        delete survivors[key]
        strippedPrefixes.add(key)
      }
    }

    if (survivors) {
      configs[index] = { ...block, plugins: survivors }
    }
  })

  if (strippedPrefixes.size === 0) {
    return
  }

  const dropped: string[] = []
  configs.forEach((block, index) => {
    let survivors: NonNullable<TypedFlatConfigItem['rules']> | undefined

    for (const [ruleName, entry] of Object.entries(block.rules ?? {})) {
      const separator = ruleName.indexOf('/')
      const prefix = separator === -1 ? '' : ruleName.slice(0, separator)
      if (!strippedPrefixes.has(prefix) || isRuleOff(entry)) {
        continue
      }
      const winner = winners.get(prefix) as { rules?: Record<string, unknown> } | undefined
      if (!winner?.rules?.[ruleName.slice(separator + 1)]) {
        survivors ??= { ...block.rules }
        delete survivors[ruleName]
        dropped.push(`${ruleName} (from block "${block.name ?? 'unnamed'}")`)
      }
    }

    if (survivors) {
      configs[index] = { ...block, rules: survivors }
    }
  })

  if (dropped.length > 0) {
    console.warn(
      `[@maninak/eslint-config] Two plugins were registered under the same key ` +
        `(${[...strippedPrefixes].join(', ')}); the first registration won. These rules are ` +
        `not implemented by it and were dropped:\n  ${dropped.join('\n  ')}`,
    )
  }
}

/**
 * Stops the JavaScript-shaped config blocks claiming `.css` files.
 *
 * A flat-config block with no `files` key applies to every file that gets linted, and antfu
 * ships about ten of them carrying some 200 JS rules between them. That is harmless while the
 * only extra languages are JSON, YAML and TOML, whose parsers produce an ESTree-shaped AST the
 * rules simply never match against. CSS is not parsed, it is a LANGUAGE, and its `SourceCode`
 * has no `getAllComments`: core rules do not fail to match on it, they throw while loading, so
 * `no-irregular-whitespace` alone takes down the lint of any CSS file. Verified before and
 * after.
 *
 * Blocks that already scope themselves with `files` are left alone, and so is a bare
 * global-ignore entry, where adding to `ignores` would exclude CSS from the lint entirely
 * rather than from one block.
 */
export function keepJavascriptBlocksOffCss(configs: TypedFlatConfigItem[]): void {
  for (const config of configs) {
    if (config.files) {
      continue
    }
    const keys = Object.keys(config).filter((key) => key !== 'name')
    if (keys.length === 1 && keys[0] === 'ignores') {
      continue
    }
    config.ignores = [...(config.ignores ?? []), GLOB_CSS]
  }
}

/** Name of the antfu block whose unicorn rules {@link restoreUnicornRulesOnVue} mirrors. */
const ANTFU_UNICORN_BLOCK_NAME = 'antfu/unicorn/rules'

/**
 * Re-applies antfu's unicorn rules to single-file components.
 *
 * antfu v9.3 scoped that block to `**\/*.?([cm])[jt]s?(x)`, which correctly stopped the rules
 * leaking onto JSON and TOML but also stopped them reaching `.vue`, where a Vue or Nuxt
 * consumer keeps most of its code. Nothing errors when that happens: every rule in that
 * block, `unicorn/error-message`, `unicorn/throw-new-error` and `unicorn/prefer-node-protocol`
 * among them, simply stops running. The mirrored block is inserted directly after the source,
 * so every later block, `maninak/prettier-vue` above all, still overrides it.
 *
 * No-ops once antfu's own glob covers `.vue` again, and reports on stderr if the source block
 * is gone, since a silent no-op here is the exact regression this exists to prevent.
 */
export function restoreUnicornRulesOnVue(configs: TypedFlatConfigItem[]): void {
  const index = configs.findIndex((block) => block.name === ANTFU_UNICORN_BLOCK_NAME)
  if (index === -1) {
    console.warn(
      `[@maninak/eslint-config] Expected an eslint config block named ` +
        `"${ANTFU_UNICORN_BLOCK_NAME}" to mirror onto .vue files, but found none. Vue files ` +
        `may be missing unicorn rules; this preset needs updating for the installed ` +
        `@antfu/eslint-config.`,
    )

    return
  }

  const source = configs[index]
  const sourceFiles = Array.isArray(source?.files) ? source.files : []
  const coversVue = sourceFiles.some(
    (glob) => typeof glob === 'string' && glob.includes('vue'),
  )
  if (coversVue || !source?.rules) {
    return
  }

  configs.splice(index + 1, 0, {
    name: 'maninak/unicorn/vue',
    files: [GLOB_VUE],
    rules: { ...source.rules },
  })
}

/** Whether a flat-config rule entry is switched off, in any of the shapes ESLint accepts. */
function isRuleOff(entry: unknown): boolean {
  const severity = Array.isArray(entry) ? (entry as unknown[])[0] : entry
  return severity === 'off' || severity === 0
}
