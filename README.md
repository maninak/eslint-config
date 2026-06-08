# @maninak/eslint-config

> _No-sweat, lint and format everything_! 🪄

[![Sponsor on Liberapay](https://img.shields.io/liberapay/patrons/maninak.svg?logo=liberapay)](https://liberapay.com/maninak/donate)

## Features

An opinionated, holistic lint-and-format suite designed to have your back, clean up after you, and stay maximally out of your way. Comes complete with supplemental recipes for git hooks, npm and CI scripts, VS Code configs and more.

- Lints your code with **ESLint** and formats it with **Prettier**
- Opts for spaces, single quotes, no semi, dangling commas (or whatever you'll set as an override)
- Optimized for TS, Vue, TailwindCSS, Node.js, Vitest
- Auto-fix most issues on `CTRL + S` and on `git commit`
- Auto-add missing imports on save (and remove unused ones)
- Infers eslintignore list from your `.gitignore` by default
- Based on [`@antfu/eslint-config`](https://github.com/antfu/eslint-config/)

## Supports

| Technology                                                       | Status |
| ---------------------------------------------------------------- | ------ |
| JavaScript                                                       | ✅     |
| TypeScript                                                       | ✅     |
| Vue 3                                                            | ✅     |
| Nuxt                                                             | ✅     |
| React                                                            | ✅     |
| Next.js                                                          | ✅     |
| Svelte                                                           | ✅     |
| JSX / TSX                                                        | ✅     |
| Node.js                                                          | ✅     |
| JSON / JSONC / JSON5                                             | ✅     |
| YAML                                                             | ✅     |
| TOML                                                             | ✅     |
| Markdown                                                         | ✅     |
| Test files (Vitest, Jest, Playwright, WDIO, Mocha, Jasmine, ...) | ✅     |
| Tailwind CSS                                                     | ✅     |
| Vue scoped CSS                                                   | ✅     |

## Setup

> _Works out of the box for JavaScript-only projects with no `tsconfig.json`. Type-aware rules activate only when you pass a `tsconfigPath` (see [Customization](#customization))._

### 1. Install

```bash
npm install -D @maninak/eslint-config eslint
```

> _`eslint` is installed alongside so the VS Code ESLint extension and any local `eslint` CLI invocation can resolve it. Under pnpm 11's default isolated `node_modules`, transitive dependencies are not hoisted, so a direct install is needed here._

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
    "lint": "eslint . --max-warnings 0 --no-warn-ignored --cache --cache-location node_modules/.cache/eslint"
  }
}
```

> [!TIP]
> To lint and auto-fix all files in your repo run:
>
> ```shell
> npm run lint -- --fix
> ```

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
  // Disable the Prettier VS Code extension; eslint-plugin-prettier handles formatting
  "prettier.enable": false,
  "editor.formatOnSave": false,

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
*.{cmd,[cC][mM][dD]} text eol=crlf
*.{bat,[bB][aA][tT]} text eol=crlf
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
    // -- A. Needed for the type-aware rules in this config --
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

    // -- C. Performance --
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
    "lint": "eslint . --max-warnings 0 --no-warn-ignored --cache --cache-location node_modules/.cache/eslint",
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
    // Point to TypeScript project(s) for type-aware linting rules.
    // Required when your tsconfig does not cover all linted files
    // (e.g. test files have their own tsconfig).
    typescript: {
      tsconfigPath: ['./tsconfig.json', './test/tsconfig.test.json'],
    },

    // Files and directories to exclude from linting (added to the built-in ignores)
    ignores: ['generated/**', 'src/webviews'],
  },

  // Additional flat config objects, merged after the maninak config
  {
    files: ['src/myModule.ts'],
    rules: {
      'ts/no-explicit-any': 'off',
    },
  },
)
```

All [antfu/eslint-config options](https://github.com/antfu/eslint-config#customization) are forwarded. See their docs for the full list.

### Multiple tsconfig projects

When different parts of your codebase use different TypeScript configs (e.g. source files and test files):

```js
// eslint.config.mjs
import maninak from '@maninak/eslint-config'

export default maninak({
  typescript: {
    tsconfigPath: [
      './tsconfig.json', // source files
      './test/tsconfig.test.json', // test files
    ],
  },
})
```

### Optional: Vue accessibility rules

Vue a11y rules are off by default. Enable them for projects that ship accessible UI components:

```js
// eslint.config.mjs
import maninak from '@maninak/eslint-config'

export default maninak({
  vue: {
    accessibility: true,
  },
})
```

> _Vue a11y covers `.vue` files only. For JSX/TSX (React and similar), add `eslint-plugin-jsx-a11y` separately._

### Optional: require JSDoc on shared utility code

Off by default. Enabling it requires JSDoc on `export`ed declarations under conventional reusable-utility paths like `utils/`, `lib/`, etc. Opt in with:

```ts
// eslint.config.mjs
import maninak from '@maninak/eslint-config'

export default maninak({
  requireJsdocInUtils: true,
})
```

### Disable Prettier formatting enforcement

If you prefer to handle formatting outside ESLint:

```js
// eslint.config.mjs
import maninak from '@maninak/eslint-config'

export default maninak(
  {
    /* main options */
  },
  {
    rules: {
      'prettier/prettier': 'off',
      'prettier-vue/prettier': 'off',
    },
  },
)
```

## Support

If this config saves you time, consider [sponsoring on Liberapay](https://liberapay.com/maninak/donate). Recurring micro-donations help me keep maintaining it (and all my other tools) in the open.

[![Donate using Liberapay](https://liberapay.com/assets/widgets/donate.svg)](https://liberapay.com/maninak/donate)

## License

[MIT](./LICENSE) License &copy; 2019-PRESENT [Kostis Maninakis](https://maninak.github.io)
