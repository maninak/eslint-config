import type { LintResult } from './helpers.js'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { detectTailwindCssDialect } from '../src/features/css.js'
import {
  detectTailwindTheme,
  findTailwindInstall,
  resolveTailwindInstall,
} from '../src/features/tailwind.js'
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

  it('adds the required blank ABOVE a standalone comment, keeping it with the return', async () => {
    const fixed = await lintAndFix(fixturePath)

    // A comment on its own line documents the return below it, so anchoring the blank on the
    // comment orphaned it upwards and made it read as a note on the previous statement.
    expect(fixed).toMatch(
      /const _quintupled = _x \* 5\n\n {2}\/\/ explains the return\n {2}return/,
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

describe('tailwind rules find the project entry point for themselves', () => {
  /*
   * The plugin learns the project's theme from its CSS entry point. Given none it silently
   * falls back to Tailwind's stock theme, so it enforces a class order the project never
   * configured. The preset therefore finds the theme rather than guessing at one, and says so
   * when it cannot. The fixture carries Tailwind the way taiga-grove does, through `@nuxt/ui`
   * with no `tailwindcss` of its own, so the carrier detection is exercised too.
   */
  const fixtureDir = 'test/fixtures/tailwind-project'
  const orderRule = 'better-tailwindcss/enforce-consistent-class-order'

  /*
   * pnpm's layout, built by hand: the carrier symlinked into the consumer's node_modules from
   * a store directory, with the only copy of Tailwind next to it in that store. This is the
   * shape taiga-grove has, and the consumer's own root resolves nothing at all in it.
   */
  function createCarrierLayout(root: string): { carrier: string; tailwind: string } {
    const store = path.join(root, 'node_modules/.pnpm/@nuxt+ui@4.9.0/node_modules')
    const carrier = path.join(store, '@nuxt/ui')
    const tailwind = path.join(store, 'tailwindcss')

    mkdirSync(carrier, { recursive: true })
    mkdirSync(tailwind, { recursive: true })
    mkdirSync(path.join(root, 'node_modules/@nuxt'), { recursive: true })
    writeFileSync(
      path.join(carrier, 'package.json'),
      JSON.stringify({ name: '@nuxt/ui', version: '4.9.0' }),
    )
    writeFileSync(
      path.join(tailwind, 'package.json'),
      JSON.stringify({ name: 'tailwindcss', version: '4.1.0' }),
    )
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ dependencies: { '@nuxt/ui': '^4.9.0' }, name: 'carrier-consumer' }),
    )
    symlinkSync(carrier, path.join(root, 'node_modules/@nuxt/ui'))

    return { carrier, tailwind }
  }

  it('comes on by itself, with no entry point given and nothing said', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const severity = await callAtDir(
        fixtureDir,
        async () => await resolveRule('Component.vue', orderRule),
      )

      expect(severity?.[0]).toBe('warn')
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('points the plugin at the entry point it found, not at the stock theme', async () => {
    const results = await callAtDir(fixtureDir, async () => await lint('Component.vue'))

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: orderRule, line: 6, severity: 1 }),
    )
  })

  it('fires on a .vue class attribute once the entry point is given', async () => {
    const results = await callAtDir(
      fixtureDir,
      async () => await lint('Component.vue', { tailwind: { entryPoint: './main.css' } }),
    )

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: orderRule, line: 6, severity: 1 }),
    )
  })

  it('autofixes the class order in a .vue template', async () => {
    const fixed = await callAtDir(
      fixtureDir,
      async () =>
        await lintAndFix('Component.vue', { tailwind: { entryPoint: './main.css' } }),
    )

    expect(fixed).toContain('class="mt-2 p-4"')
  })

  it('keeps line wrapping and unknown-classes off, since prettier owns formatting', async () => {
    const [wrapping, unknown] = await callAtDir(fixtureDir, async () => {
      const options = { tailwind: { entryPoint: './main.css' } }

      return [
        await resolveRule(
          'Component.vue',
          'better-tailwindcss/enforce-consistent-line-wrapping',
          options,
        ),
        await resolveRule('Component.vue', 'better-tailwindcss/no-unknown-classes', options),
      ]
    })

    expect(wrapping?.[0]).toBe('off')
    expect(unknown?.[0]).toBe('off')
  })

  it('stays off files that hold no class strings, rather than every file linted', async () => {
    const severities = await callAtDir(fixtureDir, async () => {
      const options = { tailwind: { entryPoint: './main.css' } }

      return await Promise.all(
        ['data.json', 'Cargo.toml', 'ci.yaml'].map(
          async (file) => await resolveRule(file, orderRule, options),
        ),
      )
    })

    expect(severities).toEqual([undefined, undefined, undefined])
  })

  it('throws on an entry point that does not exist, rather than linting the stock theme', async () =>
    await callAtDir(fixtureDir, async () => {
      const build = maninak({ tailwind: { entryPoint: './nope.css' } })

      await expect(build).rejects.toThrow(/does not exist/)
    }))

  it('finds the nearest installed tailwindcss by walking up from the given directory', () => {
    const found = findTailwindInstall(path.resolve(fixtureDir))

    expect(found).toBe(path.resolve('node_modules/tailwindcss'))
  })

  /*
   * A path with no real ancestor but the filesystem root, so the walk is guaranteed to end
   * empty-handed wherever the repo is checked out.
   */
  it('reports no install when nothing up the tree has one', () => {
    const found = findTailwindInstall('/no-such-root-9e3f/deep/dir')

    expect(found).toBeUndefined()
  })

  it('says nothing when the workspace has no tailwind at all', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      await callAtDir(
        'test/fixtures/vue-project',
        async () => await resolveRule('Component.vue', orderRule),
      )

      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('entryPoint'))
    } finally {
      warn.mockRestore()
    }
  })

  /*
   * Two apps in one repo, each with its own theme. Picking either would lint the other against
   * a class order it never configured, and the point of detecting at all is to be right, so
   * ambiguity has to stay the consumer's call.
   */
  it('stays off and names the candidates when several files could be the theme', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const severity = await callAtDir(
        'test/fixtures/tailwind-ambiguous',
        async () => await resolveRule('Component.vue', orderRule),
      )

      expect(severity).toBeUndefined()
      const [message] = warn.mock.calls[0] as [string]

      expect(message).toContain('ambiguous')
      expect(message).toContain(path.join('apps', 'admin', 'assets', 'main.css'))
      expect(message).toContain(path.join('apps', 'web', 'assets', 'main.css'))
    } finally {
      warn.mockRestore()
    }
  })

  it('stays off and says so when nothing in the project defines a theme', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const severity = await callAtDir(
        'test/fixtures/tailwind-no-theme',
        async () => await resolveRule('Component.vue', orderRule),
      )

      expect(severity).toBeUndefined()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('nothing defining'))
    } finally {
      warn.mockRestore()
    }
  })

  /*
   * `commented.css` in that fixture carries `@import "tailwindcss"` inside a comment. Matching
   * it would hand the plugin a file that imports nothing, and every rule would then run
   * against the stock theme, which is the exact failure detection exists to avoid.
   */
  it('does not read a commented-out import as the entry point', async () => {
    const { theme, entryPoints } = await callAtDir(
      'test/fixtures/tailwind-no-theme',
      async () => await Promise.resolve(detectTailwindTheme(4)),
    )

    expect(entryPoints).toEqual([])
    expect(theme).toBeUndefined()
  })

  it('prefers the v4 entry point over a leftover v3 config, and the reverse on v3', async () => {
    const [onV4, onV3] = await callAtDir(
      'test/fixtures/tailwind-both-forms',
      async () => await Promise.resolve([detectTailwindTheme(4), detectTailwindTheme(3)]),
    )

    expect(onV4.theme).toEqual({ entryPoint: expect.stringContaining('main.css') as string })
    expect(onV3.theme).toEqual({
      tailwindConfig: expect.stringContaining('tailwind.config.js') as string,
    })
  })

  it('hands the plugin a cwd it can resolve tailwindcss from', async () => {
    const settings = await callAtDir(fixtureDir, async () => {
      const configs = await maninak()
      return configs.find((config) => config.name === 'maninak/tailwindcss')?.settings
    })

    const { cwd } = (settings as { 'better-tailwindcss': { cwd: string } })[
      'better-tailwindcss'
    ]

    expect(findTailwindInstall(cwd)).toBeDefined()
  })

  /*
   * A v4 entry point pulls Tailwind in with `@import "tailwindcss"`, and Tailwind resolves
   * that relative to the file itself. A carried-in copy satisfies the plugin's own version
   * check but not this, and the plugin does not degrade: it throws from inside
   * `enhanced-resolve`, part way through the lint. Detection walks straight into it, so it
   * has to be caught up front.
   */
  it('warns instead of dying when the entry point cannot resolve tailwindcss', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'maninak-unresolvable-'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      createCarrierLayout(root)
      mkdirSync(path.join(root, 'assets'), { recursive: true })
      writeFileSync(path.join(root, 'assets/main.css'), '@import "tailwindcss";\n')

      const configs = await callAtDir(root, async () => await maninak())

      expect(configs.find((config) => config.name === 'maninak/tailwindcss')).toBeUndefined()
      const [message] = warn.mock.calls[0] as [string]

      expect(message).toContain('resolved from the directory it lives in')
      expect(message).toContain('devDependencies')
      expect(message).toContain(path.join('assets', 'main.css'))
    } finally {
      warn.mockRestore()
      rmSync(root, { force: true, recursive: true })
    }
  })

  /*
   * A dependency declared by a sub-package is installed into THAT package's node_modules. A
   * monorepo linted from its root therefore resolves nothing from the cwd, which used to be a
   * hard error telling the consumer to add a dependency they had already added.
   */
  it('finds a tailwindcss installed only in a workspace sub-package', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'maninak-workspace-'))

    try {
      const web = path.join(root, 'apps/web')
      mkdirSync(path.join(web, 'node_modules/tailwindcss'), { recursive: true })
      writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'root' }))
      writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n")
      writeFileSync(
        path.join(web, 'package.json'),
        JSON.stringify({ dependencies: { tailwindcss: '^4.1.0' }, name: 'web' }),
      )
      writeFileSync(
        path.join(web, 'node_modules/tailwindcss/package.json'),
        JSON.stringify({ name: 'tailwindcss', version: '4.1.0' }),
      )

      const install = await callAtDir(
        root,
        async () => await Promise.resolve(resolveTailwindInstall()),
      )

      // Nothing resolves from the root itself: only from the sub-package that declared it.
      expect(findTailwindInstall(root)).toBeUndefined()
      expect(install?.resolveFrom).toBe(web)
      expect(install?.dir).toBe(path.join(web, 'node_modules/tailwindcss'))
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('finds a tailwindcss that only a dependency installed, via the carrier', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'maninak-pnpm-'))

    try {
      const { carrier, tailwind } = createCarrierLayout(root)

      const install = await callAtDir(
        root,
        async () => await Promise.resolve(resolveTailwindInstall()),
      )

      // The consumer's own root resolves nothing: only the carrier's real directory does.
      expect(findTailwindInstall(root)).toBeUndefined()
      expect(install?.dir).toBe(tailwind)
      expect(install?.resolveFrom).toBe(realpathSync(carrier))
      expect(install?.major).toBe(4)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})

