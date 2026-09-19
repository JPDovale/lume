import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { join } from "node:path";
import { readFileSync, copyFileSync } from "node:fs";
import { SqliteLedgerRepository } from "../src/infrastructure/sqlite-repository";
import { ActualImporter } from "../src/infrastructure/actual-importer";
import { LedgerService } from "../src/application/ledger-service";
import { localToday, type Ledger } from "../src/domain/model";
if (process.env.LUME_DATA_DIR)
  app.setPath("userData", process.env.LUME_DATA_DIR);
if (!app.requestSingleInstanceLock()) app.quit();
else
  app
    .whenReady()
    .then(async () => {
      const wasm = join(
        app.getAppPath(),
        "node_modules/sql.js/dist/sql-wasm.wasm",
      );
      const file = join(app.getPath("userData"), "lume.sqlite");
      const repo = await SqliteLedgerRepository.open(file, wasm);
      const service = new LedgerService(repo, { today: localToday });
      const importer = new ActualImporter(wasm);
      let pending: Ledger | null = null;
      const win = new BrowserWindow({
        width: 1380,
        height: 920,
        minWidth: 360,
        minHeight: 540,
        title: "Lume",
        icon: join(app.getAppPath(), "dist/icon.png"),
        backgroundColor: "#111113",
        webPreferences: {
          preload: join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      win.setMenuBarVisibility(false);
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (e) => e.preventDefault());
      const handle = (channel: string, fn: (...args: any[]) => unknown) =>
        ipcMain.handle(channel, (event, ...args) => {
          if (
            event.sender !== win.webContents ||
            event.senderFrame !== win.webContents.mainFrame
          )
            throw new Error("Origem inválida");
          return fn(...args);
        });
      handle("ledger:snapshot", () => service.snapshot());
      handle("ledger:transaction", (tx) => service.saveTransaction(tx));
      handle("ledger:recurrence", (r) => service.saveRecurrence(r));
      handle("ledger:named", (kind, entity) => service.saveNamed(kind, entity));
      handle("ledger:delete-named", (kind, id, replacementId) =>
        service.deleteNamed(kind, id, replacementId),
      );
      handle("ledger:import-preview", async () => {
        pending = null;
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
          title: "Importar Actual Budget",
          filters: [{ name: "Actual Budget", extensions: ["zip", "sqlite"] }],
          properties: ["openFile"],
        });
        if (canceled) return null;
        const result = await importer.parse(readFileSync(filePaths[0]));
        pending = result.ledger;
        const existing = new Set(repo.read().transactions.map((t) => t.id));
        return {
          accounts: pending.accounts.length,
          categories: pending.categories.length,
          transactions: pending.transactions.length,
          duplicates: pending.transactions.filter((t) => existing.has(t.id))
            .length,
          warnings: result.warnings,
        };
      });
      handle("ledger:import-confirm", () => {
        if (!pending) throw new Error("Selecione o arquivo novamente.");
        const result = service.import(pending);
        pending = null;
        return result;
      });
      handle("ledger:backup", async () => {
        repo.save(service.snapshot());
        const result = await dialog.showSaveDialog(win, {
          defaultPath: `lume-${localToday()}.sqlite`,
          filters: [{ name: "Backup Lume", extensions: ["sqlite"] }],
        });
        if (result.canceled || !result.filePath) return false;
        if (result.filePath !== file) copyFileSync(file, result.filePath);
        return true;
      });
      if (process.env.LUME_DEV_URL) await win.loadURL(process.env.LUME_DEV_URL);
      else await win.loadFile(join(__dirname, "../dist/index.html"));
    })
    .catch((error) => {
      dialog.showErrorBox("Não foi possível abrir o Lume", String(error));
      app.quit();
    });
app.on("window-all-closed", () => app.quit());
