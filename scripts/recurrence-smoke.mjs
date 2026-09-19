import { _electron as electron, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
const folder = mkdtempSync(resolve(tmpdir(), "lume-recurrence-ui-"));
const env = { ...process.env, LUME_DATA_DIR: folder };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [".", "--ozone-platform=x11"], env });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Organização", exact: true }).click();
  await page.getByLabel("Nova conta", { exact: true }).fill("Banco de teste");
  await page
    .getByRole("button", { name: "Adicionar conta", exact: true })
    .click();
  await page.getByRole("button", { name: "Recorrências", exact: true }).click();
  await page
    .getByRole("button", { name: "Nova recorrência", exact: true })
    .click();
  await page.getByLabel("Descrição", { exact: true }).fill("Energia parcelada");
  await page.getByLabel("Precisão do valor").selectOption("approximate");
  await page.getByLabel("Valor (R$)", { exact: true }).fill("150,00");
  await page.getByLabel("Primeiro lançamento").fill("2024-01-31");
  await page.getByLabel("Término", { exact: true }).selectOption("count");
  await page.getByLabel("Número de parcelas").fill("3");
  await page
    .getByRole("button", { name: "Criar recorrência", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("3/3 lançadas", { exact: true })).toBeVisible();
  await expect(
    page.getByText("3 pendentes de validação", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ver lançamentos", exact: true })
    .click();
  await expect(page.getByText("1/3", { exact: true })).toBeVisible();
  await expect(page.getByText("3/3", { exact: true })).toBeVisible();
  await page.getByLabel("Filtrar situação").selectOption("pending");
  await expect(
    page.getByRole("button", {
      name: "Validar Energia parcelada",
      exact: true,
    }),
  ).toHaveCount(3);
  await page
    .getByRole("row")
    .filter({ hasText: "1/3" })
    .getByRole("button", { name: "Validar Energia parcelada", exact: true })
    .click();
  await page.getByLabel("Valor (R$)", { exact: true }).fill("163,42");
  await page.getByLabel("Data", { exact: true }).fill("2024-02-02");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Validar Energia parcelada",
      exact: true,
    }),
  ).toHaveCount(3);
  await page
    .getByRole("row")
    .filter({ hasText: "1/3" })
    .getByRole("button", { name: "Validar Energia parcelada", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Validar lançamento", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Validar Energia parcelada",
      exact: true,
    }),
  ).toHaveCount(2);
  await page.getByLabel("Filtrar situação").selectOption("confirmed");
  await expect(page.getByText("1/3", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Energia parcelada", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Recorrências", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("2 pendentes de validação", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve("recurrences-preview.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Ver lançamentos", exact: true })
    .click();
  await page.screenshot({
    path: resolve("recurrence-transactions-preview.png"),
    animations: "disabled",
  });
  const state = await page.evaluate(() => window.lume.snapshot());
  expect(state.transactions).toHaveLength(3);
  expect(
    state.transactions.find((t) => t.installmentNumber === 1),
  ).toMatchObject({
    amount: -16342,
    recurrenceDate: "2024-01-31",
    date: "2024-02-02",
    validationStatus: "confirmed",
  });
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Validar Energia parcelada", exact: true })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: resolve(`recurrence-validation-${width}.png`),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
  }
  expect(errors).toEqual([]);
  console.log(
    "PASS: approximate installments, immutable link/date, save without validation, explicit confirmation, filters, navigation and 1440/390/360px. Isolated profile:",
    folder,
  );
} finally {
  await app.close();
}
