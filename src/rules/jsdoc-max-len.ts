import type { Rule } from 'eslint'
import type { Comment } from 'estree'

const DEFAULT_MAX_COLUMNS = 95

/**
 * Enforces that no physical line of a JSDoc block comment (a `/**` block) runs past the column
 * limit, wrapping overflowing prose onto continuation lines that keep the same `* ` prefix.
 *
 * The fixer reflows the PARAGRAPH the over-long line opens, not the line alone: it pulls in
 * the plain-prose lines that follow and repacks the run. Wrapping a line by itself pushes its
 * overflow onto a line of its own, and since the words below never move up, the result is an
 * orphan of a word or two sitting under a full line, which reads worse than the long line did.
 * A run stops at anything that starts something new (a blank line, a `@tag`, a bullet, a
 * quote, a heading, a hanging-indented continuation, a fence), so only prose that was already
 * one paragraph is ever joined. It never reorders or rewrites words.
 *
 * It leaves untouched, and does not report, any line it cannot wrap safely:
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
      // The range starts at `/**`, past the existing indent, so re-emitting it here would
      // indent the opening line twice.
      const replacement = `/**${nl}${body}${nl}${indent} */`

      context.report({
        loc: comment.loc!,
        messageId: 'tooLong',
        data: { max: String(max) },
        fix: (fixer) => fixer.replaceTextRange(comment.range!, replacement),
      })
    }

    /**
     * True when `content` continues the paragraph above rather than starting something new, so
     * an over-long line above may reflow into it. Anything that carries its own structure (a
     * tag, a bullet, an ordered marker, a quote, a heading, a fence, a hanging indent, the
     * closing marker) starts a new run and is never absorbed into the one before it.
     */
    function isPlainContinuation(content: string): boolean {
      const trimmed = content.trim()

      return (
        trimmed !== '' &&
        trimmed !== '/' &&
        !/^\s/.test(content) &&
        !/^[@\-*+>#]/.test(trimmed) &&
        !/^\d+[).]\s/.test(trimmed) &&
        !trimmed.startsWith('```') &&
        !isUnsafeToWrap(trimmed)
      )
    }

    /**
     * True when some word in `content` cannot fit the budget even on a line of its own, e.g. a
     * long URL. Absorbing such a line would poison the whole run: {@link wrapContent} gives up
     * on the lot, and lines that could have wrapped would silently stop wrapping.
     */
    function hasUnbreakableWord(content: string, prefix: string): boolean {
      return content
        .trim()
        .split(/\s+/)
        .some((word) => prefix.length + word.length > max)
    }

    /**
     * A multiline block: reflow each paragraph that opens with an overflowing ` * ` line.
     * Tracks fenced-code and `@example` regions so their bodies are never reflowed.
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

        // Absorb the rest of the paragraph, so the overflow reflows into the words below
        // instead of being stranded on a line of its own.
        let last = ln
        let content = trimmed
        while (last < endLine) {
          const nextText = src.lines[last] // 0-indexed, so this is line `last + 1`
          const nextParsed = nextText?.match(/^(\s*\*\s?)(.*)$/)
          if (!nextText || !nextParsed) {
            break
          }
          const nextContent = nextParsed[2] ?? ''
          if (!isPlainContinuation(nextContent)) {
            break
          }
          if (hasUnbreakableWord(nextContent, prefix)) {
            break
          }
          if (`${(nextParsed[1] ?? '').replace(/\s+$/, '')} ` !== prefix) {
            break
          }
          content = `${content} ${nextContent.trim()}`
          last++
        }

        const wrapped = wrapContent(content, prefix)
        if (!wrapped || wrapped.length === 0) {
          continue // a single word too long to break: no line break helps, so leave it
        }

        const lastText = src.lines[last - 1] ?? ''
        const replacement = wrapped.map((chunk) => `${prefix}${chunk}`).join(nl)
        const from = src.getIndexFromLoc({ line: ln, column: 0 })
        const to = src.getIndexFromLoc({ line: last, column: 0 }) + lastText.length
        if (replacement === src.getText().slice(from, to)) {
          continue // already packed as tightly as this rule would pack it
        }

        context.report({
          loc: {
            start: { line: ln, column: 0 },
            end: { line: last, column: lastText.length },
          },
          messageId: 'tooLong',
          data: { max: String(max) },
          fix: (fixer) => fixer.replaceTextRange([from, to], replacement),
        })

        ln = last // the whole run is handled; the loop's own step moves past it
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
