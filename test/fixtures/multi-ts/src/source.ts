// Fixture: source-side file covered only by tsconfig.json. Trips ts/promise-function-async.

export function fetchValue(): Promise<number> {
  return Promise.resolve(1)
}
