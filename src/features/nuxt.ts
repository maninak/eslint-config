/* The official Nuxt flat config, loaded only for a consumer that has Nuxt installed. */

import type antfu from '@antfu/eslint-config'

export async function getNuxtConfigs(): Promise<Parameters<typeof antfu>['1'][]> {
  try {
    const { createConfigForNuxt } = await import('@nuxt/eslint-config/flat')
    const configs = await createConfigForNuxt({})
    const arr = Array.isArray(configs) ? configs : [configs]

    // Nuxt's config registers `eslint-plugin-import`; antfu v9 already registers a
    // different fork (`eslint-plugin-import-x` / `eslint-plugin-import-lite`) under
    // the same `import` key. Flat config rejects two distinct plugin objects under
    // one key, so we drop the offending nuxt block and let antfu's import rules
    // continue to apply.
    return arr.filter((block) => !block?.plugins?.['import']).map(makeNuxtGlobsWorkspaceWide)
  } catch {
    // @nuxt/eslint-config not installed; skip silently
    return []
  }
}

/**
 * Nuxt's generated config anchors its convention-file globs at the lint root (the `pages/`,
 * `layouts/`, `components/` dirs, and `error.vue` / `app.vue`). When the Nuxt app lives in a
 * workspace sub-package (e.g. `apps/web`) those globs never match `apps/web/pages/...`, so the
 * exemptions they carry, like turning `vue/multi-word-component-names` off for `pages/` and
 * `error.vue`, silently fail and the convention files (whose names Nuxt dictates and the user
 * cannot rename) get flagged. Prefixing each glob not already globstar-anchored with a
 * leading globstar makes it match the Nuxt dirs at any depth; a leading globstar matches
 * zero segments too, so a Nuxt app at the lint root still matches. These blocks only relax
 * rules for the convention files, so broadening the match is safe.
 */
function makeNuxtGlobsWorkspaceWide<T extends { files?: unknown }>(block: T): T {
  if (!Array.isArray(block.files)) {
    return block
  }

  const files = (block.files as unknown[]).map((glob) =>
    typeof glob === 'string' && !glob.startsWith('**/') && !glob.startsWith('/')
      ? `**/${glob}`
      : glob,
  )

  return { ...block, files }
}
