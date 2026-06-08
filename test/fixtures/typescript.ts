// Fixture: stable input for behavioural rule tests. Do not refactor.
// Each block here intentionally trips one or more rules listed in tests.

// func-style: declaration form preferred; bound arrows flagged.
const arrowBinding = () => 'flagged by func-style'

// ts/no-explicit-any: any in a position visible to the rule.
function takesAny(value: any): any {
  return value
}

// ts/strict-boolean-expressions: plain `any` in a condition (allowAny: false).
function condAny(value: any) {
  if (value) {
    return 1
  }
  return 0
}

// prefer-template: string concatenation.
const concatenated = 'hello ' + 'world'

// no-useless-return: trailing return with no value at end of void function.
function uselessReturn() {
  doSomething()
  return
}

// eqeqeq: loose equality.
function loose(a: number, b: number) {
  return a == b
}

// no-debugger
function debugged() {
  debugger
  return 1
}

// helpers referenced above so the fixture parses cleanly
function doSomething() {}

// no-nested-ternary: a nested ternary expression.
function nested(a: number, b: number, c: number) {
  return a > 0 ? b > 0 ? c : -1 : 0
}
