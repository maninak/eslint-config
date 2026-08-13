import type { LintResult } from './helpers.js'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import maninak from '../src/index.js'
import { callAtDir, lint, lintAndFix, lintAndFixRule, resolveRule } from './helpers.js'

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

describe('requireJsdoc accepts an options object', () => {
  /*
   * The boolean form only ever reached a hard-coded utils/lib/helpers glob set, so a consumer
   * whose reusable API lives elsewhere had to hand-roll the whole flat-config block. These
   * lock in the object form: custom globs, the union form, severity, and the test exemption
   * that must survive a caller-supplied glob.
   */
  async function lintJsdocFixture(
    file: string,
    options: Parameters<typeof maninak>[0],
  ): Promise<Awaited<ReturnType<typeof lint>>> {
    return await callAtDir(
      'test/fixtures/jsdoc-project',
      async () => await lint(file, options),
    )
  }

  function requireJsdocOf(results: Awaited<ReturnType<typeof lint>>): LintResult[] {
    return results.filter((finding) => finding.ruleId === 'jsdoc/require-jsdoc')
  }

  it('`true` still enforces the utility-code defaults', async () => {
    const results = await lintJsdocFixture('src/utils/exports.ts', { requireJsdoc: true })

    expect(requireJsdocOf(results)).toHaveLength(1)
  })

  it('`files` enforces on a directory the defaults never reach', async () => {
    const results = await lintJsdocFixture('src/domain/service.ts', {
      requireJsdoc: { files: ['src/domain/**/*.ts'] },
    })

    expect(requireJsdocOf(results)).toHaveLength(1)
  })

  it('`files` REPLACES the defaults, so utils/ stops being enforced', async () => {
    const results = await lintJsdocFixture('src/utils/exports.ts', {
      requireJsdoc: { files: ['src/domain/**/*.ts'] },
    })

    expect(requireJsdocOf(results)).toEqual([])
  })

  it('`extraFiles` enforces on the defaults AND the extra globs', async () => {
    const options = { requireJsdoc: { extraFiles: ['src/domain/**/*.ts'] } }
    const onUtils = await lintJsdocFixture('src/utils/exports.ts', options)
    const onDomain = await lintJsdocFixture('src/domain/service.ts', options)

    expect(requireJsdocOf(onUtils)).toHaveLength(1)
    expect(requireJsdocOf(onDomain)).toHaveLength(1)
  })

  it("`severity: 'error'` reports at error severity", async () => {
    const results = await lintJsdocFixture('src/utils/exports.ts', {
      requireJsdoc: { severity: 'error' },
    })

    expect(requireJsdocOf(results)).toEqual([expect.objectContaining({ severity: 2 })])
  })

  it('defaults to warn severity', async () => {
    const results = await lintJsdocFixture('src/utils/exports.ts', { requireJsdoc: true })

    expect(requireJsdocOf(results)).toEqual([expect.objectContaining({ severity: 1 })])
  })

  it('`description: false` drops jsdoc/require-description', async () => {
    const [enabled, dropped] = await callAtDir('test/fixtures/jsdoc-project', async () => {
      return [
        await resolveRule('src/utils/exports.ts', 'jsdoc/require-description', {
          requireJsdoc: true,
        }),
        await resolveRule('src/utils/exports.ts', 'jsdoc/require-description', {
          requireJsdoc: { description: false },
        }),
      ]
    })

    expect(enabled).toEqual(['warn'])
    expect(dropped).toBeUndefined()
  })

  it('`require` merges over the defaults rather than replacing them', async () => {
    const rule = await callAtDir(
      'test/fixtures/jsdoc-project',
      async () =>
        await resolveRule('src/utils/exports.ts', 'jsdoc/require-jsdoc', {
          requireJsdoc: { require: { ArrowFunctionExpression: true } },
        }),
    )

    expect(rule).toMatchObject([
      'warn',
      {
        publicOnly: true,
        require: {
          FunctionDeclaration: true,
          MethodDefinition: true,
          ClassDeclaration: true,
          ArrowFunctionExpression: true,
          FunctionExpression: false,
        },
      },
    ])
  })

  it('exempts a test file even when the caller-supplied glob matches it', async () => {
    const results = await lintJsdocFixture('src/domain/service.test.ts', {
      requireJsdoc: { files: ['src/domain/**/*.ts'], severity: 'error' },
    })
    const jsdocFindings = results.filter(
      (finding) => finding.ruleId?.startsWith('jsdoc/') ?? false,
    )

    expect(jsdocFindings).toEqual([])
  })

  it('honours the deprecated requireJsdocInUtils alias', async () => {
    const results = await lintJsdocFixture('src/utils/exports.ts', {
      requireJsdocInUtils: true,
    })

    expect(requireJsdocOf(results)).toHaveLength(1)
  })

  it('requireJsdoc wins over the deprecated alias', async () => {
    const results = await lintJsdocFixture('src/utils/exports.ts', {
      requireJsdoc: false,
      requireJsdocInUtils: true,
    })

    expect(requireJsdocOf(results)).toEqual([])
  })
})

