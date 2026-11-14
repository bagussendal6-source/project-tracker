import type { GitCommit, GitFacts } from "../types.ts";
import { histogram, run } from "./util.ts";

const MAX_LOG = 3000;
const RECENT_FULL = 60;
const OLDER_SAMPLE = 60;

const empty = (): GitFacts => ({
  isRepo: false,
  hasCommits: false,
  currentBranch: null,
  branches: [],
  commitCount: 0,
  firstCommit: null,
  lastCommit: null,
  weeklyCommits: [],
  commits: [],
  commitsSampled: false,
  churn: [],
  uncommitted: [],
  stashes: [],
  remotes: [],
});

/** Strip credentials from a remote URL (https://user:token@host → https://host). */
function sanitizeRemote(url: string): string {
  return url.replace(/\/\/[^/@\s]+@/, "//");
}

function parseLog(out: string): GitCommit[] {
  const commits: GitCommit[] = [];
  let cur: GitCommit | null = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("\x1e")) {
      const [hash, date, subject] = line.slice(1).split("\x1f");
      cur = { hash, date, subject: subject ?? "", filesChanged: 0, insertions: 0, deletions: 0 };
      commits.push(cur);
    } else if (cur && /files? changed/.test(line)) {
      cur.filesChanged = Number(/(\d+) files? changed/.exec(line)?.[1] ?? 0);
      cur.insertions = Number(/(\d+) insertions?/.exec(line)?.[1] ?? 0);
      cur.deletions = Number(/(\d+) deletions?/.exec(line)?.[1] ?? 0);
    }
  }
  return commits;
}

export async function scanGit(root: string): Promise<GitFacts> {
  const inside = await run("git", ["rev-parse", "--is-inside-work-tree"], root);
  if (!inside.ok || inside.stdout.trim() !== "true") return empty();

  const facts = empty();
  facts.isRepo = true;

  const [branch, branches, remotes, status, stash, head] = await Promise.all([
    run("git", ["branch", "--show-current"], root),
    run("git", ["branch", "--format=%(refname:short)"], root),
    run("git", ["remote", "-v"], root),
    run("git", ["status", "--porcelain=v1", "--", "."], root),
    run("git", ["stash", "list"], root),
    run("git", ["rev-parse", "--verify", "HEAD"], root),
  ]);
  facts.currentBranch = branch.stdout.trim() || null;
  facts.branches = branches.stdout.split("\n").filter(Boolean).slice(0, 30);
  facts.remotes = [
    ...new Set(
      remotes.stdout
        .split("\n")
        .filter(Boolean)
        .map((l) => {
          const [name, url] = l.split(/\s+/);
          return `${name} ${sanitizeRemote(url ?? "")}`;
        }),
    ),
  ];
  facts.uncommitted = status.stdout
    .split("\n")
    .filter(Boolean)
    .slice(0, 80)
    .map((l) => ({ status: l.slice(0, 2).trim(), path: l.slice(3) }));
  facts.stashes = stash.stdout.split("\n").filter(Boolean).slice(0, 10);
  facts.hasCommits = head.ok;
  if (!facts.hasCommits) return facts;

  const [log, count, churn] = await Promise.all([
    run("git", ["log", `-n${MAX_LOG}`, "--format=%x1e%h%x1f%aI%x1f%s", "--shortstat", "--", "."], root),
    run("git", ["rev-list", "--count", "HEAD", "--", "."], root),
    run("git", ["log", "-n500", "--format=", "--name-only", "--", "."], root),
  ]);

  const all = parseLog(log.stdout); // newest first
  facts.commitCount = Number(count.stdout.trim()) || all.length;
  facts.lastCommit = all[0]?.date ?? null;
  facts.firstCommit = all.at(-1)?.date ?? null;
  facts.weeklyCommits = histogram(all.map((c) => new Date(c.date))).map((h) => ({ week: h.week, commits: h.count }));

  if (all.length <= RECENT_FULL + OLDER_SAMPLE) {
    facts.commits = all;
  } else {
    const recent = all.slice(0, RECENT_FULL);
    const older = all.slice(RECENT_FULL);
    const step = older.length / OLDER_SAMPLE;
    const sampled = Array.from({ length: OLDER_SAMPLE }, (_, i) => older[Math.floor(i * step)]);
    if (sampled.at(-1) !== older.at(-1)) sampled.push(older.at(-1)!); // always keep the first commit
    facts.commits = [...recent, ...sampled];
    facts.commitsSampled = true;
  }

  const churnCount = new Map<string, number>();
  for (const f of churn.stdout.split("\n")) if (f) churnCount.set(f, (churnCount.get(f) ?? 0) + 1);
  facts.churn = [...churnCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([p, changes]) => ({ path: p, changes }));

  return facts;
}
