import type { Rule } from 'eslint'
import type { Comment } from 'estree'

const DEFAULT_MAX_COLUMNS = 95

/**
 * Enforces that no physical line of a JSDoc block comment (a `/**` block) runs past the column
 * limit, wrapping overflowing prose onto continuation lines that keep the same `* ` prefix.
 *
 * The fixer only ever inserts line breaks between existing words. It never joins lines,
 * reorders text, or rewrites content, so it preserves deliberate breaks and touches only the
 * lines that are too long. It leaves untouched, and does not report, any line it cannot wrap
 * safely:
 * - fenced code blocks and `@example` bodies, where reflowing would corrupt the code;
 * - lines with an inline `{@tag ...}`, a markdown table (a `|`), or the closing `*\/` on them;
 * - lines whose single longest word cannot itself fit, e.g. a long URL: no break would help.
 *
 * The limit is the first option's `maxColumns` (default 95), like `max-len` / `printWidth`.
 */
const jsdocMaxLen: Rule.RuleModule = {
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
      tooLong:
        'This JSDoc line exceeds the {{max}}-column limit; wrap it onto continuation lines.',
    },
  },

  create(context) {
    const options = context.options[0] as { maxColumns?: number } | undefined
    const max = options?.maxColumns ?? DEFAULT_MAX_COLUMNS
    const src = context.sourceCode
    const nl = src.getText().includes('\r\n') ? '\r\n' : '\n'

    function isJsdoc(comment: Comment): boolean {
      return comment.type === 'Block' && comment.value.startsWith('*')
    }

    /** Content this rule must not reflow: inline tags, tables, fences, or a closing `*\/`. */
    function isUnsafeToWrap(content: string): boolean {
      return (
        content.includes('{@') ||
        content.includes('|') ||
        content.includes('```') ||
        content.includes('*/')
      )
    }

    /**
     * Greedily packs `content` into lines that each fit within `max` once `prefix` is added,
     * breaking only at existing whitespace and preserving the gaps between kept words. Returns
     * `undefined` when one word cannot fit even alone, so the caller leaves the line as-is.
     */
    function wrapContent(content: string, prefix: string): string[] | undefined {
      const parts = content.split(/(\s+)/)
      const lines: string[] = []
      let current = ''

      for (let i = 0; i < parts.length; i += 2) {
        const word = parts[i]
        if (word === undefined || word === '') {
          continue
        }
        if (current === '') {
          if (prefix.length + word.length > max) {
            return undefined
          }
          current = word
          continue
        }

        const gap = parts[i - 1] ?? ' '
        const candidate = current + gap + word
        if (prefix.length + candidate.length <= max) {
          current = candidate
          continue
        }

        lines.push(current)
        if (prefix.length + word.length > max) {
          return undefined
        }
        current = word
      }

      if (current !== '') {
        lines.push(current)
      }

      return lines
    }

    /**
     * A single-line `/** ... *\/` doc comment that overflows: rewrite it as a multiline block
     * whose body is the wrapped description. Skipped for trailing comments (code precedes them
     * on the line) and content that is unsafe to wrap or holds an unbreakable word.
     */
    function checkSingleLine(comment: Comment): void {
      const line = comment.loc?.start.line ?? 0
      const column = comment.loc?.start.column ?? 0
      const lineText = src.lines[line - 1]
      if (lineText === undefined || lineText.length <= max) {
        return
      }
      // Only rewrite a comment that starts its own line; injecting breaks into a code line is
      // both surprising and needless.
      const indent = lineText.slice(0, column)
      if (indent.trim() !== '') {
        return
      }

      const trimmed = lineText.trim()
      if (!trimmed.startsWith('/**') || !trimmed.endsWith('*/')) {
        return
      }
      const content = trimmed.slice(3, -2).trim()
      if (content === '' || isUnsafeToWrap(content)) {
        return
      }

      const prefix = `${indent} * `
      const wrapped = wrapContent(content, prefix)
      if (!wrapped || wrapped.length === 0) {
        return
      }

      const body = wrapped.map((chunk) => `${prefix}${chunk}`).join(nl)
      const replacement = `${indent}/**${nl}${body}${nl}${indent} */`

      context.report({
        loc: comment.loc!,
        messageId: 'tooLong',
        data: { max: String(max) },
        fix: (fixer) => fixer.replaceTextRange(comment.range!, replacement),
      })
    }

    /**
     * A multiline block: wrap each overflowing ` * ` continuation line on its own, so breaks
     * elsewhere survive. Tracks fenced-code and `@example` regions so their bodies are never
     * reflowed.
     */
    function checkMultiLine(comment: Comment): void {
      const startLine = comment.loc?.start.line ?? 0
      const endLine = comment.loc?.end.line ?? 0
      let insideFence = false
      let insideExample = false

      for (let ln = startLine; ln <= endLine; ln++) {
        const lineText = src.lines[ln - 1]
        if (lineText === undefined) {
          continue
        }

        const parsed = lineText.match(/^(\s*\*\s?)(.*)$/)
        if (!parsed) {
          continue // the opener `/**` line, or a non-standard line: nothing to wrap
        }
        const trimmed = (parsed[2] ?? '').trim()

        if (trimmed.startsWith('```')) {
          insideFence = !insideFence
          continue
        }
        if (insideFence) {
          continue
        }
        if (/^@example\b/.test(trimmed)) {
          insideExample = true
          continue
        }
        if (insideExample) {
          if (/^@\w/.test(trimmed)) {
            insideExample = false // a new tag ends the example body; fall through to wrap it
          } else {
            continue
          }
        }

        if (
          lineText.length <= max ||
          trimmed === '' ||
          trimmed === '/' ||
          isUnsafeToWrap(trimmed)
        ) {
          continue
        }

        const prefix = `${(parsed[1] ?? '').replace(/\s+$/, '')} `
        const wrapped = wrapContent(trimmed, prefix)
        if (!wrapped || wrapped.length < 2) {
          continue // a single word too long to break, or already fits once trimmed: leave it
        }

        const replacement = wrapped.map((chunk) => `${prefix}${chunk}`).join(nl)
        const from = src.getIndexFromLoc({ line: ln, column: 0 })
        const to = from + lineText.length

        context.report({
          loc: {
            start: { line: ln, column: 0 },
            end: { line: ln, column: lineText.length },
          },
          messageId: 'tooLong',
          data: { max: String(max) },
          fix: (fixer) => fixer.replaceTextRange([from, to], replacement),
        })
      }
    }

    function checkComment(comment: Comment): void {
      if (!isJsdoc(comment)) {
        return
      }

      if (comment.loc?.start.line === comment.loc?.end.line) {
        checkSingleLine(comment)
      } else {
        checkMultiLine(comment)
      }
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

export default jsdocMaxLen
