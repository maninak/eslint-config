# @maninak/eslint-config

> _No-sweat, lint and format everything_! 🪄

[![Sponsor maninak on Liberapay](https://img.shields.io/badge/Liberapay-Donate-F6C915?logo=liberapay&logoColor=black)](https://liberapay.com/maninak/donate)

[![NPM downloads per week](https://img.shields.io/npm/dw/@maninak/eslint-config.svg)](https://npm-stat.com/charts.html?package=%40maninak%2Feslint-config)
[![Repos depending on @maninak/eslint-config](https://badgen.net/github/dependents-repo/maninak/eslint-config?color=blue)](https://github.com/maninak/eslint-config/network/dependents)
[![Github stars](https://badgen.net/github/stars/maninak/eslint-config)](https://github.com/maninak/eslint-config/stargazers)
[![rad: - z22BzXnj6B9PmE6P5Gg67XCDURPzB](https://img.shields.io/static/v1?label=rad%3A&message=z22BzXnj6B9PmE6P5Gg67XCDURPzB&color=6666FF&logo=radicle&logoColor=FFFFFF&cacheSeconds=64800)](https://app.radicle.at/nodes/seed.radicle.at/rad:z22BzXnj6B9PmE6P5Gg67XCDURPzB)

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
| Tailwind CSS                                                     | ✅     |

## Setup

### 1. Install

```bash
npm install -D @maninak/eslint-config eslint@^9.10.0
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

> _`--cache-strategy content` keys the cache on file **content** rather than the default
> mtime+size. It costs a cheap hash per file but the cache then survives changes that do not
> touch content: a `git checkout`, a branch switch, a fresh `git worktree`, or a
> format-on-save no-op. Without it, any of those invalidates the whole cache and the next run
> is a cold, full re-lint._

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

Off by default. Enabling it requires JSDoc on `export`ed declarations under conventional reusable-utility paths like `utils/`, `lib/`, etc. Opt in with:

```ts
export default maninak({
  requireJsdocInUtils: true,
})
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
