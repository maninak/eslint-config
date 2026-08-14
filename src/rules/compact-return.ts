import type { Rule } from 'eslint'
import type { Node } from 'estree'

/**
 * Owns the blank-line-before-`return` policy. This rule deliberately replaces the
 * `always(*, return)` entry of `padding-line-between-statements`: the two cannot coexist
 * because they disagree on the compact case below, and two fixers fighting over the same line
 * never converge. Keeping the whole policy in one rule guarantees a single fixed point.
 *
 * Policy, applied to a `return` that has a preceding sibling statement in the same block:
 * - Compact body (the block holds exactly two statements and both are single-line): the
 *   `return` MUST NOT have a blank line before it. A blank in a two-line body is pure noise.
 * - Any other body: the `return` MUST have exactly one blank line before it, matching the
 *   long-standing `always(*, return)` behavior.
 *
 * A `return` that is the first statement in its block is left untouched (nothing to separate).
 * The fix only ever adds or removes blank lines: any comment in the gap, whether trailing the
 * previous statement's line or standing on its own line, is always preserved.
 */
const compactReturn: Rule.RuleModule = {
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    schema: [],
    messages: {
      noBlankInCompact:
        'Remove the blank line before `return`: a two-statement body should stay compact.',
      blankRequired:
        'Add a blank line before `return` to separate it from the statement above.',
    },
  },

  create(context) {
    const src = context.sourceCode

    /** True when `node` begins and ends on the same source line. */
    function isSingleLine(node: Node): boolean {
      return node.loc?.start.line === node.loc?.end.line
    }

    /**
     * Counts blank lines in the gap between `prev` and `next`, treating any comment lines in
     * the gap as non-blank so that comment-adjacent spacing is never collapsed by this rule.
     */
    function blankLineCountBetween(prev: Node, next: Node): number {
      const prevEndLine = prev.loc?.end.line ?? 0
      const nextStartLine = next.loc?.start.line ?? 0

      const commentLines = new Set<number>()
      const commentsBetween = src.getCommentsBefore(next)
      for (const comment of commentsBetween) {
        const start = comment.loc?.start.line ?? 0
        const end = comment.loc?.end.line ?? 0
        for (let line = start; line <= end; line++) {
          commentLines.add(line)
        }
      }

      let blanks = 0
      for (let line = prevEndLine + 1; line < nextStartLine; line++) {
        if (!commentLines.has(line)) {
          blanks++
        }
      }

      return blanks
    }

    /** The statement list a node lives in, for a block, program, or switch case parent. */
    function siblingStatementsOf(parent: Node): Node[] | undefined {
      if (parent.type === 'BlockStatement' || parent.type === 'Program') {
        return parent.body
      }
      if (parent.type === 'SwitchCase') {
        return parent.consequent
      }

      return undefined
    }

    function checkReturn(node: Node & { type: 'ReturnStatement' }): void {
      const parent = (node as unknown as { parent?: Node }).parent
      if (!parent) {
        return
      }

      // Only handle returns that live directly in a statement list with siblings.
      const body = siblingStatementsOf(parent)
      if (!body) {
        return
      }

      const index = body.indexOf(node)
      if (index <= 0) {
        return // first statement, or not found: nothing to separate
      }

      const prev = body[index - 1] as Node

      const isCompact =
        parent.type === 'BlockStatement' &&
        body.length === 2 &&
        isSingleLine(prev) &&
        isSingleLine(node)

      const blanks = blankLineCountBetween(prev, node)

      if (isCompact && blanks > 0) {
        context.report({
          node,
          messageId: 'noBlankInCompact',
          fix(fixer) {
            const gap = src.getText().slice(prev.range![1], node.range![0])
            // Drop only the blank (whitespace-only) lines in the gap. The first segment is
            // whatever trails the previous statement on its line (e.g. a `// comment`), the
            // last is the indentation before `return`; both are kept, as is any standalone
            // comment line between them. A blanket collapse would delete those comments.
            const segments = gap.split('\n')
            const kept = segments.filter(
              (segment, i) =>
                i === 0 || i === segments.length - 1 || segment.trim().length > 0,
            )

            return fixer.replaceTextRange([prev.range![1], node.range![0]], kept.join('\n'))
          },
        })

        return
      }

      if (!isCompact && blanks === 0) {
        context.report({
          node,
          messageId: 'blankRequired',
          fix(fixer) {
            /*
             * Anchor the blank on the token or comment immediately before `return`, not on the
             * previous statement node. That keeps a comment TRAILING the previous statement
             * attached to it, and lands the blank before `return` rather than between the
             * statement and its own trailing comment.
             *
             * A comment that begins its own line is the opposite case: it documents the
             * `return` below it, so the blank has to go above the comment. Anchoring on it
             * split the pair and left the comment reading as a note on the statement above.
             */
            let before = src.getTokenBefore(node, { includeComments: true })
            while (before && isOwnLineComment(before)) {
              before = src.getTokenBefore(before, { includeComments: true })
            }

            return before ? fixer.insertTextAfter(before, '\n') : null
          },
        })
      }
    }

    /** Whether `token` is a comment with nothing but whitespace before it on its line. */
    function isOwnLineComment(token: { type: string; range?: [number, number] }): boolean {
      if (token.type !== 'Line' && token.type !== 'Block') {
        return false
      }

      const text = src.getText()
      const lineStart = text.lastIndexOf('\n', token.range![0]) + 1

      return text.slice(lineStart, token.range![0]).trim().length === 0
    }

    return {
      ReturnStatement: checkReturn,
    }
  },
}

export default compactReturn
