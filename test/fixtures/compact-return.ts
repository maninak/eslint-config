// Fixture for maninak/compact-return. Do not auto-fix.
// Each case has a `// @case <name>` anchor used by tests to locate lines.

// @case compact-blank-fire
// Two single-line statements with a blank between them: the blank must be removed.
function _compactWithBlank(_x: number) {
  const _doubled = _x * 2

  return _doubled
}

// @case compact-no-blank-ok
// Two single-line statements, already compact: no violation.
function _compactNoBlank(_x: number) {
  const _doubled = _x * 2
  return _doubled
}

// @case noncompact-blank-ok
// Three statements: a blank before return is required and present, so no violation.
function _threeStatements(_x: number) {
  const _doubled = _x * 2
  const _tripled = _x * 3

  return _doubled + _tripled
}

// @case noncompact-no-blank-fire
// Three statements with no blank before return: a blank is required.
function _threeStatementsNoBlank(_x: number) {
  const _doubled = _x * 2
  const _tripled = _x * 3
  return _doubled + _tripled
}

// @case compact-multiline-prev-ok
// Two statements but the first spans multiple lines, so the body is not two lines: the
// blank before return is allowed (treated as non-compact).
function _multilinePrev(_x: number) {
  const _chained = [_x]
    .map((value) => value * 2)
    .filter((value) => value > 0)

  return _chained
}

// @case return-first-ok
// A return that is the first statement in its block: nothing to separate, no violation.
function _returnFirst(_x: number) {
  return _x
}

// @case switch-case-return-ok
// A `case`/`default` whose consequent is a single `return`: nothing precedes it in the
// case body, so compact-return must stay silent (this is what padding-line's now-removed
// `always(*, return)` used to wrongly flag).
function _switchWithCaseReturn(_x: number) {
  switch (_x) {
    case 1:
      return 'one'
    case 2:
      return 'two'
    default:
      return 'other'
  }
}
