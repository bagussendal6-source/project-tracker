// Discover project folders the developer has worked on with Claude Code,
// using the cwd recorded in each ~/.claude/projects/<encoded>/<session>.jsonl.

import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

export interface KnownProject {
  root: string;
  lastUsed: string;
  sessions: number;
}

async function cwdOf(file: string): Promise<string | null> {
  const rl = readline.createInterface({ input: createReadStream(file, "utf8") });
  let n = 0;
  try {
    for await (const line of rl) {
      if (++n > 40) break;
      const m = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(line);
      if (m) return JSON.parse(`"${m[1]}"`) as string;
    }
  } finally {
    rl.close();
  }
  return null;
}

/** Existing folders with Claude Code sessions, most recently used first. Skips temp and app-support dirs. */
export async function knownProjects(limit = 50): Promise<KnownProject[]> {
  const base = path.join(os.homedir(), ".claude", "projects");
  const dirs = await readdir(base, { withFileTypes: true }).catch(() => []);
  const found = new Map<string, KnownProject>();
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const dir = path.join(base, d.name);
    const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".jsonl"));
    if (!files.length) continue;
    const cwd = await cwdOf(path.join(dir, files[0]));
    if (!cwd || cwd === os.homedir() || /\/\.claude\/|^\/private\/|^\/tmp\/|\/Library\//.test(cwd)) continue;
    const st = await stat(cwd).catch(() => null);
    if (!st?.isDirectory()) continue;
    const mtime = (await stat(dir)).mtime.toISOString();
    const prev = found.get(cwd);
    if (!prev || prev.lastUsed < mtime) found.set(cwd, { root: cwd, lastUsed: mtime, sessions: (prev?.sessions ?? 0) + files.length });
    else prev.sessions += files.length;
  }
  return [...found.values()].sort((a, b) => b.lastUsed.localeCompare(a.lastUsed)).slice(0, limit);
}