describe('filenameCase enforces a naming convention', () => {
  /*
   * The preset shipped no filename convention, so a consumer wanting camelCase modules and
   * PascalCase components had to hand-roll two blocks AND carve out every Vue/Nuxt path whose
   * filename is load-bearing. Getting that carve-out wrong flags `pages/`, `app.vue` and
   * `[id].vue`, and "fixing" those breaks the app's routes.
   */
  const ruleId = 'unicorn/filename-case'

  async function lintPlain(
    file: string,
    options: Parameters<typeof maninak>[0] = { filenameCase: true },
  ): Promise<Awaited<ReturnType<typeof lint>>> {
    return await callAtDir(
      'test/fixtures/filename-case',
      async () => await lint(file, options),
    )
  }

  async function lintNuxt(
    file: string,
    options: Parameters<typeof maninak>[0] = { filenameCase: true },
  ): Promise<Awaited<ReturnType<typeof lint>>> {
    return await callAtDir(
      'test/fixtures/filename-case-nuxt',
      async () => await lint(file, options),
    )
  }

  function caseFindings(results: Awaited<ReturnType<typeof lint>>): LintResult[] {
    return results.filter((finding) => finding.ruleId === ruleId)
  }

  it('flags a kebab-case .ts file', async () => {
    const results = await lintPlain('kebab-case.ts')

    expect(caseFindings(results)).toEqual([expect.objectContaining({ ruleId, severity: 2 })])
  })

  it('accepts a camelCase .ts file', async () => {
    const results = await lintPlain('camelCase.ts')

    expect(caseFindings(results)).toEqual([])
  })

  it('accepts all-lowercase single words, so index.ts and noise.ts pass', async () => {
    const onIndex = await lintPlain('index.ts')
    const onNoise = await lintPlain('noise.ts')

    expect(caseFindings(onIndex)).toEqual([])
    expect(caseFindings(onNoise)).toEqual([])
  })

  it('judges a multi-dot name on its leading segment only', async () => {
    const onCompliant = await lintPlain('foo.test.ts')
    const onOffending = await lintPlain('pack-io.worker.ts')

    expect(caseFindings(onCompliant)).toEqual([])
    expect(caseFindings(onOffending)).toEqual([
      expect.objectContaining({
        ruleId,
        message: expect.stringContaining('packIo.worker.ts') as unknown as string,
      }),
    ])
  })

  it('does NOT exempt pages/ when the consumer has no Vue or Nuxt dependency', async () => {
    const results = await lintPlain('pages/route-name.ts')

    expect(caseFindings(results)).toEqual([expect.objectContaining({ ruleId })])
  })

  it('does NOT fire by default (option off)', async () => {
    const results = await lintPlain('kebab-case.ts', {})

    expect(caseFindings(results)).toEqual([])
  })

  it('flags a kebab-case .vue component', async () => {
    const results = await lintNuxt('kebab-case.vue')

    expect(caseFindings(results)).toEqual([expect.objectContaining({ ruleId })])
  })

  it('accepts a PascalCase .vue component', async () => {
    const results = await lintNuxt('PascalCase.vue')

    expect(caseFindings(results)).toEqual([])
  })

  it.each([
    'app.vue',
    'error.vue',
    'nuxt.config.ts',
    'pages/foo-bar.vue',
    'pages/[id].vue',
    // Outside every carved-out directory, so this one is exempt purely by its brackets.
    '[custom].vue',
    'server/api/some-handler.ts',
  ])('exempts the Nuxt convention path %s', async (file) => {
    const results = await lintNuxt(file)

    expect(caseFindings(results)).toEqual([])
  })

  it('still flags a non-convention file in a Nuxt project', async () => {
    const results = await lintNuxt('kebab-case.ts')

    expect(caseFindings(results)).toEqual([expect.objectContaining({ ruleId })])
  })

  it('`ts: false` disables the script block while .vue stays enforced', async () => {
    const options = { filenameCase: { ts: false } } as const
    const onScript = await lintNuxt('kebab-case.ts', options)
    const onComponent = await lintNuxt('kebab-case.vue', options)

    expect(caseFindings(onScript)).toEqual([])
    expect(caseFindings(onComponent)).toEqual([expect.objectContaining({ ruleId })])
  })

  it('`vue: false` disables the component block while .ts stays enforced', async () => {
    const options = { filenameCase: { vue: false } } as const
    const onScript = await lintNuxt('kebab-case.ts', options)
    const onComponent = await lintNuxt('kebab-case.vue', options)

    expect(caseFindings(onScript)).toEqual([expect.objectContaining({ ruleId })])
    expect(caseFindings(onComponent)).toEqual([])
  })

  it('honours a custom casing and severity', async () => {
    const results = await lintPlain('camelCase.ts', {
      filenameCase: { ts: 'kebabCase', severity: 'warn' },
    })

    expect(caseFindings(results)).toEqual([expect.objectContaining({ ruleId, severity: 1 })])
  })

  it('honours extra ignore globs', async () => {
    const results = await lintPlain('kebab-case.ts', {
      filenameCase: { ignore: ['**/kebab-case.ts'] },
    })

    expect(caseFindings(results)).toEqual([])
  })
})

