import { _electron as electron, expect } from "@playwright/test";
import { resolve } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import initSqlJs from "sql.js";
import { zipSync } from "fflate";
import { demoLedger } from "./demo-data.mjs";
const dataDir = mkdtempSync(resolve(tmpdir(), "lume-e2e-"));
const env = { ...process.env, LUME_DATA_DIR: dataDir };
delete env.ELECTRON_RUN_AS_NODE;
const errors = [];
let app;
async function launch() {
  app = await electron.launch({
    executablePath: process.env.LUME_EXECUTABLE,
    args: process.env.LUME_EXECUTABLE
      ? ["--ozone-platform=x11"]
      : [".", "--ozone-platform=x11"],
    env,
    timeout: 30000,
  });
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  return page;
}
try {
  let page = await launch();

  await page.getByRole("button", { name: "Organização", exact: true }).click();
  await page.getByLabel("Nova conta", { exact: true }).fill("Conta principal");
  await page
    .getByRole("button", { name: "Adicionar conta", exact: true })
    .click();
  await expect(
    page.getByText("Conta principal", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Nova categoria", { exact: true }).fill("Alimentação");
  await page
    .getByRole("button", { name: "Adicionar categoria", exact: true })
    .click();
  await expect(page.getByText("Alimentação", { exact: true })).toBeVisible();
  await page.getByLabel("Nova tag", { exact: true }).fill("Essencial");
  await page
    .getByRole("button", { name: "Adicionar tag", exact: true })
    .click();
  await expect(page.getByText("#Essencial", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Novo lançamento", exact: true })
    .click();
  await page.getByLabel("Descrição", { exact: true }).fill("Compra de teste");
  await page.getByLabel("Valor (R$)", { exact: true }).fill("123,45");
  await page
    .getByLabel("Categoria", { exact: true })
    .selectOption({ label: "Alimentação" });
  await page.getByRole("checkbox", { name: "Essencial", exact: true }).check();
  await page
    .getByRole("button", { name: "Registrar lançamento", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Lançamentos", exact: true }).click();
  await expect(
    page.getByText("Compra de teste", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Editar Compra de teste", exact: true })
    .click();
  await page.getByLabel("Descrição", { exact: true }).fill("Compra revisada");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(
    page.getByText("Compra revisada", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Recorrências", exact: true }).click();
  await page
    .getByRole("button", { name: "Nova recorrência", exact: true })
    .click();
  await page.getByLabel("Descrição", { exact: true }).fill("Internet");
  await page.getByLabel("Valor (R$)", { exact: true }).fill("99,90");
  await page
    .getByRole("button", { name: "Criar recorrência", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Internet", exact: true }),
  ).toBeVisible();
  const before = await page.evaluate(() => window.lume.snapshot());
  expect(before.transactions).toHaveLength(2);
  await app.close();
  page = await launch();
  const after = await page.evaluate(() => window.lume.snapshot());
  expect(after).toEqual(before);
  // Import an actual SQLite archive through the production IPC and the preview UI.
  const SQL = await initSqlJs(),
    db = new SQL.Database();
  db.run(`CREATE TABLE accounts(id TEXT,name TEXT,tombstone INTEGER);INSERT INTO accounts VALUES('import-bank','Conta importada',0);
 CREATE TABLE categories(id TEXT,name TEXT,tombstone INTEGER);INSERT INTO categories VALUES('import-food','Restaurantes',0);
 CREATE TABLE transactions(id TEXT,acct TEXT,amount INTEGER,date INTEGER,description TEXT,category TEXT,tombstone INTEGER);
 INSERT INTO transactions VALUES('import-tx','import-bank',-5000,20260901,'Almoço importado','import-food',0);`);
  const zip = resolve(dataDir, "actual.zip");
  writeFileSync(zip, zipSync({ "db.sqlite": db.export() }));
  db.close();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    });
  }, zip);
  await page
    .getByRole("button", { name: "Importar Actual", exact: false })
    .click();
  await expect(
    page.getByText("Seu histórico está pronto para chegar"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirmar importação", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Importar Actual", exact: false })
    .click();
  await expect(
    page.getByText("1 lançamentos já presentes serão ignorados."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirmar importação", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await page.evaluate(() => window.lume.snapshot())).transactions,
  ).toHaveLength(3);
  // Seed only the isolated test profile for visual validation.
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  await app.close();
  env.LUME_DATA_DIR = mkdtempSync(resolve(tmpdir(), "lume-visual-"));
  const demoDb = new SQL.Database();
  demoDb.run(
    "CREATE TABLE ledger (id INTEGER PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL)",
  );
  demoDb.run("INSERT INTO ledger VALUES (1, 1, ?)", [
    JSON.stringify(demoLedger(today)),
  ]);
  writeFileSync(resolve(env.LUME_DATA_DIR, "lume.sqlite"), demoDb.export());
  demoDb.close();
  page = await launch();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".recharts-line-curve").first()).toBeVisible();
  await page.screenshot({
    path: resolve("preview.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Gastos e previsões", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Cada categoria, com contexto",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Categoria da análise").selectOption("demo:category-4");
  await expect(
    page.getByRole("heading", { name: "Dentro de Saúde", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Horizonte da projeção").selectOption("6");
  await page.getByLabel("Período do histórico").selectOption("12");
  await expect(
    page.getByText("Exames e consulta", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Categoria da análise").selectOption("all");
  await page.screenshot({
    path: resolve("reports-preview.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Patrimônio", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "A trajetória do seu patrimônio",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Histórico patrimonial", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Horizonte da projeção").selectOption("12");
  await page.getByLabel("Período do histórico").selectOption("24");
  await page.getByLabel("Horizonte da projeção").selectOption("6");
  await page.getByLabel("Período do histórico").selectOption("12");
  await page.screenshot({
    path: resolve("wealth-preview.png"),
    fullPage: false,
    animations: "disabled",
  });
  const overflow = () =>
    page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
  expect((await overflow()).scroll).toBeLessThanOrEqual(
    (await overflow()).width + 1,
  );
  for (const width of [768, 390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(
      page.getByRole("button", { name: "Abrir menu", exact: true }),
    ).toBeVisible();
    for (const name of [
      "Visão geral",
      "Gastos e previsões",
      "Patrimônio",
      "Organização",
      "Lançamentos",
      "Recorrências",
    ]) {
      await page
        .getByRole("button", { name: "Abrir menu", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name, exact: true })
        .click();
      await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
      const metricWidths = await page
        .locator(".metric-value")
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            width: node.clientWidth,
            scroll: node.scrollWidth,
          })),
        );
      for (const metric of metricWidths)
        expect(
          metric.scroll,
          `Metric overflows in ${name} at ${width}px`,
        ).toBeLessThanOrEqual(metric.width + 1);
      const dimension = await overflow();
      expect(
        dimension.scroll,
        `${name} overflows at ${width}px`,
      ).toBeLessThanOrEqual(dimension.width + 1);
      if (width === 390 && name === "Patrimônio")
        await page.screenshot({
          path: resolve("wealth-mobile.png"),
          fullPage: false,
          animations: "disabled",
        });
      if (width === 390 && name === "Gastos e previsões") {
        await page
          .getByLabel("Categoria da análise")
          .selectOption("demo:category-4");
        await expect(
          page.getByRole("heading", { name: "Dentro de Saúde", exact: true }),
        ).toBeVisible();
        const filtered = await overflow();
        expect(filtered.scroll).toBeLessThanOrEqual(filtered.width + 1);
        await page.screenshot({
          path: resolve("spending-mobile.png"),
          fullPage: true,
          animations: "disabled",
        });
      }
    }
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Nova recorrência", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const dimension = await overflow();
    expect(dimension.scroll).toBeLessThanOrEqual(dimension.width + 1);
    await page.keyboard.press("Escape");
  }
  expect(errors).toEqual([]);
  console.log(
    "PASS: UI create/edit, categories/tags, recurrence, persistence/reopen, Actual ZIP preview/import/deduplication, category filters, forecast horizons, wealth dashboards, responsive 1440/768/390/360px on all six pages; no renderer errors. Test data:",
    dataDir,
  );
} finally {
  if (app) await app.close();
}
