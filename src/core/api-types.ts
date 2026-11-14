// Types shared by the Electron main process, the preload bridge, and the renderer.

import type { FactSheet, FeatureStatus, Report, RunMeta } from "../types.ts";

export interface ProjectEntry {
  id: string;
  root: string;
  name: string;
  addedAt: string;
}

export interface Overrides {
  /** Feature id → counts toward MVP (overrides the model's in_mvp). */
  mvp: Record<string, boolean>;
  /** Developer-confirmed MVP definition; fed into the next analysis. */
  charter: string | null;
  /** Items the developer ticked off ("next:<title>", "rem:<title>"). Cleared on re-analysis. */
  checked: Record<string, boolean>;
}

export interface ProjectSummary extends ProjectEntry {
  exists: boolean;
  analyzedAt: string | null;
  oneLiner: string | null;
  projectType: string | null;
  verdict: Report["potential"]["verdict"] | null;
  mvpPct: number | null;
  momentum: number | null;
  lastActivity: string | null;
  counts: Record<FeatureStatus, number> | null;
  /** Weekly activity for the last 26 weeks (commits + prompts, or file edits when neither exists). */
  activity: number[];
}

export interface ProjectDetail {
  entry: ProjectEntry;
  facts: FactSheet | null;
  report: Report | null;
  meta: RunMeta | null;
  overrides: Overrides;
}

export type Stage = "queued" | "scanning" | "analyzing" | "writing" | "done" | "error" | "cancelled";

export interface AnalysisStatus {
  id: string;
  stage: Stage;
  startedAt: string;
  tools: { n: number; label: string }[];
  scanned: { files: number; lines: number; commits: number; sessions: number } | null;
  error: string | null;
}

export interface KnownProject {
  root: string;
  lastUsed: string;
  sessions: number;
}

export interface Api {
  listProjects(): Promise<ProjectSummary[]>;
  knownProjects(): Promise<KnownProject[]>;
  pickFolder(): Promise<string | null>;
  addProject(root: string): Promise<ProjectEntry>;
  removeProject(id: string): Promise<void>;
  getProject(id: string): Promise<ProjectDetail | null>;
  analyze(id: string, opts: { sessions: boolean }): Promise<void>;
  cancel(id: string): Promise<void>;
  statuses(): Promise<AnalysisStatus[]>;
  saveOverrides(id: string, overrides: Overrides): Promise<void>;
  reveal(id: string, rel?: string): Promise<void>;
  openFile(id: string, rel: string): Promise<void>;
  onStatus(cb: (s: AnalysisStatus) => void): () => void;
}
