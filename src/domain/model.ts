import { z } from "zod";
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Data inválida",
  );
export const namedSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
});
export const transactionSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  description: z.string().trim().min(1).max(300),
  amount: z
    .number()
    .int()
    .safe()
    .refine((v) => v !== 0, "Valor deve ser diferente de zero"),
  date: dateSchema,
  categoryId: z.string().nullable(),
  tagIds: z.array(z.string()),
  notes: z.string().max(10000).default(""),
  transfer: z.boolean().default(false),
  openingBalance: z.boolean().default(false),
  recurrenceId: z.string().nullable().default(null),
  recurrenceDate: dateSchema.optional(),
  installmentNumber: z.number().int().positive().optional(),
  installmentTotal: z.number().int().positive().optional(),
  validationStatus: z.enum(["pending", "confirmed"]).optional(),
});
export const recurrenceSchema = transactionSchema
  .omit({
    date: true,
    transfer: true,
    openingBalance: true,
    recurrenceDate: true,
    installmentNumber: true,
    installmentTotal: true,
    validationStatus: true,
  })
  .extend({
    startDate: dateSchema,
    endDate: dateSchema.nullable(),
    frequency: z.enum(["weekly", "monthly", "yearly"]),
    active: z.boolean(),
    amountMode: z.enum(["exact", "approximate"]).optional(),
    installmentCount: z.number().int().min(1).max(1200).nullable().optional(),
  })
  .refine(
    (v) => !v.endDate || v.endDate >= v.startDate,
    "Fim anterior ao início",
  )
  .refine(
    (v) => !(v.endDate && v.installmentCount),
    "Escolha uma data final ou um número de parcelas.",
  );
export const isConfirmed = (t: Pick<Transaction, "validationStatus">) =>
  t.validationStatus !== "pending";
export type Named = z.infer<typeof namedSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type Recurrence = z.infer<typeof recurrenceSchema>;
export type Ledger = {
  accounts: Named[];
  categories: Named[];
  tags: Named[];
  transactions: Transaction[];
  recurrences: Recurrence[];
};
export const emptyLedger = (): Ledger => ({
  accounts: [],
  categories: [],
  tags: [],
  transactions: [],
  recurrences: [],
});
export const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
export function parseMoney(value: string): number {
  const normalized = value
    .trim()
    .replace(/\s|R\$/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized))
    throw new Error("Use um valor como 123,45.");
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0)
    throw new Error("Informe um valor positivo válido.");
  return cents;
}
