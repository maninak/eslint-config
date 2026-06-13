import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { callAtDir, lint, lintAndFix, resolveRule } from './helpers.js'

const tsFixturePath = 'test/fixtures/typescript.ts'
const typeAwareFixturePath = 'test/fixtures/type-aware.ts'
const tsOptions = { typescript: { tsconfigPath: 'test/fixtures/tsconfig.json' } }

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
  it('func-style flags a top-level arrow binding (at warn severity)', async () => {
    const results = await lint(tsFixturePath)

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'func-style', severity: 1 }),
    )
  })

  it('ts/no-explicit-any flags an explicit any (at warn severity)', async () => {
    const results = await lint(tsFixturePath)

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'ts/no-explicit-any', severity: 1 }),
    )
  })

  it('no-debugger flags a debugger statement', async () => {
    const results = await lint(tsFixturePath)

    expect(results).toContainEqual(expect.objectContaining({ ruleId: 'no-debugger' }))
  })

  it('eqeqeq flags loose equality', async () => {
    const results = await lint(tsFixturePath)

    expect(results).toContainEqual(expect.objectContaining({ ruleId: 'eqeqeq' }))
  })

  it('no-useless-return flags a bare return at end of void function', async () => {
    const results = await lint(tsFixturePath)

    expect(results).toContainEqual(expect.objectContaining({ ruleId: 'no-useless-return' }))
  })

  it('no-nested-ternary flags a nested ternary', async () => {
    const results = await lint(tsFixturePath)

    expect(results).toContainEqual(expect.objectContaining({ ruleId: 'no-nested-ternary' }))
  })
})

describe('type-aware rules fire when tsconfigPath is set', () => {
  it('ts/strict-boolean-expressions is disabled (too noisy on union types)', async () => {
    const results = await lint(typeAwareFixturePath, tsOptions)

    expect(results).not.toContainEqual(
      expect.objectContaining({ ruleId: 'ts/strict-boolean-expressions' }),
    )
  })

  it('ts/return-await flags returning a Promise without await in try/catch', async () => {
    const results = await lint(typeAwareFixturePath, tsOptions)

    expect(results).toContainEqual(expect.objectContaining({ ruleId: 'ts/return-await' }))
  })

  it('ts/promise-function-async flags a non-async Promise-returning function', async () => {
    const results = await lint(typeAwareFixturePath, tsOptions)

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'ts/promise-function-async' }),
    )
  })
})

describe('type-aware rules auto-activate when tsconfig.json sits at cwd', () => {
  it('ts/promise-function-async fires without an explicit tsconfigPath', async () => {
    const results = await callAtDir(
      'test/fixtures/multi-ts',
      async () => await lint('src/source.ts'),
    )

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'ts/promise-function-async' }),
    )
  })
})

describe('tsconfigPath as an array unlocks non-standard tsconfig names', () => {
  async function lintMultiTs(file: string): Promise<Awaited<ReturnType<typeof lint>>> {
    return await callAtDir('test/fixtures/multi-ts', async () => {
      return await lint(file, {
        typescript: { tsconfigPath: ['./tsconfig.json', './tsconfig.wdio.json'] },
      })
    })
  }

  it('type-aware rules fire on files covered by the first tsconfig', async () => {
    const results = await lintMultiTs('src/source.ts')

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'ts/promise-function-async' }),
    )
  })

  it('type-aware rules fire on files covered only by a non-standard tsconfig', async () => {
    const results = await lintMultiTs('e2e/spec.ts')

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'ts/promise-function-async' }),
    )
  })
})

describe('intentional opt-outs stay off', () => {
  it('ts/no-floating-promises does NOT fire even on a floating Promise', async () => {
    const results = await lint(typeAwareFixturePath, tsOptions)
    const matching = results.filter((result) => result.ruleId === 'ts/no-floating-promises')

    expect(matching).toEqual([])
  })

  /*
   * The fixtures below each contain a construct the rule WOULD flag if enabled, so a clean
   * result proves the rule is genuinely inert on real code, not merely that the config entry
   * reads `off`. unicorn/number-literal-case doubles as the regression guard for the
   * eslint-config-prettier disable spread: if that set failed to apply, the lowercase hex
   * literal would be reported.
   */
  it('import/consistent-type-specifier-style stays off on an inline type specifier', async () => {
    const results = await lint('test/fixtures/optouts/typespec.ts')
    const matching = results.filter(
      (finding) => finding.ruleId === 'import/consistent-type-specifier-style',
    )

    expect(matching).toEqual([])
  })

  it('jsonc/sort-keys stays off on an unsorted object', async () => {
    const results = await lint('test/fixtures/optouts/unsorted.json')
    const matching = results.filter((finding) => finding.ruleId === 'jsonc/sort-keys')

    expect(matching).toEqual([])
  })

  it('unicorn/number-literal-case stays off on a lowercase hex literal', async () => {
    const results = await lint('test/fixtures/optouts/hex.ts')
    const matching = results.filter(
      (finding) => finding.ruleId === 'unicorn/number-literal-case',
    )

    expect(matching).toEqual([])
  })

  it('antfu/consistent-chaining stays off on an inconsistently wrapped chain', async () => {
    const results = await lint('test/fixtures/optouts/chaining.ts')
    const matching = results.filter(
      (finding) => finding.ruleId === 'antfu/consistent-chaining',
    )

    expect(matching).toEqual([])
  })
})

