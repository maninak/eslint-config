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

describe('type-aware overrides apply when tsconfigPath is set', () => {
  it('ts/no-confusing-void-expression ignores arrow shorthand', async () => {
    const rule = await resolveRule(tsFixturePath, 'ts/no-confusing-void-expression', tsOptions)

    expect(rule).toMatchObject(['warn', { ignoreArrowShorthand: true }])
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

describe('maninak/prefer-concise-async-arrow', () => {
  /*
   * Prettier always expands `async () => { await expr }` to multiline. The concise form
   * `async () => await expr` is semantically equivalent and prettier leaves it alone.
   * The rule auto-fixes in the right direction so prettier/prettier stops firing.
   */
  const fixturePath = 'test/fixtures/inline-callback.ts'
  const ruleId = 'maninak/prefer-concise-async-arrow'

  function getCaseArea(caseName: string): { start: number; end: number } {
    const lines = readFileSync(fixturePath, 'utf-8').split('\n')
    const startIdx = lines.findIndex((ln) => ln.includes(`@case ${caseName}`))

    if (startIdx === -1) {
      throw new Error(`Case not found: ${caseName}`)
    }

    const endIdx = lines.findIndex((ln, idx) => idx > startIdx && ln.includes('@case'))
    const start = startIdx + 2
    const end = endIdx === -1 ? lines.length : endIdx + 1

    return { start, end }
  }

  function caseHasViolation(
    results: Awaited<ReturnType<typeof lint>>,
    caseName: string,
  ): boolean {
    const { start, end } = getCaseArea(caseName)

    return results.some(
      (result) => result.ruleId === ruleId && result.line >= start && result.line <= end,
    )
  }

  it('fires on a single-await block body (at warn severity)', async () => {
    const results = await lint(fixturePath)

    expect(results).toContainEqual(expect.objectContaining({ ruleId, severity: 1 }))
  })

  it('does NOT fire when the block body has more than one statement', async () => {
    const results = await lint(fixturePath)

    expect(caseHasViolation(results, 'multi-statement')).toBe(false)
  })

  it('still fires (reports) when a comment sits inside the block', async () => {
    const results = await lint(fixturePath)

    expect(caseHasViolation(results, 'comment-inside')).toBe(true)
  })

  it('auto-fixes to the concise form prettier accepts without rewriting', async () => {
    const fixed = await lintAndFix(fixturePath)

    expect(fixed).toContain('async () => await initGitRepo()')
    expect(fixed).not.toContain('{ await initGitRepo() }')
  })

  it('preserves the return-type annotation and typed params in the fix', async () => {
    const fixed = await lintAndFix(fixturePath)

    // Body-only replacement keeps `: Promise<void>` and the typed param; a from-scratch
    // reconstruction of the node from `node.params` would have dropped both.
    expect(fixed).toContain('async (): Promise<void> => await teardown()')
    expect(fixed).toContain('async (count: number): Promise<void> => await consume(count)')
  })

  it('does NOT fix (keeps the block) when that would drop an inner comment', async () => {
    const fixed = await lintAndFix(fixturePath)

    expect(fixed).toContain('// keep this note')
    expect(fixed).not.toContain('async () => await boot()')
  })

  it('reaches a fixed point (a second fix pass changes nothing)', async () => {
    const fixed = await lintAndFix(fixturePath)
    const { writeFileSync, rmSync } = await import('node:fs')
    const settledPath = 'test/fixtures/async-arrow-settled.ts'
    writeFileSync(settledPath, fixed)

    try {
      const refixed = await lintAndFix(settledPath)

      expect(refixed).toBe(fixed)
    } finally {
      rmSync(settledPath, { force: true })
    }
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

describe('framework detection scans workspace sub-packages, not just the root', () => {
  /*
   * The fixture is a pnpm workspace whose root package.json declares no framework; `vue` and
   * `nuxt` live in `packages/web`. Detecting them across the workspace is what lets a plain
   * `maninak()` lint `.vue` files without the consumer passing `vue: true` or a `max-len`
   * override, which was the recurring per-repo workaround.
   */
  async function lintMonorepoVue(): Promise<Awaited<ReturnType<typeof lint>>> {
    return await callAtDir(
      'test/fixtures/monorepo-vue',
      async () => await lint('packages/web/Component.vue'),
    )
  }

  it('enables Vue rules when vue is declared only in a sub-package', async () => {
    const results = await lintMonorepoVue()

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'vue/define-props-declaration' }),
    )
  })

  it('turns max-len off for .vue so a long unwrappable template line is not flagged', async () => {
    // Without workspace detection the maninak Vue blocks (which hand formatting to
    // prettier-vue and thus disable max-len) never activate here, so the long <p title="...">
    // line would be reported. This proves the whole Vue block, not just antfu's parser, is on.
    const results = await lintMonorepoVue()
    const maxLen = results.filter((finding) => finding.ruleId === 'max-len')

    expect(maxLen).toEqual([])
  })

  it('disables vue/no-undef-components when nuxt is present in the workspace', async () => {
    const results = await lintMonorepoVue()
    const undef = results.filter((finding) => finding.ruleId === 'vue/no-undef-components')

    expect(undef).toEqual([])
  })

  it('keeps vue/no-undef-components ON for a plain (non-nuxt) Vue project', async () => {
    // The paired assertion that makes the nuxt-off case above non-vacuous: the identical
    // undefined-component construct MUST still report in a Vue project without nuxt.
    const results = await callAtDir(
      'test/fixtures/vue-project',
      async () => await lint('UndefComponent.vue'),
    )

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'vue/no-undef-components' }),
    )
  })

  it('exempts a nested Nuxt convention file (pages/) from vue/multi-word-component-names', async () => {
    // Nuxt dictates single-word names for pages/layouts/error/app files, so its config turns
    // vue/multi-word-component-names off for them. Those globs are root-anchored, so a Nuxt
    // app in a sub-package (packages/web here) needs the globs broadened to match. Without
    // that, `pages/index.vue` gets flagged with a name it cannot legally change (taiga-grove).
    const results = await callAtDir(
      'test/fixtures/monorepo-vue',
      async () => await lint('packages/web/pages/index.vue'),
    )
    const flagged = results.filter(
      (finding) => finding.ruleId === 'vue/multi-word-component-names',
    )

    expect(flagged).toEqual([])
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

describe('maninak/jsdoc-oneline', () => {
  const fixturePath = 'test/fixtures/jsdoc-oneline.ts'
  const ruleId = 'maninak/jsdoc-oneline'
  const expected = '/** Copies the sandbox identity into `altNodeHomePath`. */'

  function getCaseArea(caseName: string): { start: number; end: number } {
    const lines = readFileSync(fixturePath, 'utf-8').split('\n')
    const startIdx = lines.findIndex((ln) => ln.includes(`@case ${caseName}`))

    if (startIdx === -1) {
      throw new Error(`Case not found: ${caseName}`)
    }

    const endIdx = lines.findIndex((ln, idx) => idx > startIdx && ln.includes('@case'))
    const start = startIdx + 2
    const end = endIdx === -1 ? lines.length : endIdx + 1

    return { start, end }
  }

  function caseHasViolation(
    results: Awaited<ReturnType<typeof lint>>,
    caseName: string,
  ): boolean {
    const { start, end } = getCaseArea(caseName)

    return results.some(
      (result) => result.ruleId === ruleId && result.line >= start && result.line <= end,
    )
  }

  const malformed = [
    'multiline-clean',
    'multiline-extra-spaces',
    'dangling-close',
    'no-inner-spaces',
    'double-leading-space',
    'missing-trailing-space',
  ]

  for (const caseName of malformed) {
    it(`flags the ${caseName} block`, async () => {
      const results = await lint(fixturePath)

      expect(caseHasViolation(results, caseName)).toBe(true)
    })
  }

  it('leaves a tag-bearing block untouched', async () => {
    const results = await lint(fixturePath)

    expect(caseHasViolation(results, 'keep-tagged')).toBe(false)
  })

  it('leaves a multi-paragraph block untouched', async () => {
    const results = await lint(fixturePath)

    expect(caseHasViolation(results, 'keep-multiparagraph')).toBe(false)
  })

  it('leaves a block untouched when its one-line form would exceed the print width', async () => {
    const results = await lint(fixturePath)

    expect(caseHasViolation(results, 'keep-too-long')).toBe(false)
  })

  it('auto-fix collapses every malformed variant to the same one-line form', async () => {
    const fixed = await lintAndFix(fixturePath)
    const occurrences = fixed.split('\n').filter((line) => line.trim() === expected)

    // All six malformed cases must collapse to the identical single-line comment.
    expect(occurrences).toHaveLength(6)
    // The tag-bearing and multi-paragraph blocks must remain multiline (still contain ` * `).
    expect(fixed).toContain('* @param x the input value')
    expect(fixed).toContain('* Second paragraph of the description.')
    // The too-long block must also stay multiline (fix would have overflowed the print width).
    expect(fixed).toContain('* This description is deliberately long enough')
  })

  it('reaches a fixed point (a second fix pass changes nothing)', async () => {
    const fixed = await lintAndFix(fixturePath)
    const { writeFileSync, rmSync } = await import('node:fs')
    const settledPath = 'test/fixtures/jsdoc-oneline-settled.ts'
    writeFileSync(settledPath, fixed)

    try {
      const refixed = await lintAndFix(settledPath)

      expect(refixed).toBe(fixed)
    } finally {
      rmSync(settledPath, { force: true })
    }
  })
})

describe('maninak/jsdoc-max-len', () => {
  const fixturePath = 'test/fixtures/jsdoc-max-len.ts'
  const ruleId = 'maninak/jsdoc-max-len'
  const a50 = 'a'.repeat(50)
  const b50 = 'b'.repeat(50)

  function getCaseArea(caseName: string): { start: number; end: number } {
    const lines = readFileSync(fixturePath, 'utf-8').split('\n')
    const startIdx = lines.findIndex((ln) => ln.includes(`@case ${caseName}`))

    if (startIdx === -1) {
      throw new Error(`Case not found: ${caseName}`)
    }

    const endIdx = lines.findIndex((ln, idx) => idx > startIdx && ln.includes('@case'))
    const start = startIdx + 2
    const end = endIdx === -1 ? lines.length : endIdx + 1

    return { start, end }
  }

  function caseHasViolation(
    results: Awaited<ReturnType<typeof lint>>,
    caseName: string,
  ): boolean {
    const { start, end } = getCaseArea(caseName)

    return results.some(
      (result) => result.ruleId === ruleId && result.line >= start && result.line <= end,
    )
  }

  const fireCases = ['wrap-oneline-fire', 'wrap-param-fire', 'wrap-prose-fire']

  for (const caseName of fireCases) {
    it(`flags the overflowing ${caseName} block`, async () => {
      const results = await lint(fixturePath)

      expect(caseHasViolation(results, caseName)).toBe(true)
    })
  }

  const keepCases = [
    'short-ok',
    'keep-fence-ok',
    'keep-example-ok',
    'keep-inline-tag-ok',
    'keep-table-ok',
    'keep-url-ok',
    'keep-trailing-ok',
    'keep-inline-closer-ok',
  ]

  for (const caseName of keepCases) {
    it(`leaves the ${caseName} block untouched`, async () => {
      const results = await lint(fixturePath)

      expect(caseHasViolation(results, caseName)).toBe(false)
    })
  }

  it('auto-fix rewrites a too-long one-line block as an exact multiline block', async () => {
    const fixed = await lintAndFix(fixturePath)

    expect(fixed).toContain(`/**\n * ${a50}\n * ${b50}\n */`)
  })

  it('auto-fix wraps a long @param line, keeping the tag on the first line', async () => {
    const fixed = await lintAndFix(fixturePath)

    expect(fixed).toContain(` * @param foo ${a50}\n * ${b50} more`)
  })

  it('auto-fix wraps a long prose line so the opening words now fit the limit', async () => {
    const fixed = await lintAndFix(fixturePath)
    const proseLine = fixed
      .split('\n')
      .find((line) => line.includes('This description line is deliberately written'))

    // The original prose line is 123 columns. After wrapping, the line carrying its opening
    // words must fit the limit (proving the wrap happened; word preservation is locked by the
    // exact one-line and @param assertions above).
    expect(proseLine !== undefined && proseLine.length <= 95).toBe(true)
  })

  it('keeps the deliberately-skipped long lines byte-for-byte', async () => {
    const fixed = await lintAndFix(fixturePath)

    expect(fixed).toContain(
      'const veryLongVariableName = someFunction(withArgs, thatPush, thisCodeLine, wellPastNinetyFive)',
    )

    expect(fixed).toContain(
      'See {@link SomeVeryLongReferenceIdentifier} for the complete explanation of how this behaves ok.',
    )

    expect(fixed).toContain(
      'https://example.com/some/really/long/path/segment/that/has/no/spaces/and/cannot/be/wrapped/at/all',
    )
    // The trailing block comment is not converted to multiline (code precedes it on the line).
    expect(fixed).toContain('export const _trailing = 1 /**')
  })

  it('reaches a fixed point (a second fix pass changes nothing)', async () => {
    const fixed = await lintAndFix(fixturePath)
    const { writeFileSync, rmSync } = await import('node:fs')
    const settledPath = 'test/fixtures/jsdoc-max-len-settled.ts'
    writeFileSync(settledPath, fixed)

    try {
      const refixed = await lintAndFix(settledPath)

      expect(refixed).toBe(fixed)
    } finally {
      rmSync(settledPath, { force: true })
    }
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

  it('fires exactly 6 padding violations in the fixture (regression guard)', () => {
    expect(results).toHaveLength(6)
  })
})

describe('maninak/compact-return', () => {
  const fixturePath = 'test/fixtures/compact-return.ts'
  const ruleId = 'maninak/compact-return'

  function getCaseArea(caseName: string): { start: number; end: number } {
    const lines = readFileSync(fixturePath, 'utf-8').split('\n')
    const startIdx = lines.findIndex((ln) => ln.includes(`@case ${caseName}`))

    if (startIdx === -1) {
      throw new Error(`Case not found: ${caseName}`)
    }

    const endIdx = lines.findIndex((ln, idx) => idx > startIdx && ln.includes('@case'))
    const start = startIdx + 2
    const end = endIdx === -1 ? lines.length : endIdx + 1

    return { start, end }
  }

  function caseHasViolation(
    results: Awaited<ReturnType<typeof lint>>,
    caseName: string,
  ): boolean {
    const { start, end } = getCaseArea(caseName)

    return results.some(
      (result) => result.ruleId === ruleId && result.line >= start && result.line <= end,
    )
  }

  it('flags a blank line before return in a two-statement body', async () => {
    const results = await lint(fixturePath)

    expect(caseHasViolation(results, 'compact-blank-fire')).toBe(true)
  })

  it('accepts an already-compact two-statement body', async () => {
    const results = await lint(fixturePath)

    expect(caseHasViolation(results, 'compact-no-blank-ok')).toBe(false)
  })

  it('accepts a blank line before return in a three-statement body', async () => {
    const results = await lint(fixturePath)

    expect(caseHasViolation(results, 'noncompact-blank-ok')).toBe(false)
  })

  it('requires a blank line before return in a three-statement body without one', async () => {
    const results = await lint(fixturePath)

    expect(caseHasViolation(results, 'noncompact-no-blank-fire')).toBe(true)
  })

  it('treats a two-statement body as non-compact when the first statement is multiline', async () => {
    const results = await lint(fixturePath)

    expect(caseHasViolation(results, 'compact-multiline-prev-ok')).toBe(false)
  })

  it('ignores a return that is the first statement in its block', async () => {
    const results = await lint(fixturePath)

    expect(caseHasViolation(results, 'return-first-ok')).toBe(false)
  })

  it('does NOT flag a single-return switch case (the old always(*, return) footgun)', async () => {
    const results = await lint(fixturePath)

    expect(caseHasViolation(results, 'switch-case-return-ok')).toBe(false)
  })

  it('auto-fix collapses the compact blank and reaches a fixed point', async () => {
    const fixed = await lintAndFix(fixturePath)

    expect(fixed).toMatch(/const _doubled = _x \* 2\n {2}return _doubled/)
    expect(fixed).toMatch(/const _tripled = _x \* 3\n\n {2}return _doubled \+ _tripled/)
  })

  it('fixes a compact blank with a standalone comment in the gap, keeping the comment', async () => {
    const fixed = await lintAndFix(fixturePath)

    // The blank line is removed but the standalone comment survives on its own line.
    expect(fixed).toMatch(
      /const _doubled = _x \* 2\n {2}\/\/ keep this explanation\n {2}return _doubled/,
    )
  })

  it('removes the blank while keeping a trailing comment (the try-block guard pattern)', async () => {
    const fixed = await lintAndFix(fixturePath)

    // This is the reported case: `void _x // comment` then a blank then `return`. The blank
    // must go and the trailing comment must stay on the previous statement's line.
    expect(fixed).toMatch(/void _x \/\/ getter will throw if disposed\n {4}return false/)
  })

  it('adds the required blank AFTER a trailing comment, not splitting the comment off', async () => {
    const fixed = await lintAndFix(fixturePath)

    expect(fixed).toMatch(
      /const _tripled = _x \* 3 \/\/ scaled up\n\n {2}return _doubled \+ _tripled/,
    )
  })

  it('reaches a fixed point (a second fix pass changes nothing)', async () => {
    const fixed = await lintAndFix(fixturePath)
    const { writeFileSync, rmSync } = await import('node:fs')
    const settledPath = 'test/fixtures/compact-return-settled.ts'
    writeFileSync(settledPath, fixed)

    try {
      const refixed = await lintAndFix(settledPath)

      expect(refixed).toBe(fixed)
    } finally {
      rmSync(settledPath, { force: true })
    }
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

describe('error-handling rules from newer eslint cores', () => {
  /*
   * `@nuxt/eslint-config` turns both on, so before this they applied to Nuxt consumers only
   * and silently skipped every other project. Both need an eslint newer than the preset's
   * old `^9.10.0` peer floor, which is why that floor moved to `^9.35.0`.
   */
  const fixture = 'test/fixtures/error-handling.ts'

  it('no-unassigned-vars flags a let that is read but never assigned', async () => {
    const results = await lint(fixture)

    expect(results).toContainEqual(expect.objectContaining({ ruleId: 'no-unassigned-vars' }))
  })

  it('preserve-caught-error flags a re-throw that drops the caught error', async () => {
    const results = await lint(fixture)

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'preserve-caught-error' }),
    )
  })

  it('allows a deliberate bare catch, since requireCatchParameter stays off', async () => {
    // `no-empty` already permits `catch {}`; requiring a parameter would contradict it. The
    // fixture holds exactly one bare catch, so only the re-throw above may be reported.
    const results = await lint(fixture)
    const reported = results.filter((finding) => finding.ruleId === 'preserve-caught-error')

    expect(reported).toHaveLength(1)
    expect(reported[0]?.line).toBe(16)
  })
})

describe('unicorn rules reach .vue files', () => {
  /*
   * antfu v9.3 scoped its unicorn block to a JS/TS glob, which silently stopped 14 rules
   * reaching SFCs, where a Vue or Nuxt consumer keeps most of its code. The preset mirrors
   * that block onto `.vue`, so this asserts the rules actually run there.
   */
  it('unicorn/error-message fires on a message-less Error thrown inside an SFC', async () => {
    const results = await callAtDir(
      'test/fixtures/vue-project',
      async () => await lint('UnicornRules.vue'),
    )

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'unicorn/error-message' }),
    )
  })

  it('keeps prettier-vue winning over the mirrored block for formatting rules', async () => {
    // The mirror is inserted directly after antfu's unicorn block so every later block still
    // overrides it. antfu sets `unicorn/number-literal-case` to error and
    // `maninak/prettier-vue` turns it off for SFCs; appending the mirror at the end instead
    // would resurrect it and put it back in conflict with prettier.
    const severity = await callAtDir(
      'test/fixtures/vue-project',
      async () => await resolveRule('Component.vue', 'unicorn/number-literal-case'),
    )

    expect(severity?.[0]).toBe('off')
  })

  it('keeps checking NaN in unicorn/prefer-number-properties', async () => {
    // antfu 9.3 flipped `checkNaN` off; the global `isNaN` coerces, so this stays on.
    const severity = await resolveRule('src/config.ts', 'unicorn/prefer-number-properties')

    expect(severity?.[0]).not.toBe('off')
    expect(severity?.[1]).toMatchObject({ checkNaN: true })
  })
})

describe('a Nuxt consumer gets a usable config despite duplicate plugin registrations', () => {
  /*
   * antfu and @nuxt/eslint-config both register `ts` and `vue`. When their transitive plugin
   * copies fail to dedupe, flat config throws `Cannot redefine plugin` on the first file
   * linted, killing lint entirely for every Nuxt consumer.
   */
  it('resolves a config for a Nuxt sub-package file without throwing', async () => {
    const severity = await callAtDir(
      'test/fixtures/monorepo-vue',
      async () => await resolveRule('packages/web/Component.vue', 'vue/no-dupe-keys'),
    )

    expect(severity).toBeDefined()
  })

  it("keeps Nuxt's own rules, so the blocks are not dropped wholesale", async () => {
    const severity = await callAtDir(
      'test/fixtures/monorepo-vue',
      async () => await resolveRule('packages/web/Component.vue', 'nuxt/prefer-import-meta'),
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

  /*
   * `spaced-comment` reads a TOML `#` comment as an unbalanced JS block comment and demands a
   * space before its terminator. taiga-grove's only recourse was ignoring `rust/**\/*.toml`
   * outright, which also lost it any real TOML linting.
   */
  it('does not report JS comment rules on a TOML `#` comment', async () => {
    const results = await lint('test/fixtures/manifest.toml')
    const jsCommentRules = results.filter((result) =>
      ['spaced-comment', 'maninak/jsdoc-max-len', 'maninak/jsdoc-oneline'].includes(
        result.ruleId ?? '',
      ),
    )

    expect(jsCommentRules).toEqual([])
  })

  it('still enforces spaced-comment on TypeScript, so the scoping is not a blanket off', async () => {
    const results = await lint('test/fixtures/comment-spacing.ts')

    expect(results).toContainEqual(expect.objectContaining({ ruleId: 'spaced-comment' }))
  })
})
