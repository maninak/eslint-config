// Fixture for maninak/jsdoc-max-len. Do not auto-fix.
// Each case has a `// @case <name>` anchor used by tests to locate lines.
// Some JSDoc lines below deliberately exceed 95 columns; that is the point of the fixture.

// @case wrap-oneline-fire
// A single-line JSDoc that overflows is rewritten as a multiline block. The two 50-char tokens
// force one token per wrapped line, giving a hand-verifiable exact output.
/** aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb */
export const _oneline = 1

// @case wrap-param-fire
// A long `@param` continuation line wraps, keeping the tag on the first line.
/**
 * @param foo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb more
 */
export function _param(foo: number): number {
  return foo
}

// @case wrap-prose-fire
// A long prose continuation line wraps at word boundaries onto ` * ` continuation lines.
/**
 * This description line is deliberately written to run well past the ninety-five column budget so the rule has to wrap it.
 */
export const _prose = 1

// @case short-ok
// Every line fits within 95 columns: no violation, nothing to wrap.
/**
 * A short description well within budget.
 * @param foo the input value
 */
export function _short(foo: number): number {
  return foo
}

// @case keep-fence-ok
// A fenced code block holds a line over 95 columns; reflowing code would corrupt it, so it is
// left untouched.
/**
 * Usage:
 * ```ts
 * const veryLongVariableName = someFunction(withArgs, thatPush, thisCodeLine, wellPastNinetyFive)
 * ```
 */
export const _fence = 1

// @case keep-example-ok
// An `@example` body over 95 columns is code, so it is not wrapped.
/**
 * @example
 * const result = anotherLongFunctionCall(argumentOne, argumentTwo, argumentThree, overNinetyFive)
 */
export const _example = 1

// @case keep-inline-tag-ok
// A line carrying an inline `{@link}` tag is not wrapped, since a break could split the tag.
/**
 * See {@link SomeVeryLongReferenceIdentifier} for the complete explanation of how this behaves ok.
 */
export const _inlineTag = 1

// @case keep-table-ok
// A markdown table row (it contains a `|`) is not wrapped.
/**
 * | column one heading | column two heading | column three heading | the fourth column heading |
 */
export const _table = 1

// @case keep-url-ok
// A single unbreakable token (a long URL) over 95 columns: no break helps, so left as-is.
/**
 * https://example.com/some/really/long/path/segment/that/has/no/spaces/and/cannot/be/wrapped/at/all
 */
export const _url = 1

// @case keep-trailing-ok
// A trailing block comment (code precedes it on the line) is never converted to a multiline
// block: injecting line breaks into a code line would be surprising and needless.
export const _trailing = 1 /** this trailing doc comment is intentionally longer than the 95 col budget */

// @case keep-inline-closer-ok
// A continuation line carrying the closing marker inline is not wrapped, since a break could
// strand the `*/` on its own line. Its text without the closer already fits, so nothing fires.
/**
 * this description line is sized so that only the trailing closing marker tips it past col 95 */
export const _inlineCloser = 1

// @case wrap-paragraph-fire
// An over-long line whose paragraph continues below. The fix must reflow the whole run:
// wrapping the line alone strands its overflow on a line of its own while the words below
// stay put.
/**
 * cccccccccccccccccccccccccccccccccccccccccccccccccc dddddddddddddddddddddddddddddddddddddddddddddddddd
 * eeeeeeeeee
 */
export const _paragraph = 1

// @case keep-bullet-boundary-ok
// The line below the over-long one opens a bullet, so it starts a new run and is never
// absorbed. The long line above it still wraps; only the merge is forbidden.
/**
 * ffffffffffffffffffffffffffffffffffffffffffffffffff gggggggggggggggggggggggggggggggggggggggggggggggggg
 * - a bullet that must not be merged into the paragraph above
 */
export const _bulletBoundary = 1

// @case wrap-above-url-fire
// An over-long line whose paragraph continues into a line holding an unbreakable URL. The
// run must stop at that line: absorbing it would make the whole paragraph unwrappable, so
// the long line above would silently stop wrapping.
/**
 * hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii
 * https://example.com/another/really/long/path/segment/with/no/spaces/at/all/that/cannot/wrap/ok
 */
export const _aboveUrl = 1

// @case wrap-oneline-indented-fire
// A single-line block that is indented: the expansion must keep the original indent rather
// than adding a second one in front of `/**`.
export interface _Indented {
  /** jjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjj kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk */
  indented: number
}
