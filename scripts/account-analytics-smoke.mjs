import { _electron as electron, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
const folder = mkdtempSync(resolve(tmpdir(), "lume-account-analysis-"));
const env = { ...process.env, LUME_DATA_DIR: folder };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const errors = [];
async function launch() {
  app = await electron.launch({ args: [".", "--ozone-platform=x11"], env });
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("heading", { name: "Visão geral", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  return page;
}
async function openAccounts(page) {
  const trigger = page.getByRole("button", {
    name: "Selecionar conta",
    exact: true,
  });
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.click();
  await expect(page.getByLabel("Filtrar por conta")).toBeVisible();
}
async function selectAccount(page, value) {
  await openAccounts(page);
  await page.getByLabel("Filtrar por conta").selectOption(value);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Filtrar por conta")).toBeHidden();
}
try {
  let page = await launch();
  await page.evaluate(async () => {
    for (const [id, name] of [
      ["bank", "Conta do dia a dia"],
      ["investment", "Investimentos"],
    ])
      await window.lume.saveNamed("accounts", { id, name });
    await window.lume.saveNamed("categories", {
      id: "food",
      name: "Alimentação",
    });
    const now = new Date();
    const month = (offset) => {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    };
    const save = (id, date, amount, accountId = "bank") =>
      window.lume.saveTransaction({
        id,
        date,
        amount,
        accountId,
        description: id,
        categoryId: "food",
        tagIds: [],
        notes: "",
        recurrenceId: null,
        transfer: false,
        openingBalance: false,
      });
    for (let i = -13; i < 0; i++) {
      await save(`Mercado ${i}`, `${month(i)}-05`, i >= -3 ? -20000 : -10000);
      await save(`Padaria ${i}`, `${month(i)}-20`, i >= -3 ? -10000 : -5000);
    }
    await window.lume.saveNamed("categories", {
      id: "one-off",
      name: "Compra pontual",
    });
    await window.lume.saveTransaction({
      id: "single",
      date: `${month(0)}-01`,
      amount: -223400,
      accountId: "bank",
      categoryId: "one-off",
      description: "Compra única",
      tagIds: [],
      notes: "",
      recurrenceId: null,
      transfer: false,
      openingBalance: false,
    });
    await save("Compra do mês", `${month(0)}-01`, -18000);
    await save(
      "Aporte investimentos",
      `${month(0)}-01`,
      -9000000,
      "investment",
    );
    await save("Aporte anterior", `${month(-1)}-01`, -9000000, "investment");
  });
  await page.reload();
  await selectAccount(page, "bank");
  await openAccounts(page);
  await page
    .getByRole("button", { name: "Definir como principal", exact: true })
    .click();
  await expect
    .poll(async () =>
      page.evaluate(() =>
        window.lume.snapshot().then((s) => s.settings?.primaryAccountId),
      ),
    )
    .toBe("bank");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Organização", exact: true }).click();
  const includeInvestments = page.getByRole("checkbox", {
    name: "Investimentos: Incluir nos gastos e previsões",
    exact: true,
  });
  await expect(includeInvestments).toBeChecked();
  await includeInvestments.click();
  // Controlled by the persisted IPC response, so the visual state changes asynchronously.
  await expect(includeInvestments).not.toBeChecked();
  await expect
    .poll(async () =>
      page.evaluate(() =>
        window.lume
          .snapshot()
          .then((s) => s.settings?.excludedSpendingAccountIds),
      ),
    )
    .toEqual(["investment"]);
  await page
    .getByRole("button", { name: "Gastos e previsões", exact: true })
    .click();
  await openAccounts(page);
  await expect(page.getByLabel("Filtrar por conta")).toHaveValue("primary");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "O que mudou no seu comportamento" }),
  ).toBeVisible();
  await expect(
    page.getByText("Novo nível de gasto", { exact: true }),
  ).toBeVisible();
  await page
    .getByText("Ver detalhes e previsão", { exact: true })
    .first()
    .click();
  await expect(page.getByText(/Erro médio:/)).toBeVisible();
  await expect(
    page.getByText("Aporte investimentos", { exact: true }),
  ).toHaveCount(0);
  await selectAccount(page, "all");
  await openAccounts(page);
  await expect(page.getByText(/1 conta\(s\) fora das análises/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("Novo nível de gasto", { exact: true }),
  ).toBeVisible();
  const forecasts = page.locator('[data-slot="card"]').filter({
    has: page.getByRole("heading", {
      name: "Próximos meses, categoria por categoria",
      exact: true,
    }),
  });
  const oneOff = forecasts
    .getByRole("row")
    .filter({ hasText: "Compra pontual" });
  await expect(
    oneOff.getByRole("cell", { name: "Sem padrão", exact: true }),
  ).toHaveCount(3);
  await page.screenshot({
    path: "account-analysis-preview.png",
    fullPage: true,
  });
  await selectAccount(page, "investment");
  await page
    .getByRole("button", { name: "Analisar Alimentação", exact: true })
    .click();
  await expect(
    page.getByText("Aporte investimentos", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lançamentos", exact: true }).click();
  await expect(
    page.getByText("Aporte investimentos", { exact: true }),
  ).toBeVisible();
  await selectAccount(page, "bank");
  await expect(
    page.getByText("Aporte investimentos", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Patrimônio", exact: true }).click();
  await openAccounts(page);
  await expect(page.getByLabel("Filtrar por conta")).toHaveValue("all");
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("Investimentos", { exact: true }).last(),
  ).toBeVisible();
  await app.close();
  app = undefined;
  page = await launch();
  await openAccounts(page);
  await expect(page.getByLabel("Filtrar por conta")).toHaveValue("primary");
  await page.keyboard.press("Escape");
  await openAccounts(page);
  await expect(
    page.getByRole("option", { name: "Principal · Conta do dia a dia" }),
  ).toHaveCount(1);
  await page.screenshot({ path: "account-selector-preview.png" });
  await page.keyboard.press("Escape");
  const saved = await page.evaluate(() => window.lume.snapshot());
  expect(saved.settings).toEqual({
    primaryAccountId: "bank",
    excludedSpendingAccountIds: ["investment"],
  });
  expect(
    saved.transactions.find((t) => t.id === "Aporte investimentos").amount,
  ).toBe(-9000000);
  for (const name of ["Organização", "Gastos e previsões", "Visão geral"]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name, exact: true }).click();
    await page.setViewportSize({ width: 360, height: 800 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    if (name === "Gastos e previsões") {
      await page.screenshot({
        path: "account-analysis-mobile.png",
        fullPage: true,
      });
      await openAccounts(page);
      const menu = page.getByRole("dialog", {
        name: "Conta da visualização",
        exact: true,
      });
      await expect(menu).toBeVisible();
      await expect
        .poll(async () => {
          const box = await menu.boundingBox();
          return box.x >= 0 && box.x + box.width <= 360;
        })
        .toBe(true);
      await page.screenshot({ path: "account-selector-mobile.png" });
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Selecionar conta", exact: true }),
      ).toBeFocused();
    }
  }
  expect(errors).toEqual([]);
  console.log(
    "Account filters, persisted primary/exclusions, behavioral evidence, investment access, wealth preservation and 360px layout passed.",
  );
} finally {
  if (app) await app.close();
}
