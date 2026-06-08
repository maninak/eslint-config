/* Fixture for jsdoc/require-jsdoc behavioural tests.
 *
 * The path matches one of maninak's utility globs (`** /utils/**`), so when the
 * `requireJsdocInUtils` option is on, the rule must fire on the undocumented export and
 * stay quiet on the two documented ones.
 */

// no jsdoc here — should trigger require-jsdoc
export function undocumented(): string {
  return 'undocumented'
}

/**
 * Documented export. Free-text description means jsdoc/require-description is satisfied.
 */
export function documented(): string {
  return 'documented'
}

/**
 * Both @param and @returns tags are omitted on purpose: they are not required by maninak,
 * a description alone is enough of a contract block.
 */
export function tagless(value: string): string {
  return value
}
