// Runs a read-only, isolated Claude Code session in headless mode and returns the structured report.
// Uses the developer's existing Claude CLI login (subscription); no API key involved.

import { spawn } from "node:child_process";
import type { FactSheet, Report, RunMeta } from "../types.ts";
import { systemPrompt, userPrompt } from "./prompt.ts";
import { reportSchema } from "./schema.ts";

export interface RunOptions {
  model: string;
  lang: string;
  charter?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Called for each tool call Claude makes (n is 1-based). */
  onTool?: (n: number, label: string) => void;
  /** Human-readable progress lines (defaults to console.log). */
  onEvent?: (line: string) => void;
}

/** Locate the claude binary; GUI apps on macOS don't inherit the shell PATH. */
function claudeBin(): string {
  return process.env.CLAUDE_BIN || "claude";
}

const TOOL_LABEL: Record<string, (i: Record<string, any>) => string> = {
  Read: (i) => `read  ${i.file_path ?? ""}${i.offset ? `:${i.offset}` : ""}`,
  Glob: (i) => `glob  ${i.pattern ?? ""}${i.path ? ` in ${i.path}` : ""}`,
  Grep: (i) => `grep  ${i.pattern ?? ""}${i.path ? ` in ${i.path}` : ""}${i.glob ? ` (${i.glob})` : ""}`,
};

export function claudeArgs(facts: FactSheet, opts: RunOptions): string[] {
  const today = new Date().toISOString().slice(0, 10);
  return [
    "-p",
    "--model", opts.model,
    // Isolation: no CLAUDE.md, skills, plugins, hooks, or MCP servers from the user's setup,
    // and no settings files from the analyzed project (a project's hooks must never run here).
    "--safe-mode",
    "--restricted",
    "--strict-mcp-config",
    // Read-only toolset, confined to the project folder by --restricted; anything else is denied.
    "--tools", "Read,Glob,Grep",
    "--permission-mode", "dontAsk",
    // Don't write a transcript into ~/.claude/projects (it would pollute the project's own session history).
    "--no-session-persistence",
    "--output-format", "stream-json",
    "--verbose",
    "--json-schema", JSON.stringify(reportSchema),
    "--system-prompt", systemPrompt(opts.lang, today),
  ];
}

export async function runAnalysis(
  facts: FactSheet,
  opts: RunOptions,
): Promise<{ report: Report; meta: RunMeta; log: string }> {
  const startedAt = new Date();
  const args = claudeArgs(facts, opts);
  const child = spawn(claudeBin(), args, { cwd: facts.root, stdio: ["pipe", "pipe", "pipe"], env: process.env });
  const say = opts.onEvent ?? ((l: string) => console.log(l));
  let aborted = false;
  const onAbort = () => {
    aborted = true;
    child.kill("SIGTERM");
  };
  if (opts.signal?.aborted) onAbort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  const spawnError = new Promise<never>((_, reject) =>
    child.on("error", (e) => reject(new Error(`Could not start the claude CLI (${e.message}). Is Claude Code installed and on your PATH?`))),
  );

  const logLines: string[] = [];
  let toolCalls = 0;
  const readFiles = new Set<string>();
  const searchedPaths = new Set<string>();
  const rel = (p: string) => (p.startsWith(facts.root + "/") ? p.slice(facts.root.length + 1) : p === facts.root ? "." : p);
  let result = null as Record<string, any> | null; // assigned in a callback; avoid TS narrowing to never
  let stderr = "";
  let buf = "";

  const timer = setTimeout(() => child.kill("SIGTERM"), opts.timeoutMs ?? 25 * 60_000);

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      logLines.push(line);
      let ev: Record<string, any>;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.type === "assistant") {
        for (const c of ev.message?.content ?? []) {
          if (c.type !== "tool_use") continue;
          if (c.name === "StructuredOutput") {
            say("  ✎ writing report");
            continue;
          }
          toolCalls++;
          const input = c.input ?? {};
          if (c.name === "Read" && input.file_path) readFiles.add(rel(String(input.file_path)));
          if ((c.name === "Grep" || c.name === "Glob")) searchedPaths.add(rel(String(input.path ?? facts.root)));
          const label = (TOOL_LABEL[c.name]?.(input) ?? c.name).replaceAll(facts.root + "/", "").replaceAll(facts.root, ".");
          opts.onTool?.(toolCalls, label);
          say(`  ${String(toolCalls).padStart(3)} ${label}`);
        }
      } else if (ev.type === "result") {
        result = ev;
      }
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (c: string) => (stderr += c));

  child.stdin.on("error", () => {}); // EPIPE if claude dies early; surfaced via exit code instead
  child.stdin.end(userPrompt(facts, opts.charter));

  const code: number = await Promise.race([
    new Promise<number>((resolve) => child.on("close", (c) => resolve(c ?? 1))),
    spawnError,
  ]).finally(() => {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  });
  const log = logLines.join("\n");

  if (aborted) throw new Error("Analysis cancelled.");
  if (!result) throw new Error(`claude exited (${code}) without a result.\n${stderr.slice(-2000)}`);
  if (result.is_error || !result.structured_output) {
    throw new Error(
      `Analysis failed (${result.subtype ?? "error"}): ${String(result.result ?? "").slice(0, 1500)}\n${stderr.slice(-1000)}`,
    );
  }

  const u = result.usage ?? {};
  const meta: RunMeta = {
    model: opts.model,
    startedAt: startedAt.toISOString(),
    durationMs: result.duration_ms ?? Date.now() - startedAt.getTime(),
    numTurns: result.num_turns ?? 0,
    toolCalls,
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    notionalCostUsd: result.total_cost_usd ?? 0,
    readFiles: [...readFiles].sort(),
    searchedPaths: [...searchedPaths].sort(),
  };
  return { report: result.structured_output as Report, meta, log };
}
