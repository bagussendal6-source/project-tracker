import { realpath } from "node:fs/promises";
import path from "node:path";
import type { FactSheet } from "../types.ts";
import { scanDocs } from "./docs.ts";
import { scanFiles } from "./files.ts";
import { scanGit } from "./git.ts";
import { scanSessions } from "./sessions.ts";

export interface ScanOptions {
  sessions: boolean;
}

/** Deterministic, zero-token scan of a project folder. */
export async function buildFactSheet(rootArg: string, opts: ScanOptions): Promise<FactSheet> {
  const root = await realpath(path.resolve(rootArg));
  const git = await scanGit(root);
  const [{ files, markers, list }, sessions] = await Promise.all([
    scanFiles(root, git.isRepo),
    scanSessions(root, opts.sessions),
  ]);
  const docs = await scanDocs(root, list);
  return {
    generatedAt: new Date().toISOString(),
    root,
    name: path.basename(root),
    files,
    git,
    markers,
    docs,
    sessions,
  };
}
