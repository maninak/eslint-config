import { describe, expect, it } from 'vitest'
import { callAtDir, resolveRule } from './helpers.js'

const tsFixture = 'test/fixtures/typescript.ts'
const tsOptions = { typescript: { tsconfigPath: './tsconfig.json' } }

describe('non-type-aware TypeScript overrides win over antfu defaults', () => {
  it('ts/no-explicit-any is warn', async () => {
    expect(await resolveRule(tsFixture, 'ts/no-explicit-any')).toEqual(['warn'])
  })

  it('ts/consistent-type-imports prefers inline-type-imports', async () => {
    const rule = await resolveRule(tsFixture, 'ts/consistent-type-imports')

    expect(rule).toMatchObject(['warn', { fixStyle: 'inline-type-imports' }])
  })

  it('func-style enforces declarations and disallows arrow bindings', async () => {
    const rule = await resolveRule(tsFixture, 'func-style')

    expect(rule).toMatchObject(['warn', 'declaration', { allowArrowFunctions: false }])
  })

  it('import/consistent-type-specifier-style is off', async () => {
    const rule = await resolveRule(tsFixture, 'import/consistent-type-specifier-style')

    expect(rule?.[0]).toBe('off')
  })

  it('jsonc/sort-keys is off', async () => {
    const rule = await resolveRule('package.json', 'jsonc/sort-keys')

    expect(rule?.[0]).toBe('off')
  })
})

describe('type-aware overrides apply when tsconfigPath is set', () => {
  it('ts/no-floating-promises is off', async () => {
    const rule = await resolveRule(tsFixture, 'ts/no-floating-promises', tsOptions)

    expect(rule?.[0]).toBe('off')
  })

  it('ts/strict-boolean-expressions is disabled', async () => {
    const rule = await resolveRule(tsFixture, 'ts/strict-boolean-expressions', tsOptions)

    expect(rule).toEqual(['off'])
  })

  it('ts/return-await is enabled', async () => {
    const rule = await resolveRule(tsFixture, 'ts/return-await', tsOptions)

    expect(rule?.[0]).not.toBe('off')
  })

  it('ts/promise-function-async is enabled', async () => {
    const rule = await resolveRule(tsFixture, 'ts/promise-function-async', tsOptions)

    expect(rule?.[0]).not.toBe('off')
  })
})

describe('vue rules apply on .vue files only (when consumer has vue declared)', () => {
  it('vue/define-props-declaration is warn for .vue', async () => {
    await callAtDir('test/fixtures/vue-project', async () => {
      const rule = await resolveRule('Component.vue', 'vue/define-props-declaration')

      expect(rule).toEqual(['warn', 'type-based'])
    })
  })

  it('vue/define-props-declaration is absent on .ts files', async () => {
    const rule = await resolveRule(tsFixture, 'vue/define-props-declaration')

    expect(rule).toBeUndefined()
  })

  it('vue/prefer-use-template-ref is warn for .vue (Vue 3.5+ API)', async () => {
    await callAtDir('test/fixtures/vue-project', async () => {
      const rule = await resolveRule('Component.vue', 'vue/prefer-use-template-ref')

      expect(rule?.[0]).toBe('warn')
    })
  })

  it('vue/max-template-depth is configured for .vue', async () => {
    await callAtDir('test/fixtures/vue-project', async () => {
      const rule = await resolveRule('Component.vue', 'vue/max-template-depth')

      expect(rule).toMatchObject(['warn', { maxDepth: 8 }])
    })
  })
})

describe('eslint-config-prettier conflict disables actually apply', () => {
  /*
   * Regression guard for the `interopDefault(import('eslint-config-prettier'))` bug: a
   * Promise was passed to the sync interop helper, so the conflict-disable spread silently
   * contributed nothing. These assert representative disables from that set are in effect.
   */
  it('unicorn/number-literal-case is off (prettier lowercases hex, the rule uppercases)', async () => {
    const rule = await resolveRule(tsFixture, 'unicorn/number-literal-case')

    expect(rule?.[0]).toBe('off')
  })

  it('@stylistic/quotes (style/quotes) carries no formatting conflict at error severity', async () => {
    const rule = await resolveRule(tsFixture, 'style/quotes')

    expect(rule?.[0]).not.toBe('error')
  })

  it('vue/html-self-closing survives the disable list (deliberately deleted from it)', async () => {
    await callAtDir('test/fixtures/vue-project', async () => {
      const rule = await resolveRule('Component.vue', 'vue/html-self-closing')

      expect(rule?.[0]).toBe('warn')
    })
  })
})

describe('rules that fight prettier fixes are off', () => {
  it('antfu/consistent-chaining is off (circular fixes against prettier chain layout)', async () => {
    const rule = await resolveRule(tsFixture, 'antfu/consistent-chaining')

    expect(rule).toEqual(['off'])
  })
})

describe('prettier does not run on TOML', () => {
  it('prettier/prettier has no entry for .toml files', async () => {
    const rule = await resolveRule('test/fixtures/manifest.toml', 'prettier/prettier')

    expect(rule?.[0] ?? 'off').toBe('off')
  })
})
