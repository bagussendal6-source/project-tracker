// Dev runner: Vite dev server for the UI (hot reload) + Electron pointed at it.
// Main-process changes need a restart (Ctrl+C, then npm run dev).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "vite";
import { buildElectron } from "./build-electron.mjs";

await buildElectron();
const server = await createServer({ configFile: "vite.config.ts" });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? "http://localhost:5199/";
console.log(`UI dev server: ${url}`);

const electronBin = createRequire(import.meta.url)("electron");
const child = spawn(electronBin, ["."], { stdio: "inherit", env: { ...process.env, VITE_DEV_URL: url } });
child.on("exit", async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
process.on("SIGINT", () => child.kill("SIGINT"));
