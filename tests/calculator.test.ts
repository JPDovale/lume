import { describe, expect, it } from "vitest";
import { calculate } from "../src/domain/calculator";
import { CalculatorService } from "../src/application/calculator-service";
import { emptyLedger, type Ledger } from "../src/domain/model";
describe("calculator arithmetic", () => {
  it.each([
    ["0,1 + 0,2", "0,3"],
    ["(120 + 80) × 15%", "30"],
    ["2 + 3 * 4", "14"],
    ["-(2+3)/2", "-2,5"],
    ["1/3", "0,333333333333"],
    ["-1/6", "-0,166666666667"],
    [".5 + 1.", "1,5"],
    ["9999999999999999+1", "10000000000000000"],
    ["100+10%", "100,1"],
    ["-0", "0"],
    ["12÷-2", "-6"],
  ])("evaluates %s", (expression, result) =>
    expect(calculate(expression)).toBe(result),
  );
  it.each([
    "",
    "1/0",
    "0/0",
    "2+",
    "(1+2",
    "2(3)",
    "1.2.3",
    "alert(1)",
    "1e3",
    "1 2",
    "2**3",
    "1".repeat(161),
  ])("rejects invalid expressions without executing code: %s", (expression) =>
    expect(() => calculate(expression)).toThrow(),
  );
});
describe("shared calculator history", () => {
  it("shares persisted results across service instances and preserves financial records", () => {
    let state: Ledger = {
      ...emptyLedger(),
      accounts: [{ id: "bank", name: "Banco" }],
      settings: { primaryAccountId: "bank", excludedSpendingAccountIds: [] },
    };
    const repo = {
      read: () => structuredClone(state),
      save: (value: Ledger) => {
        state = structuredClone(value);
      },
    };
    const a = new CalculatorService(repo),
      b = new CalculatorService(repo);
    expect(a.history()).toEqual([]);
    const entry = a.calculate("12+8");
    expect(b.history()).toEqual([entry]);
    b.calculate("20*2");
    expect(a.history().map((v) => v.result)).toEqual(["40", "20"]);
    const before = structuredClone(state);
    expect(() => a.calculate("1/0")).toThrow();
    expect(state).toEqual(before);
    for (let i = 0; i < 105; i++) a.calculate(String(i));
    expect(b.history()).toHaveLength(100);
    expect(b.history()[0].result).toBe("104");
    expect(state.accounts).toEqual([{ id: "bank", name: "Banco" }]);
    expect(state.settings?.primaryAccountId).toBe("bank");
  });
});
