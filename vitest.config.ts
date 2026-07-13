import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    reporters: ['verbose'],
    // These specs load the full ESLint plugin tree and run real lints against fixtures, cold
    // and slow (several seconds) on the first hit per worker. The 5s default was already
    // borderline for the heaviest lintFiles call, so give every test comfortable headroom.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
