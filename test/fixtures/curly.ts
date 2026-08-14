/* Lint input: a braceless single-statement `if`, which `curly: 'all'` must report. */

export function probe(value: number): number {
  if (value > 0) return 1

  return 0
}
