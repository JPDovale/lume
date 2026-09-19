import { contextBridge, ipcRenderer } from "electron";
import type { LumeApi } from "../src/application/api";
const api: LumeApi = {
  saveMonthlyPlan: (config) => ipcRenderer.invoke("planning:save", config),
  saveSettings: (settings) => ipcRenderer.invoke("ledger:settings", settings),
  calculatorHistory: () => ipcRenderer.invoke("calculator:history"),
  calculate: (expression) =>
    ipcRenderer.invoke("calculator:calculate", expression),
  snapshot: () => ipcRenderer.invoke("ledger:snapshot"),
  saveTransaction: (t) => ipcRenderer.invoke("ledger:transaction", t),
  saveRecurrence: (r) => ipcRenderer.invoke("ledger:recurrence", r),
  saveNamed: (k, e) => ipcRenderer.invoke("ledger:named", k, e),
  deleteNamed: (kind, id, replacementId) =>
    ipcRenderer.invoke("ledger:delete-named", kind, id, replacementId),
  previewImport: () => ipcRenderer.invoke("ledger:import-preview"),
  confirmImport: () => ipcRenderer.invoke("ledger:import-confirm"),
  exportBackup: () => ipcRenderer.invoke("ledger:backup"),
};
contextBridge.exposeInMainWorld("lume", api);
