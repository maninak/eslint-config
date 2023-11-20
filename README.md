# @maninak/eslint-config

>_No-sweat, lint and format everything_!

Design goal: maximize DX, minimize friction, auto-fix as much as possible! 🪄

- <span style="text-decoration: underline; text-decoration-skip-ink: none; text-decoration-style: wavy; text-decoration-color: rgb(204, 167, 0);">Yellow squiggles</span> for most benign rules triggered while you're in the middle of writing new, unfinished code, leaving the <span style="text-decoration: underline; text-decoration-skip-ink: none; text-decoration-style: wavy; text-decoration-color: rgb(188, 22, 22);">red squiggles</span> for the important issues needing your attention
- Lints your code with **ESLint** _and_ formats it with **Prettier**
- Supports JS, TS, Vue, JSX, JSON, YAML, Markdown, TailwindCSS, Node.js, Vitest, Jest, and more
- Infers eslintignore list from your `.gitignore` by default
- Spaces, single quotes, no semi, dangling commas, sorted imports
- Auto-fix on `CTRL + S` and on `git commit`
- Auto-add missing imports on save (and remove unused ones)
- Reasonable defaults, best practices, simple setup, single dep install
- **Code style principle**: Minimal for reading, stable for diff, consistent, safe, strict
- Based on [`@antfu/eslint-config`](https://github.com/antfu/eslint-config/)

## Usage

### Install

```bash
npm i -D @maninak/eslint-config
```

### Create config file

ESM

If you're in a repo using [`"type": "module"`](https://nodejs.org/api/packages.html#type) then create an `eslint.config.js` with the following contents:

```js
import maninak from '@maninak/eslint-config'

export default maninak({
  typescript: { tsconfigPath: 'tsconfig.json' },
})
```

CJS

> [!NOTE]
> Not supported yet. 🙆‍♂️

<!-- Otherwise, use the following inside `eslint.config.js`:

```js
const maninak = require('@maninak/eslint-config').default

module.exports = maninak({
  typescript: { tsconfigPath: 'tsconfig.json' },
})
``` -->

## Migration

If you are still using ESLint's legacy config format it is strongly suggested that you migrate to the their [new flat config](https://eslint.org/docs/latest/use/configure/configuration-files-new).

<details>
<summary>Show more</summary>

### Automated

The base package team provides an experimental CLI tool to help with the migration.

Commit any unsaved changes and then run:

```shell
npx @antfu/eslint-config@latest
```

### Combining flat and legacy config formats

```js
// eslint.config.js
import maninak from '@maninak/eslint-config'
import { FlatCompat } from '@eslint/eslintrc'

module.exports = maninak(
  {
    typescript: { tsconfigPath: 'tsconfig.json' },
  },

  // Legacy config example
  ...new FlatCompat().config({
    extends: [
      'eslint:recommended',
      // Other extends...
    ],
    overrides: [
      {
        files: ['*.vue'],
        extends: ['plugin:vue-scoped-css/vue3-recommended'],
        parser: 'vue-eslint-parser',
        parserOptions: { parser: '@typescript-eslint/parser' },
        rules: { 'vue-scoped-css/no-deprecated-v-enter-v-leave-class': 'error' },
      },
    ]
  }),

  // Other flat ESLint configs...
)
```

> [!IMPORTANT]
> `.eslintignore` no longer works in the new flat ESLint config. Use `ignores` (flat config) or `excludedFiles` (legacy config).
</details>

## Suggested recipes

It is strongly suggested that you apply all recipes.

### Package.json script

To lint all files on command, ideal also to run in your CI, merge this into to your `package.json`:

```json
{
  "scripts": {
    "lint": "eslint . --max-warnings 0 --no-warn-ignored --cache --cache-location node_modules/.cache/eslint",
  }
}
```

> [!TIP]
> To lint and auto-fix all files in your repo run:
>
> ```shell
> npm run lint -- --fix
> ```

### Auto-lint changed files on git commit

To automatically lint and auto-fix (only) all staged files before every commit, add the following to your `package.json`:

```json
{
  "lint-staged": {
    "*": "eslint --fix --max-warnings 0 --no-warn-ignored --cache --cache-location node_modules/.cache/eslint"
  },
  "simple-git-hooks": {
    "pre-commit": "npx lint-staged"
  },
}
```

> [!IMPORTANT]
> Make sure to [follow these steps](https://github.com/toplenboren/simple-git-hooks#when-migrating-from-husky-git-hooks-are-not-running)
 if you are migrating from husky

### VS Code Support

To get in-editor <span style="text-decoration: underline; text-decoration-skip-ink: none; text-decoration-style: wavy; text-decoration-color: rgb(204, 167, 0);">squiggles</span>, auto-fix, auto-import and more follow the next steps.

Install [VS Code ESLint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint).

Add the following settings to your `.vscode/settings.json`:

```jsonc
{
  /* eslint-disable jsonc/sort-keys */

  "git.inputValidationSubjectLength": 72,

  "eslint.experimental.useFlatConfig": true,

  // Disable other linters/formatters, use eslint instead
  "prettier.enable": false,
  "editor.formatOnSave": false,
  "tailwindCSS.validate": false,
  // Auto fix eslint issues on save
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.organizeImports": "never"
  },

  // Enable eslint for all supported languages
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact",
    "vue",
    "html",
    "markdown",
    "json",
    "jsonc",
    "yaml",
  ],
}
```

### Line-break consistency between Linux/Mac and Windows

Add the following to your `.gitattributes`:

```conf
* text=auto eol=lf
```

### Cross-editor Support

Add the following to your `.editorconfig`:

```conf
# editorconfig.org
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

### Stricter TypeScript checks

Consider adding the following to your `tsconfig.json` and fixing any issues that pop up (or comment out hard-to-fix options):

```jsonc
{
  "compilerOptions": {
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "strict": true
  },
}
```

## Configuration

Certain rules only get enabled in specific files, for example, `ts/*` rules only get enabled in `.ts` files and `vue/*` rules only in `.vue` files. If you want to override the rules, you need to specify the file extension:

```js
// eslint.config.js
import maninak from '@maninak/eslint-config'

export default maninak(
  { vue: true, typescript: true },
  {
    // Without `files` specified, these are general rules for all files
    rules: {
      'style/semi': ['error', 'never'],
    },
  }
  {
    // Remember to specify the file glob as done here, otherwise thise vue rule will try to run on non-vue files too
    files: ['**/*.vue'],
    rules: {
      'vue/operator-linebreak': ['error', 'before'],
    },
  },
)
```

There's also an `overrides` property in the first param for ease of use:

```js
// eslint.config.js
import maninak from '@maninak/eslint-config'

