import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Fixtures are lint INPUT, not specs. Some are named `*.test.ts` on purpose, to prove the
    // jsdoc test-file exemption, and vitest would otherwise collect them and fail on the
    // missing suite. Spread the defaults back in: assigning `exclude` replaces them.
    exclude: [...configDefaults.exclude, 'test/fixtures/**'],
    reporters: ['verbose'],
    // These specs load the full ESLint plugin tree and run real lints against fixtures, cold
    // and slow (several seconds) on the first hit per worker. The 5s default was already
    // borderline for the heaviest lintFiles call, so give every test comfortable headroom.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
