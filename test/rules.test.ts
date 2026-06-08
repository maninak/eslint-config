import { describe, expect, it } from 'vitest'
import { resolveRule, withCwd } from './helpers.js'

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

  it('ts/strict-boolean-expressions allows all Nullable variants', async () => {
    const rule = await resolveRule(tsFixture, 'ts/strict-boolean-expressions', tsOptions)

    expect(rule).toMatchObject([
      'warn',
      {
        allowString: true,
        allowNumber: true,
        allowNullableBoolean: true,
        allowNullableString: true,
        allowNullableNumber: true,
        allowNullableObject: true,
        allowAny: false,
      },
    ])
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

describe('stylistic plugin is registered manually under style/ prefix', () => {
  it('jsx-quotes is configured', async () => {
    const rule = await resolveRule(tsFixture, 'jsx-quotes')

    expect(rule).toEqual(['warn', 'prefer-double'])
  })
})

describe('vue rules apply on .vue files only (when consumer has vue declared)', () => {
  it('vue/define-props-declaration is warn for .vue', async () => {
    await withCwd('test/fixtures/vue-project', async () => {
      const rule = await resolveRule('Component.vue', 'vue/define-props-declaration')

      expect(rule).toEqual(['warn', 'type-based'])
    })
  })

  it('vue/define-props-declaration is absent on .ts files', async () => {
    const rule = await resolveRule(tsFixture, 'vue/define-props-declaration')

    expect(rule).toBeUndefined()
  })

  it('vue/prefer-use-template-ref is warn for .vue (Vue 3.5+ API)', async () => {
    await withCwd('test/fixtures/vue-project', async () => {
      const rule = await resolveRule('Component.vue', 'vue/prefer-use-template-ref')

      expect(rule?.[0]).toBe('warn')
    })
  })

  it('vue/max-template-depth is configured for .vue', async () => {
    await withCwd('test/fixtures/vue-project', async () => {
      const rule = await resolveRule('Component.vue', 'vue/max-template-depth')

      expect(rule).toMatchObject(['warn', { maxDepth: 8 }])
    })
  })
})