export default maninak({
  overrides: {
    vue: {
      'vue/operator-linebreak': ['error', 'before'],
    },
    typescript: {
      'ts/consistent-type-definitions': ['error', 'interface'],
    },
    // ...
  }
})
```

### Optional Extra Rules

The config also provides some optional plugins/rules for extended usages.

#### `perfectionist` (sorting)

The plugin [`eslint-plugin-perfectionist`](https://github.com/azat-io/eslint-plugin-perfectionist) allows you to sorted object keys, imports, etc, with auto-fix. It's already installed for you but no rules are enabled by default.

It's recommended to opt-in on each file individually using [configuration comments](https://eslint.org/docs/latest/use/configure/rules#using-configuration-comments-1).

```js
/* eslint perfectionist/sort-objects: "error" */
const objectWantedToSort = {
  a: 2,
  b: 1,
  c: 3,
}
/* eslint perfectionist/sort-objects: "off" */
```

### Plugins Renaming

Since flat ESLint config requires us to explicitly provide the plugin names (instead of mandatory convention from npm package name), we renamed some plugins to make the overall scope more consistent and easier to write.

| New Prefix | Original Prefix | Source Plugin |
| --- | --- | --- |
| `import/*` | `i/*` | [eslint-plugin-i](https://github.com/un-es/eslint-plugin-i) |
| `node/*` | `n/*` | [eslint-plugin-n](https://github.com/eslint-community/eslint-plugin-n) |
| `yaml/*` | `yml/*` | [eslint-plugin-yml](https://github.com/ota-meshi/eslint-plugin-yml) |
| `ts/*` | `@typescript-eslint/*` | [@typescript-eslint/eslint-plugin](https://github.com/typescript-eslint/typescript-eslint) |
| `test/*` | `vitest/*` | [eslint-plugin-vitest](https://github.com/veritem/eslint-plugin-vitest) |
| `test/*` | `no-only-tests/*` | [eslint-plugin-no-only-tests](https://github.com/levibuzolic/eslint-plugin-no-only-tests) |

When you want to override rules or disable them inline, you need to update to the new prefix:

```diff
-// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
+// eslint-disable-next-line ts/consistent-type-definitions
type foo = { bar: 2 }
```

## Versioning Policy

This project follows [Semantic Versioning](https://semver.org/) for releases. However, since this is just a config and involved with opinions and many moving parts, we don't treat rules changes as breaking changes.

### Changes Considered as Breaking Changes

- Node.js version requirement changes
- Huge refactors that might break the config
- Plugins made major changes that might break the config
- Changes that might affect most of the codebases

### Changes Considered as Non-breaking Changes

- Enable/disable rules and plugins (that might become stricter)
- Rules options changes
- Version bumps of dependencies

## FAQ

### I found a rule that shows a red squiggle but should have yellow instead (or any other problem/idea)

Awesome! Please open an Issue with a reproduction code snippet or consider opening a PR to patch it.

### I prefer XYZ...

Sure, you can config and override rules locally in your project to fit your needs. If that still does not work for you, you can always fork this repo and maintain your own.

## Check Also

- [maninak/ts-xor](https://github.com/maninak/ts-xor) - Compose custom types containing mutually exclusive keys

🫶 Follow me on [X](https://twitter.com/maninak_).

## License

[MIT](./LICENSE) License &copy; 2019-PRESENT [Kostis Maninakis](https://maninak.github.io)
