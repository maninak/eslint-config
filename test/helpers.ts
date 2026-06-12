import path from 'node:path'
import { ESLint } from 'eslint'
import maninak from '../src/index.js'

const SEVERITY = { 0: 'off', 1: 'warn', 2: 'error' } as const
const eslintCache = new Map<string, Promise<ESLint>>()

/**
 * Returns an ESLint instance configured with maninak(`options`), memoized by a deterministic
 * key derived from `process.cwd()` and `options`. Building antfu's flat config and loading the
 * plugin tree dominates per-call cost; without this cache every test pays it. The cwd is part
 * of the key because maninak's framework auto-detection reads `process.cwd()/package.json` at
 * config-build time, so two tests under different cwds need different ESLint instances.
 */
async function getEslint(options: Parameters<typeof maninak>[0] = {}): Promise<ESLint> {
  const key = `${process.cwd()}::${JSON.stringify(options ?? {})}`
  let pending = eslintCache.get(key)
  if (!pending) {
    pending = (async () => {
      const config = await maninak(options)

      return new ESLint({
        overrideConfigFile: true,

        overrideConfig: config,
      })
    })()
    eslintCache.set(key, pending)
  }

  return await pending
}

/**
 * Resolves the effective rule entry ESLint would apply for `filePath` under maninak's config.
 *
 * Returns a tuple `[severity, ...options]` where `severity` is `'off' | 'warn' | 'error'`.
 * ESLint represents severities internally as numbers (0/1/2); we normalize to strings so
 * assertions read naturally and stay stable across ESLint internals.
 *
 * Returns `undefined` if the rule has no entry for that file. Use this to lock in which rules
 * survive antfu's defaults plus our overrides. A future antfu/plugin bump that silently shifts
 * a rule between buckets, strips its severity, or renames it will fail loudly.
 */
export async function resolveRule(
  filePath: string,
  ruleName: string,
  options: Parameters<typeof maninak>[0] = {},
): Promise<['off' | 'warn' | 'error', ...unknown[]] | undefined> {
  const eslint = await getEslint(options)
  const resolved = (await eslint.calculateConfigForFile(filePath)) as
    | { rules?: Record<string, [number, ...unknown[]] | undefined> }
    | undefined
  const raw = resolved?.rules?.[ruleName]
  if (!raw) {
    return undefined
  }
  const [num, ...rest] = raw

  return [SEVERITY[num as 0 | 1 | 2], ...rest]
}

export interface LintResult {
  ruleId: string | null
  severity: number
  line: number
  message: string
}

/**
 * Lints a fixture file on disk under maninak(`options`) and returns the raw results. Use this
 * for behavioural tests: feed a fixture that contains a known violation, assert which rule
 * fires (or doesn't). Tests can also assert the absence of a rule to lock in that an
 * intentionally-disabled rule (e.g. `ts/no-floating-promises`) stays off.
 */
export async function lint(
  fixturePath: string,
  options: Parameters<typeof maninak>[0] = {},
): Promise<LintResult[]> {
  const eslint = await getEslint(options)
  const results = await eslint.lintFiles([fixturePath])

  return results.flatMap((result) =>
    result.messages.map((msg) => ({
      ruleId: msg.ruleId ?? null,
      severity: msg.severity,
      line: msg.line,
      message: msg.message,
    })),
  )
}

/**
 * Temporarily chdirs to `desiredCwd` (resolved relative to the maninak repo root, not to the
 * caller) for the duration of `callee`, then restores the previous cwd. Use this when a test
 * needs maninak's framework auto-detection to see specific deps in `package.json` — for
 * example, Vue rules only load when the consumer's `package.json` declares `vue`.
 */
export async function callAtDir<T>(desiredCwd: string, callee: () => Promise<T>): Promise<T> {
  const prev = process.cwd()
  process.chdir(path.resolve(prev, desiredCwd))

  try {
    return await callee()
  } finally {
    process.chdir(prev)
  }
}
