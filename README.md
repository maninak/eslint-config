# @maninak/eslint-config

> _No-sweat, lint and format everything_! 🪄

[![Sponsor maninak on Liberapay](https://img.shields.io/badge/Liberapay-Donate-F6C915?logo=liberapay&logoColor=black)](https://liberapay.com/maninak/donate)

[![NPM downloads per week](https://img.shields.io/npm/dw/@maninak/eslint-config.svg)](https://npm-stat.com/charts.html?package=%40maninak%2Feslint-config) [![Repos depending on @maninak/eslint-config](https://badgen.net/github/dependents-repo/maninak/eslint-config?color=blue)](https://github.com/maninak/eslint-config/network/dependents) [![Github stars](https://badgen.net/github/stars/maninak/eslint-config)](https://github.com/maninak/eslint-config/stargazers) [![rad: - z22BzXnj6B9PmE6P5Gg67XCDURPzB](https://img.shields.io/static/v1?label=rad%3A&message=z22BzXnj6B9PmE6P5Gg67XCDURPzB&color=6666FF&logo=radicle&logoColor=FFFFFF&cacheSeconds=64800)](https://app.radicle.at/nodes/seed.radicle.at/rad:z22BzXnj6B9PmE6P5Gg67XCDURPzB)

## Features

An opinionated, holistic lint-and-format suite designed to have your back, clean up after you, and stay maximally out of your way. Comes complete with supplemental recipes for git hooks, npm and CI scripts, VS Code configs and more.

- Lints your code with **ESLint** and formats it with **Prettier**
- Opts for spaces, single quotes, no semi, dangling commas (or whatever you'll set as an override)
- Optimized for TS, Vue, TailwindCSS, Node.js, Vitest
- Auto-fix most issues on `CTRL + S` and on `git commit`
- Auto-add missing imports, sort, and group them on save (and auto-remove unused ones)
- Infers eslintignore list from your `.gitignore`
- Dual support fo both ESM and CJS projects
- Based on [`@antfu/eslint-config`](https://github.com/antfu/eslint-config/)

## Supports

| Technology                                                       | Status |
| ---------------------------------------------------------------- | ------ |
| JavaScript / TypeScript                                          | ✅     |
| Vue (detected version specific rules) / Nuxt / scoped CSS        | ✅     |
| React / Next.js                                                  | ✅     |
| Svelte                                                           | ✅     |
| JSX / TSX                                                        | ✅     |
| Node.js                                                          | ✅     |
| JSON / JSONC / JSON5                                             | ✅     |
| YAML / TOML                                                      | ✅     |
| Markdown                                                         | ✅     |
| Test files (Vitest, Jest, Playwright, WDIO, Mocha, Jasmine, ...) | ✅     |
| Tailwind CSS (v3 and v4, auto-detected, see below)               | ✅     |
| CSS (see below)                                                  | ✅     |

### CSS

Your `.css` files were matched by no config at all before: not linted, not formatted. [`@eslint/css`](https://github.com/eslint/css) now lints them wherever the project has any CSS, catching things no other tool here can see: a misspelled property, a value no property accepts, a duplicated `@import` or keyframe selector, an unmatchable selector, a malformed `grid-template-areas`.

Where this project uses Tailwind, the parser is taught the Tailwind dialect, so `@theme`, `@utility`, `@apply` and `@custom-variant` read as the CSS they are rather than as parse errors. Parsing is tolerant, so a stylesheet built for PostCSS plugins keeps linting instead of failing outright on syntax this parser has never heard of.

```js
export default maninak({
  css: { available: 'newly' }, // an app targeting current browsers
  // css: false,               // or switch the rules off
})
```

`available` sets how new a feature may be before `css/use-baseline` objects. The default `'widely'` suits a site with a long browser tail; `'newly'` suits an app on current engines and stops the rule reporting things like `user-select` and `light-dark()`.

Coverage is standalone `.css` only. `@eslint/css` parses a whole file as CSS and has no way to reach an SFC's `<style>` block, which stays with `eslint-plugin-vue-scoped-css`.

Two rules are tuned rather than taken as shipped. `no-invalid-properties` allows unknown variables, since a stylesheet reading `var(--token)` cannot prove a token defined in another file exists. `no-invalid-at-rules` is off under Tailwind, because `tailwind-csstree` carries no descriptor table for a `@utility` body and would call every custom utility invalid.

### Tailwind CSS

Tailwind rules come from [`eslint-plugin-better-tailwindcss`](https://github.com/schoero/eslint-plugin-better-tailwindcss), which covers Tailwind 3 and 4. They come on by themselves: the preset spots Tailwind in your workspace and finds the file that defines your theme, which is the one CSS file doing `@import "tailwindcss"` on v4, or `tailwind.config.js` on v3. Nothing to configure.

It looks for Tailwind through `@nuxt/ui` and the `@tailwindcss/*` build plugins as well as a direct `tailwindcss` dependency, because a Nuxt UI app is a Tailwind app that never declares Tailwind. A copy installed only by one of your workspace's sub-packages counts too.

Nothing is ever guessed, though. The plugin reads your real theme from that file, and given none it falls back to Tailwind's stock theme, enforcing a class order you never configured while treating every themed class as unknown. So when the answer is not exactly one file, the rules stay off and the preset says which case it hit. That is what these options settle:

```js
export default maninak({
  // Tailwind v4: the CSS file that starts `@import "tailwindcss"`
  tailwind: { entryPoint: './apps/web/assets/css/main.css' },

  // Tailwind v3: your config file instead
  // tailwind: { tailwindConfig: './tailwind.config.js' },

  // or switch the rules off entirely
  // tailwind: false,
})
```

A path you pass by hand is held to a stricter standard than one the preset found: if it does not resolve, the config fails outright rather than linting against the wrong theme. You asked for these rules by name, so silently not running them would be the worse answer.

#### When Tailwind has to be a dependency

On **v4**, `tailwindcss` must be resolvable from the directory your entry-point CSS lives in. Tailwind resolves that file's own `@import "tailwindcss"` relative to the file, and no setting redirects it, so a copy carried in by `@nuxt/ui` does not satisfy it however it is installed. Add `tailwindcss` to the devDependencies of the package that owns that CSS file. The preset checks this up front and tells you so, because the plugin's own failure here is an uncaught throw part-way through the lint.

On **v3** there is no such requirement: a transitively-installed Tailwind is enough, and the preset points the plugin at it for you.

Two rules from the plugin's `recommended` set are off: `enforce-consistent-line-wrapping`, because it rewraps class strings across lines and formatting here belongs to prettier, and `no-unknown-classes`, because real projects mix Tailwind utilities with their own class names.

## Setup

### 1. Install

```bash
npm install -D @maninak/eslint-config eslint@^9.38.0
```

### 2. Create config file

```js
// eslint.config.mjs
import maninak from '@maninak/eslint-config'

export default maninak()
```

> _Using the `.mjs` extension forces the file to be parsed as an ES Module. This is compatible with both CommonJS and ESM projects without any other changes._

### 3. Add npm script

Add the following to your `package.json` for local and CI invocation:

```json
{
  "scripts": {
    "lint": "eslint . --max-warnings 0 --no-warn-ignored --cache --cache-strategy content --cache-location node_modules/.cache/eslint --concurrency=auto"
  }
}
```

> _To lint and auto-fix all files: `npm run lint -- --fix`._

> _`--cache-strategy content` keys the cache on file **content** rather than the default mtime+size. It costs a cheap hash per file but the cache then survives changes that do not touch content: a `git checkout`, a branch switch, a fresh `git worktree`, or a format-on-save no-op. Without it, any of those invalidates the whole cache and the next run is a cold, full re-lint._

> _`--concurrency=auto` splits the run across worker threads, and each worker loads the config separately (~1.7s each). It pays off only where per-file work exceeds that: a ~3,000-file type-aware codebase went from 109s to 82s, a small repo is a wash, and 400 files carrying no type information got slower (4.9s serial against 6.5s). Keep the flag on a large or type-aware repo, drop it on a small one, and leave it out of `lint-staged`, which runs on a few files where worker startup is pure overhead._

### 4. VS Code Support

Install the [VS Code ESLint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) and the [EditorConfig extension](https://marketplace.visualstudio.com/items?itemName=EditorConfig.EditorConfig).

To share these with your team, create `.vscode/extensions.json` with the following:

```json
{
  "recommendations": ["dbaeumer.vscode-eslint", "EditorConfig.EditorConfig"]
}
```

Then create `.vscode/settings.json` with the following and commit both files to your repo:

```jsonc
{
  // Disable the Prettier VS Code extension; eslint-plugin-prettier handles formatting.
  // Running both the Prettier extension and ESLint fix-on-save makes them fight over the
  // same edits, which shows up as a `prettier/prettier` warning that reappears every save.
  "prettier.enable": false,
  "editor.formatOnSave": false,

  // Pin the editor to 2-space indentation so it never inserts 4-space indents that
  // `prettier/prettier` then flags on every keystroke. The .editorconfig below enforces the
  // same; these two settings are the belt-and-suspenders for editors that ignore it.
  "editor.tabSize": 2,
  "editor.detectIndentation": false,

  // Auto-fix lint errors and auto-add missing imports on save
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.addMissingImports": "explicit",
  },

  // Tell the ESLint extension to also validate these file types beyond its defaults
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact",
    "vue",
    "markdown",
    "json",
    "jsonc",
    "yaml",
    "toml",
  ],

  // Optional personal preferences below

  // Highlight when a git commit subject line exceeds the conventional 72-character limit
  "git.inputValidationSubjectLength": 72,
  // Lint the git commit message input box (catches missing subject, body-without-blank-line, etc.)
  "git.inputValidation": true,
}
```

### 5. Line-break consistency between Linux/Mac and Windows

Create a `.gitattributes` file in your project root to ensure consistent line endings across operating systems:

```gitattributes
* text=auto eol=lf
```

Commit this file to your repo.

### 6. Cross-editor Support

Create an `.editorconfig` file in your project root to enforce consistent editor behaviour across all editors and IDEs (VS Code, WebStorm, Vim, Emacs, and others):

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

Commit this file to your repo. The [VS Code EditorConfig extension](https://marketplace.visualstudio.com/items?itemName=EditorConfig.EditorConfig) installed in step 4 picks this up automatically. Other editors support it via plugins or natively.

### 7. Recommended `tsconfig.json` options

The three groups below are independently useful. Group A is the minimum to get type-aware linting; B catches more bugs at compile time; C makes typecheck faster on cold and warm runs.

```jsonc
{
  "compilerOptions": {
    // -- A. Needed to support the type-aware rules in this config --
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "moduleDetection": "force",

    // -- B. Suggested stricter checks --
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "noPropertyAccessFromIndexSignature": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "allowUnusedLabels": false,
    "allowUnreachableCode": false,

    // -- C. Suggested performance options --
    "skipLibCheck": true,
    "incremental": true,
    "tsBuildInfoFile": "node_modules/.cache/typescript/.tsbuildinfo",
  },
}
```

> _Group B options can each surface latent bugs you didn't know existed. Turn them on one at a time on an existing codebase, fix what surfaces, then move on. Greenfield projects can enable all of B from day one._

### 8. Pre-commit hooks

Install the hook runner and the staged-file linter:

```bash
npm install -D simple-git-hooks lint-staged
```

Add the following to your `package.json`:

```jsonc
{
  "scripts": {
    "lint": "eslint . --max-warnings 0 --no-warn-ignored --cache --cache-strategy content --cache-location node_modules/.cache/eslint",
    // Ensures git hooks remain installed
    "postinstall": "npx simple-git-hooks",
  },
  "simple-git-hooks": {
    "pre-commit": "npx lint-staged",
  },
  "lint-staged": {
    "*": "eslint --fix --max-warnings 0 --no-warn-ignored",
  },
}
```

Then activate the hooks once right now (subsequent installs re-activate them automatically via `postinstall`):

```bash
npx simple-git-hooks
```

## Customization

Pass options to `maninak()` to configure features, or pass additional flat config objects as extra arguments:

```js
// eslint.config.mjs
import maninak from '@maninak/eslint-config'

export default maninak(
  {
    // Files and directories to exclude from linting (added to the built-in ignores)
    ignores: ['generated/**', 'src/deprecated'],
  },

  // Additional ESLint flat config objects, merged after the maninak config
  {
    files: ['src/myModule.ts'],
    rules: { 'ts/no-explicit-any': 'off' },
  },
)
```

All [antfu/eslint-config options](https://github.com/antfu/eslint-config#customization) are forwarded. See their docs for the full list.

### Multiple tsconfig files

A `tsconfig.json` at your project root activates type-aware linting automatically. From there, TypeScript's project service auto-discovers any nested file also literally named `tsconfig.json` (e.g. `./tsconfig.json` for source, `./test/tsconfig.json` for tests). No wiring needed:

```js
export default maninak({
  // implicit default when `./tsconfig.json` exists; set explicitly only to override
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
})
```

Auto-discovery is name-strict: a file like `tsconfig.test.json` or `tsconfig.wdio.json` is invisible to it. Either rename the file to `tsconfig.json` in its own directory, or list every config explicitly as an array:

```js
export default maninak({
  typescript: {
    tsconfigPath: ['./tsconfig.json', './test/e2e/tsconfig.wdio.json'],
  },
})
```

The array form is also a handy escape hatch for a single config with a non-standard name.

### Optional: Vue accessibility rules

Vue a11y rules are off by default. Enable them for projects that ship accessible UI components:

```js
export default maninak({
  vue: { accessibility: true },
})
```

> _Vue a11y covers `.vue` files only. For JSX/TSX (React and similar), add `eslint-plugin-jsx-a11y` separately._

### Optional: require JSDoc on shared utility code

Off by default. `true` requires JSDoc on `export`ed declarations under conventional reusable-utility paths (`utils/`, `util/`, `lib/`, `helpers/`, and the same names as single files). A free-text description alone satisfies it; `@param` and `@returns` stay optional.

```ts
export default maninak({
  requireJsdoc: true,
})
```

Pass an object when your reusable API lives elsewhere, or to change how strict the rule is:

```ts
export default maninak({
  requireJsdoc: {
    files: ['src/domain/**/*.ts', 'packages/*/src/**/*.ts'],
    severity: 'error',
  },
})
```

| Key | Default | What it does |
| --- | --- | --- |
| `files` | the utility globs above | Globs to enforce on, **replacing** the defaults |
| `extraFiles` | `[]` | Globs enforced **in addition** to whatever `files` resolves to |
| `publicOnly` | `true` | Only `export`ed declarations need a block |
| `require` | the three declaration kinds | Per-node-kind toggles, merged over the default (`FunctionDeclaration`, `MethodDefinition`, `ClassDeclaration`, `ArrowFunctionExpression`, `FunctionExpression`) |
| `description` | `true` | Also enforce `jsdoc/require-description` |
| `severity` | `'warn'` | Severity for both rules |

Test files (`*.test.*`, `*.spec.*`, `*.unit.*`, and anything under `test/`, `tests/`, `__tests__/`, `specs/`, `__specs__/`) are exempt whatever globs you pass.

> _`requireJsdocInUtils: true` is the old spelling of `requireJsdoc: true`. It still works, and is ignored when `requireJsdoc` is also set._

### Optional: enforce filename casing

Off by default. `true` requires camelCase for `.ts`, `.mts`, `.cts`, `.js`, `.mjs` and `.cjs` files, and PascalCase for `.vue` components.

```ts
export default maninak({
  filenameCase: true,
})
```

| Key        | Default        | What it does                                         |
| ---------- | -------------- | ---------------------------------------------------- |
| `ts`       | `'camelCase'`  | Casing for the JS/TS family, or `false` to skip them |
| `vue`      | `'pascalCase'` | Casing for `.vue`, or `false` to skip them           |
| `ignore`   | `[]`           | Extra globs exempt from the check                    |
| `severity` | `'error'`      | Severity for both blocks                             |

Casings are those of [`unicorn/filename-case`](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/filename-case.md): `camelCase`, `kebabCase`, `pascalCase`, `snakeCase`.

What it will not flag:

- **An all-lowercase single word.** `index.ts`, `noise.ts` and `fs.ts` are already valid camelCase.
- **The trailing segments of a multi-dot name.** `foo.test.ts` and `packIo.worker.ts` pass; only the leading segment is judged, so `pack-io.worker.ts` is reported as `packIo.worker.ts`.
- **`.tsx` and `.jsx`.** One repo legitimately holds PascalCase components and camelCase hooks under the same extension, so no single casing is right for them.
- **Vue and Nuxt convention paths**, when `vue` or `nuxt` is a dependency: `pages/`, `layouts/`, `middleware/`, `server/`, `app.vue`, `error.vue`, `*.config.*`, and any name with a dynamic segment such as `[id].vue`. Renaming one of those changes a route or stops the framework finding the file.

The rule reports without fixing, since renaming a file on disk would break every import of it. Each fix is a `git mv` plus an import rewrite.

### Type-aware linting inside `.vue` files

On by default, wherever it can be. Without it, rules that need type information (`ts/no-unsafe-argument`, `ts/no-unsafe-assignment`, `ts/no-unsafe-call`, `ts/no-unsafe-member-access`, `ts/no-unsafe-return`, `ts/no-misused-promises`, `ts/restrict-template-expressions` and the rest) run on `.ts` and stop at the `.vue` boundary. Nothing errors and nothing warns, so a Vue or Nuxt project can believe those rules are enforced everywhere while the files holding most of its code are exempt.

Three preconditions have to hold, each detected rather than assumed:

- **Vue support must be on**, which happens automatically when `vue` or `nuxt` is a dependency.
- **Type-aware linting must already be active**, meaning a resolved `tsconfig.json` (see [Multiple tsconfig files](#multiple-tsconfig-files)). A repo that never opted into type-aware linting is left exactly as it was.
- **That tsconfig's `include` must cover `.vue` files.** Nuxt's generated `.nuxt/tsconfig.json` does; a hand-rolled one often does not.

When one does not hold, the preset says so once and leaves your SFCs linted as before. It will not fail a lint over a default you never chose. Setting `vueTypeAware: true` by hand asks for it explicitly, and then an unmet precondition is a hard error instead, because silently not doing what you asked for is the worse answer.

To switch it off:

```ts
export default maninak({
  vueTypeAware: false,
})
```

That is the lever to reach for on lint time. Type-checking SFC script blocks costs roughly 1.5x on a Vue-heavy tree (measured: 60 SFCs went from ~3.0s to ~4.4s, about 23ms extra per SFC).

Two things worth knowing:

- **Coverage is the `<script>` block, not the template.** `vue-eslint-parser` hands typescript-eslint the script program, so an unsafe value is reported where it is created rather than where a template interpolation dereferences it.
- **Expect a wave of findings the first time.** These are pre-existing type holes that were never reported, not new ones.

### Optional: add your own import groups

The preset orders imports with `perfectionist/sort-imports`. ESLint replaces a rule's options rather than merging them, so adding one group by hand means copying the preset's whole `groups` array plus `internalPattern`, `order`, `type` and both newline keys, and that copy stops tracking the preset the moment any of them changes. `sortImports` takes only what is yours:

```ts
export default maninak({
  sortImports: {
    customGroups: [
      {
        groupName: 'extension-internal',
        elementNamePattern: '^extension(?:Utils|Helpers)/',
        after: 'value-external',
      },
    ],
  },
})
```

| Key               | What it does                                               |
| ----------------- | ---------------------------------------------------------- |
| `customGroups`    | Groups to splice into the preset's ordering                |
| `internalPattern` | Replaces the preset's `internalPattern` (`['^@/', '^~/']`) |

Each custom group takes `groupName`, one of `after` or `before` naming a preset group, and any other key `perfectionist/sort-imports` accepts in its own `customGroups` (`elementNamePattern`, `modifiers`, `selector`, and the rest). `after` and `before` find a group nested inside one of the preset's bundles, so `after: 'value-sibling'` works. Naming a group the preset does not have throws, rather than silently putting yours somewhere arbitrary. With neither key the group lands just ahead of the `unknown` catch-all.

The preset's groups, in order: `type-import`, `[type-parent, type-sibling, type-index, type-internal]`, `value-builtin`, `value-external`, `value-internal`, `[value-parent, value-sibling, value-index]`, `side-effect`, `ts-equals-import`, `unknown`.

### Markdown prose is soft-wrapped

Prettier runs with `proseWrap: "never"`, so one paragraph, list item, blockquote or table row is one source line however long it gets. The reader's client wraps to the reader's width, and a three-word edit stays a three-word diff instead of reflowing every line after it.

Adopting this in an existing repo unwraps its markdown on the first `--fix`. Two consequences worth expecting: consecutive lines separated only by a newline (a stack of badges, for instance) join into one line, and a table whose widest row exceeds `printWidth` loses its column padding, since it cannot be aligned inside the line budget anyway.

To keep hand-wrapped prose instead, put a `.prettierrc.json` at the repo root; it wins over the preset:

```json
{ "proseWrap": "preserve" }
```

### Disable Prettier formatting enforcement

If you prefer to handle formatting outside ESLint:

```js
export default maninak(
  {},
  {
    rules: {
      'prettier/prettier': 'off',
      'prettier-vue/prettier': 'off',
    },
  },
)
```

### Silencing a rule

It might be the case that a rule is firing but you know better and would prefer it silenced. Here's how to silence a rule inline:

```ts
const unused1 = unusedVar // eslint-disable-line unused-imports/no-unused-vars

// eslint-disable-next-line unused-imports/no-unused-vars
const unused2 = unusedVar

/* eslint-disable unused-imports/no-unused-vars */
const unused3 = unusedVar
const unused4 = unusedVar
/* eslint-enable unused-imports/no-unused-vars */
```

To silence a rule across the entire file, put the `eslint-disable` at the top with no matching `eslint-enable`. To silence across the whole repo, turn it off in `eslint.config.mjs` (see the flat config examples above).

## Support

If this library saves you time, or you would like to see it keep getting better, here are a few ways to appreciate prior and support further development:

- 🌱 Star this repo on [GitHub](https://github.com/cytechmobile/radicle-vscode-extension) and seed it on [Radicle](https://app.radicle.at/nodes/seed.radicle.at/rad:z3Makm6fsQQXmpSFE43DZqwupaEhk)
- 🗣️ Share it with colleagues, or leave a rating on the [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=radicle-ide-plugins-team.radicle) or [Open VSX](https://open-vsx.org/extension/radicle-ide-plugins-team/radicle)
- 💛 Chip in a recurring micro-donation on Liberapay, if you can comfortably spare it.

[![Sponsor maninak on Liberapay](https://img.shields.io/badge/Liberapay-Donate-F6C915?logo=liberapay&logoColor=black)](https://liberapay.com/maninak/donate)

Every bit, a kind message included, makes maintaining this and my other open-source tools more sustainable. Thank you!

## License

[MIT](./LICENSE) License &copy; 2019-PRESENT [Kostis Maninakis](https://maninak.github.io)
