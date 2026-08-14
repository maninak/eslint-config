# Changelog

Notable changes per release, newest first. Anything that forces you to act before upgrading is called out under **Breaking**.

## 0.5.0 (2026-08-14)

### Breaking

- **Node 18 is dropped.**
  - The supported range is now `^20.19.0 || ^22.13.0 || >=24`.
  - That floor is what the bundled plugins themselves declare, and a test derives it from their manifests so it cannot drift again.
- **ESLint must be `^9.38.0` or newer**, up from `^9.10.0`, as required by `no-unassigned-vars` and `preserve-caught-error`.
- **CSS files are linted now.**
  - `@eslint/css` is included. Until now `.css` was neither linted nor formatted by the preset.
  - Where Tailwind is detected, the parser is taught Tailwind's dialect, so a v4 entry point using `@theme`, `@custom-variant`, `@utility` and `@apply` parses instead of failing outright.
  - Expect new findings in any project with stylesheets. Pass `css: false` to switch them off.
- **Vue SFCs are linted type-aware by default.**
  - Rules needing type information used to stop at the `.vue` boundary without saying so, which let a Vue or Nuxt project believe they were enforced everywhere while the files holding most of its code were exempt.
  - Where no resolved tsconfig covers SFCs, the preset warns once and leaves type-aware linting off, instead of throwing as it did before.
  - Pass `vueTypeAware: false` to switch it off.
- **Tailwind rules moved to `eslint-plugin-better-tailwindcss`.**
  - Tailwind 3 and 4 both lint now.
  - The preset finds your theme file itself: the CSS file importing Tailwind on v4, or `tailwind.config.js` on v3.
  - A Tailwind reachable only transitively, through `@nuxt/ui` for instance, resolves too, so `tailwindcss` is an optional peer rather than a required devDependency.
  - Where several files could be the theme, the preset names them and stays off. Set `tailwind: { entryPoint }` to settle it.
- **Markdown prose is soft-wrapped**, via prettier's `proseWrap: 'never'`. Existing hard-wrapped markdown reflows the first time it is formatted.

### Added

- `sortImports`, to splice your own import groups in without restating the preset's.
- `filenameCase`, off by default, with carve-outs for Vue and Nuxt file conventions.
- `requireJsdoc` accepts an options object. `requireJsdocInUtils` is deprecated in its favour.
- `no-unassigned-vars` and `preserve-caught-error` across the preset.
- `@antfu/eslint-config` 9.3, restoring Vue and Nuxt coverage that had been silently lost.

### Fixed

- **`curly` was switched off everywhere.**
  - `eslint-config-prettier` disables it, and the preset applied that set in a later block than the one configuring `curly: ['warn', 'all']`, so brace enforcement was dead for every file type.
  - Expect brace warnings that never appeared before.
- **Vue 3.10 and newer read as older than 3.5**, because version detection ran through `Number.parseFloat('3.10')`, which is `3.1`. Those projects were served the pre-3.5 rule set.
- **`vueTypeAware` only judged the first tsconfig**, so a project splitting SFC coverage across two was wrongly told its SFCs were uncovered.
- **`maninak/compact-return`'s autofixer could detach a standalone comment** from the return it belonged to.
- **JavaScript comment and style rules fired on TOML, YAML, JSON and markdown.**
- **`maninak/jsdoc-max-len` double-indented expanded blocks** instead of reflowing the paragraph.

### Internal

Vue and Tailwind plugins load only when their config blocks are built. Each feature moved into its own module under `src/features/`.

## 0.4.0 (2026-07-14)

- Added `maninak/jsdoc-max-len`, which wraps over-long JSDoc lines.
- Lint scripts gained `--concurrency=auto` and the content cache strategy.

## 0.3.1 (2026-07-13)

- Nuxt convention-file exemptions now apply inside workspace sub-packages too.

## 0.3.0 (2026-07-13)

- Added the `maninak/prefer-concise-async-arrow`, `maninak/compact-return` and `maninak/jsdoc-oneline` rules.
- Custom-rule autofixers are precise: return types, parameters and comments survive a fix.
- Frameworks are detected across workspace sub-packages, and `vue/no-undef-components` is gated on Nuxt.

## 0.2.5 (2026-06-13)

- `eslint-config-prettier`'s disables are applied properly, and TOML handling fixed.
- `ignoreArrowShorthand` expanded to allow single-line callbacks.

## 0.2.4 (2026-06-12)

- Refined when a blank line before a function is allowed, and allowed long class declarations.

## 0.2.3 (2026-06-11)

- Vue formatting fixes, `ts/strict-boolean-expressions` off, `pnpm-workspace.yaml` no longer linted, and gentler prettier whitespace handling.

## 0.2.2 (2026-06-10)

- Stopped crashing the VS Code ESLint extension on Vue files, and improved Svelte edge cases.

## 0.2.1 (2026-06-10)

- `tsconfigPath` accepts an array, and tsconfigs are parsed as JSONC.
- Dogfooding works without building first.

## 0.2.0 and earlier

See the git history.
