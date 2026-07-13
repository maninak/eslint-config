// Fixture for padding-line-between-statements tests. Do not auto-fix.
// Note: no `export`. The rule checks raw AST node types; `export` wraps them.
//
// Each case has a `// @case <name>` anchor used by tests to locate lines.
// Violations are intentional. The "fire" cases have NO blank line where one
// is required; the "ok" cases have a blank line (or use a relaxed combo).

// @case always-directive-fire
function _directiveFire() {
  'use strict'
  const _afterDirectiveNoBlank = 1

  return _afterDirectiveNoBlank
}

// @case always-directive-ok
function _directiveOk() {
  'use strict'

  const _afterDirectiveWithBlank = 1

  return _afterDirectiveWithBlank
}

// @case always-mlb-fire
const _beforeTry = 1
try {
  doSomething()
} catch (_err) {
  handleError()
}

// @case always-mlb-ok
const _beforeTryWithBlank = 1

try {
  doSomethingElse()
} catch (_err) {
  handleError()
}

// @case relax-if
const _condValue = true
if (_condValue) {
  doSomething()
}

// @case relax-const-for
const _limit = 3
for (let _i = 0; _i < _limit; _i++) {
  doSomething()
}

// @case relax-const-while
const _running = true
while (_running) {
  doSomething()
}

// @case relax-const-do
const _maxRetries = 3
do {
  doSomething()
} while (_maxRetries > 0)

// @case relax-let-mlb
let _count = 0
for (let _i = 0; _i < 3; _i++) {
  _count++
}

// @case relax-const-fn
const _btnRef = 'ref'
const _isEditing = false
function _toggle() {
  return _isEditing
}

// @case relax-let-fn
let _multiplier = 2
function _double(_x: number) {
  return _x * _multiplier
}

// @case relax-interface-fn
interface _ClickEvent {
  target: string
}
function _handleClick(_ev: _ClickEvent) {
  return true
}

// @case relax-type-fn
type _Status = 'open' | 'closed'
function _getStatus(): _Status {
  return 'open'
}

// @case fire-fn-fn
function _funcA(_x: number) {
  return _x + 1
}
function _funcB(_x: number) {
  return _x + 2
}

// @case ok-fn-fn
function _funcC(_x: number) {
  return _x + 3
}

function _funcD(_x: number) {
  return _x + 4
}

// @case fire-class-fn
class _ClassBeforeFunc {
  public _method() {
    return 1
  }
}
function _funcAfterClass(_x: number) {
  return _x
}

// @case ok-class-fn
class _ClassWithBlankBeforeFunc {
  public _method() {
    return 1
  }
}

function _funcAfterClassWithBlank(_x: number) {
  return _x
}

// @case fire-expression-fn
defineEmits(['update'])
function _funcAfterEmits(_x: number) {
  return _x
}

// @case ok-expression-fn
defineEmits(['ready'])

function _funcAfterEmitsWithBlank(_x: number) {
  return _x
}

// @case fire-multiline-expression-fn
watchEffect(() => {
  doSomething()
})
function _funcAfterWatchEffect(_x: number) {
  return _x
}

// @case ok-multiline-expression-fn
watchEffect(() => {
  doSomethingElse()
})

function _funcAfterWatchEffectWithBlank(_x: number) {
  return _x
}
