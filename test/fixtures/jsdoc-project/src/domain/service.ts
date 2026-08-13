/* Fixture for the object form of `requireJsdoc`.
 *
 * `src/domain/` matches none of the default utility globs, so this file is only reached when
 * the caller names it through `files` or `extraFiles`.
 */

export function undocumentedService(): string {
  return 'undocumented'
}
