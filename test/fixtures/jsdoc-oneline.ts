// Fixture for maninak/jsdoc-oneline. The six leading cases are the malformed
// single-description blocks that must all collapse to the identical one-line form.
// The trailing cases must be left untouched.

// @case multiline-clean
/**
 * Copies the sandbox identity into `altNodeHomePath`.
 */
export function caseA(): void {}

// @case multiline-extra-spaces
/**
 *   Copies the sandbox identity into `altNodeHomePath`.
 */
export function caseB(): void {}

// @case dangling-close
/** Copies the sandbox identity into `altNodeHomePath`.
 */
export function caseC(): void {}

// @case no-inner-spaces
/**Copies the sandbox identity into `altNodeHomePath`.*/
export function caseD(): void {}

// @case double-leading-space
/**  Copies the sandbox identity into `altNodeHomePath`. */
export function caseE(): void {}

// @case missing-trailing-space
/** Copies the sandbox identity into `altNodeHomePath`.*/
export function caseF(): void {}

// @case keep-tagged
/**
 * Does a thing.
 * @param x the input value
 */
export function caseTagged(x: number): number {
  return x
}

// @case keep-multiparagraph
/**
 * First paragraph of the description.
 *
 * Second paragraph of the description.
 */
export function caseMultiParagraph(): void {}

// @case keep-too-long
/**
 * This description is deliberately long enough that collapsing it onto a single line would
 * overflow the ninety-five column print width, so the rule must leave it multiline.
 */
export function caseTooLong(): void {}
