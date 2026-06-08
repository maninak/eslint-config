// Fixture: type-aware behaviours. Loaded with options.typescript.tsconfigPath.
// Each block intentionally trips one rule listed in tests.

// ts/return-await: returning a promise without await inside a try/catch.
async function returnAwait(): Promise<number> {
  try {
    return Promise.resolve(1)
  } catch {
    return 0
  }
}

// ts/promise-function-async: a function that returns a Promise but is not async.
function notAsync(): Promise<number> {
  return Promise.resolve(1)
}

// ts/no-floating-promises target — but the rule is OFF in maninak, so this
// should produce NO message. Test verifies the off-ness, not the firing.
async function flooting() {
  Promise.resolve(1)
}

// ts/strict-boolean-expressions: a plain `any` in a condition (allowAny: false).
function condAny(value: any) {
  if (value) {
    return 1
  }
  return 0
}