describe('css files are linted, which nothing in this preset did before', () => {
  /*
   * CSS was previously matched by no config at all: not linted, not formatted. These rules
   * catch real defects rather than style opinions, so they are on wherever a project has CSS.
   */
  const cssFixture = 'test/fixtures/css-project'

  it('reports the defects no other tool in this preset can see', async () => {
    const results = await callAtDir(cssFixture, async () => await lint('styles.css'))
    const found = results.map((finding) => finding.ruleId)

    expect(found).toEqual(
      expect.arrayContaining([
        'css/no-duplicate-imports',
        'css/no-empty-blocks',
        'css/no-invalid-properties',
        'css/no-duplicate-keyframe-selectors',
        'css/no-invalid-named-grid-areas',
      ]),
    )
  })

  it('reports rather than blocks, like every other rule here', async () => {
    const results = await callAtDir(cssFixture, async () => await lint('styles.css'))

    expect(results.every((finding) => finding.severity === 1)).toBe(true)
  })

  /*
   * A flat-config block with no `files` key claims every file that gets linted, and antfu
   * ships about ten of them. On a CSS file those JS rules do not merely fail to match: core
   * rules reach for `sourceCode.getAllComments`, which the CSS language has no such thing
   * as, and throw while loading. `no-irregular-whitespace` alone took down the whole lint.
   */
  it('keeps the javascript rules off css, which used to crash the lint', async () => {
    const [core, prettier] = await callAtDir(cssFixture, async () => [
      await resolveRule('styles.css', 'no-irregular-whitespace'),
      await resolveRule('styles.css', 'prettier/prettier'),
    ])

    expect(core).toBeUndefined()
    expect(prettier).toBeUndefined()
  })

  /*
   * These rules are on by default, so an unfamiliar stylesheet must not cost the consumer
   * their lint. A CSS file run through PostCSS plugins is ordinary in a real project and its
   * syntax is unknown here: in strict mode `@custom-media` alone is a fatal parse error that
   * reports nothing else in the file.
   */
  it('keeps linting a stylesheet whose syntax it does not fully know', async () => {
    const results = await callAtDir(
      'test/fixtures/css-postcss',
      async () => await lint('custom-media.css'),
    )

    expect(results.filter((finding) => finding.ruleId === null)).toEqual([])
    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'css/no-invalid-properties' }),
    )
  })

  it('stays out of the way entirely when asked', async () => {
    const severity = await callAtDir(
      cssFixture,
      async () => await resolveRule('styles.css', 'css/no-empty-blocks', { css: false }),
    )

    expect(severity).toBeUndefined()
  })

  it('loads nothing for a project that has no css at all', async () => {
    const configs = await callAtDir('test/fixtures/css-none', async () => await maninak())

    expect(configs.find((config) => config.name === 'maninak/css')).toBeUndefined()
  })

  it('holds use-baseline to widely available features by default', async () => {
    const results = await callAtDir(cssFixture, async () => await lint('styles.css'))

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'css/use-baseline', line: 18 }),
    )
  })

  it('lets an app targeting current browsers ask for the newer baseline', async () => {
    const results = await callAtDir(
      cssFixture,
      async () => await lint('styles.css', { css: { available: 'newly' } }),
    )

    expect(results.filter((finding) => finding.ruleId === 'css/use-baseline')).toEqual([])
  })
})

