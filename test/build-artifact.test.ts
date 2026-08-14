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
          `${distFile} not found: run \`pnpm build\` before \`pnpm test:build-artifact\``,
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
    engines: { node: string }
  }

  function readManifest(name: string): {
    peerDependencies?: Record<string, string>
    engines?: { node?: string }
  } {
    return JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf-8')) as {
      peerDependencies?: Record<string, string>
      engines?: { node?: string }
    }
  }

  /*
   * The lowest version a range admits, as one comparable number. Minor and patch are optional
   * because a dependency may spell its range `^9` or `>=10`: reading only full `x.y.z` triples
   * made this guard throw a TypeError on such a range instead of reporting, which is a gate
   * failing as a crash rather than as an answer.
   */
  function readRangeFloor(range: string): number {
    const ranks = [...range.matchAll(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/g)].map(
      (match) => Number(match[1]) * 1e6 + Number(match[2] ?? 0) * 1e3 + Number(match[3] ?? 0),
    )

    expect(ranks.length, `no version found in range "${range}"`).toBeGreaterThan(0)

    return Math.min(...ranks)
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

      expect(
        ourFloor,
        `our eslint peer floor is below what ${dep} needs (${required})`,
      ).toBeGreaterThanOrEqual(readRangeFloor(required))
    }
  })

  /*
   * `engines.node` is a promise to the consumer's package manager, and it was three majors
   * below what the bundled plugins declare: a Node 18 consumer installed cleanly and then hit
   * an unsupported runtime the first time a dynamic plugin import ran.
   */
  it('claims a node floor no older than every bundled plugin needs', () => {
    const ourFloor = readRangeFloor(own.engines.node)

    for (const dep of Object.keys(own.dependencies)) {
      const required = readManifest(dep).engines?.node
      if (!required) {
        continue
      }

      expect(
        ourFloor,
        `our engines.node floor is below what ${dep} needs (${required})`,
      ).toBeGreaterThanOrEqual(readRangeFloor(required))
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

/*
 * README link guard.
 *
 * The README ships inside the published package, so a relative link that does not resolve is
 * a 404 on both GitHub and npm. The licence link read `./LICENSE` for years while the file on
 * disk is spelled `LICENCE`, and nothing here noticed.
 */
describe('the README links to files that exist', () => {
  const readme = readFileSync('README.md', 'utf8')
  const targets = [...readme.matchAll(/\]\((\.[^)#]*)\)/g)].map((match) => match[1]!)

  it('finds relative links to check, so the assertion below cannot pass vacuously', () => {
    expect(targets.length).toBeGreaterThan(0)
  })

  it('resolves every one of them', () => {
    expect(targets.filter((target) => !existsSync(target))).toEqual([])
  })
})

/*
 * Source-path guard for the repo docs.
 *
 * The docs name source files in backticks, and a rename leaves those names pointing at
 * nothing.
 * That is how CONTRIBUTING ended up describing `src/config.ts` for a while after it became
 * `src/preset.ts`: nothing reads these strings, so nothing complained. Only paths rooted at a
 * real source directory are checked, which keeps globs and consumer-side examples out.
 */
describe('the docs name source files that exist', () => {
  // `.claude/` is untracked, so it is absent from a fresh clone and from CI. Checking it only
  // where it exists keeps the guard useful locally without making the suite fail elsewhere;
  // the two tracked docs carry enough paths that the assertion below cannot go vacuous.
  const docs = ['README.md', 'CONTRIBUTING.md', '.claude/rules/authoring.md'].filter((doc) =>
    existsSync(doc),
  )
  const mentions = docs.flatMap((doc) =>
    [...readFileSync(doc, 'utf8').matchAll(/`((?:src|test|types|scripts)\/[\w./-]+)`/g)].map(
      (match) => ({ doc, path: match[1]! }),
    ),
  )

  it('finds paths to check, so the assertion below cannot pass vacuously', () => {
    expect(mentions.length).toBeGreaterThan(0)
  })

  it('resolves every one of them', () => {
    expect(mentions.filter((mention) => !existsSync(mention.path))).toEqual([])
  })
})
