import { _electron as electron, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import initSqlJs from "sql.js";
import { demoLedger } from "./demo-data.mjs";
const folder = mkdtempSync(resolve(tmpdir(), "lume-behavior-visual-"));
const date = new Date(),
  today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const SQL = await initSqlJs(),
  db = new SQL.Database();
db.run(
  "CREATE TABLE ledger (id INTEGER PRIMARY KEY, version INTEGER, data TEXT)",
);
db.run("INSERT INTO ledger VALUES (1,1,?)", [
  JSON.stringify(demoLedger(today)),
]);
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
  const panel = page
    .locator('[data-slot="card"]')
    .filter({
      has: page.getByRole("heading", {
        name: "O que mudou no seu comportamento",
        exact: true,
      }),
    });
  const cards = panel.getByRole("article");
  await expect(cards).toHaveCount(3);
  await expect(panel.getByText(/Erro médio:/).first()).toBeHidden();
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: "behavior-hierarchy-preview.png" });
  const first = cards.first();
  await first.locator("summary").click();
  await expect(first.getByText(/Erro médio:/)).toBeVisible();
  await first.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(first.getByText(/Erro médio:/)).toBeHidden();
  await page.setViewportSize({ width: 360, height: 800 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await panel.screenshot({ path: "behavior-hierarchy-mobile.png" });
  await first.locator("summary").click();
  await expect(first.getByText(/Erro médio:/)).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "PASS: three readable cards, collapsed evidence, keyboard disclosure, desktop/mobile layout and renderer health.",
  );
} finally {
  await app.close();
}
