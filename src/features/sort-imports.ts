/*
 * Import ordering. The preset's own groups live here, in one place, so a consumer can insert a
 * custom group without restating every key ESLint would otherwise replace.
 */

import type { TypedFlatConfigItem } from '@antfu/eslint-config'
import { GLOB_SRC, GLOB_SVELTE, GLOB_VUE } from '@antfu/eslint-config'

/**
 * One entry in `perfectionist/sort-imports`'s `groups`: a group name, or a bundle of names
 * that sort together.
 */

export type ImportGroup = string | [string, ...string[]]

/** Severity for `perfectionist/sort-imports`, shared by the preset block and the builder. */
export const SORT_IMPORTS_SEVERITY = 'warn' as const

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
export function buildSortImportsOptions(): {
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
