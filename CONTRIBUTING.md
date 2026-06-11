# Contributing to `@maninak/eslint-config`

This file is for maintainers. It captures the parts that aren't obvious from reading the code.

## Local setup

```bash
git clone git@github.com:maninak/eslint-config.git
cd eslint-config
pnpm install
```

## Testing changes locally

The `pnpm link --global` route plays surprising games with peer dep resolution in flat-config land, so the verified path is `pnpm pack` plus a tarball install:

```bash
pnpm build
pnpm pack --pack-destination /tmp

# In a throwaway branch of a real consumer
cd /path/to/some-consumer
pnpm add -D /tmp/maninak-eslint-config-0.2.0.tgz
pnpm lint
```

### Useful one-liners

```bash
# Verify a rule's effective value after antfu's defaults + our overrides
pnpm exec eslint --print-config src/factory.ts | jq '.rules["ts/return-await"]'

# Show which plugins ESLint sees registered in the resolved config
pnpm exec eslint --print-config src/factory.ts | jq '.plugins'

# Inspect the tarball that will ship to npm
pnpm build && pnpm pack --pack-destination /tmp && tar tzf /tmp/maninak-eslint-config-*.tgz
```

## The repo shape

Two things make this package unusual.

**The config file lints itself.** `eslint.config.mjs` imports from `./dist/index.js`. Any change to `src/config.ts` requires a `pnpm build` before the new rules show up in editor or `pnpm lint`. The build output is committed-adjacent (in `dist/`), so the flow is: edit `src/`, run `pnpm build`, then `pnpm lint`.

**Two tsconfigs, on purpose.** `tsconfig.json` covers everything the IDE and the lint type-checker need to see (`src/`, `types/`, `scripts/`, `eslint.config.mjs`). `tsconfig.build.json` is the narrow emission config used by the `postbuild` step that runs `tsc -p tsconfig.build.json --emitDeclarationOnly` to produce `dist/*.d.ts`. The narrow config sets `rootDir: ./src` to satisfy TypeScript 6's TS5011 emission check. If you find yourself adding a new directory of source, add it to both.

## What to watch for when bumping `@antfu/eslint-config`

The trap is the type-aware split. Antfu v9 keeps two separate config blocks for TypeScript:

- `antfu/typescript/rules` reads overrides from `typescript.overrides` and applies to every TS file
- `antfu/typescript/rules-type-aware` reads from `typescript.overridesTypeAware` and applies only when the consumer passes `tsconfigPath`

A rule that needs type information (anything checking value types, promise tracking, awaited-expression analysis, etc.) lives in the type-aware block. If you put its override in the wrong bucket, the override is silently dropped and antfu's default wins. Verify with `pnpm exec eslint --print-config src/factory.ts | grep -E '"(ts/return-await|ts/no-floating-promises)"'`.

Future antfu releases may shuffle rules between buckets, so when you bump, re-check that every rule we override still resolves to our value (not antfu's default) in `--print-config` output.

## What to watch for when bumping TypeScript

TypeScript 6 added TS5011 (explicit `rootDir` required when `outDir` is set and source paths could be ambiguous). Future majors will likely add similar emission-time constraints. If `pnpm build` fails after a TS bump, the answer is usually a small adjustment in `tsconfig.build.json`, not `tsconfig.json`.

## What to watch for when bumping ESLint plugins

`eslint-plugin-jasmine` ships no TypeScript declarations. The ambient shim at `types/eslint-plugin-jasmine.d.ts` keeps `verbatimModuleSyntax` happy. If the plugin starts shipping types, delete the shim.

`@stylistic/eslint-plugin` is registered manually in `src/config.ts` because antfu with `stylistic: false` does not register the plugin itself. The `style/...` rule prefix we use is the rename antfu defines. If antfu's rename map changes, the prefix must change.

## Release process

```bash
# bump version in package.json (or npm version <patch|minor|major>)
npm version <patch|minor|major>    # runs preversion: build + test
pnpm publish                       # runs prepublish: verify-deps + lint, then publishes
                                   # postpublish pushes the version tag
```

Before publishing a new major or significant minor, install the tarball in `cytechmobile/radicle-vscode-extension` and any other known consumer on throwaway branches and verify lint stays clean. The lint-on-itself check in this repo proves the config loads, but it does not prove every consumer-side rule still applies the way we expect.

## Supporting the project

Beyond code, a sustaining way to contribute is [sponsoring on Liberapay](https://liberapay.com/maninak/donate). Recurring micro-donations help keep this other projects actively maintained.
