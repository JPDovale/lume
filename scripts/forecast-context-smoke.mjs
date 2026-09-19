import { _electron as electron, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import initSqlJs from "sql.js";
const folder = mkdtempSync(resolve(tmpdir(), "lume-forecast-context-"));
const now = new Date();
const month = (offset) =>
  new Date(Date.UTC(now.getFullYear(), now.getMonth() + offset, 1))
    .toISOString()
    .slice(0, 7);
const ledger = {
  accounts: [{ id: "bank", name: "Conta do dia a dia" }],
  categories: [
    { id: "salary", name: "Trabalho" },
    { id: "debt", name: "Dívidas" },
    { id: "food", name: "Alimentação" },
  ],
  tags: [],
  transactions: [],
  recurrences: [
    {
      id: "salary",
      description: "Salário",
      accountId: "bank",
      categoryId: "salary",
      amount: 500000,
      tagIds: [],
      notes: "",
      recurrenceId: null,
      startDate: `${month(1)}-01`,
      endDate: null,
      frequency: "monthly",
      active: true,
    },
  ],
};
const amounts = [
  70000, 80000, 60000, 90000, 0, 900000, 240000, 160000, 600000, 280000, 75000,
  90000,
];
for (let i = -18; i < 0; i++) {
  for (const [suffix, amount, categoryId, description] of [
    ["salary", 500000, "salary", "Lançamento importado"],
    ["debt", -amounts[(i + 18) % 12], "debt", `Pagamento ${i}`],
    ["food", -40000, "food", `Mercado ${i}`],
  ]) {
    if (amount)
      ledger.transactions.push({
        id: `${suffix}:${i}`,
        description,
        date: `${month(i)}-01`,
        amount,
        accountId: "bank",
        categoryId,
        tagIds: [],
        notes: "Fixture isolada",
        recurrenceId: null,
        transfer: false,
        openingBalance: false,
      });
  }
}
const SQL = await initSqlJs(),
  db = new SQL.Database();
db.run(
  "CREATE TABLE ledger (id INTEGER PRIMARY KEY,version INTEGER,data TEXT)",
);
db.run("INSERT INTO ledger VALUES(1,1,?)", [JSON.stringify(ledger)]);
writeFileSync(resolve(folder, "lume.sqlite"), db.export());
db.close();
const env = { ...process.env, LUME_DATA_DIR: folder };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [".", "--ozone-platform=x11"], env });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Gastos e previsões", exact: true })
    .click();
  const panel = page.locator('[data-slot="card"]').filter({
    has: page.getByRole("heading", {
      name: "Cada categoria, com contexto",
      exact: true,
    }),
  });
  const income = panel
    .getByLabel("Contexto da previsão")
    .locator("div")
    .filter({ has: page.getByText(/Entradas estimadas ·/) })
    .first();
  await expect(income).toContainText("5.000,00");
  await expect(panel.getByText(/Correspondência estimada:/)).toBeVisible();
  const row = panel.getByRole("row").filter({
    has: page.getByRole("button", { name: "Dívidas", exact: true }),
  });
  await expect(
    row.getByText("Baixa previsibilidade", { exact: true }),
  ).toBeVisible();
  await expect(row.getByText(/% do total estimado/)).toBeVisible();
  await expect(
    panel.getByText("Soma das categorias", { exact: true }),
  ).toBeVisible();
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: "forecast-context-preview.png" });
  await row.getByRole("button", { name: "Dívidas", exact: true }).click();
  const detail = page.locator('[data-slot="card"]').filter({
    has: page.getByRole("heading", {
      name: "Dentro de Dívidas",
      exact: true,
    }),
  });
  await detail
    .getByText("Por que a previsão é instável?", { exact: true })
    .click();
  await expect(
    detail.getByText(/Esses extremos não são uma previsão provável/),
  ).toBeVisible();
  await expect(detail.getByText(/O cenário superior do total/)).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  await panel.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await panel.screenshot({ path: "forecast-context-mobile.png" });
  expect(errors).toEqual([]);
  console.log(
    "PASS: income reconciliation, central category values, consolidated total, uncertainty disclosure and mobile layout.",
  );
} finally {
  await app.close();
}
