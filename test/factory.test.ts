import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'
import maninak from '../src/index.js'

describe('factory', () => {
  it('returns an array of flat config blocks', async () => {
    const cfg = await maninak()

    expect(Array.isArray(cfg)).toBe(true)
    expect(cfg.length).toBeGreaterThan(5)
  })

  it('user-supplied configs override earlier blocks', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: await maninak({}, { rules: { 'no-debugger': 'off' as const } }),
    })
    const resolved = (await eslint.calculateConfigForFile('foo.ts')) as {
      rules?: { 'no-debugger'?: [number, ...unknown[]] }
    }

    expect(resolved.rules?.['no-debugger']?.[0]).toBe(0)
  })

  it('exposes a callable default export', () => {
    const result = maninak()

    expect(result).toBeInstanceOf(Promise)
  })
})
