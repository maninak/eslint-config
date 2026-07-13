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
 * Comments between the previous statement and the `return` are preserved; the rule only adds
 * or removes blank lines in the gap that is free of comment text.
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
            // Collapse the gap between the two statements to a single newline, preserving any
            // indentation that precedes the return token.
            const between = src.getText().slice(prev.range![1], node.range![0])
            const trailingIndent = between.slice(between.lastIndexOf('\n') + 1)

            return fixer.replaceTextRange(
              [prev.range![1], node.range![0]],
              `\n${trailingIndent}`,
            )
          },
        })

        return
      }

      if (!isCompact && blanks === 0) {
        context.report({
          node,
          messageId: 'blankRequired',
          fix(fixer) {
            return fixer.insertTextAfter(prev, '\n')
          },
        })
      }
    }

    return {
      ReturnStatement: checkReturn,
    }
  },
}

export default compactReturn