describe('markdown prose is soft-wrapped', () => {
  /*
   * Prettier defaults `proseWrap` to `preserve`, which enforces nothing: a hand-wrapped
   * paragraph keeps whatever line breaks the author typed and drifts further out of shape
   * with every edit. The preset sets `never`, so one paragraph, list item or table row is
   * one source line and the reader's client decides the display width.
   */
  const fixturePath = 'test/fixtures/prose-wrap.md'

  it('flags a hand-wrapped paragraph and a hand-wrapped list item', async () => {
    const results = await lint(fixturePath)
    const formatting = results.filter((finding) => finding.ruleId === 'prettier/prettier')

    expect(formatting.map((finding) => finding.line)).toEqual([3, 7])
  })

  it('collapses each block onto a single line when fixed', async () => {
    const fixed = await lintAndFix(fixturePath)
    const paragraph = fixed.split('\n').find((line) => line.startsWith('This paragraph'))

    expect(paragraph).toContain('collapses onto one line.')
    expect(fixed).toMatch(/^- A list item .*other shape the setting governs\.$/m)
  })
})

describe('ts/switch-exhaustiveness-check counts a default clause as no coverage', () => {
  /*
   * A `switch` over a discriminated union must name every member, otherwise adding a variant
   * compiles clean everywhere it is dispatched on and the new case silently takes whatever
   * the `default:` does. typescript-eslint's `considerDefaultExhaustiveForUnions` decides
   * whether a `default:` counts as covering the missing member; the version this preset pins
   * defaults it to `false`, which is the behaviour worth having. This test exists so a bump
   * that flips that default back is reported here rather than discovered as a shipped bug.
   */
  const fixturePath = 'test/fixtures/switch-exhaustiveness.ts'

  it('reports the missing union member even when a default clause is present', async () => {
    const results = await lint(fixturePath, tsOptions)
    const findings = results.filter(
      (finding) => finding.ruleId === 'ts/switch-exhaustiveness-check',
    )

    expect(findings).toEqual([
      expect.objectContaining({
        line: 13,
        message: 'Switch is not exhaustive. Cases not matched: "triangle"',
      }),
      expect.objectContaining({
        line: 24,
        message: 'Switch is not exhaustive. Cases not matched: "triangle"',
      }),
    ])
  })
})

