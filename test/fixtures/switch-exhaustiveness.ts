/* Fixture for ts/switch-exhaustiveness-check.
 *
 * `withDefaultClause` is the case the rule misses under its own default options: a `default:`
 * counts as covering `'triangle'`, so adding a union member compiles clean and silently takes
 * the default branch. `withoutDefaultClause` is reported either way, and is here to prove the
 * rule was active at all.
 */

type Shape = 'circle' | 'square' | 'triangle'

export function withDefaultClause(shape: Shape): string {
  switch (shape) {
    case 'circle':
      return 'round'
    case 'square':
      return 'boxy'
    default:
      return 'other'
  }
}

export function withoutDefaultClause(shape: Shape): string {
  switch (shape) {
    case 'circle':
      return 'round'
    case 'square':
      return 'boxy'
  }

  return 'unreached'
}
