// Dev-only stand-in for the Electron bridge, so the UI can be previewed in a plain browser
// (npm run ui) using the analyses the CLI saved in out/. Never bundled into the app.

import type { AnalysisStatus, Api, Overrides, ProjectDetail, ProjectSummary } from "../../src/core/api-types.ts";
import { recentActivity } from "../../src/report/activity.ts";
import { computeProgress, withMvpOverrides } from "../../src/report/progress.ts";
import type { FactSheet, Report, RunMeta } from "../../src/types.ts";

const files = import.meta.glob<{ default: unknown }>("../../out/*/{fact-sheet,report,run}.json", { eager: true });

interface Mock {
  facts: FactSheet;
  report: Report | null;
  meta: RunMeta | null;
}
const byDir = new Map<string, Mock>();
for (const [p, mod] of Object.entries(files)) {
  const [, dir, kind] = /out\/([^/]+)\/(fact-sheet|report|run)\.json$/.exec(p)!;
  const m = byDir.get(dir) ?? ({ facts: null, report: null, meta: null } as unknown as Mock);
  if (kind === "fact-sheet") m.facts = mod.default as FactSheet;
  if (kind === "report") m.report = mod.default as Report;
  if (kind === "run") m.meta = mod.default as RunMeta;
  byDir.set(dir, m);
}
const projects = [...byDir.entries()].filter(([, m]) => m.facts).map(([id, m]) => ({ id, ...m }));
const overrides = new Map<string, Overrides>();
const ov = (id: string): Overrides => overrides.get(id) ?? { mvp: {}, charter: null, checked: {} };
const listeners = new Set<(s: AnalysisStatus) => void>();

export const mockApi: Api = {
  async listProjects() {
    return projects.map((p): ProjectSummary => {
      const r = p.report ? withMvpOverrides(p.report, ov(p.id).mvp) : null;
      const pr = r ? computeProgress(r) : null;
      return {
        id: p.id,
        root: p.facts.root,
        name: p.facts.name,
        addedAt: p.facts.generatedAt,
        exists: true,
        analyzedAt: p.meta?.startedAt ?? null,
        oneLiner: r?.identity.one_liner ?? null,
        projectType: r?.identity.project_type ?? null,
        verdict: r?.potential.verdict ?? null,
        mvpPct: pr?.mvpPct ?? null,
        momentum: r?.potential.scores.momentum ?? null,
        lastActivity: r?.where_you_left_off.last_activity ?? p.facts.files.lastModified?.slice(0, 10) ?? null,
        counts: pr?.counts ?? null,
        activity: recentActivity(p.facts),
      };
    });
  },
  async knownProjects() {
    return [
      { root: "/Users/you/ScrollAdaptor", lastUsed: new Date(Date.now() - 9 * 864e5).toISOString(), sessions: 9 },
      { root: "/Users/you/Gotham", lastUsed: new Date(Date.now() - 20 * 864e5).toISOString(), sessions: 2 },
    ];
  },
  async pickFolder() {
    return null;
  },
  async addProject(root) {
    return { id: root, root, name: root.split("/").pop()!, addedAt: new Date().toISOString() };
  },
  async removeProject() {},
  async getProject(id): Promise<ProjectDetail | null> {
    const p = projects.find((x) => x.id === id);
    if (!p) return null;
    return {
      entry: { id, root: p.facts.root, name: p.facts.name, addedAt: p.facts.generatedAt },
      facts: p.facts,
      report: p.report,
      meta: p.meta,
      overrides: ov(id),
    };
  },
  async analyze(id) {
    const s: AnalysisStatus = { id, stage: "analyzing", startedAt: new Date().toISOString(), tools: [], scanned: { files: 933, lines: 69367, commits: 11, sessions: 24 }, error: null };
    const labels = ["read  src/main.ts", "grep  TODO in src", "read  src/server/index.ts", "glob  src/**/*.tsx"];
    let n = 0;
    const tick = setInterval(() => {
      n++;
      s.tools = [...s.tools, { n, label: labels[n % labels.length] }];
      if (n >= 8) {
        s.stage = "done";
        clearInterval(tick);
      }
      listeners.forEach((l) => l({ ...s }));
    }, 700);
  },
  async cancel() {},
  async statuses() {
    return [];
  },
  async saveOverrides(id, o) {
    overrides.set(id, o);
  },
  async reveal() {},
  async openFile() {},
  onStatus(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};