describe('css linting understands tailwind, whose at-rules are not css', () => {
  /*
   * The stock parser does not skip Tailwind's at-rules, it rejects them: a v4 entry point dies
   * on `@custom-variant dark (&:where(.dark, .dark *))` at parse time and reports nothing else
   * in the file. The dialect is picked from what the stylesheet contains, not from whether
   * `tailwindcss` resolves, since a repo can have the syntax without a loadable package.
   */
  const fixture = 'test/fixtures/css-tailwind'

  /*
   * A project outside any node_modules tree, declaring nothing and resolving nothing, whose
   * stylesheet is nonetheless unmistakably Tailwind v4. Everything except the file's own
   * contents says "no Tailwind here", and handing that file the stock grammar is a parse
   * failure rather than a missed rule.
   */
  it('reads the dialect off the stylesheets, not off what is installed', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'maninak-dialect-'))

    try {
      writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'no-deps' }))
      writeFileSync(path.join(root, 'main.css'), '@import "tailwindcss";\n')

      const dialect = await callAtDir(
        root,
        async () => await Promise.resolve(detectTailwindCssDialect()),
      )

      expect(dialect).toBe('tailwind4')
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('leaves plain css on the stock grammar', async () => {
    const dialect = await callAtDir(
      'test/fixtures/css-project',
      async () => await Promise.resolve(detectTailwindCssDialect()),
    )

    expect(dialect).toBeUndefined()
  })

  it('hands the parser the tailwind grammar, and plain css none', async () => {
    async function syntaxOf(dir: string): Promise<unknown> {
      const configs = await callAtDir(dir, async () => await maninak({ tailwind: false }))
      const block = configs.find((config) => config.name === 'maninak/css')

      return (block?.languageOptions as { customSyntax?: unknown } | undefined)?.customSyntax
    }

    expect(await syntaxOf(fixture)).toBeDefined()
    expect(await syntaxOf('test/fixtures/css-project')).toBeUndefined()
  })

  it('lints a v4 entry point instead of dying on it', async () => {
    const results = await callAtDir(
      fixture,
      async () => await lint('main.css', { tailwind: false }),
    )

    expect(results.filter((finding) => finding.ruleId === null)).toEqual([])
    expect(results).toContainEqual(expect.objectContaining({ ruleId: 'css/no-important' }))
  })

  /*
   * `tailwind-csstree` parses `@utility` but carries no descriptor table for its body, so
   * `no-invalid-at-rules` calls every declaration inside one an unknown descriptor. That is
   * the rule being wrong about every custom utility a project defines.
   */
  it('does not call a custom utility invalid', async () => {
    const results = await callAtDir(
      fixture,
      async () => await lint('main.css', { tailwind: false }),
    )

    expect(results.filter((finding) => finding.ruleId === 'css/no-invalid-at-rules')).toEqual(
      [],
    )
  })

  it('keeps that rule on for a project that writes plain css', async () => {
    const severity = await callAtDir(
      'test/fixtures/css-project',
      async () => await resolveRule('styles.css', 'css/no-invalid-at-rules'),
    )

    expect(severity?.[0]).toBe('warn')
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

  /*
   * The default reaches every consumer, most of whom write no Vue at all. Warning them that an
   * option they never set is inapplicable would make the preset noisy for the majority to
   * serve the minority, so only an explicit `vueTypeAware: true` earns that message.
   */
  it('stays silent in a repo with no Vue when nobody set the option', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      await callAtDir(
        'test/fixtures/multi-ts',
        async () => await maninak({ typescript: { tsconfigPath: './tsconfig.json' } }),
      )

      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('vueTypeAware'))
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

  /** `vueTypeAware` left `undefined` means "never mentioned", which is now its own case. */
  async function lintTypeAwareFixture(
    file: string,
    vueTypeAware?: boolean,
  ): Promise<Awaited<ReturnType<typeof lint>>> {
    return await callAtDir(
      'test/fixtures/vue-type-aware',
      async () =>
        await lint(file, {
          typescript: options.typescript,
          ...(vueTypeAware === undefined ? {} : { vueTypeAware }),
        }),
    )
  }

  it('reports an any flowing into a typed call inside an SFC', async () => {
    const results = await lintTypeAwareFixture('Unsafe.vue', true)

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'ts/no-unsafe-argument' }),
    )
  })

  it('reaches into SFCs by default, without the option being mentioned at all', async () => {
    // The default flip: a repo already linting type-aware gets its SFCs covered too, with
    // nothing added to its config.
    const results = await lintTypeAwareFixture('Unsafe.vue')

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'ts/no-unsafe-argument' }),
    )
  })

  it('reports nothing type-aware in that same SFC when the option is off', async () => {
    // The paired assertion that makes the case above meaningful, and the escape hatch for
    // anyone who wants the lint time back.
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

  it('fails with one actionable error when asked for and the tsconfig misses SFCs', async () => {
    // Otherwise every SFC reports "was not found by the project service" as a parse error,
    // which in a real app is hundreds of failures that never name the cause.
    const build = callAtDir(
      'test/fixtures/vue-type-aware-untracked',
      async () => await maninak(options),
    )

    await expect(build).rejects.toThrow(/does not include any of the 1 \.vue files/)
  })

  /*
   * The same tsconfig, with nobody having asked for SFC coverage. Failing here would break the
   * lint of every Vue repo whose tsconfig happens not to include SFCs, over a default they
   * never chose, so this one degrades and explains itself instead.
   */
  it('warns and lints on when the tsconfig misses SFCs and nobody asked', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const configs = await callAtDir(
        'test/fixtures/vue-type-aware-untracked',
        async () => await maninak({ typescript: options.typescript }),
      )

      expect(configs.length).toBeGreaterThan(0)
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('does not include any of the 1 .vue files'),
      )
    } finally {
      warn.mockRestore()
    }
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

describe('vueTypeAware judges every resolved tsconfig, not just the first', () => {
  /*
   * A consumer splitting source and SFCs across two tsconfigs hands BOTH to the parser via
   * the legacy project mode, so SFC coverage in either one is enough. Checking only the first
   * hard-failed that setup when the option was named explicitly, and warned falsely otherwise.
   */
  it('stays silent when a later tsconfig is the one covering .vue', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      await callAtDir(
        'test/fixtures/vue-split-tsconfig',
        async () =>
          await maninak({
            vueTypeAware: true,
            typescript: { tsconfigPath: ['./tsconfig.json', './tsconfig.vue.json'] },
          }),
      )
    } finally {
      warn.mockRestore()
    }

    expect(warn.mock.calls.flat().join(' ')).not.toContain('.vue files')
  })

  it('still reports when NO tsconfig covers .vue, so the check has not been defanged', async () => {
    const building = callAtDir(
      'test/fixtures/vue-split-tsconfig',
      async () =>
        await maninak({
          vueTypeAware: true,
          typescript: { tsconfigPath: ['./tsconfig.json'] },
        }),
    )

    await expect(building).rejects.toThrow(/does not include any of the \d+ \.vue files/)
  })
})

