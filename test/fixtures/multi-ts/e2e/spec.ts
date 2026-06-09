// Fixture: e2e-side file covered only by tsconfig.wdio.json. Trips ts/promise-function-async.
// Lives under a non-standard tsconfig name to exercise the array-tsconfigPath escape hatch.

export function bootSession(): Promise<number> {
  return Promise.resolve(1)
}
