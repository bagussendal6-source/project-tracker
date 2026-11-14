// Project registry and per-project analysis files, stored as JSON under the app's userData dir:
//   <userData>/projects.json
//   <userData>/projects/<id>/{fact-sheet,report,run,overrides}.json, report-<stamp>.json, report.md, run.log

import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Overrides, ProjectDetail, ProjectEntry, ProjectSummary } from "../src/core/api-types.ts";
import { loadAnalysis } from "../src/core/pipeline.ts";
import { recentActivity } from "../src/report/activity.ts";
import { computeProgress, withMvpOverrides } from "../src/report/progress.ts";

export class Store {
  readonly dir: string;
  constructor(dir: string) {
    this.dir = dir;
  }

  private get registryFile() {
    return path.join(this.dir, "projects.json");
  }

  projectDir(id: string) {
    return path.join(this.dir, "projects", id);
  }

  async entries(): Promise<ProjectEntry[]> {
    try {
      return JSON.parse(await readFile(this.registryFile, "utf8")) as ProjectEntry[];
    } catch {
      return [];
    }
  }

  private async saveEntries(list: ProjectEntry[]) {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.registryFile, JSON.stringify(list, null, 2));
  }

  async entry(id: string): Promise<ProjectEntry | null> {
    return (await this.entries()).find((e) => e.id === id) ?? null;
  }

  async add(rootArg: string): Promise<ProjectEntry> {
    const root = await realpath(rootArg);
    if (!(await stat(root)).isDirectory()) throw new Error(`${root} is not a folder`);
    const id = createHash("sha1").update(root).digest("hex").slice(0, 10);
    const list = await this.entries();
    const existing = list.find((e) => e.id === id);
    if (existing) return existing;
    const e: ProjectEntry = { id, root, name: path.basename(root), addedAt: new Date().toISOString() };
    await this.saveEntries([...list, e]);
    await mkdir(this.projectDir(id), { recursive: true });
    return e;
  }

  async remove(id: string) {
    await this.saveEntries((await this.entries()).filter((e) => e.id !== id));
    await rm(this.projectDir(id), { recursive: true, force: true });
  }

  async overrides(id: string): Promise<Overrides> {
    try {
      const o = JSON.parse(await readFile(path.join(this.projectDir(id), "overrides.json"), "utf8"));
      return { mvp: o.mvp ?? {}, charter: o.charter ?? null, checked: o.checked ?? {} };
    } catch {
      return { mvp: {}, charter: null, checked: {} };
    }
  }

  async saveOverrides(id: string, o: Overrides) {
    await mkdir(this.projectDir(id), { recursive: true });
    await writeFile(path.join(this.projectDir(id), "overrides.json"), JSON.stringify(o, null, 2));
  }

  async detail(id: string): Promise<ProjectDetail | null> {
    const entry = await this.entry(id);
    if (!entry) return null;
    const stored = await loadAnalysis(this.projectDir(id));
    return {
      entry,
      facts: stored?.facts ?? null,
      report: stored?.report ?? null,
      meta: stored?.meta ?? null,
      overrides: await this.overrides(id),
    };
  }

  async summaries(): Promise<ProjectSummary[]> {
    const list = await this.entries();
    return Promise.all(
      list.map(async (entry): Promise<ProjectSummary> => {
        const [stored, ov, exists] = await Promise.all([
          loadAnalysis(this.projectDir(entry.id)),
          this.overrides(entry.id),
          stat(entry.root).then((s) => s.isDirectory()).catch(() => false),
        ]);
        const report = stored?.report ? withMvpOverrides(stored.report, ov.mvp) : null;
        const p = report ? computeProgress(report) : null;
        return {
          ...entry,
          exists,
          analyzedAt: stored?.meta?.startedAt ?? (report ? stored!.facts.generatedAt : null),
          oneLiner: report?.identity.one_liner ?? null,
          projectType: report?.identity.project_type ?? null,
          verdict: report?.potential.verdict ?? null,
          mvpPct: p?.mvpPct ?? null,
          momentum: report?.potential.scores.momentum ?? null,
          lastActivity: report?.where_you_left_off.last_activity ?? lastActivityFromFacts(stored?.facts),
          counts: p?.counts ?? null,
          activity: stored?.facts ? recentActivity(stored.facts) : [],
        };
      }),
    );
  }
}

function lastActivityFromFacts(f: { git: { lastCommit: string | null }; sessions: { sessions: { end: string | null }[] }; files: { lastModified: string | null } } | undefined) {
  if (!f) return null;
  const c = [f.git.lastCommit, f.sessions.sessions[0]?.end, f.files.lastModified].filter(Boolean) as string[];
  return c.length ? c.sort().at(-1)!.slice(0, 10) : null;
}
