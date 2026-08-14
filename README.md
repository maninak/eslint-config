# @maninak/eslint-config

> _No-sweat, lint and format everything_! 🪄

[![Sponsor maninak on Liberapay](https://img.shields.io/badge/Liberapay-Donate-F6C915?logo=liberapay&logoColor=black)](https://liberapay.com/maninak/donate)

[![NPM downloads per week](https://img.shields.io/npm/dw/@maninak/eslint-config.svg)](https://npm-stat.com/charts.html?package=%40maninak%2Feslint-config) [![Repos depending on @maninak/eslint-config](https://badgen.net/github/dependents-repo/maninak/eslint-config?color=blue)](https://github.com/maninak/eslint-config/network/dependents) [![Github stars](https://badgen.net/github/stars/maninak/eslint-config)](https://github.com/maninak/eslint-config/stargazers) [![rad: - z22BzXnj6B9PmE6P5Gg67XCDURPzB](https://img.shields.io/static/v1?label=rad%3A&message=z22BzXnj6B9PmE6P5Gg67XCDURPzB&color=6666FF&logo=radicle&logoColor=FFFFFF&cacheSeconds=64800)](https://app.radicle.at/nodes/seed.radicle.at/rad:z22BzXnj6B9PmE6P5Gg67XCDURPzB)

## Features

An opinionated lint-and-format suite that has your back, cleans up after you, and stays out of your way. Ships with recipes for git hooks, npm and CI scripts, and editor configs.

- Lints your code with **ESLint** and formats it with **Prettier**
- Formats with spaces, single quotes, no semicolons and trailing commas, each overridable
- Carries dedicated rules for TypeScript, Vue, Tailwind CSS, Node.js and test files
- Fixes most findings on save and on `git commit`, once you add steps 4 and 8 below
- Adds missing imports on save, removes unused ones, and keeps the rest sorted and grouped
- Skips whatever your `.gitignore` skips, with no second ignore list to maintain
- Works in both ESM and CJS projects
- Based on [`@antfu/eslint-config`](https://github.com/antfu/eslint-config/)

## Supports

| Technology                                                       | Status |
| ---------------------------------------------------------------- | ------ |
| JavaScript / TypeScript                                          | ✅     |
| Vue (rules matched to the installed major) / Nuxt / scoped CSS   | ✅     |
| React / Next.js                                                  | ✅     |
| Svelte                                                           | ✅     |
| JSX / TSX                                                        | ✅     |
| Node.js                                                          | ✅     |
| JSON / JSONC / JSON5                                             | ✅     |
| YAML / TOML                                                      | ✅     |
| Markdown                                                         | ✅     |
| Test files (Vitest, Jest, Playwright, WDIO, Mocha, Jasmine, ...) | ✅     |
| Tailwind CSS (v3 and v4, auto-detected)                          | ✅     |
| CSS                                                              | ✅     |

## Setup

Steps 1 to 3 get you linting. Steps 4 to 8 are independent of each other and of the rest, adopt any, all or none.

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

> _The `.mjs` extension forces the file to be parsed as an ES module, so the same config file works in a CommonJS project and an ESM one alike, with no other changes._

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

> _`--cache-strategy content` keys the cache on file content instead of mtime, so a `git checkout`, a branch switch or a fresh worktree does not throw the whole cache away. Always worth it._

> _`--concurrency=auto` costs each worker its own config load (~1.7s), so it only pays where per-file work exceeds that: a 3,000-file type-aware repo went from 109s to 82s, while 400 files carrying no type-aware rules got slower, from 4.9s to 6.5s. Keep it on a large or type-aware repo, drop it on a small one, and leave it out of `lint-staged`._

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
  // eslint-plugin-prettier already formats. Leaving the Prettier extension on too makes the
  // two fight over the same edits, as a `prettier/prettier` warning that returns every save.
  "prettier.enable": false,
  "editor.formatOnSave": false,

  // Never insert 4-space indents that `prettier/prettier` then flags on every keystroke.
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

  // Flag a commit subject over the conventional 72 chars, and lint the message box
  "git.inputValidationSubjectLength": 72,
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

The three groups below are independent of each other. A is the baseline this preset assumes, and `strict` in particular is what the type-aware rules read to tell a nullable value from a safe one. B catches more bugs at compile time. C makes `tsc` faster on cold and warm runs.

```jsonc
{
  "compilerOptions": {
    // -- A. The baseline this preset assumes --
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

Add the following to your `package.json`, alongside the `lint` script from step 3:

```jsonc
{
  "scripts": {
    // Reinstalls the hooks after every `npm install`, so they cannot silently go missing
    "postinstall": "npx simple-git-hooks",
  },
  "simple-git-hooks": {
    "pre-commit": "npx lint-staged",
  },
  // Same cache as step 3 on purpose: a pre-commit run then warms the cache the full run reads
  "lint-staged": {
    "*": "eslint --fix --max-warnings 0 --no-warn-ignored --cache --cache-strategy content --cache-location node_modules/.cache/eslint",
  },
}
```

Then activate the hooks once by hand. Every later `npm install` re-activates them through `postinstall`:

```bash
npx simple-git-hooks
```

## Customization

`maninak()` takes no required arguments. To change something, pass an options object first, then any number of extra flat config objects, which are merged after the preset:

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

Every [antfu/eslint-config option](https://github.com/antfu/eslint-config#customization) is forwarded unchanged. On top of those, this preset adds six of its own:

| Option | Default | What it does |
| --- | --- | --- |
| [`css`](#css) | on when the project has any `.css` | Lints `.css`, Tailwind dialect included |
| [`tailwind`](#tailwind-css) | on when exactly one theme file is found | Tailwind class rules |
| [`vueTypeAware`](#type-aware-linting-inside-vue-files) | `true` | Extends type-aware rules into `.vue` |
| [`requireJsdoc`](#require-jsdoc-on-shared-utility-code) | `false` | JSDoc on exported utility code |
| [`filenameCase`](#enforce-filename-casing) | `false` | One casing convention for filenames |
| [`sortImports`](#add-your-own-import-groups) | the preset's own groups | Splices in import groups of your own |

Skip to whichever one you came for.

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

### Vue accessibility rules

Vue a11y rules are off by default. Enable them for projects that ship accessible UI components:

```js
export default maninak({
  vue: { accessibility: true },
})
```

> _Vue a11y covers `.vue` files only. For JSX/TSX (React and similar), add `eslint-plugin-jsx-a11y` separately._

### Require JSDoc on shared utility code

Off by default. `true` requires a JSDoc block on `export`ed declarations under the folders that conventionally hold reusable utilities (`utils/`, `util/`, `lib/`, `helpers/`), and in single files carrying those same names (`utils.ts`). A free-text description alone satisfies it; `@param` and `@returns` stay optional.

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
| `require` | `FunctionDeclaration`, `MethodDefinition` and `ClassDeclaration` on; `ArrowFunctionExpression` and `FunctionExpression` off | Per-node-kind toggles, merged over that default rather than replacing it |
| `description` | `true` | Also enforce `jsdoc/require-description` |
| `severity` | `'warn'` | Severity for `jsdoc/require-jsdoc` and `jsdoc/require-description` alike |

Test files (`*.test.*`, `*.spec.*`, `*.unit.*`, and anything under `test/`, `tests/`, `__tests__/`, `specs/`, `__specs__/`) are exempt whatever globs you pass.

> _`requireJsdocInUtils: true` is the old spelling of `requireJsdoc: true`. It still works, and is ignored when `requireJsdoc` is also set._

### Enforce filename casing

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
| `severity` | `'error'`      | Severity for the JS/TS and `.vue` checks alike       |

Casings are those of [`unicorn/filename-case`](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/filename-case.md): `camelCase`, `kebabCase`, `pascalCase`, `snakeCase`.

Exempt by design: all-lowercase single words (`index.ts` is already camelCase), the trailing segments of a multi-dot name (only `pack-io` in `pack-io.worker.ts` is judged), `.tsx` and `.jsx` (one repo legitimately mixes PascalCase components with camelCase hooks), and Vue/Nuxt convention paths such as `pages/`, `layouts/`, `server/`, `error.vue` and `[id].vue`, where renaming would change a route or hide the file from the framework.

It reports without fixing: renaming a file would break every import of it, so each fix is a `git mv` plus an import rewrite.

### Type-aware linting inside `.vue` files

On by default, wherever the three preconditions below hold. Without it the rules that need type information (`ts/no-unsafe-*`, `ts/no-misused-promises`, `ts/restrict-template-expressions` and the rest) run on `.ts` and stop at the `.vue` boundary, silently: a Vue or Nuxt project can believe they are enforced everywhere while the files holding most of its code are exempt.

Three preconditions have to hold, each detected rather than assumed:

- **Vue support must be on**, which happens automatically when `vue` or `nuxt` is a dependency.
- **Type-aware linting must already be active**, meaning a resolved `tsconfig.json` (see [Multiple tsconfig files](#multiple-tsconfig-files)). A repo that never opted into type-aware linting is left exactly as it was.
- **That tsconfig's `include` must cover `.vue` files.** Nuxt's generated `.nuxt/tsconfig.json` does; a hand-rolled one often does not.

When one does not hold, the preset warns once and leaves your SFCs as they were, rather than failing a lint over a default you never chose. Setting `vueTypeAware: true` by hand asks for it explicitly, and then an unmet precondition is a hard error instead.

```ts
export default maninak({
  vueTypeAware: false, // the lever to reach for on lint time
})
```

<details><summary>What it costs and what it covers</summary>

Type-checking SFC script blocks costs roughly 1.5x on a Vue-heavy tree: 60 SFCs went from ~3.0s to ~4.4s, about 23ms extra per SFC. Coverage is the `<script>` block, not the template, so an unsafe value is reported where it is created. Expect a wave of findings the first time; they are pre-existing type holes, not new ones.

</details>

### CSS

Nothing else in this preset reads `.css` files: without this option they are neither linted nor formatted. [`@eslint/css`](https://github.com/eslint/css) lints them wherever the project has any CSS at all, catching what no other tool here can see: a misspelled property, a value no property accepts, a duplicated `@import` or keyframe selector, an unmatchable selector, a malformed `grid-template-areas`.

```js
export default maninak({
  css: { available: 'newly' }, // an app targeting current browsers
  // css: false,               // or switch the rules off
})
```

`available` sets how new a feature may be before `css/use-baseline` objects. The default `'widely'` suits a site with a long browser tail; `'newly'` suits an app on current engines and stops the rule reporting things like `user-select` and `light-dark()`.

Where the project uses Tailwind, the parser is taught the Tailwind dialect, so `@theme`, `@utility`, `@apply` and `@custom-variant` read as the CSS they are rather than as parse errors. Parsing is tolerant: syntax the parser does not recognise, such as a PostCSS plugin's own at-rule, is skipped rather than taking the whole file down with it.

Coverage is standalone `.css` only: `@eslint/css` parses a whole file as CSS and cannot reach an SFC `<style>` block, which stays with `eslint-plugin-vue-scoped-css`.

### Tailwind CSS

Tailwind rules come from [`eslint-plugin-better-tailwindcss`](https://github.com/schoero/eslint-plugin-better-tailwindcss) and cover Tailwind 3 and 4. They come on by themselves: the preset spots Tailwind in your workspace, including through `@nuxt/ui` and the `@tailwindcss/*` build plugins, and finds the file that defines your theme. That is the one CSS file doing `@import "tailwindcss"` on v4, or `tailwind.config.js` on v3. Nothing to configure.

Nothing is guessed, though. Given no theme the plugin falls back to Tailwind's stock one, enforcing a class order you never configured while treating every themed class as unknown. So unless exactly one file answers to it, the rules stay off and the preset says which it found, none or several. These options settle it:

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

A path you pass by hand is held to a stricter standard than one the preset found: if it does not resolve, the config fails outright rather than linting against the wrong theme.

<details><summary>When Tailwind has to be a real dependency, and which rules are off</summary>

On **Tailwind v4**, `tailwindcss` must be resolvable from the directory your entry-point CSS lives in, because Tailwind resolves that file's own `@import "tailwindcss"` relative to the file and no setting redirects it. A copy carried in by `@nuxt/ui` does not satisfy it, so add `tailwindcss` to the devDependencies of the package owning that CSS file. The preset checks this up front, since the plugin's own failure here is an uncaught throw part-way through the lint. On **v3** there is no such requirement: a transitively-installed Tailwind is enough and the preset points the plugin at it for you.

Two rules from the plugin's `recommended` set are off: `enforce-consistent-line-wrapping`, because rewrapping class strings is formatting and that belongs to prettier, and `no-unknown-classes`, because real projects mix Tailwind utilities with their own class names.

</details>

### Add your own import groups

The preset orders imports with `perfectionist/sort-imports`. ESLint replaces a rule's options rather than merging them, so adding one group by hand means copying the preset's entire `sort-imports` configuration into your own config, where the copy stops tracking the preset the moment any of it changes. `sortImports` takes only what is yours:

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

<details><summary>Placement rules and the preset's own group order</summary>

Each custom group takes `groupName`, one of `after` or `before` naming a preset group, and any other key `perfectionist/sort-imports` accepts in its own `customGroups` (`elementNamePattern`, `modifiers`, `selector`, and the rest). `after` and `before` can name a group that sits inside one of the preset's bracketed bundles, not only a top-level one, so `after: 'value-sibling'` works. Naming a group the preset does not have makes the config throw on startup, rather than silently placing yours somewhere arbitrary. With neither key the group lands just ahead of the `unknown` catch-all.

The preset's groups, in order: `type-import`, `[type-parent, type-sibling, type-index, type-internal]`, `value-builtin`, `value-external`, `value-internal`, `[value-parent, value-sibling, value-index]`, `side-effect`, `ts-equals-import`, `unknown`.

</details>

### Markdown prose is soft-wrapped

Prettier runs with `proseWrap: "never"`, so one paragraph, list item, blockquote or table row is one source line however long it gets. The reader's client wraps to the reader's width, and a three-word edit stays a three-word diff instead of reflowing every line after it.

<details><summary>What the first <code>--fix</code> does to an existing repo</summary>

Adopting the preset in an existing repo unwraps that repo's markdown on the first `--fix`. Two consequences worth expecting: consecutive lines separated only by a newline (a stack of badges, for instance) join into one line, and a table whose widest row exceeds `printWidth` loses its column padding, since it cannot be aligned inside the line budget anyway.

</details>

To keep hand-wrapped prose instead, put a `.prettierrc.json` at your repo root. Prettier reads it in preference to the preset's own settings:

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

When a rule fires and you know better:

```ts
const unused1 = unusedVar // eslint-disable-line unused-imports/no-unused-vars

// eslint-disable-next-line unused-imports/no-unused-vars
const unused2 = unusedVar

/* eslint-disable unused-imports/no-unused-vars */
const unused3 = unusedVar
const unused4 = unusedVar
/* eslint-enable unused-imports/no-unused-vars */
```

Omit the closing `eslint-enable` to silence the rest of the file, or turn the rule off in `eslint.config.mjs` to silence the whole repo.

## Support

If this library saves you time, or you would like to see it keep getting better, here are a few ways to appreciate prior and support further development:

- 🌱 Star this repo on [GitHub](https://github.com/maninak/eslint-config) and seed it on [Radicle](https://app.radicle.at/nodes/seed.radicle.at/rad:z22BzXnj6B9PmE6P5Gg67XCDURPzB)
- 🗣️ Share it with colleagues who spend their evenings arguing about semicolons
- 💛 Chip in a recurring micro-donation on Liberapay, if you can comfortably spare it.

[![Sponsor maninak on Liberapay](https://img.shields.io/badge/Liberapay-Donate-F6C915?logo=liberapay&logoColor=black)](https://liberapay.com/maninak/donate)

Every bit, a kind message included, makes maintaining this and my other open-source tools more sustainable. Thank you!

## License

[MIT](./LICENCE) License &copy; 2019-PRESENT [Kostis Maninakis](https://maninak.github.io)
