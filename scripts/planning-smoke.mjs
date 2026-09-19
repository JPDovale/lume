import { _electron as electron, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import initSqlJs from "sql.js";
const folder = mkdtempSync(resolve(tmpdir(), "lume-planning-"));
await build({
  entryPoints: ["src/domain/planning.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: resolve(folder, "planning.mjs"),
});
const { proposePlan, savePlanRecord } = await import(
  pathToFileURL(resolve(folder, "planning.mjs"))
);
const now = new Date();
const month = (offset) =>
  new Date(Date.UTC(now.getFullYear(), now.getMonth() + offset, 1))
    .toISOString()
    .slice(0, 7);
const ledger = {
  accounts: [{ id: "bank", name: "Conta principal" }],
  categories: [
    { id: "food", name: "Alimentação" },
    { id: "home", name: "Moradia" },
    { id: "extra", name: "Lazer" },
  ],
  tags: [],
  recurrences: [],
  transactions: [],
};
for (let i = -8; i < 0; i++)
  for (const [categoryId, amount] of [
    [null, 500000],
    ["food", -100000],
    ["home", -200000],
  ])
    ledger.transactions.push({
      id: `${i}:${categoryId}`,
      description: categoryId ?? "Salário",
      date: `${month(i)}-05`,
      accountId: "bank",
      categoryId,
      amount,
      tagIds: [],
      notes: "",
      recurrenceId: null,
    });
for (let i = 0; i < 35; i++)
  ledger.transactions.push({
    id: `current:${i}`,
    description: `Compra ${i}`,
    date: `${month(0)}-01`,
    accountId: "bank",
    categoryId: "food",
    amount: -100,
    tagIds: [],
    notes: "",
    recurrenceId: null,
  });
const config = {
  month: month(-1),
  accountIds: ["bank"],
  savingsBps: 2000,
  incomeOverride: null,
  categories: [
    { categoryId: "food", reserveBps: 10000 },
    { categoryId: "home", reserveBps: 10000 },
  ],
};
ledger.monthlyPlans = [
  savePlanRecord(
    ledger,
    proposePlan(ledger, config, `${month(-1)}-01`),
    `${month(-1)}-01`,
  ),
];
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
let app = await electron.launch({ args: [".", "--ozone-platform=x11"], env });
try {
  let page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole("button", { name: "Planejamento", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Como distribuir o orçamento" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Mês do planejamento", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Ainda pode gastar", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Recalcular sugestões", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Meses encerrados", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Meta de sobra (%)", { exact: true }).fill("25.5");
  await expect(page.locator("[data-planning-budget]")).toContainText(
    "3.725,00",
  );
  await page.getByLabel("Meta de sobra (%)", { exact: true }).fill("25");
  await expect(page.locator("[data-planning-budget]")).toContainText(
    "3.750,00",
  );
  await page
    .getByRole("button", { name: "Salvar planejamento", exact: true })
    .click();
  await expect(
    page.getByText("Planejamento salvo", { exact: true }),
  ).toBeVisible();
  let state = await page.evaluate(() => window.lume.snapshot());
  let saved = state.monthlyPlans.find((p) => p.config.month === month(1));
  expect(saved.savingsGoal).toBe(125000);
  expect(saved.allocations.reduce((s, c) => s + c.allocated, 0)).toBe(300000);
  const oldFood = saved.allocations[0].allocated;
  const foodSlider = page.getByRole("slider", {
    name: "Reservar da previsão de Alimentação",
    exact: true,
  });
  await expect(foodSlider).toHaveValue("100");
  await foodSlider.focus();
  await page.keyboard.press("Home");
  await expect(foodSlider).toHaveValue("0");
  await expect(
    page.locator('[data-plan-category="food"] [data-plan-limit]'),
  ).toContainText("0,00");
  await page.keyboard.press("End");
  await expect(foodSlider).toHaveValue("100");
  await expect(
    page.locator('[data-plan-category="food"] [data-plan-limit]'),
  ).toContainText("1.000,00");
  const track = page.locator(
    '[data-plan-category="food"] [data-slot="slider-track"]',
  );
  const box = await track.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(foodSlider).toHaveValue("50");
  await expect(
    page.locator('[data-plan-category="food"] [data-plan-limit]'),
  ).toContainText("500,00");
  await expect(
    page.locator('[data-plan-category="home"] [data-plan-limit]'),
  ).toContainText("2.000,00");
  await page
    .getByRole("button", { name: "Salvar planejamento", exact: true })
    .click();
  await expect(
    page.getByText("Planejamento salvo", { exact: true }),
  ).toBeVisible();
  state = await page.evaluate(() => window.lume.snapshot());
  saved = state.monthlyPlans.find((p) => p.config.month === month(1));
  expect(saved.allocations[0].allocated).toBe(oldFood / 2);
  expect(saved.config.categories[0].reserveBps).toBe(5000);
  await page
    .getByLabel("Categoria para adicionar ao plano", { exact: true })
    .selectOption("extra");
  await page
    .getByRole("button", { name: "Adicionar categoria", exact: true })
    .click();
  await expect(
    page.getByRole("slider", {
      name: "Reservar da previsão de Lazer",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remover Lazer do plano", exact: true })
    .click();
  await expect(
    page.getByRole("slider", {
      name: "Reservar da previsão de Lazer",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Salvar planejamento", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .locator("header")
      .getByRole("button", { name: "Importar Actual", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator("aside")
      .getByRole("button", { name: "Importar Actual", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: "planning-preview.png", fullPage: true });
  await page.setViewportSize({ width: 360, height: 900 });
  await expect(
    page
      .locator("header")
      .getByRole("button", { name: "Importar Actual", exact: true }),
  ).toBeVisible();
  await expect(foodSlider).toBeVisible();
  await page.screenshot({ path: "planning-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page
    .getByRole("button", { name: "Resultados dos planos", exact: true })
    .click();
  await page.getByRole("button", { name: /^Ver / }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByText("Meta sobre a renda real", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "planning-result-preview.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 900 });
  await page.screenshot({
    path: "planning-history-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Lançamentos", exact: true }).click();
  await expect(page.locator("[data-month-divider]")).toHaveCount(1);
  await page.screenshot({
    path: "transaction-months-preview.png",
    fullPage: true,
  });
  const next = page.getByRole("button", { name: /Próxima/ });
  await next.click();
  await expect(page.locator("[data-month-divider]").first()).toContainText(
    "continuação",
  );
  expect(await page.locator("[data-month-divider]").count()).toBeGreaterThan(1);
  expect(errors).toEqual([]);
  await app.close();
  app = await electron.launch({ args: [".", "--ozone-platform=x11"], env });
  page = await app.firstWindow();
  await page.getByRole("button", { name: "Planejamento", exact: true }).click();
  await expect(
    page.getByText("Planejamento salvo", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Meta de sobra (%)", { exact: true }),
  ).toHaveValue("25");
  await expect(
    page.getByRole("slider", {
      name: "Reservar da previsão de Alimentação",
      exact: true,
    }),
  ).toHaveValue("50");
  console.log(
    "Planning: allocations, percentage sliders with keyboard and mouse, add/remove, SQLite restart, closure details, mobile and month separators passed.",
  );
} finally {
  await app.close();
}