describe('a Vue minor past 9 still counts as newer, not older', () => {
  /*
   * The detected version used to be one `major.minor` float, so `3.10` parsed to `3.1` and
   * compared as OLDER than 3.5. Every 3.5-gated rule would have vanished silently the day Vue
   * shipped 3.10, which is a whole minor nobody would think to test.
   */
  it('vue/prefer-use-template-ref stays on for a consumer declaring vue ^3.10.0', async () => {
    const results = await callAtDir(
      'test/fixtures/vue-310',
      async () => await lint('TemplateRef.vue'),
    )

    expect(results).toContainEqual(
      expect.objectContaining({ ruleId: 'vue/prefer-use-template-ref' }),
    )
  })
})

describe('brace style survives the prettier block that would silently disable it', () => {
  /*
   * `curly: 'all'` was set in an early block and then zeroed by eslint-config-prettier, which
   * the preset spreads into a LATER block applying to every file. The preset had shipped with
   * no brace enforcement at all, under a comment claiming the net behaviour was unchanged, so
   * these assert the rule reaches a real lint rather than merely appearing in the config.
   */
  it('curly fires on a braceless single-statement if in TypeScript', async () => {
    const results = await lint('test/fixtures/curly.ts')

    expect(results).toContainEqual(expect.objectContaining({ ruleId: 'curly' }))
  })

  it('curly fires inside an SFC too, where the prettier-vue block also spreads that set', async () => {
    const results = await callAtDir(
      'test/fixtures/vue-project',
      async () => await lint('Curly.vue'),
    )

    expect(results).toContainEqual(expect.objectContaining({ ruleId: 'curly' }))
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
