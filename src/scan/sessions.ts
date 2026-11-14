// Summarize the developer's past Claude Code sessions for this folder.
// Claude Code stores them at ~/.claude/projects/<encoded-path>/<session-id>.jsonl,
// where the encoded path replaces every non-alphanumeric character with "-".

import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import type { SessionFacts, SessionSummary } from "../types.ts";
import { histogram, truncate } from "./util.ts";

const DETAILED = 12;
const PROMPT_CHARS = 400;

export function encodeProjectPath(absPath: string): string {
  return absPath.replace(/[^a-zA-Z0-9]/g, "-");
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => c && typeof c === "object" && (c as { type?: string }).type === "text")
    .map((c) => (c as { text?: string }).text ?? "")
    .join("\n");
}

function cleanPrompt(raw: string): string | null {
  let t = raw
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<pasted_content[^>]*>([\s\S]*?)<\/pasted_content[^>]*>/g, (_m, inner: string) => `[pasted] ${inner}`)
    .trim();
  if (!t) return null;
  if (/^(<command-|<local-command|Caveat:|<bash-|<task-notification|<side-sessions-event|<ci-monitor-event|\[Request interrupted)/.test(t)) {
    // Keep slash commands visible as a short note; drop pure noise.
    const cmd = /<command-name>([^<]+)<\/command-name>/.exec(t)?.[1];
    if (!cmd) return null;
    const args = /<command-args>([^<]*)<\/command-args>/.exec(t)?.[1] ?? "";
    t = `${cmd} ${args}`.trim();
  }
  return truncate(t, PROMPT_CHARS);
}

async function summarize(file: string): Promise<SessionSummary & { promptDates: Date[] }> {
  const id = path.basename(file, ".jsonl");
  const prompts: string[] = [];
  const promptDates: Date[] = [];
  let title: string | null = null;
  let start: string | null = null;
  let end: string | null = null;
  let lastAssistantText: string | null = null;

  const rl = readline.createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    let o: Record<string, any>;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.type === "custom-title" && o.customTitle) title = String(o.customTitle);
    if (o.type === "summary" && o.summary && !title) title = String(o.summary);
    if (o.isSidechain) continue;
    if (o.type !== "user" && o.type !== "assistant") continue;
    if (o.timestamp) {
      if (!start) start = o.timestamp;
      end = o.timestamp;
    }
    if (o.type === "user") {
      const human = o.origin ? o.origin.kind === "human" : typeof o.message?.content === "string";
      if (!human || o.isMeta) continue;
      const p = cleanPrompt(textOf(o.message?.content));
      if (p) {
        prompts.push(p);
        if (o.timestamp) promptDates.push(new Date(o.timestamp));
      }
    } else {
      const t = textOf(o.message?.content).trim();
      if (t) lastAssistantText = t;
    }
  }

  return {
    id,
    title,
    start,
    end,
    humanPrompts: prompts.length,
    firstPrompts: prompts.slice(0, 3),
    lastPrompts: prompts.length > 3 ? prompts.slice(Math.max(3, prompts.length - 6)) : [],
    lastAssistantText: lastAssistantText ? truncate(lastAssistantText, 900) : null,
    promptDates,
  };
}

export async function scanSessions(root: string, enabled: boolean): Promise<SessionFacts> {
  const base = path.join(os.homedir(), ".claude", "projects");
  const encoded = encodeProjectPath(root);
  const none = { enabled, dir: null, count: 0, sessions: [], older: [], weeklyPrompts: [] };
  if (!enabled) return none;

  let dirs: string[];
  try {
    dirs = (await readdir(base)).filter((d) => d === encoded || d.startsWith(encoded + "--claude-worktrees-"));
  } catch {
    return none;
  }
  if (!dirs.length) return none;

  const files: { file: string; mtime: number }[] = [];
  for (const d of dirs) {
    for (const f of await readdir(path.join(base, d)).catch(() => [] as string[])) {
      if (!f.endsWith(".jsonl")) continue;
      const full = path.join(base, d, f);
      files.push({ file: full, mtime: (await stat(full)).mtimeMs });
    }
  }

  const summaries = (await Promise.all(files.map((f) => summarize(f.file))))
    .filter((s) => s.humanPrompts > 0)
    .sort((a, b) => (b.end ?? "").localeCompare(a.end ?? ""));

  const weeklyPrompts = histogram(summaries.flatMap((s) => s.promptDates)).map((h) => ({ week: h.week, prompts: h.count }));
  const strip = ({ promptDates: _d, ...s }: SessionSummary & { promptDates: Date[] }): SessionSummary => s;

  return {
    enabled,
    dir: path.join(base, encoded),
    count: summaries.length,
    sessions: summaries.slice(0, DETAILED).map(strip),
    older: summaries.slice(DETAILED).map((s) => ({ id: s.id, title: s.title, start: s.start, humanPrompts: s.humanPrompts })),
    weeklyPrompts,
  };
}
