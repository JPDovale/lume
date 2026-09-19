import { _electron as electron, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
const env = {
  ...process.env,
  LUME_DATA_DIR: mkdtempSync(resolve(tmpdir(), "lume-calculator-ui-")),
};
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
try {
  let page = await launch();
  await page
    .getByRole("button", { name: "Abrir calculadora", exact: true })
    .click();
  const first = page.getByRole("region", {
    name: "Calculadora 1",
    exact: true,
  });
  await first.getByLabel("Expressão", { exact: true }).fill("0,1+0,2");
  await first.getByLabel("Expressão", { exact: true }).press("Enter");
  await expect(first.getByLabel("Resultado", { exact: true })).toHaveText(
    "0,3",
  );
  // Move the first window away, leaving room for the second.
  const handle = first.getByRole("button", { name: "Mover calculadora 1" });
  const before = await first.boundingBox(),
    grip = await handle.boundingBox();
  await page.mouse.move(grip.x + 30, grip.y + 10);
  await page.mouse.down();
  await page.mouse.move(420, 100, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await first.boundingBox()).x)
    .toBeLessThan(before.x - 200);
  await page
    .getByRole("button", { name: "Abrir calculadora", exact: true })
    .click();
  const second = page.getByRole("region", {
    name: "Calculadora 2",
    exact: true,
  });
  await expect(
    second.getByRole("button", {
      name: "Usar resultado 0,3 de 0,1+0,2",
      exact: true,
    }),
  ).toBeVisible();
  await second.getByLabel("Expressão", { exact: true }).fill("(120+80)*15%");
  await second.getByRole("button", { name: "Calcular", exact: true }).click();
  await expect(
    first.getByRole("button", {
      name: "Usar resultado 30 de (120+80)*15%",
      exact: true,
    }),
  ).toBeVisible();
  await expect(first.getByLabel("Expressão", { exact: true })).toHaveValue(
    "0,1+0,2",
  );
  await first
    .getByRole("button", {
      name: "Usar resultado 30 de (120+80)*15%",
      exact: true,
    })
    .click();
  await first.getByRole("button", { name: "+", exact: true }).click();
  await first.getByRole("button", { name: "7", exact: true }).click();
  await first.getByRole("button", { name: "Calcular", exact: true }).click();
  await expect(first.getByLabel("Resultado", { exact: true })).toHaveText("37");
  await second.getByLabel("Expressão", { exact: true }).fill("1/0");
  await second.getByLabel("Expressão", { exact: true }).press("Enter");
  await expect(second.getByRole("alert")).toContainText("dividir por zero");
  expect(
    await page.evaluate(() =>
      window.lume.calculatorHistory().then((h) => h.length),
    ),
  ).toBe(3);
  await page.getByRole("button", { name: "Lançamentos", exact: true }).click();
  await expect(first).toBeVisible();
  await page.screenshot({ path: "calculator-preview.png" });
  await first
    .getByRole("button", { name: "Minimizar calculadora 1", exact: true })
    .click();
  await expect(first.getByLabel("Expressão", { exact: true })).toBeHidden();
  await second
    .getByRole("button", { name: "Fechar calculadora 2", exact: true })
    .click();
  await first
    .getByRole("button", { name: "Restaurar calculadora 1", exact: true })
    .click();
  await expect(first.getByLabel("Resultado", { exact: true })).toHaveText("37");
  await page.setViewportSize({ width: 360, height: 640 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await expect
    .poll(async () => {
      const box = await first.boundingBox();
      return (
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= 360 &&
        box.y + box.height <= 640
      );
    })
    .toBe(true);
  await page.screenshot({ path: "calculator-mobile.png" });
  await app.close();
  app = undefined;
  page = await launch();
  await page
    .getByRole("button", { name: "Abrir calculadora", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Usar resultado 37 de 30+7",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.lume.calculatorHistory().then((h) => h.length),
    ),
  ).toBe(3);
  expect(errors).toEqual([]);
  console.log(
    "PASS: multiple floating calculators, drag, independent expressions, shared history, reuse, keypad, errors, navigation, minimize/restore, 360px bounds and persistence.",
  );
} finally {
  if (app) await app.close();
}
