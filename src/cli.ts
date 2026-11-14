#!/usr/bin/env node
// CLI: scan a project folder, ask Claude (via the Claude CLI) for a briefing, render it.
//
//   node src/cli.ts analyze <folder> [--no-sessions] [--lang English] [--model claude-sonnet-5-5]
//   node src/cli.ts scan <folder> [--no-sessions]
//   node src/cli.ts render <folder>

import { createHash } from "node:crypto";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { knownProjects } from "./core/known.ts";
import { analyzeProject, DEFAULT_MODEL, loadAnalysis } from "./core/pipeline.ts";
import { renderMarkdown } from "./report/render.ts";
import { buildFactSheet } from "./scan/index.ts";
import type { FactSheet } from "./types.ts";

const APP_ROOT = path.resolve(import.meta.dirname, "..");

function usage(): never {
  console.error(`Usage:
  node src/cli.ts analyze <folder> [--no-sessions] [--lang <language>] [--model <id>]
  node src/cli.ts scan <folder> [--no-sessions]
  node src/cli.ts render <folder>`);
  process.exit(2);
}

async function resolveFolder(folder: string): Promise<string> {
  try {
    return await realpath(path.resolve(folder));
  } catch {
    const known = await knownProjects(15);
    const list = known.length
      ? `\n\nProjects you've worked on with Claude Code:\n${known.map((p) => `  ${p.root.replace(os.homedir(), "~")}`).join("\n")}`
      : "";
    console.error(`Folder not found: ${path.resolve(folder)}${list}`);
    process.exit(1);
  }
}

async function outDirFor(abs: string): Promise<string> {
  const hash = createHash("sha1").update(abs).digest("hex").slice(0, 6);
  const dir = path.join(APP_ROOT, "out", `${path.basename(abs).replace(/[^\w.-]+/g, "_")}-${hash}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

function printScanSummary(f: FactSheet) {
  const g = f.git;
  console.log(`  files      ${f.files.totalFiles} (${f.files.totalLines.toLocaleString()} lines)${f.files.truncated ? " [truncated]" : ""}`);
  console.log(`  languages  ${f.files.languages.slice(0, 5).map((l) => l.language).join(", ") || "—"}`);
  console.log(
    `  git        ${g.isRepo ? (g.hasCommits ? `${g.commitCount} commits, last ${g.lastCommit?.slice(0, 10)}` : "repo with no commits") : "not a git repo"}` +
      (g.uncommitted.length ? `, ${g.uncommitted.length} uncommitted` : ""),
  );
  console.log(`  markers    ${f.markers.total} TODO/FIXME-style`);
  console.log(`  sessions   ${f.sessions.enabled ? `${f.sessions.count} Claude Code sessions` : "disabled"}`);
  console.log(`  docs       ${f.docs.readme ? "README" : "no README"}${f.docs.claudeMd ? ", CLAUDE.md" : ""}, ${f.docs.manifests.length} manifests`);
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      "no-sessions": { type: "boolean", default: false },
      lang: { type: "string", default: "English" },
      model: { type: "string", default: DEFAULT_MODEL },
    },
  });
  const [command, folder] = positionals;
  if (!command || !folder || !["analyze", "scan", "render"].includes(command)) usage();
  const root = await resolveFolder(folder);
  const out = await outDirFor(root);

  if (command === "render") {
    const stored = await loadAnalysis(out);
    if (!stored?.report) throw new Error(`No saved analysis for ${root}. Run analyze first.`);
    await writeFile(path.join(out, "report.md"), renderMarkdown(stored.report, stored.facts, stored.meta));
    console.log(path.join(out, "report.md"));
    return;
  }

  if (command === "scan") {
    console.log(`Scanning ${root} …`);
    const facts = await buildFactSheet(root, { sessions: !values["no-sessions"] });
    await writeFile(path.join(out, "fact-sheet.json"), JSON.stringify(facts, null, 2));
    printScanSummary(facts);
    console.log(path.join(out, "fact-sheet.json"));
    return;
  }

  const t0 = Date.now();
  const { meta } = await analyzeProject(root, out, {
    sessions: !values["no-sessions"],
    lang: values.lang!,
    model: values.model!,
    onEvent: (e) => {
      if (e.type === "stage" && e.stage === "scanning") console.log(`Scanning ${root} …`);
      if (e.type === "scanned") {
        console.log(`Scan done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        printScanSummary(e.facts);
        console.log(`\nAnalyzing with ${values.model} via Claude CLI …`);
      }
      if (e.type === "log") console.log(e.line);
    },
  });
  console.log(
    `\nDone in ${(meta!.durationMs / 1000).toFixed(0)}s · ${meta!.toolCalls} tool calls · ` +
      `${(meta!.inputTokens + meta!.cacheReadTokens + meta!.cacheWriteTokens).toLocaleString()} in / ${meta!.outputTokens.toLocaleString()} out tokens`,
  );
  console.log(path.join(out, "report.md"));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
