import { spawn } from "node:child_process";
import electron from "electron";
const child = spawn(electron, ["."], {
  stdio: "inherit",
  env: { ...process.env, LUME_DEV_URL: "http://127.0.0.1:5173" },
});
child.on("exit", (code) => process.exit(code ?? 1));
