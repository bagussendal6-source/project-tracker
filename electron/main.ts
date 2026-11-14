import { execFile } from "node:child_process";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from "electron";
import type { AnalysisStatus } from "../src/core/api-types.ts";
import { knownProjects } from "../src/core/known.ts";
import { analyzeProject, DEFAULT_MODEL } from "../src/core/pipeline.ts";
import { Store } from "./store.ts";

const APP_ROOT = path.resolve(__dirname, "..");
const DEV_URL = process.env.VITE_DEV_URL;

app.setName("Project Tracker");
const store = new Store(app.getPath("userData"));
const running = new Map<string, { controller: AbortController; status: AnalysisStatus }>();
let win: BrowserWindow | null = null;

/** GUI apps on macOS start with a minimal PATH; borrow the login shell's so `claude` and `git` resolve. */
async function adoptShellPath() {
  const shellBin = process.env.SHELL || "/bin/zsh";
  const out = await new Promise<string>((resolve) =>
    execFile(shellBin, ["-ilc", 'printf "__PATH__%s__END__" "$PATH"; command -v claude'], { timeout: 8000 }, (_e, stdout) =>
      resolve(stdout ?? ""),
    ),
  );
  const m = /__PATH__(.*)__END__/s.exec(out);
  if (m?.[1]) process.env.PATH = m[1];
  const bin = out.split("__END__")[1]?.trim().split("\n").pop();
  if (bin && !process.env.CLAUDE_BIN) process.env.CLAUDE_BIN = bin;
}

function broadcast(s: AnalysisStatus) {
  win?.webContents.send("status", s);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    title: "Project Tracker",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    // Native translucent sidebar; the main pane paints its own opaque background.
    vibrancy: "sidebar",
    visualEffectState: "followWindow",
    backgroundColor: "#00000000",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!DEV_URL || !url.startsWith(DEV_URL)) e.preventDefault();
  });
  win.once("ready-to-show", () => win?.show());
  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(APP_ROOT, "dist", "index.html"));
  win.on("closed", () => (win = null));
}

/** A standard Mac menu. Notably no View › Reload, so ⌘R can mean "Refresh Briefing". */
function buildMenu() {
  const template: MenuItemConstructorOptions[] = [
    { role: "appMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(DEV_URL ? ([{ type: "separator" }, { role: "toggleDevTools" }] as MenuItemConstructorOptions[]) : []),
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function requireEntry(id: string) {
  const e = await store.entry(id);
  if (!e) throw new Error("Unknown project");
  return e;
}

/** Resolve a project-relative path, refusing anything that escapes the project folder. */
function insideProject(root: string, rel: string) {
  const abs = path.resolve(root, rel.replace(/:\d+(-\d+)?$/, ""));
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error("Path outside project");
  return abs;
}

function registerIpc() {
  ipcMain.handle("listProjects", () => store.summaries());
  ipcMain.handle("knownProjects", () => knownProjects(60));
  ipcMain.handle("pickFolder", async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ["openDirectory"], message: "Choose a project folder to track" });
    return r.canceled ? null : (r.filePaths[0] ?? null);
  });
  ipcMain.handle("addProject", (_e, root: string) => store.add(root));
  ipcMain.handle("removeProject", async (_e, id: string) => {
    running.get(id)?.controller.abort();
    await store.remove(id);
  });
  ipcMain.handle("getProject", (_e, id: string) => store.detail(id));
  ipcMain.handle("statuses", () => [...running.values()].map((r) => r.status));
  ipcMain.handle("saveOverrides", (_e, id: string, o) => store.saveOverrides(id, o));
  ipcMain.handle("cancel", (_e, id: string) => running.get(id)?.controller.abort());
  ipcMain.handle("reveal", async (_e, id: string, rel?: string) => {
    const e = await requireEntry(id);
    shell.showItemInFolder(rel ? insideProject(e.root, rel) : e.root);
  });
  ipcMain.handle("openFile", async (_e, id: string, rel: string) => {
    const e = await requireEntry(id);
    const err = await shell.openPath(insideProject(e.root, rel));
    if (err) throw new Error(err);
  });

  ipcMain.handle("analyze", async (_e, id: string, opts: { sessions: boolean }) => {
    if (running.has(id)) return;
    const entry = await requireEntry(id);
    const overrides = await store.overrides(id);
    const controller = new AbortController();
    const status: AnalysisStatus = {
      id,
      stage: "scanning",
      startedAt: new Date().toISOString(),
      tools: [],
      scanned: null,
      error: null,
    };
    running.set(id, { controller, status });
    broadcast(status);

    analyzeProject(entry.root, store.projectDir(id), {
      sessions: opts.sessions,
      lang: "English",
      model: DEFAULT_MODEL,
      charter: overrides.charter ?? undefined,
      signal: controller.signal,
      onEvent: (ev) => {
        if (ev.type === "stage") status.stage = ev.stage;
        else if (ev.type === "scanned")
          status.scanned = {
            files: ev.facts.files.totalFiles,
            lines: ev.facts.files.totalLines,
            commits: ev.facts.git.commitCount,
            sessions: ev.facts.sessions.count,
          };
        else if (ev.type === "tool") status.tools = [...status.tools, { n: ev.n, label: ev.label }];
        else return;
        broadcast({ ...status });
      },
    })
      .then(async () => {
        // A fresh analysis re-derives feature ids, so stale MVP toggles are dropped; the charter text is kept.
        await store.saveOverrides(id, { mvp: {}, charter: overrides.charter, checked: {} });
        status.stage = "done";
      })
      .catch((err: unknown) => {
        status.stage = controller.signal.aborted ? "cancelled" : "error";
        status.error = err instanceof Error ? err.message : String(err);
      })
      .finally(() => {
        running.delete(id);
        broadcast({ ...status });
      });
  });
}

app.whenReady().then(async () => {
  // The production CSP is a <meta> tag injected by vite.config.ts at build time.
  await adoptShellPath();
  // Projects are added by the user (onboarding or Add Project), never imported behind their back.
  buildMenu();
  registerIpc();
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("window-all-closed", () => {
  for (const r of running.values()) r.controller.abort();
  if (process.platform !== "darwin") app.quit();
});
