/** Exact largest-remainder distribution, with committed amounts as immutable floors. */
export function allocateBudget(
  budget: number,
  items: { weight: number; floor: number }[],
): number[] {
  const result = items.map((i) => i.floor);
  if (items.reduce((s, i) => s + i.floor, 0) >= budget || !items.length)
    return result;
  let remaining = budget;
  let active = items.map((_, i) => i);
  while (active.length) {
    const total = active.reduce((s, i) => s + BigInt(items[i].weight), 0n);
    const weight = (i: number) => (total ? BigInt(items[i].weight) : 1n);
    const denominator = total || BigInt(active.length);
    const fixed = active.filter(
      (i) =>
        (BigInt(remaining) * weight(i)) / denominator < BigInt(items[i].floor),
    );
    if (fixed.length) {
      for (const i of fixed) {
        result[i] = items[i].floor;
        remaining -= result[i];
      }
      const excluded = new Set(fixed);
      active = active.filter((i) => !excluded.has(i));
      continue;
    }
    const fractions = active.map((i) => ({
      i,
      remainder: (BigInt(remaining) * weight(i)) % denominator,
    }));
    for (const i of active)
      result[i] = Number((BigInt(remaining) * weight(i)) / denominator);
    let pennies = remaining - active.reduce((s, i) => s + result[i], 0);
    fractions.sort((a, b) =>
      a.remainder === b.remainder
        ? a.i - b.i
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
    for (const { i } of fractions) {
      if (!pennies) break;
      result[i]++;
      pennies--;
    }
    break;
  }
  return result;
}
export const percentOf = (amount: number, bps: number) =>
  Number((BigInt(amount) * BigInt(bps) + 5000n) / 10000n);

/** Reserve the requested amounts, shrinking only the portion above known commitments. */
export function allocateReserves(
  budget: number,
  items: { requested: number; committed: number }[],
): number[] {
  const committed = items.reduce((sum, c) => sum + c.committed, 0);
  const flexible = items.map((c) => Math.max(0, c.requested - c.committed));
  const wanted = flexible.reduce((sum, value) => sum + value, 0);
  const available = Math.max(0, budget - committed);
  const amounts =
    wanted <= available
      ? flexible
      : allocateBudget(
          available,
          flexible.map((weight) => ({ weight, floor: 0 })),
        );
  return items.map((c, i) => c.committed + amounts[i]);
}
