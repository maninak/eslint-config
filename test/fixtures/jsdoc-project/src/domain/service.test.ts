/* Fixture proving the test-file exemption survives a caller-supplied `files` glob.
 *
 * A `files: ['src/domain/**']` matches this path too, yet no jsdoc rule may fire here. The
 * two exports cover both rules: one has no block at all (`require-jsdoc`), the other has a
 * block carrying only a tag (`require-description`).
 */

export function undocumentedSpecHelper(): string {
  return 'helper'
}

/**
 * @returns the fixture's second helper
 */
export function taglessOnlySpecHelper(): string {
  return 'tagless'
}
