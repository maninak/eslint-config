# @maninak/eslint-config

A batteries-included, plug-n-play linter and formater aiming for maximum DX and minimum friction. Supports JS, TS, Vue, JSX, ...

## Installation

```sh
npm i -D @maninak/eslint-config
```

In the root of your repository create an `.eslintrc.cjs` with

```js
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: '@maninak',
  rules: {
    // disable or adjust any rules here
    // e.g. 'no-console': 'off'
  },
}
```

## Post-installation

- .gitattributes
- tsconfig.eslint.json
- .vscode/settings.json
- .editorconfig
- husky + package.json