describe('ts/consistent-type-imports inlines the type specifier when autofixed', () => {
  /*
   * The maninak-specific choice here is `fixStyle: 'inline-type-imports'`, which is only
   * observable in the fix output: a value+type import from one module must collapse to a
   * single statement with an inline `type` keyword, not split into a separate `import type`.
   */
  it('produces an inline `type` keyword rather than a separate import type statement', async () => {
    const fixed = await lintAndFix('test/fixtures/optouts/type-import.ts')

    expect(fixed).toMatch(/import\s*\{[^}]*\btype WriteStream\b[^}]*\}/)
    expect(fixed).not.toMatch(/import type\s*\{/)
  })
})

describe('vue rules fire on .vue files when vue is a consumer dep', () => {
  async function lintVue(): Promise<Awaited<ReturnType<typeof lint>>> {
    return await callAtDir(
      'test/fixtures/vue-project',
      async () => await lint('Component.vue'),
    )
  }

  it('vue/define-props-declaration flags the runtime (non-type-based) form (at warn severity)', async () => {
    const results = await lintVue()

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'vue/define-props-declaration', severity: 1 }),
    )
  })

  it('vue/define-emits-declaration flags the array form', async () => {
    const results = await lintVue()

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'vue/define-emits-declaration' }),
    )
  })

  it('vue/html-button-has-type flags a <button> without type attribute', async () => {
    const results = await lintVue()

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'vue/html-button-has-type' }),
    )
  })

  it('vue/no-unused-emit-declarations flags a declared but never-emitted event', async () => {
    const results = await lintVue()

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'vue/no-unused-emit-declarations' }),
    )
  })
})

describe('vue rules do not fire on non-vue files', () => {
  it('vue/define-props-declaration does NOT fire on a .ts fixture', async () => {
    const results = await lint(tsFixturePath)
    const matching = results.filter(
      (result) => result.ruleId === 'vue/define-props-declaration',
    )

    expect(matching).toEqual([])
  })
})

describe('jsdoc/require-jsdoc (opt-in via requireJsdocInUtils)', () => {
  const jsdocOpts = { requireJsdocInUtils: true }

  it('flags an undocumented exported function under utils/', async () => {
    const results = await callAtDir(
      'test/fixtures/jsdoc-project',
      async () => await lint('src/utils/exports.ts', jsdocOpts),
    )

    expect(results).toContainEqual(expect.objectContaining({ ruleId: 'jsdoc/require-jsdoc' }))
  })

  it('fires only on the undocumented export, not on the two documented ones', async () => {
    const results = await callAtDir(
      'test/fixtures/jsdoc-project',
      async () => await lint('src/utils/exports.ts', jsdocOpts),
    )
    const matching = results.filter((result) => result.ruleId === 'jsdoc/require-jsdoc')

    expect(matching).toHaveLength(1)
  })

  it('does not require @param or @returns (description alone is enough)', async () => {
    const results = await callAtDir(
      'test/fixtures/jsdoc-project',
      async () => await lint('src/utils/exports.ts', jsdocOpts),
    )
    // The `tagless` export starts around line 23; no jsdoc rule should complain about it.
    const onTagless = results.filter(
      (result) => result.line >= 23 && (result.ruleId?.startsWith('jsdoc/') ?? false),
    )

    expect(onTagless).toEqual([])
  })

  it('does not require jsdoc on test files even when opted in', async () => {
    const results = await lint('test/behaviour.test.ts', jsdocOpts)
    const matching = results.filter((result) => result.ruleId === 'jsdoc/require-jsdoc')

    expect(matching).toEqual([])
  })

  it('does NOT fire by default (option off)', async () => {
    const results = await callAtDir(
      'test/fixtures/jsdoc-project',
      async () => await lint('src/utils/exports.ts'),
    )
    const matching = results.filter((result) => result.ruleId === 'jsdoc/require-jsdoc')

    expect(matching).toEqual([])
  })
})

