import { randomUUID } from "node:crypto";
import {
  calculate,
  CALCULATOR_HISTORY_LIMIT,
  type Calculation,
} from "../domain/calculator";
import type { LedgerRepository } from "./ports";
export class CalculatorService {
  private readonly repository: LedgerRepository;
  constructor(repository: LedgerRepository) {
    this.repository = repository;
  }
  history(): Calculation[] {
    return this.repository.read().calculatorHistory ?? [];
  }
  calculate(input: unknown): Calculation {
    if (typeof input !== "string") throw new Error("Expressão inválida.");
    const expression = input.trim();
    const entry = {
      id: randomUUID(),
      expression,
      result: calculate(expression),
      createdAt: new Date().toISOString(),
    };
    const state = this.repository.read();
    state.calculatorHistory = [entry, ...(state.calculatorHistory ?? [])].slice(
      0,
      CALCULATOR_HISTORY_LIMIT,
    );
    this.repository.save(state);
    return entry;
  }
}
