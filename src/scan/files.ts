import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { FileFacts, Marker, MarkerFacts } from "../types.ts";
import { histogram, isoDate, run, truncate } from "./util.ts";

const IGNORE_DIRS = new Set([
  ".git", "node_modules", ".venv", "venv", "env", "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache",
  "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", ".turbo", ".parcel-cache", ".cache", ".expo",
  "target", "Pods", "DerivedData", ".gradle", ".idea", ".vscode", "coverage", ".nyc_output", "vendor",
  ".terraform", ".serverless", ".vercel", ".netlify", "bower_components", ".dart_tool", ".pub-cache",
  "Library", "Temp", "Logs", "obj", ".godot", ".import", "site-packages", ".tox", ".eggs",
]);
const IGNORE_PATHS = [".claude/worktrees/"];
const MAX_FILES = 25_000;
const MAX_TEXT_BYTES = 512 * 1024;
const MAX_TOTAL_READ = 120 * 1024 * 1024;

const LANG: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", ipynb: "Jupyter", rb: "Ruby", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", kts: "Kotlin",
  swift: "Swift", m: "Objective-C", mm: "Objective-C", c: "C", h: "C/C++ header", cpp: "C++", cc: "C++", hpp: "C++",
  cs: "C#", php: "PHP", dart: "Dart", lua: "Lua", luau: "Luau", gd: "GDScript", r: "R", jl: "Julia",
  scala: "Scala", ex: "Elixir", exs: "Elixir", erl: "Erlang", hs: "Haskell", clj: "Clojure", zig: "Zig",
  sh: "Shell", bash: "Shell", zsh: "Shell", ps1: "PowerShell", sql: "SQL",
  html: "HTML", htm: "HTML", css: "CSS", scss: "SCSS", sass: "SCSS", less: "Less", vue: "Vue", svelte: "Svelte",
  astro: "Astro", md: "Markdown", mdx: "Markdown", rst: "reStructuredText", txt: "Text",
  json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", xml: "XML", gradle: "Gradle", tf: "Terraform",
  proto: "Protobuf", graphql: "GraphQL", gql: "GraphQL", prisma: "Prisma", sol: "Solidity",
  glsl: "GLSL", hlsl: "HLSL", wgsl: "WGSL", shader: "Shader", tex: "LaTeX",
};
const NON_CODE = new Set(["Markdown", "reStructuredText", "Text", "JSON", "YAML", "TOML", "XML"]);
const SPECIAL_NAMES: Record<string, string> = { Dockerfile: "Docker", Makefile: "Make", Gemfile: "Ruby" };
const LOCKFILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "Cargo.lock", "poetry.lock", "Podfile.lock", "composer.lock", "Gemfile.lock", "uv.lock"]);

