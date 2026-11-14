// Bundle the Electron main and preload scripts (TypeScript → CommonJS) into dist-electron/.
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

export async function buildElectron() {
  const common = { bundle: true, platform: "node", format: "cjs", target: "node22", external: ["electron"], sourcemap: true, logLevel: "warning" };
  await Promise.all([
    build({ ...common, entryPoints: ["electron/main.ts"], outfile: "dist-electron/main.cjs" }),
    build({ ...common, entryPoints: ["electron/preload.ts"], outfile: "dist-electron/preload.cjs" }),
  ]);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildElectron();
  console.log("Built dist-electron/");
}
