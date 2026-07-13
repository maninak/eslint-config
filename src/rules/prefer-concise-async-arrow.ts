import type { Rule } from 'eslint'

/**
 * Flags `async () => { await expr }` (an async arrow whose block body is a single `await`
 * expression statement) and auto-fixes it to the concise form `async () => await expr`.
 *
 * Prettier leaves the concise form alone but always expands block bodies to multiline, so the
 * two forms are not style-equivalent when `prettier/prettier` is active. This rule resolves
 * the conflict in the right direction: it picks the form prettier accepts without rewriting.
 *
 * Only fires when the block body holds exactly one statement, that statement is an expression
 * statement, and that expression is an `AwaitExpression`. Multi-statement bodies, `return`
 * statements, and non-`await` single expressions are left untouched.
 */
const preferConciseAsyncArrow: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    schema: [],
    messages: {
      preferConcise:
        'Prefer `async () => await expr` over `async () => { await expr }`. ' +
        'Prettier always expands block bodies to multiline; the concise form stays on one line.',
    },
  },

  create(context) {
    return {
      ArrowFunctionExpression(node) {
        if (!node.async) {
          return
        }
        if (node.body.type !== 'BlockStatement') {
          return
        }

        const { body: statements } = node.body
        if (statements.length !== 1) {
          return
        }

        const [statement] = statements
        if (!statement || statement.type !== 'ExpressionStatement') {
          return
        }
        if (statement.expression.type !== 'AwaitExpression') {
          return
        }

        const awaitExpr = statement.expression

        context.report({
          node,
          messageId: 'preferConcise',
          fix(fixer) {
            const src = context.sourceCode
            const awaitText = src.getText(awaitExpr)
            // Always wrap params in parens to match the `arrow-parens: always` rule.
            const paramsText = `(${node.params.map((param) => src.getText(param)).join(', ')})`

            return fixer.replaceText(node, `async ${paramsText} => ${awaitText}`)
          },
        })
      },
    }
  },
}

export default preferConciseAsyncArrow
