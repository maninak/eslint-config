import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * Build-artifact tests.
 *
 * These tests run against the compiled `dist/` output, not the source. They guard structural
 * properties of the *published package* that cannot be caught by linting the source or by
 * behavioural tests that import from `src/`.
 */

/*
 * FlatCompat guard.
 *
 * ESLint's legacy `FlatCompat` bridge resolves plugins by *string name* at runtime via
 * `require('<plugin-name>')`, with the resolution root set to a synthetic
 * `<consumerProjectRoot>/__placeholder__.js` path. Under pnpm's default strict (non-hoisting)
 * node_modules layout, transitive deps live inside `.pnpm/<pkg>/node_modules/<pkg>` and are
 * NOT reachable from the consumer's project root via Node's standard `require()` walk. This
 * causes the VS Code ESLint extension to crash with "Cannot find module 'eslint-plugin-…'"
 * for any pnpm consumer project that uses Vue or Tailwind.
 *
 * The invariant: the compiled output must not call `new FlatCompat()` at runtime. All plugins
 * must be imported directly inside maninak so they resolve from maninak's own node_modules,
 * regardless of the consumer's package manager or layout.
 */
describe('build artifact does not use FlatCompat (ESLint extension compatibility)', () => {
  const distFiles = ['dist/index.js', 'dist/index.cjs'] as const

  for (const distFile of distFiles) {
    it(`${distFile} contains no runtime FlatCompat instantiation`, () => {
      let src: string
      try {
        src = readFileSync(distFile, 'utf8')
      } catch {
        throw new Error(
          `${distFile} not found — run \`pnpm build\` before \`pnpm test:build-artifact\``,
        )
      }

      // match the runtime call pattern `new FlatCompat(`
      const matches = [...src.matchAll(/new\s+FlatCompat\s*\(/g)]

      expect(
        matches,
        [
          `Found ${matches.length} runtime FlatCompat instantiation(s) in ${distFile}.`,
          "FlatCompat resolves plugins by string name from the consumer's project root,",
          'which breaks under pnpm strict layout and in the VS Code ESLint extension.',
          'Use direct imports inside maninak instead of FlatCompat-wrapped legacy configs.',
        ].join(' '),
      ).toHaveLength(0)
    })
  }
})
