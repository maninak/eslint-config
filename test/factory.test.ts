import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'
import maninak from '../src/index.js'

describe('factory', () => {
  it('returns an array of flat config blocks', async () => {
    const cfg = await maninak()

    expect(Array.isArray(cfg)).toBe(true)
    expect(cfg.length).toBeGreaterThan(5)
  })

  it('user-supplied configs override earlier blocks (a later off actually silences a rule)', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: await maninak({}, { rules: { 'no-debugger': 'off' as const } }),
    })
    const results = await eslint.lintFiles(['test/fixtures/typescript.ts'])
    const debuggerFindings = results
      .flatMap((result) => result.messages)
      .filter((message) => message.ruleId === 'no-debugger')

    expect(debuggerFindings).toEqual([])
  })

  it('exposes a callable default export', () => {
    const result = maninak()

    expect(result).toBeInstanceOf(Promise)
  })
})
