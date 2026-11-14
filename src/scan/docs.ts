import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DocFacts } from "../types.ts";
import { truncate } from "./util.ts";

const MANIFEST_NAMES = new Set([
  "package.json", "pyproject.toml", "requirements.txt", "setup.py", "Pipfile", "Cargo.toml", "go.mod",
  "Package.swift", "Podfile", "pubspec.yaml", "Gemfile", "composer.json", "build.gradle", "build.gradle.kts",
  "pom.xml", "project.godot", "manifest.json", "app.json", "docker-compose.yml", "docker-compose.yaml",
  "Dockerfile", "wrangler.toml", "wrangler.jsonc", "vercel.json", "netlify.toml", "default.project.json",
  "electron-builder.yml", "tauri.conf.json", "deno.json", "bunfig.toml", "Makefile",
]);

async function read(root: string, rel: string, max: number): Promise<string | null> {
  try {
    return truncate(await readFile(path.join(root, rel), "utf8"), max);
  } catch {
    return null;
  }
}

/** Reduce package.json to the parts that say what a project is. */
function summarizePackageJson(text: string): string {
  try {
    const p = JSON.parse(text);
    return JSON.stringify(
      {
        name: p.name,
        description: p.description,
        version: p.version,
        scripts: p.scripts,
        main: p.main,
        bin: p.bin,
        dependencies: p.dependencies ? Object.keys(p.dependencies) : undefined,
        devDependencies: p.devDependencies ? Object.keys(p.devDependencies) : undefined,
        workspaces: p.workspaces,
      },
      null,
      1,
    );
  } catch {
    return truncate(text, 2000);
  }
}

export async function scanDocs(root: string, files: string[]): Promise<DocFacts> {
  const depth = (f: string) => f.split("/").length - 1;
  const readmePath =
    files.find((f) => /^readme(\.[a-z]+)?$/i.test(f)) ?? files.find((f) => depth(f) <= 1 && /\/readme\.md$/i.test(f));
  const claudePath = files.find((f) => /^(CLAUDE|AGENTS)\.md$/i.test(f) || /^\.claude\/CLAUDE\.md$/i.test(f));

  const manifests: { path: string; content: string }[] = [];
  for (const f of files.filter((f) => depth(f) <= 2 && MANIFEST_NAMES.has(path.basename(f))).slice(0, 12)) {
    const raw = await read(root, f, 60_000);
    if (!raw) continue;
    const content = path.basename(f) === "package.json" ? summarizePackageJson(raw) : truncate(raw, 1800);
    manifests.push({ path: f, content: truncate(content, 3000) });
  }

  const otherDocs = files
    .filter((f) => /\.(md|mdx|txt|rst)$/i.test(f) && f !== readmePath && f !== claudePath)
    .filter((f) => !/(^|\/)(LICENSE|CHANGELOG|CODE_OF_CONDUCT)/i.test(f))
    .sort((a, b) => depth(a) - depth(b))
    .slice(0, 50);

  return {
    readme: readmePath ? await read(root, readmePath, 6000) : null,
    claudeMd: claudePath ? await read(root, claudePath, 4000) : null,
    otherDocs,
    manifests,
  };
}
