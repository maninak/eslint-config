/* Fixture for ts/switch-exhaustiveness-check.
 *
 * `withDefaultClause` is the case that only bites while `considerDefaultExhaustiveForUnions`
 * stays `false`: were it `true`, the `default:` would count as covering `'triangle'` and
 * adding a union member would compile clean while silently taking the default branch.
 * `withoutDefaultClause` is reported under either setting, and is here so a failure on the
 * first can be told apart from the rule being off altogether.
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
