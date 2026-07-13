import type { Rule } from 'eslint'
import type { Comment } from 'estree'

const DEFAULT_MAX_COLUMNS = 80

/**
 * Collapses a JSDoc block whose only content is a plain description onto a single line,
 * `/** text *\/`, normalizing interior whitespace to single spaces, as long as the result fits
 * within the configured print width.
 *
 * Left untouched:
 * - Blocks that carry any `@tag` (`@param`, `@returns`, and so on): those stay multiline.
 * - Blocks with a blank line in the description (deliberate multi-paragraph prose).
 * - Blocks whose single-line form would exceed the print width.
 * - Non-JSDoc block comments (a `/*` that is not `/**`) and line comments.
 *
 * The print width is read from the first rule option, defaulting to 80, so a consumer can pass
 * the same value used for `max-len` / prettier `printWidth`.
 */
const jsdocOneline: Rule.RuleModule = {
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    schema: [
      {
        type: 'object',
        properties: { maxColumns: { type: 'integer', minimum: 1 } },
        additionalProperties: false,
      },
    ],
    messages: {
      collapse: 'Collapse this single-description JSDoc comment onto one line.',
    },
  },

  create(context) {
    const options = context.options[0] as { maxColumns?: number } | undefined
    const maxColumns = options?.maxColumns ?? DEFAULT_MAX_COLUMNS
    const src = context.sourceCode

    function isJsdoc(comment: Comment): boolean {
      return comment.type === 'Block' && comment.value.startsWith('*')
    }

    /**
     * Returns the description text of a JSDoc comment with interior whitespace and leading
     * asterisks collapsed to single spaces, or `undefined` when the block must be left alone
     * (it carries a tag or contains a blank line in its body).
     */
    function normalizedDescription(comment: Comment): string | undefined {
      // `comment.value` is the text between `/*` and `*/`, so it starts with the leading `*`.
      const inner = comment.value.replace(/^\*/, '')

      const rawLines = inner.split('\n')
      const contentLines = rawLines.map((line) => line.replace(/^\s*\*?/, '').trim())
      const nonEmpty = contentLines.filter((line) => line.length > 0)

      if (nonEmpty.length === 0) {
        return undefined
      }

      // A blank line between content lines signals deliberate multi-paragraph prose.
      const firstContent = contentLines.findIndex((line) => line.length > 0)
      const lastContent =
        contentLines.length -
        1 -
        [...contentLines].reverse().findIndex((line) => line.length > 0)

      for (let i = firstContent; i <= lastContent; i++) {
        if (contentLines[i]?.length === 0) {
          return undefined
        }
      }

      const text = nonEmpty.join(' ').replace(/\s+/g, ' ').trim()

      // Any JSDoc tag means this is not a plain description; leave it to the jsdoc plugin.
      if (/(?:^|\s)@\w/.test(text)) {
        return undefined
      }

      return text
    }

    function checkComment(comment: Comment): void {
      if (!isJsdoc(comment)) {
        return
      }

      const text = normalizedDescription(comment)
      if (text === undefined) {
        return
      }

      const singleLine = `/** ${text} */`

      const startColumn = comment.loc?.start.column ?? 0
      const isAlreadySingleLine = comment.loc?.start.line === comment.loc?.end.line
      const currentText = src.getText(comment as never)

      if (isAlreadySingleLine && currentText === singleLine) {
        return
      }

      // Only collapse when the result fits; otherwise leave the block as-is.
      if (startColumn + singleLine.length > maxColumns) {
        return
      }

      context.report({
        loc: comment.loc!,
        messageId: 'collapse',
        fix(fixer) {
          return fixer.replaceTextRange(comment.range!, singleLine)
        },
      })
    }

    return {
      Program() {
        for (const comment of src.getAllComments()) {
          checkComment(comment)
        }
      },
    }
  },
}

export default jsdocOneline
