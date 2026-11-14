// Scan → analyze → persist, shared by the CLI and the desktop app.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runAnalysis } from "../ai/runner.ts";
import { renderMarkdown } from "../report/render.ts";
import { buildFactSheet } from "../scan/index.ts";
import type { FactSheet, Report, RunMeta } from "../types.ts";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

export type PipelineEvent =
  | { type: "stage"; stage: "scanning" | "analyzing" | "writing" }
  | { type: "scanned"; facts: FactSheet }
  | { type: "tool"; n: number; label: string }
  | { type: "log"; line: string };

export interface PipelineOptions {
  sessions: boolean;
  lang: string;
  model: string;
  /** Developer-confirmed charter text, fed back into the next analysis. */
  charter?: string;
  signal?: AbortSignal;
  onEvent?: (e: PipelineEvent) => void;
}

export interface StoredAnalysis {
  facts: FactSheet;
  report: Report | null;
  meta: RunMeta | null;
}

const stamp = () => new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);

export async function analyzeProject(root: string, outDir: string, opts: PipelineOptions): Promise<StoredAnalysis> {
  const emit = opts.onEvent ?? (() => {});
  await mkdir(outDir, { recursive: true });

  emit({ type: "stage", stage: "scanning" });
  const facts = await buildFactSheet(root, { sessions: opts.sessions });
  await writeFile(path.join(outDir, "fact-sheet.json"), JSON.stringify(facts, null, 2));
  emit({ type: "scanned", facts });

  emit({ type: "stage", stage: "analyzing" });
  const { report, meta, log } = await runAnalysis(facts, {
    model: opts.model,
    lang: opts.lang,
    charter: opts.charter,
    signal: opts.signal,
    onTool: (n, label) => emit({ type: "tool", n, label }),
    onEvent: (line) => emit({ type: "log", line }),
  });

  emit({ type: "stage", stage: "writing" });
  const json = JSON.stringify(report, null, 2);
  await Promise.all([
    writeFile(path.join(outDir, "run.log"), log),
    writeFile(path.join(outDir, "run.json"), JSON.stringify(meta, null, 2)),
    writeFile(path.join(outDir, "report.json"), json),
    writeFile(path.join(outDir, `report-${stamp()}.json`), json),
    writeFile(path.join(outDir, "report.md"), renderMarkdown(report, facts, meta)),
  ]);
  return { facts, report, meta };
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function loadAnalysis(outDir: string): Promise<StoredAnalysis | null> {
  const facts = await readJson<FactSheet>(path.join(outDir, "fact-sheet.json"));
  if (!facts) return null;
  return {
    facts,
    report: await readJson<Report>(path.join(outDir, "report.json")),
    meta: await readJson<RunMeta>(path.join(outDir, "run.json")),
  };
}
