import { describe, expect, it } from 'vitest'
import { lintFixture, withCwd } from './helpers.js'

const tsFixture = 'test/fixtures/typescript.ts'
const typeAwareFixture = 'test/fixtures/type-aware.ts'
const tsOptions = { typescript: { tsconfigPath: './tsconfig.json' } }

/*
 * Behavioural tests for non-auto-fixable rules.
 *
 * Each test feeds a fixture that contains a known violation and asserts which rule fires (or
 * doesn't). Restricting to non-auto-fixable rules keeps assertions about *what gets reported*
 * stable across plugin versions; a separate concern would be testing fixer output, which
 * is far more brittle.
 *
 * The negative tests (e.g. "ts/no-floating-promises does NOT fire") are equally important.
 * They lock in maninak's deliberate opt-outs, so a future antfu/plugin bump that flips a
 * default cannot silently re-enable a rule we intentionally turned off.
 */

describe('non-type-aware rules fire on real code', () => {
  it('func-style flags a top-level arrow binding', async () => {
    const msgs = await lintFixture(tsFixture)

    expect(msgs).toContainEqual(expect.objectContaining({ ruleId: 'func-style' }))
  })

  it('ts/no-explicit-any flags an explicit any', async () => {
    const msgs = await lintFixture(tsFixture)

    expect(msgs).toContainEqual(expect.objectContaining({ ruleId: 'ts/no-explicit-any' }))
  })

  it('no-debugger flags a debugger statement', async () => {
    const msgs = await lintFixture(tsFixture)

    expect(msgs).toContainEqual(expect.objectContaining({ ruleId: 'no-debugger' }))
  })

  it('eqeqeq flags loose equality', async () => {
    const msgs = await lintFixture(tsFixture)

    expect(msgs).toContainEqual(expect.objectContaining({ ruleId: 'eqeqeq' }))
  })

  it('no-useless-return flags a bare return at end of void function', async () => {
    const msgs = await lintFixture(tsFixture)

    expect(msgs).toContainEqual(expect.objectContaining({ ruleId: 'no-useless-return' }))
  })

  it('no-nested-ternary flags a nested ternary', async () => {
    const msgs = await lintFixture(tsFixture)

    expect(msgs).toContainEqual(expect.objectContaining({ ruleId: 'no-nested-ternary' }))
  })
})

describe('type-aware rules fire when tsconfigPath is set', () => {
  it('ts/strict-boolean-expressions flags `if (any)` (allowAny: false)', async () => {
    const msgs = await lintFixture(typeAwareFixture, tsOptions)

    expect(msgs).toContainEqual(
      expect.objectContaining({ ruleId: 'ts/strict-boolean-expressions' }),
    )
  })

  it('ts/return-await flags returning a Promise without await in try/catch', async () => {
    const msgs = await lintFixture(typeAwareFixture, tsOptions)

    expect(msgs).toContainEqual(expect.objectContaining({ ruleId: 'ts/return-await' }))
  })

  it('ts/promise-function-async flags a non-async Promise-returning function', async () => {
    const msgs = await lintFixture(typeAwareFixture, tsOptions)

    expect(msgs).toContainEqual(
      expect.objectContaining({ ruleId: 'ts/promise-function-async' }),
    )
  })
})

describe('intentional opt-outs stay off', () => {
  it('ts/no-floating-promises does NOT fire even on a floating Promise', async () => {
    const msgs = await lintFixture(typeAwareFixture, tsOptions)
    const matching = msgs.filter((msg) => msg.ruleId === 'ts/no-floating-promises')

    expect(matching).toEqual([])
  })
})

describe('vue rules fire on .vue files when vue is a consumer dep', () => {
  async function lintVue(): Promise<Awaited<ReturnType<typeof lintFixture>>> {
    return await withCwd(
      'test/fixtures/vue-project',
      async () => await lintFixture('Component.vue'),
    )
  }

  it('vue/define-props-declaration flags the runtime (non-type-based) form', async () => {
    const msgs = await lintVue()

    expect(msgs).toContainEqual(
      expect.objectContaining({ ruleId: 'vue/define-props-declaration' }),
    )
  })

  it('vue/define-emits-declaration flags the array form', async () => {
    const msgs = await lintVue()

    expect(msgs).toContainEqual(
      expect.objectContaining({ ruleId: 'vue/define-emits-declaration' }),
    )
  })

  it('vue/html-button-has-type flags a <button> without type attribute', async () => {
    const msgs = await lintVue()

    expect(msgs).toContainEqual(
      expect.objectContaining({ ruleId: 'vue/html-button-has-type' }),
    )
  })

  it('vue/no-unused-emit-declarations flags a declared but never-emitted event', async () => {
    const msgs = await lintVue()

    expect(msgs).toContainEqual(
      expect.objectContaining({ ruleId: 'vue/no-unused-emit-declarations' }),
    )
  })
})

describe('vue rules do not fire on non-vue files', () => {
  it('vue/define-props-declaration does NOT fire on a .ts fixture', async () => {
    const msgs = await lintFixture(tsFixture)
    const matching = msgs.filter((msg) => msg.ruleId === 'vue/define-props-declaration')

    expect(matching).toEqual([])
  })
})

describe('jsdoc/require-jsdoc (opt-in via requireJsdocInUtils)', () => {
  const jsdocOpts = { requireJsdocInUtils: true }

  it('flags an undocumented exported function under utils/', async () => {
    const msgs = await withCwd(
      'test/fixtures/jsdoc-project',
      async () => await lintFixture('src/utils/exports.ts', jsdocOpts),
    )

    expect(msgs).toContainEqual(expect.objectContaining({ ruleId: 'jsdoc/require-jsdoc' }))
  })

  it('fires only on the undocumented export, not on the two documented ones', async () => {
    const msgs = await withCwd(
      'test/fixtures/jsdoc-project',
      async () => await lintFixture('src/utils/exports.ts', jsdocOpts),
    )
    const matching = msgs.filter((msg) => msg.ruleId === 'jsdoc/require-jsdoc')

    expect(matching).toHaveLength(1)
  })

  it('does not require @param or @returns (description alone is enough)', async () => {
    const msgs = await withCwd(
      'test/fixtures/jsdoc-project',
      async () => await lintFixture('src/utils/exports.ts', jsdocOpts),
    )
    // The `tagless` export starts around line 23; no jsdoc rule should complain about it.
    const onTagless = msgs.filter(
      (msg) => msg.line >= 23 && (msg.ruleId?.startsWith('jsdoc/') ?? false),
    )

    expect(onTagless).toEqual([])
  })

  it('does not require jsdoc on test files even when opted in', async () => {
    const msgs = await lintFixture('test/behaviour.test.ts', jsdocOpts)
    const matching = msgs.filter((msg) => msg.ruleId === 'jsdoc/require-jsdoc')

    expect(matching).toEqual([])
  })

  it('does NOT fire by default (option off)', async () => {
    const msgs = await withCwd(
      'test/fixtures/jsdoc-project',
      async () => await lintFixture('src/utils/exports.ts'),
    )
    const matching = msgs.filter((msg) => msg.ruleId === 'jsdoc/require-jsdoc')

    expect(matching).toEqual([])
  })
})
