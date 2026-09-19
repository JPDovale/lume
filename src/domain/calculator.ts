export type Calculation = {
  id: string;
  expression: string;
  result: string;
  createdAt: string;
};
export const CALCULATOR_HISTORY_LIMIT = 100;
type Fraction = { n: bigint; d: bigint };
const combine = (a: Fraction, b: Fraction, op: string): Fraction => {
  if (op === "+") return { n: a.n * b.d + b.n * a.d, d: a.d * b.d };
  if (op === "-") return { n: a.n * b.d - b.n * a.d, d: a.d * b.d };
  if (op === "*") return { n: a.n * b.n, d: a.d * b.d };
  if (b.n === 0n) throw new Error("Não é possível dividir por zero.");
  return { n: a.n * b.d, d: a.d * b.n };
};
/** Small arithmetic grammar; never executes JavaScript. Decimals remain exact until display rounding. */
export function calculate(expression: string): string {
  if (!expression.trim() || expression.length > 160)
    throw new Error("Digite uma expressão com até 160 caracteres.");
  const source = expression
    .replace(/,/g, ".")
    .replace(/×/g, "*")
    .replace(/÷/g, "/");
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+*/%-]|[^\s]/g) ?? [];
  let cursor = 0;
  const fail = () => {
    throw new Error(
      "Expressão inválida. Use números, parênteses e operações básicas.",
    );
  };
  function atom(): Fraction {
    let value: Fraction;
    const token = tokens[cursor++];
    if (token === "+" || token === "-") {
      value = atom();
      return { ...value, n: token === "-" ? -value.n : value.n };
    }
    if (token === "(") {
      value = sum();
      if (tokens[cursor++] !== ")") return fail();
    } else if (token && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) {
      const [whole, decimal = ""] = token.split(".");
      value = {
        n: BigInt((whole || "0") + decimal),
        d: 10n ** BigInt(decimal.length),
      };
    } else return fail();
    while (tokens[cursor] === "%") {
      cursor++;
      value = { n: value.n, d: value.d * 100n };
    }
    return value;
  }
  function product(): Fraction {
    let value = atom();
    while (tokens[cursor] === "*" || tokens[cursor] === "/") {
      const op = tokens[cursor++];
      value = combine(value, atom(), op);
    }
    return value;
  }
  function sum(): Fraction {
    let value = product();
    while (tokens[cursor] === "+" || tokens[cursor] === "-") {
      const op = tokens[cursor++];
      value = combine(value, product(), op);
    }
    return value;
  }
  const value = sum();
  if (cursor !== tokens.length) return fail();
  const negative = value.n < 0n !== value.d < 0n,
    n = value.n < 0n ? -value.n : value.n,
    d = value.d < 0n ? -value.d : value.d;
  const scale = 10n ** 12n,
    rounded = (n * scale * 2n + d) / (d * 2n);
  const decimals = String(rounded % scale)
    .padStart(12, "0")
    .replace(/0+$/, "");
  return `${negative && rounded !== 0n ? "-" : ""}${rounded / scale}${decimals ? `,${decimals}` : ""}`;
}