describe('sortImports extends the import ordering without restating it', () => {
  /*
   * ESLint REPLACES a rule's options rather than merging them, so a consumer wanting one
   * extra import group had to copy the preset's whole `groups` array plus `internalPattern`,
   * `order`, `type` and both newline keys. radicle-vscode-extension's webviews config does
   * exactly that today, and that copy stops tracking this preset the moment any of those
   * change. These lock in that a custom group can be spliced in while everything else stays
   * owned by the preset.
   */
  const ruleId = 'perfectionist/sort-imports'
  const extensionInternal = {
    groupName: 'extension-internal',
    elementNamePattern: '^extension(?:Utils|Helpers)/',
  }

  it('keeps every preset option the consumer did not name', async () => {
    const rule = await resolveRule(tsFixturePath, ruleId, {
      sortImports: { customGroups: [{ ...extensionInternal, after: 'value-external' }] },
    })

    expect(rule?.[0]).toBe('warn')
    expect(rule?.[1]).toMatchObject({
      internalPattern: ['^@/', '^~/'],
      newlinesBetween: 'ignore',
      newlinesInside: 'ignore',
      order: 'asc',
      type: 'natural',
    })
  })

  it('splices the custom group in after the named preset group', async () => {
    const rule = await resolveRule(tsFixturePath, ruleId, {
      sortImports: { customGroups: [{ ...extensionInternal, after: 'value-external' }] },
    })
    const groups = (rule?.[1] as { groups: unknown[] }).groups

    expect(groups).toEqual([
      'type-import',
      ['type-parent', 'type-sibling', 'type-index', 'type-internal'],
      'value-builtin',
      'value-external',
      'extension-internal',
      'value-internal',
      ['value-parent', 'value-sibling', 'value-index'],
      'side-effect',
      'ts-equals-import',
      'unknown',
    ])
  })

  it('splices before the named preset group when `before` is used', async () => {
    const rule = await resolveRule(tsFixturePath, ruleId, {
      sortImports: { customGroups: [{ ...extensionInternal, before: 'value-internal' }] },
    })
    const groups = (rule?.[1] as { groups: unknown[] }).groups

    expect(groups[4]).toBe('extension-internal')
    expect(groups[5]).toBe('value-internal')
  })

  it('places a group with no `after`/`before` just ahead of the `unknown` catch-all', async () => {
    const rule = await resolveRule(tsFixturePath, ruleId, {
      sortImports: { customGroups: [extensionInternal] },
    })
    const groups = (rule?.[1] as { groups: unknown[] }).groups

    expect(groups.at(-2)).toBe('extension-internal')
    expect(groups.at(-1)).toBe('unknown')
  })

  it('finds a target nested inside one of the preset bundles', async () => {
    // `value-sibling` only exists inside the ['value-parent', 'value-sibling', 'value-index']
    // bundle, so a placement naming it must look through nested entries, not just top-level.
    const rule = await resolveRule(tsFixturePath, ruleId, {
      sortImports: { customGroups: [{ ...extensionInternal, after: 'value-sibling' }] },
    })
    const groups = (rule?.[1] as { groups: unknown[] }).groups
    const insertedAt = groups.indexOf('extension-internal')

    expect(groups[insertedAt - 1]).toEqual(['value-parent', 'value-sibling', 'value-index'])

    expect(groups[insertedAt + 1]).toBe('side-effect')
  })

  it('strips the placement keys before handing the group to perfectionist', async () => {
    const rule = await resolveRule(tsFixturePath, ruleId, {
      sortImports: { customGroups: [{ ...extensionInternal, after: 'value-external' }] },
    })
    const { customGroups } = rule?.[1] as { customGroups: Record<string, unknown>[] }

    expect(customGroups).toEqual([extensionInternal])
  })

  it('replaces internalPattern when given', async () => {
    const rule = await resolveRule(tsFixturePath, ruleId, {
      sortImports: { internalPattern: ['^#/'] },
    })

    expect(rule?.[1]).toMatchObject({ internalPattern: ['^#/'] })
  })

  it('throws when a custom group name collides with one already in the ordering', async () => {
    async function build(): Promise<unknown> {
      return await maninak({
        sortImports: {
          customGroups: [{ ...extensionInternal, groupName: 'value-internal' }],
        },
      })
    }

    await expect(build).rejects.toThrow(/"value-internal" collides with a group already/)
  })

  it('throws when a placement names a group the preset does not have', async () => {
    async function build(): Promise<unknown> {
      return await maninak({
        sortImports: { customGroups: [{ ...extensionInternal, after: 'value-nonsense' }] },
      })
    }

    await expect(build).rejects.toThrow(/"value-nonsense", which is not one of the preset/)
  })

  it('makes a monorepo-internal alias layout legal on real code', async () => {
    const fixture = 'test/fixtures/sort-imports/unsorted.ts'
    const withoutGroup = await lint(fixture)
    const withGroup = await lint(fixture, {
      sortImports: { customGroups: [{ ...extensionInternal, after: 'value-external' }] },
    })

    function sortFindings(results: Awaited<ReturnType<typeof lint>>): LintResult[] {
      return results.filter((finding) => finding.ruleId === ruleId)
    }

    expect(sortFindings(withoutGroup)).toEqual([expect.objectContaining({ ruleId })])
    expect(sortFindings(withGroup)).toEqual([])
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

  const c50 = 'c'.repeat(50)
  const d50 = 'd'.repeat(50)
  const f50 = 'f'.repeat(50)
  const g50 = 'g'.repeat(50)
  const h50 = 'h'.repeat(50)
  const i50 = 'i'.repeat(50)
  const j50 = 'j'.repeat(50)
  const k50 = 'k'.repeat(50)

  const fireCases = [
    'wrap-oneline-fire',
    'wrap-param-fire',
    'wrap-prose-fire',
    'wrap-paragraph-fire',
    'wrap-above-url-fire',
    'wrap-oneline-indented-fire',
  ]

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

  it('auto-fix keeps the original indent when expanding an indented one-line block', async () => {
    const fixed = await lintAndFixRule(fixturePath, ruleId)

    expect(fixed).toContain(`{\n  /**\n   * ${j50}\n   * ${k50}\n   */`)
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

  it('auto-fix reflows the paragraph rather than stranding the overflow alone', async () => {
    /*
     * Observed against taiga-grove on 2026-08-13: wrapping each over-long line by itself left
     * 1009 comments with an orphan word or two under a full line, because the words below the
     * break never moved up. The whole run must repack, so `eeeeeeeeee` rides up onto the line
     * with room for it rather than staying on one of its own.
     */
    const fixed = await lintAndFix(fixturePath)

    expect(fixed).toContain(`/**\n * ${c50}\n * ${d50} eeeeeeeeee\n */`)
  })

  it('auto-fix never merges a following bullet into the paragraph above it', async () => {
    const fixed = await lintAndFix(fixturePath)

    expect(fixed).toContain(
      `/**\n * ${f50}\n * ${g50}\n * - a bullet that must not be merged into the paragraph above\n */`,
    )
  })

  it('auto-fix still wraps the line above an unwrappable URL', async () => {
    /*
     * The URL line cannot be wrapped at all, and absorbing it into the run would make the
     * whole paragraph unwrappable, so the perfectly wrappable line above it would silently
     * stop being fixed. The run has to stop at that line instead.
     */
    const fixed = await lintAndFix(fixturePath)

    expect(fixed).toContain(
      `/**\n * ${h50}\n * ${i50}\n * https://example.com/another/really/long/path/segment/with/no/spaces/at/all/that/cannot/wrap/ok\n */`,
    )
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

describe('vueTypeAware is inapplicable rather than fatal without Vue', () => {
  /*
   * A repo with no Vue has no `antfu/vue/rules` block to point at a project, and the code
   * that points it used to throw when the block was missing. That turned an option that is
   * merely inapplicable into a hard failure of the consumer's whole lint, while the sibling
   * tsconfig check deliberately treats "no SFCs here" as benign. The two paths now agree.
   */
  it('builds a usable config and says why the option did nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      const configs = await callAtDir(
        'test/fixtures/multi-ts',
        async () =>
          await maninak({
            vueTypeAware: true,
            typescript: { tsconfigPath: './tsconfig.json' },
          }),
      )

      expect(configs.length).toBeGreaterThan(0)
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('vueTypeAware is on, but Vue support is off') as string,
      )
    } finally {
      warn.mockRestore()
    }
  })

  it('stays silent when the option is off', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      await callAtDir(
        'test/fixtures/multi-ts',
        async () => await maninak({ typescript: { tsconfigPath: './tsconfig.json' } }),
      )

      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('vueTypeAware') as string)
    } finally {
      warn.mockRestore()
    }
  })
})

describe('vueTypeAware extends type-aware linting into SFCs', () => {
  /*
   * Without the option, antfu leaves `.vue` out of `filesTypeAware` AND gives the Vue block's
   * inner TS parser no project, so every type-aware rule silently skips SFCs. That is
   * invisible to the consumer: nothing errors, the rules simply never run, in the files
   * where a Vue or Nuxt app keeps most of its code.
   */
  const options = { vueTypeAware: true, typescript: { tsconfigPath: './tsconfig.json' } }

  async function lintTypeAwareFixture(
    file: string,
    withOption: boolean,
  ): Promise<Awaited<ReturnType<typeof lint>>> {
    return await callAtDir(
      'test/fixtures/vue-type-aware',
      async () => await lint(file, withOption ? options : { typescript: options.typescript }),
    )
  }

  it('reports an any flowing into a typed call inside an SFC', async () => {
    const results = await lintTypeAwareFixture('Unsafe.vue', true)

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'ts/no-unsafe-argument' }),
    )
  })

  it('reports nothing type-aware in that same SFC when the option is off', async () => {
    // The paired assertion that makes the case above meaningful, and the measure of what
    // every Vue consumer is missing today.
    const results = await lintTypeAwareFixture('Unsafe.vue', false)
    const typeAware = results.filter((finding) => finding.ruleId?.startsWith('ts/no-unsafe-'))

    expect(typeAware).toEqual([])
  })

  it('reports nothing type-aware on a well-typed SFC', async () => {
    // The false-positive guard. Turning the option on must not start flagging ordinary,
    // correctly-typed component code, or no consumer could ever adopt it.
    const results = await lintTypeAwareFixture('Clean.vue', true)
    const typeAware = results.filter((finding) => finding.ruleId?.startsWith('ts/no-unsafe-'))

    expect(typeAware).toEqual([])
  })

  it('covers the script block but not template expressions', async () => {
    // A known and deliberate limit: vue-eslint-parser hands typescript-eslint the script
    // program, so an unsafe value is caught where it is created and not where the template
    // dereferences it. Locked in so a future parser change that starts type-checking
    // templates shows up here rather than as a surprise wave of findings in consumers.
    const results = await lintTypeAwareFixture('UnsafeTemplate.vue', true)
    const lines = results
      .filter((finding) => finding.ruleId?.startsWith('ts/no-unsafe-'))
      .map((finding) => finding.line)

    expect(lines).toEqual([4])
  })

  it('fails with one actionable error when the tsconfig does not cover SFCs', async () => {
    // Otherwise every SFC reports "was not found by the project service" as a parse error,
    // which in a real app is hundreds of failures that never name the cause.
    const build = callAtDir(
      'test/fixtures/vue-type-aware-untracked',
      async () => await maninak(options),
    )

    await expect(build).rejects.toThrow(/does not include any of the 1 \.vue files/)
  })

  it('leaves .ts behaviour unchanged whether the option is on or off', async () => {
    const withOption = await lintTypeAwareFixture('unsafe.ts', true)
    const withoutOption = await lintTypeAwareFixture('unsafe.ts', false)
    function unsafeOf(results: Awaited<ReturnType<typeof lint>>): string[] {
      return results
        .filter((finding) => finding.ruleId?.startsWith('ts/no-unsafe-'))
        .map((finding) => `${finding.ruleId}:${finding.line}`)
        .sort()
    }

    expect(unsafeOf(withOption)).toEqual(unsafeOf(withoutOption))
    expect(unsafeOf(withOption).length).toBeGreaterThan(0)
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
   * antfu v9.3 scoped its unicorn block to a JS/TS glob, which silently stopped every rule
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
