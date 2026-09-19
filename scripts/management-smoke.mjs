import { _electron as electron, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
const folder = mkdtempSync(resolve(tmpdir(), "lume-management-ui-"));
const env = { ...process.env, LUME_DATA_DIR: folder };
delete env.ELECTRON_RUN_AS_NODE;
let app;
async function launch() {
  app = await electron.launch({ args: [".", "--ozone-platform=x11"], env });
  const page = await app.firstWindow();
  await page
    .getByRole("heading", { name: "Visão geral", exact: true })
    .waitFor();
  return page;
}
try {
  let page = await launch();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async () => {
    await window.lume.saveNamed("accounts", { id: "bank", name: "Banco" });
    for (const [kind, id, name] of [
      ["categories", "source", "Origem"],
      ["categories", "target", "Destino"],
      ["tags", "old", "Antiga"],
      ["tags", "new", "Nova"],
    ])
      await window.lume.saveNamed(kind, { id, name });
    await window.lume.saveRecurrence({
      id: "r",
      description: "Energia",
      accountId: "bank",
      categoryId: "source",
      tagIds: ["old", "new"],
      amount: -15000,
      notes: "Teste",
      recurrenceId: null,
      startDate: "2024-01-31",
      endDate: null,
      installmentCount: 3,
      amountMode: "approximate",
      frequency: "monthly",
      active: true,
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "Recorrências", exact: true }).click();
  await page
    .getByRole("button", { name: "Editar recorrência Energia", exact: true })
    .click();
  await expect(page.getByLabel("Primeiro lançamento")).toBeDisabled();
  await expect(page.getByLabel("Frequência", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Valor (R$)", { exact: true })).toHaveValue(
    "150,00",
  );
  await page.getByLabel("Descrição", { exact: true }).fill("Energia revisada");
  await page.getByLabel("Valor (R$)", { exact: true }).fill("180,00");
  await page.getByLabel("Precisão do valor").selectOption("exact");
  await page.getByLabel("Número de parcelas").fill("4");
  await page
    .getByRole("button", { name: "Salvar recorrência", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("4/4 lançadas", { exact: true })).toBeVisible();
  let state = await page.evaluate(() => window.lume.snapshot());
  expect(
    state.transactions.filter(
      (t) => t.amount === -15000 && t.validationStatus === "pending",
    ),
  ).toHaveLength(3);
  expect(
    state.transactions.find((t) => t.installmentNumber === 4),
  ).toMatchObject({ amount: -18000, validationStatus: "confirmed" });
  await page.getByRole("button", { name: "Organização", exact: true }).click();
  await page
    .getByRole("button", { name: "Editar categoria Origem", exact: true })
    .click();
  await page.getByLabel("Nome", { exact: true }).fill("Casa");
  await page
    .getByRole("button", { name: "Salvar categoria", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Editar tag Antiga", exact: true })
    .click();
  await page.getByLabel("Nome", { exact: true }).fill("Essencial");
  await page.getByRole("button", { name: "Salvar tag", exact: true }).click();
  await page
    .getByRole("button", { name: "Excluir categoria Casa", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mover e excluir", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Categoria de destino").selectOption("target");
  await page.screenshot({
    path: resolve("category-migration-preview.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(
    (await page.evaluate(() => window.lume.snapshot())).categories,
  ).toHaveLength(2);
  await page
    .getByRole("button", { name: "Excluir categoria Casa", exact: true })
    .click();
  await page.getByLabel("Categoria de destino").selectOption("target");
  await page
    .getByRole("button", { name: "Mover e excluir", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Excluir tag Essencial", exact: true })
    .click();
  await page.setViewportSize({ width: 360, height: 844 });
  await page.getByLabel("Tag de destino").selectOption("new");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: resolve("tag-migration-mobile.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Mover e excluir", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  state = await page.evaluate(() => window.lume.snapshot());
  expect(state.transactions).toHaveLength(4);
  expect(
    state.transactions.every(
      (t) =>
        t.categoryId === "target" &&
        t.tagIds.length === 1 &&
        t.tagIds[0] === "new" &&
        t.recurrenceId === "r",
    ),
  ).toBe(true);
  expect(state.recurrences[0]).toMatchObject({
    categoryId: "target",
    tagIds: ["new"],
    amount: -18000,
  });
  expect(errors).toEqual([]);
  await app.close();
  app = null;
  page = await launch();
  expect(await page.evaluate(() => window.lume.snapshot())).toEqual(state);
  console.log(
    "PASS: edit recurrence, preserve old values, rename category/tag, mandatory destination, cancel, move/delete/deduplicate, mobile dialog and persisted reopen. Profile:",
    folder,
  );
} finally {
  if (app) await app.close();
}
