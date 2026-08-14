import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { globSync } from 'tinyglobby'
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

/*
 * Peer-declaration guards.
 *
 * These lock our `peerDependencies` to what the plugins we bundle actually demand of the
 * consumer, so a plugin bump that widens or raises its own requirement cannot leave ours
 * quietly wrong.
 */
describe('peer declarations match what the bundled plugins demand', () => {
  const own = JSON.parse(readFileSync('package.json', 'utf-8')) as {
    dependencies: Record<string, string>
    peerDependencies: Record<string, string>
    peerDependenciesMeta?: Record<string, { optional?: boolean }>
  }

  function readManifest(name: string): {
    peerDependencies?: Record<string, string>
  } {
    return JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf-8')) as {
      peerDependencies?: Record<string, string>
    }
  }

  /** The lowest version a range admits, e.g. `'^9.10.0 || ^10.0.0'` gives `[9, 10, 0]`. */
  function readRangeFloor(range: string): number[] {
    const versions = [...range.matchAll(/(\d+)\.(\d+)\.(\d+)/g)].map((match) =>
      match.slice(1).map(Number),
    )
    versions.sort(
      (left, right) => left[0]! - right[0]! || left[1]! - right[1]! || left[2]! - right[2]!,
    )

    return versions[0]!
  }

  it('asks for the same tailwindcss range the tailwind plugin does', () => {
    const plugin = readManifest('eslint-plugin-better-tailwindcss')

    expect(own.peerDependencies['tailwindcss']).toBe(plugin.peerDependencies?.['tailwindcss'])
  })

  /*
   * Optional on purpose. A required peer would have npm install Tailwind into every consumer,
   * including those that write no classes, and it would pick the newest version the range
   * allows rather than the project's own: a v4 engine reading a v3 config is exactly the
   * silent wrong answer the Tailwind rules refuse to give.
   */
  it('marks tailwindcss optional, so no consumer is made to install it', () => {
    expect(own.peerDependenciesMeta?.['tailwindcss']?.optional).toBe(true)
  })

  it('asks for an eslint no older than every bundled plugin needs', () => {
    const ourFloor = readRangeFloor(own.peerDependencies['eslint']!)

    for (const dep of Object.keys(own.dependencies)) {
      const required = readManifest(dep).peerDependencies?.['eslint']
      if (!required) {
        continue
      }
      const theirFloor = readRangeFloor(required)
      const ourRank = ourFloor[0]! * 1e6 + ourFloor[1]! * 1e3 + ourFloor[2]!
      const theirRank = theirFloor[0]! * 1e6 + theirFloor[1]! * 1e3 + theirFloor[2]!

      expect(
        ourRank,
        `our eslint peer floor ${ourFloor.join('.')} is below what ${dep} needs (${required})`,
      ).toBeGreaterThanOrEqual(theirRank)
    }
  })
})

/*
 * Lazy-plugin guard.
 *
 * A static import is evaluated the moment the config module loads, so every consumer pays for
 * it whether or not the blocks using it are ever built. These three plugins serve one
 * framework each and cost ~380ms together, and a config load happens once per lint worker
 * (ESLint spawns one per core under `--concurrency`), so loading them eagerly charges a plain
 * TypeScript repo for Vue and Tailwind support it never receives.
 *
 * The invariant: the compiled output may reference them only through a dynamic `import()`,
 * reached inside the branch that actually needs them. This is asserted against the bundle
 * rather than at runtime because a static import has no observable runtime signature beyond
 * timing, whereas here it is exact.
 */
describe('framework-specific plugins are loaded lazily, not at config-module load', () => {
  const LAZY_PLUGINS = [
    'eslint-plugin-vue-scoped-css',
    'eslint-plugin-prettier-vue',
    'eslint-plugin-better-tailwindcss',
  ] as const
  const distFiles = ['dist/index.js', 'dist/index.cjs'] as const

  for (const distFile of distFiles) {
    for (const plugin of LAZY_PLUGINS) {
      it(`${distFile} reaches ${plugin} only through a dynamic import`, () => {
        const source = readFileSync(distFile, 'utf-8')

        expect(source, `${plugin} is missing from ${distFile} entirely`).toContain(
          `import("${plugin}")`,
        )

        expect(source, `${plugin} is statically required in ${distFile}`).not.toContain(
          `require("${plugin}")`,
        )

        expect(source, `${plugin} is statically imported in ${distFile}`).not.toContain(
          `from "${plugin}"`,
        )
      })
    }
  }
})

/*
 * Declaration-chain guard.
 *
 * `tsc --emitDeclarationOnly` treats a `.d.ts` INPUT as already emitted and silently skips it,
 * so writing a types-only module as `src/x.d.ts` leaves `dist/` with declarations importing a
 * `./x.js` that was never written. Consumers then see `any` where an option type should be,
 * and nothing else here notices: lint, tests and the build all stay green.
 */
describe('the published declarations resolve each other', () => {
  const declarations = globSync(['dist/**/*.d.ts', 'dist/**/*.d.cts'], { absolute: true })

  it('emits declarations at all, so the check below cannot pass vacuously', () => {
    expect(declarations.length).toBeGreaterThan(5)
  })

  for (const declaration of declarations) {
    const shown = path.relative(process.cwd(), declaration)

    it(`${shown} imports only files that exist`, () => {
      const source = readFileSync(declaration, 'utf8')
      const specifiers = [...source.matchAll(/from '(\.[^']*)'/g)].map((match) => match[1]!)
      const missing = specifiers.filter((specifier) => {
        const resolved = path.resolve(path.dirname(declaration), specifier)

        return !['.d.ts', '.d.cts', '.ts', '.js'].some((extension) =>
          existsSync(resolved.replace(/\.[cm]?js$/, '') + extension),
        )
      })

      expect(missing).toEqual([])
    })
  }
})
