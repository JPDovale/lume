import { _electron as electron, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import initSqlJs from "sql.js";
import { demoLedger } from "./demo-data.mjs";
const folder = mkdtempSync(resolve(tmpdir(), "lume-visual-final-"));
const d = new Date(),
  today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
const app = await electron.launch({
  executablePath: resolve("release/linux-unpacked/lume"),
  args: ["--ozone-platform=x11"],
  env,
});
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  const scrollbar = await page.evaluate(() => ({
    width: getComputedStyle(document.documentElement, "::-webkit-scrollbar")
      .width,
    thumb: getComputedStyle(
      document.documentElement,
      "::-webkit-scrollbar-thumb",
    ).backgroundColor,
    scheme: getComputedStyle(document.documentElement).colorScheme,
  }));
  expect(scrollbar).toEqual({
    width: "10px",
    thumb: "rgb(68, 68, 77)",
    scheme: "dark",
  });
  await page
    .getByRole("button", { name: "Gastos e previsões", exact: true })
    .click();
  await page.screenshot({
    path: resolve("reports-preview.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Patrimônio", exact: true }).click();
  await page.screenshot({
    path: resolve("wealth-preview.png"),
    animations: "disabled",
  });
  for (const width of [768, 390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    const metrics = await page
      .locator(".metric-value")
      .evaluateAll((nodes) =>
        nodes.map((n) => ({ w: n.clientWidth, s: n.scrollWidth })),
      );
    for (const m of metrics) expect(m.s).toBeLessThanOrEqual(m.w + 1);
    const body = await page.evaluate(() => ({
      w: innerWidth,
      s: document.documentElement.scrollWidth,
    }));
    expect(body.s).toBeLessThanOrEqual(body.w + 1);
    if (width === 390)
      await page.screenshot({
        path: resolve("wealth-mobile.png"),
        animations: "disabled",
      });
  }
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  const dialogScrollbar = await page
    .locator('[data-slot="dialog-content"]')
    .evaluate(
      (n) => getComputedStyle(n, "::-webkit-scrollbar-thumb").backgroundColor,
    );
  expect(dialogScrollbar).toBe("rgb(68, 68, 77)");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Gastos e previsões", exact: true })
    .click();
  await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
  await page.getByLabel("Horizonte da projeção").selectOption("12");
  const table = page.locator('[data-slot="table-container"]').last();
  const tableScroll = await table.evaluate((n) => ({
    width: n.clientWidth,
    scroll: n.scrollWidth,
    thumb: getComputedStyle(n, "::-webkit-scrollbar-thumb").backgroundColor,
  }));
  expect(tableScroll.scroll).toBeGreaterThan(tableScroll.width);
  expect(tableScroll.thumb).toBe("rgb(68, 68, 77)");
  await page.screenshot({
    path: resolve("spending-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  console.log(
    "PASS: packaged dark scrollbars on document, dialog and horizontal tables; intact monetary values and no page overflow at 768/390/360px.",
  );
} finally {
  await app.close();
}
