// Fixture: stable input for behavioural rule tests. Do not refactor.
// Each block here intentionally trips one or more rules listed in tests.

// no-unassigned-vars: declared, never assigned, but read below.
let neverAssigned: string | undefined

export function readNeverAssigned(): string | undefined {
  return neverAssigned
}

// preserve-caught-error: binds the caught error, then re-throws without it as `cause`.
export function rethrowLosingCause(): void {
  try {
    JSON.parse('{')
  } catch (error) {
    throw new Error(`could not parse the manifest: ${String(error)}`)
  }
}

// A deliberate bare catch stays allowed, because requireCatchParameter is off.
export function swallowsDeliberately(): void {
  try {
    JSON.parse('{')
  } catch {}
}
