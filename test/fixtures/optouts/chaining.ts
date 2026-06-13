export const total = [1, 2, 3].map((value) => value * 2).filter((value) => value > 2)
  .reduce((acc, value) => acc + value, 0)
