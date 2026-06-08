import { describe, expect, it } from 'vitest'
import maninak from '../src/index.js'

describe('factory', () => {
  it('returns an array of flat config blocks', async () => {
    const cfg = await maninak()

    expect(Array.isArray(cfg)).toBe(true)
    expect(cfg.length).toBeGreaterThan(5)
  })

  it('appends user configs after maninak blocks', async () => {
    const sentinel = { rules: { 'no-debugger': 'off' as const } }
    const cfg = await maninak({}, sentinel)

    expect(cfg.at(-1)).toMatchObject(sentinel)
  })

  it('exposes a callable default export', () => {
    const result = maninak()

    expect(result).toBeInstanceOf(Promise)
  })
})
