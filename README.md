# @maninak/eslint-config

>_No-sweat, lint and format everything_!

- Goal: maximum DX, minimum distraction, auto-fix as much as possible! 🪄
- Uses <u style="text-decoration-skip-ink: none; text-decoration-style: wavy; text-decoration-color: rgb(204, 167, 0);">yellow squiggles</u> for most rules, important when your code is in WIP state, leaving the red color for the <u style="text-decoration-skip-ink: none; text-decoration-style: wavy; text-decoration-color: rgb(188, 22, 22);">important linting and typing issues</u> you're actually interested in
- Lints with **ESLint** _and_ formats your code with **Prettier**
- Supports JS, TS, JSX, Vue, JSON, YAML, Markdown, TailwindCss, Node.js, testing code, ...
- Infers eslintignore list from `.gitignore` by default
- Spaces, single quotes, no semi, dangling commas, sorted imports
- Auto-fix on save and on pre-commit
- Auto-add missing imports (or remove unused ones) on save
- Reasonable defaults, best practices, dead-simple config, single dep install
- **Code style principle**: Minimal for reading, stable for diff, consistent, safe, strict
- Based on [`@antfu/eslint-config`](https://github.com/antfu/eslint-config/)

## Usage

### Install

```bash
npm i -D @maninak/eslint-config
```

### Create config file

#### In a Node.js repo with [`"type": "module"`](https://nodejs.org/api/packages.html#type)

Just create an `esling.config.js` with the following contents and you're good to go!

```js
import maninak from '@maninak/eslint-config'

export default maninak({
  typescript: { tsconfigPath: 'tsconfig.json' },
})
```

#### In a CommonJS repo

> [!NOTE]
> Not supported yet. 🙆‍♂️

<!-- ```js
// eslint.config.js
const antfu = require('@antfu/eslint-config').default

module.exports = antfu()
``` -->

#### Combining ESLint Flat and legacy config formats for easier migration:

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
> `.eslintignore` no longer works in flat ESLint config. Use `ignores` (flat config) or `excludedFiles` (legacy config).

### Add package.json script

Merge this into to your `package.json`:

```json
{
  "scripts": {
    "lint": "eslint . --max-warnings 0 --no-warn-ignored --cache --cache-location node_modules/.cache/eslint",
  }
}
```

### Lint git-staged files on pre-commit

If you want to apply lint and auto-fix before every commit, you can add the following to your `package.json`:

```json
{
  "simple-git-hooks": {
    "pre-commit": "npx lint-staged"
  },
  "lint-staged": {
    "*": "eslint --fix --max-warnings 0 --no-warn-ignored --cache --cache-location node_modules/.cache/eslint"
  },
}
```

> [!IMPORTANT]
> Make sure to [follow these steps](https://github.com/toplenboren/simple-git-hooks#when-migrating-from-husky-git-hooks-are-not-running)
 if you are migrating from husky

### VS Code Support (in-editor <u style="text-decoration-skip-ink: none; text-decoration-style: wavy; text-decoration-color: rgb(204, 167, 0);">〰️ squiggles</u>, 🛠️ auto fix, 📦 auto-import, ...)

Install [VS Code ESLint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint).

Add the following settings to your `.vscode/settings.json`:

```jsonc
{
  /* eslint-disable jsonc/sort-keys */

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

  // Silences the stylistic rules in you IDE, but will still auto-fix them
  "eslint.rules.customizations": [
    { "rule": "style/*", "severity": "off" },
    { "rule": "*-indent", "severity": "off" },
    { "rule": "*-spacing", "severity": "off" },
    { "rule": "*-spaces", "severity": "off" },
    { "rule": "*-order", "severity": "off" },
    { "rule": "*-dangle", "severity": "off" },
    { "rule": "*-newline", "severity": "off" },
    { "rule": "*quotes", "severity": "off" },
    { "rule": "*semi", "severity": "off" }
  ],

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
    "yaml"
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
    "moduleDetection": "force",
    "strict": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "skipLibCheck": true
  },
}
```

## Rule Overrides

Certain rules would only be enabled in specific files, for example, `ts/*` rules would only be enabled in `.ts` files and `vue/*` rules would only be enabled in `.vue` files. If you want to override the rules, you need to specify the file extension:

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
    // Remember to specify the file glob here, otherwise it might cause the vue plugin to handle non-vue files
    files: ['**/*.vue'],
    rules: {
      'vue/operator-linebreak': ['error', 'before'],
    },
  },
)
```

There's also provided an `overrides` options to make it easier:

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
    yaml: {},
    // ...
  }
})
```

### Optional Extra Rules

This config also provides some optional plugins/rules for extended usages.

#### `perfectionist` (sorting)

This plugin [`eslint-plugin-perfectionist`](https://github.com/azat-io/eslint-plugin-perfectionist) allows you to sorted object keys, imports, etc, with auto-fix.

The plugin is installed but no rules are enabled by default.

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

Since flat ESLint config requires us to explicitly provide the plugin names (instead of mandatory convention from npm package name), we renamed some plugins to make overall scope more consistent and easier to write.

| New Prefix | Original Prefix | Source Plugin |
| --- | --- | --- |
| `import/*` | `i/*` | [eslint-plugin-i](https://github.com/un-es/eslint-plugin-i) |
| `node/*` | `n/*` | [eslint-plugin-n](https://github.com/eslint-community/eslint-plugin-n) |
| `yaml/*` | `yml/*` | [eslint-plugin-yml](https://github.com/ota-meshi/eslint-plugin-yml) |
| `ts/*` | `@typescript-eslint/*` | [@typescript-eslint/eslint-plugin](https://github.com/typescript-eslint/typescript-eslint) |
| `test/*` | `vitest/*` | [eslint-plugin-vitest](https://github.com/veritem/eslint-plugin-vitest) |
| `test/*` | `no-only-tests/*` | [eslint-plugin-no-only-tests](https://github.com/levibuzolic/eslint-plugin-no-only-tests) |

When you want to override rules, or disable them inline, you need to update to the new prefix:

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

## Links

This library is [published on NPM](https://www.npmjs.com/package/@maninak/eslint-config).

🫶 Follow me on [X](https://twitter.com/maninak_).

## License

[MIT](./LICENSE) License &copy; 2019-PRESENT [Kostis Maninakis](https://maninak.github.io)