describe('padding-line-between-statements', async () => {
  const paddingFixturePath = 'test/fixtures/padding-line.ts'
  const rule = 'padding-line-between-statements'

  /** Returns the {start, end} line range (1-indexed, inclusive) for a fixture case. */
  function getCaseArea(fixture: string, caseName: string): { start: number; end: number } {
    const lines = readFileSync(fixture, 'utf-8').split('\n')
    const startIdx = lines.findIndex((ln) => ln.includes(`@case ${caseName}`))

    if (startIdx === -1) {
      throw new Error(`Case not found: ${caseName}`)
    }

    const endIdx = lines.findIndex((ln, idx) => idx > startIdx && ln.includes('@case'))
    const start = startIdx + 2 // first code line after the anchor comment (1-indexed)
    const end = endIdx === -1 ? lines.length : endIdx + 1

    return { start, end }
  }

  const results = (await lint(paddingFixturePath)).filter((result) => result.ruleId === rule)

  function isLineInCase(line: number, caseName: string): boolean {
    const { start, end } = getCaseArea(paddingFixturePath, caseName)

    return line >= start && line <= end
  }

  // ── always(*, return) ──────────────────────────────────────────────────────

  it('flags a missing blank line before return', () => {
    expect(results.some((result) => isLineInCase(result.line, 'always-return-fire'))).toBe(
      true,
    )
  })

  it('accepts a blank line before return', () => {
    expect(results.some((result) => isLineInCase(result.line, 'always-return-ok'))).toBe(false)
  })

  // ── always(directive, *) ───────────────────────────────────────────────────

  it('flags a missing blank line after a directive prologue', () => {
    expect(results.some((result) => isLineInCase(result.line, 'always-directive-fire'))).toBe(
      true,
    )
  })

  it('accepts a blank line after a directive prologue', () => {
    expect(results.some((result) => isLineInCase(result.line, 'always-directive-ok'))).toBe(
      false,
    )
  })

  // ── always(*, multiline-block-like) ───────────────────────────────────────

  it('flags a missing blank line before a multiline block-like statement', () => {
    expect(results.some((result) => isLineInCase(result.line, 'always-mlb-fire'))).toBe(true)
  })

  it('accepts a blank line before a multiline block-like statement', () => {
    expect(results.some((result) => isLineInCase(result.line, 'always-mlb-ok'))).toBe(false)
  })

  // ── any(*, if) — relaxes always(*, MLB) for co-located early returns ──────

  it('does NOT require a blank line before an if block (co-located guard)', () => {
    expect(results.some((result) => isLineInCase(result.line, 'relax-if'))).toBe(false)
  })

  // ── any(singleline-const, for/while/do) ───────────────────────────────────

  it('does NOT require a blank line between a const and a for loop', () => {
    expect(results.some((result) => isLineInCase(result.line, 'relax-const-for'))).toBe(false)
  })

  it('does NOT require a blank line between a const and a while loop', () => {
    expect(results.some((result) => isLineInCase(result.line, 'relax-const-while'))).toBe(
      false,
    )
  })

  it('does NOT require a blank line between a const and a do-while loop', () => {
    expect(results.some((result) => isLineInCase(result.line, 'relax-const-do'))).toBe(false)
  })

  // ── any(singleline-let, multiline-block-like) ─────────────────────────────

  it('does NOT require a blank line between a let and a loop body', () => {
    expect(results.some((result) => isLineInCase(result.line, 'relax-let-mlb'))).toBe(false)
  })

  // ── any(*, function) — relaxed for co-located declarations ────────────────

  it('does NOT require a blank line between a const and its associated function', () => {
    expect(results.some((result) => isLineInCase(result.line, 'relax-const-fn'))).toBe(false)
  })

  it('does NOT require a blank line between a let and its associated function', () => {
    expect(results.some((result) => isLineInCase(result.line, 'relax-let-fn'))).toBe(false)
  })

  it('does NOT require a blank line when an interface precedes its function', () => {
    expect(results.some((result) => isLineInCase(result.line, 'relax-interface-fn'))).toBe(
      false,
    )
  })

  it('does NOT require a blank line when a type alias precedes its function', () => {
    expect(results.some((result) => isLineInCase(result.line, 'relax-type-fn'))).toBe(false)
  })

  // ── always(function, function) ────────────────────────────────────────────

  it('flags a missing blank line between consecutive function declarations', () => {
    expect(results.some((result) => isLineInCase(result.line, 'fire-fn-fn'))).toBe(true)
  })

  it('accepts a blank line between consecutive function declarations', () => {
    expect(results.some((result) => isLineInCase(result.line, 'ok-fn-fn'))).toBe(false)
  })

  // ── always(class, function) ───────────────────────────────────────────────

  it('flags a missing blank line between a class and a following function', () => {
    expect(results.some((result) => isLineInCase(result.line, 'fire-class-fn'))).toBe(true)
  })

  it('accepts a blank line between a class and a following function', () => {
    expect(results.some((result) => isLineInCase(result.line, 'ok-class-fn'))).toBe(false)
  })

  // ── always(expression, function) ─────────────────────────────────────────

  it('flags a missing blank line between a call expression and a function', () => {
    expect(results.some((result) => isLineInCase(result.line, 'fire-expression-fn'))).toBe(
      true,
    )
  })

  it('accepts a blank line between a call expression and a function', () => {
    expect(results.some((result) => isLineInCase(result.line, 'ok-expression-fn'))).toBe(false)
  })

  // ── always(multiline-expression, function) ────────────────────────────────

  it('flags a missing blank line between a multiline call and a function', () => {
    expect(
      results.some((result) => isLineInCase(result.line, 'fire-multiline-expression-fn')),
    ).toBe(true)
  })

  it('accepts a blank line between a multiline call and a function', () => {
    expect(
      results.some((result) => isLineInCase(result.line, 'ok-multiline-expression-fn')),
    ).toBe(false)
  })

  // ── regression guard ─────────────────────────────────────────────────────

  it('fires exactly 7 padding violations in the fixture (regression guard)', () => {
    expect(results).toHaveLength(7)
  })
})