const MARKER_RE = /\b(TODO|FIXME|HACK|XXX)\b[:\s(]?(.*)|((?:not (?:yet )?implemented|coming soon))(.*)/i;

function languageOf(rel: string): string | null {
  const base = path.basename(rel);
  if (SPECIAL_NAMES[base]) return SPECIAL_NAMES[base];
  const ext = path.extname(base).slice(1).toLowerCase();
  return LANG[ext] ?? null;
}

function ignored(rel: string): boolean {
  if (IGNORE_PATHS.some((p) => rel.startsWith(p) || rel.includes("/" + p))) return true;
  return rel.split("/").slice(0, -1).some((seg) => IGNORE_DIRS.has(seg));
}

async function walk(root: string): Promise<{ files: string[]; truncated: boolean }> {
  const files: string[] = [];
  const stack = [""];
  while (stack.length) {
    const rel = stack.pop()!;
    let entries;
    try {
      entries = await readdir(path.join(root, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!IGNORE_DIRS.has(e.name) && !IGNORE_PATHS.some((p) => (childRel + "/").endsWith(p))) stack.push(childRel);
      } else if (e.isFile()) {
        if (e.name === ".DS_Store") continue;
        files.push(childRel);
        if (files.length >= MAX_FILES * 4) return { files, truncated: true };
      }
    }
  }
  return { files, truncated: false };
}

/** Prefer git's view of the tree (respects .gitignore); fall back to a filesystem walk. */
async function listFiles(root: string, isGitRepo: boolean): Promise<{ files: string[]; truncated: boolean }> {
  if (isGitRepo) {
    const r = await run("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "."], root);
    if (r.ok) {
      const files = r.stdout.split("\0").filter((f) => f && !ignored(f) && !f.endsWith(".DS_Store"));
      return { files, truncated: false };
    }
  }
  return walk(root);
}

function isTestPath(rel: string): boolean {
  return (
    /(^|\/)(tests?|__tests__|spec|specs|e2e)\//i.test(rel) ||
    /\.(test|spec)\.[a-z0-9]+$/i.test(rel) ||
    /(_test\.(go|py)|Tests?\.(swift|kt|java|cs))$/.test(rel) ||
    /(^|\/)test_[^/]+\.py$/.test(rel)
  );
}

function buildTree(files: string[], maxDepth = 3, maxLines = 140): string {
  interface Node { files: number; children: Map<string, Node> }
  const rootNode: Node = { files: 0, children: new Map() };
  for (const f of files) {
    const parts = f.split("/");
    let node = rootNode;
    for (let i = 0; i < parts.length - 1 && i < maxDepth; i++) {
      let child = node.children.get(parts[i]);
      if (!child) node.children.set(parts[i], (child = { files: 0, children: new Map() }));
      node = child;
    }
    node.files++;
  }
  const count = (n: Node): number => n.files + [...n.children.values()].reduce((s, c) => s + count(c), 0);
  const lines: string[] = [];
  const rootFiles = files.filter((f) => !f.includes("/")).sort();
  const visit = (n: Node, depth: number) => {
    // Alphabetical keeps the project's own ordering (src/, tests/, 01_x/…); cap siblings so one asset dir can't eat the budget.
    const kids = [...n.children.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const shown = kids.slice(0, 14);
    for (const [name, child] of shown) {
      if (lines.length >= maxLines) return;
      lines.push(`${"  ".repeat(depth)}${name}/ (${count(child)})`);
      visit(child, depth + 1);
    }
    if (kids.length > shown.length) lines.push(`${"  ".repeat(depth)}… ${kids.length - shown.length} more dirs`);
  };
  visit(rootNode, 0);
  for (const f of rootFiles.slice(0, 40)) if (lines.length < maxLines + 40) lines.push(f);
  if (rootFiles.length > 40) lines.push(`… ${rootFiles.length - 40} more root files`);
  return lines.join("\n");
}

export async function scanFiles(
  root: string,
  isGitRepo: boolean,
): Promise<{ files: FileFacts; markers: MarkerFacts; list: string[] }> {
  const listed = await listFiles(root, isGitRepo);
  const all = listed.files;
  const scanned = all.slice(0, MAX_FILES);

  const langStats = new Map<string, { files: number; lines: number }>();
  const dirStats = new Map<string, { files: number; lines: number }>();
  const mtimes: { path: string; m: Date }[] = [];
  const markers: Marker[] = [];
  const byKind: Record<string, number> = {};
  let totalLines = 0;
  let totalRead = 0;

  for (const rel of scanned) {
    let st;
    try {
      st = await stat(path.join(root, rel));
    } catch {
      continue;
    }
    mtimes.push({ path: rel, m: st.mtime });
    const lang = languageOf(rel);
    const top = rel.includes("/") ? rel.split("/")[0] + "/" : "(root)";
    const ds = dirStats.get(top) ?? { files: 0, lines: 0 };
    ds.files++;
    let lines = 0;
    if (lang && st.size <= MAX_TEXT_BYTES && totalRead < MAX_TOTAL_READ && !LOCKFILES.has(path.basename(rel))) {
      try {
        const text = await readFile(path.join(root, rel), "utf8");
        totalRead += st.size;
        const split = text.split("\n");
        lines = split.length;
        if (!NON_CODE.has(lang) || lang === "Markdown") {
          for (let i = 0; i < split.length; i++) {
            const line = split[i];
            if (line.length > 400) continue;
            const m = MARKER_RE.exec(line);
            if (!m) continue;
            const kind = (m[1] ?? m[3] ?? "").toUpperCase().replace(/\s+/g, " ");
            const normKind = kind.startsWith("NOT") ? "NOT IMPLEMENTED" : kind.startsWith("COMING") ? "COMING SOON" : kind;
            byKind[normKind] = (byKind[normKind] ?? 0) + 1;
            markers.push({ path: rel, line: i + 1, kind: normKind, text: truncate(line.trim(), 200) });
          }
        }
      } catch {
        /* binary or unreadable */
      }
    }
    totalLines += lines;
    ds.lines += lines;
    dirStats.set(top, ds);
    if (lang) {
      const ls = langStats.get(lang) ?? { files: 0, lines: 0 };
      ls.files++;
      ls.lines += lines;
      langStats.set(lang, ls);
    }
  }

  mtimes.sort((a, b) => b.m.getTime() - a.m.getTime());
  const testFiles = scanned.filter(isTestPath);
  const ci = scanned.filter((f) =>
    /^(\.github\/workflows\/|\.gitlab-ci\.yml|\.circleci\/|azure-pipelines\.yml|bitbucket-pipelines\.yml|\.travis\.yml)/.test(f),
  );

  // Marker samples: at most 3 per file, newest files first, 60 total.
  const order = new Map(mtimes.map((x, i) => [x.path, i]));
  const perFile = new Map<string, number>();
  const samples = [...markers]
    .sort((a, b) => (order.get(a.path) ?? 0) - (order.get(b.path) ?? 0))
    .filter((mk) => {
      const n = perFile.get(mk.path) ?? 0;
      perFile.set(mk.path, n + 1);
      return n < 3;
    })
    .slice(0, 60);

  return {
    files: {
      totalFiles: all.length,
      scannedFiles: scanned.length,
      truncated: listed.truncated || all.length > MAX_FILES,
      totalLines,
      languages: [...langStats.entries()]
        .map(([language, s]) => ({ language, ...s }))
        .sort((a, b) => b.lines - a.lines)
        .slice(0, 15),
      topDirs: [...dirStats.entries()]
        .map(([dir, s]) => ({ dir, ...s }))
        .sort((a, b) => b.lines - a.lines || b.files - a.files)
        .slice(0, 20),
      tree: buildTree(scanned),
      firstModified: isoDate(mtimes.at(-1)?.m ?? null),
      lastModified: isoDate(mtimes[0]?.m ?? null),
      recentlyModified: mtimes.slice(0, 25).map((x) => ({ path: x.path, modified: x.m.toISOString() })),
      weeklyModified: histogram(mtimes.map((x) => x.m)).map((h) => ({ week: h.week, files: h.count })),
      tests: { files: testFiles.length, samples: testFiles.slice(0, 10) },
      ci,
    },
    markers: { total: markers.length, byKind, samples },
    list: scanned,
  };
}