describe('JSX attribute quote style)', () => {
  async function lintJsx(file: string): Promise<Awaited<ReturnType<typeof lint>>> {
    return await callAtDir('test/fixtures/jsx-project', async () => await lint(file))
  }

  it('flags single-quoted JSX attributes', async () => {
    const results = await lintJsx('single-quotes.tsx')

    expect(results).toContainEqual(expect.objectContaining({ ruleId: 'prettier/prettier' }))
  })

  it('accepts double-quoted JSX attributes', async () => {
    const results = await lintJsx('double-quotes.tsx')

    expect(results).toEqual([])
  })
})

describe('vue version-gated rules fire on the right constructs', () => {
  async function lintVueFile(file: string): Promise<Awaited<ReturnType<typeof lint>>> {
    return await callAtDir('test/fixtures/vue-project', async () => await lint(file))
  }

  it('vue/prefer-use-template-ref flags a ref() bound to a template ref (Vue 3.5+ API)', async () => {
    const results = await lintVueFile('TemplateRef.vue')

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'vue/prefer-use-template-ref' }),
    )
  })

  it('vue/html-self-closing flags an unclosed void element', async () => {
    const results = await lintVueFile('SelfClosing.vue')

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'vue/html-self-closing' }),
    )
  })

  it('vue/max-template-depth flags nesting one level past the limit (depth 9)', async () => {
    const results = await lintVueFile('DeepTemplate.vue')

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'vue/max-template-depth' }),
    )
  })

  it('vue/max-template-depth accepts nesting at the limit (depth 8)', async () => {
    const results = await lintVueFile('ShallowTemplate.vue')
    const matching = results.filter((finding) => finding.ruleId === 'vue/max-template-depth')

    expect(matching).toEqual([])
  })
})

describe('prettier-vue rules fire on .vue files', () => {
  it('prettier-vue/prettier flags formatting issues', async () => {
    const results = await callAtDir(
      'test/fixtures/vue-project',
      async () => await lint('Component.vue'),
    )

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'prettier-vue/prettier' }),
    )
  })
})

describe('tailwindcss rules are registered on .vue files when tailwindcss is a dep', () => {
  it('tailwindcss/classnames-order is active', async () => {
    // Checking rule registration rather than linting a file: running the rule requires a live
    // tailwindcss install in the fixture cwd, which would make this an integration test.
    const severity = await callAtDir(
      'test/fixtures/tailwind-project',
      async () => await resolveRule('Component.vue', 'tailwindcss/classnames-order'),
    )

    expect(severity).toBeDefined()
    expect(severity![0]).not.toBe('off')
  })
})

describe('TOML files lint without prettier parse failures', () => {
  /*
   * Before excluding TOML from the prettier block, prettier had no parser for it and fell
   * back to a JS parse: section headers parsed as array literals and hyphenated bare keys
   * (`default-features = false`) errored as invalid assignments, so every Cargo.toml failed.
   */
  it('a Cargo-style manifest with hyphenated keys produces no parsing errors', async () => {
    const results = await lint('test/fixtures/manifest.toml')

    const parseFailures = results.filter((result) => result.message.includes('Parsing error'))
    const prettierFindings = results.filter((result) => result.ruleId === 'prettier/prettier')

    expect(parseFailures).toEqual([])
    expect(prettierFindings).toEqual([])
  })
})
