// Shared types for the fact sheet (deterministic scan) and the report (AI analysis).

// ---------- Fact sheet ----------

export interface FileFacts {
  totalFiles: number;
  scannedFiles: number;
  truncated: boolean;
  totalLines: number;
  languages: { language: string; files: number; lines: number }[];
  topDirs: { dir: string; files: number; lines: number }[];
  tree: string; // compact indented tree, depth-limited
  firstModified: string | null;
  lastModified: string | null;
  recentlyModified: { path: string; modified: string }[];
  weeklyModified: { week: string; files: number }[]; // based on mtimes (unreliable after copies)
  tests: { files: number; samples: string[] };
  ci: string[];
}

export interface GitCommit {
  hash: string;
  date: string;
  subject: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface GitFacts {
  isRepo: boolean;
  hasCommits: boolean;
  currentBranch: string | null;
  branches: string[];
  commitCount: number;
  firstCommit: string | null;
  lastCommit: string | null;
  weeklyCommits: { week: string; commits: number }[];
  commits: GitCommit[]; // recent ones in full, older ones sampled
  commitsSampled: boolean;
  churn: { path: string; changes: number }[];
  uncommitted: { status: string; path: string }[];
  stashes: string[];
  remotes: string[];
}

export interface Marker {
  path: string;
  line: number;
  kind: string;
  text: string;
}

export interface MarkerFacts {
  total: number;
  byKind: Record<string, number>;
  samples: Marker[];
}

export interface DocFacts {
  readme: string | null;
  claudeMd: string | null;
  otherDocs: string[];
  manifests: { path: string; content: string }[];
}

export interface SessionSummary {
  id: string;
  title: string | null;
  start: string | null;
  end: string | null;
  humanPrompts: number;
  firstPrompts: string[];
  lastPrompts: string[];
  lastAssistantText: string | null;
}

export interface SessionFacts {
  enabled: boolean;
  dir: string | null;
  count: number;
  sessions: SessionSummary[]; // most recent first, detailed
  older: { id: string; title: string | null; start: string | null; humanPrompts: number }[];
  weeklyPrompts: { week: string; prompts: number }[];
}

export interface FactSheet {
  generatedAt: string;
  root: string;
  name: string;
  files: FileFacts;
  git: GitFacts;
  markers: MarkerFacts;
  docs: DocFacts;
  sessions: SessionFacts;
}

// ---------- Report (mirrors ai/schema.ts) ----------

export type FeatureStatus = "done" | "partial" | "stub" | "planned";
export type Size = "S" | "M" | "L";

export interface Evidence {
  kind: "file" | "commit" | "session" | "todo" | "doc";
  ref: string;
  note: string;
}

export interface Feature {
  id: string;
  name: string;
  description: string;
  status: FeatureStatus;
  size: Size;
  in_mvp: boolean;
  confidence: "high" | "medium" | "low";
  evidence: Evidence[];
  missing: string;
}

export interface Report {
  identity: {
    name: string;
    one_liner: string;
    problem: string;
    target_users: string;
    project_type: string;
    stack: string[];
    charter: { mvp_definition: string; in_scope: string[]; out_of_scope: string[] };
  };
  where_you_left_off: {
    last_activity: string;
    summary: string;
    in_progress_task: string;
    state: "clean" | "mid_change" | "broken" | "unknown";
    evidence: Evidence[];
  };
  features: Feature[];
  phases: { name: string; start: string; end: string; kind: string; summary: string }[];
  remaining: {
    title: string;
    detail: string;
    category: string;
    effort: Size;
    blocks_mvp: boolean;
    feature_id: string;
  }[];
  tech_debt: { title: string; detail: string; severity: "low" | "medium" | "high"; refs: string[] }[];
  potential: {
    could_become: string;
    use_cases: string[];
    similar_tools: string[];
    scores: { remaining_effort: number; momentum: number; novelty: number; usefulness: number };
    verdict: "continue" | "narrow_scope" | "pivot" | "park" | "archive";
    verdict_reasoning: string;
    risks: string[];
  };
  next_steps: { title: string; why: string; how: string[]; estimate_minutes: number; files: string[] }[];
  open_questions: string[];
}

export interface RunMeta {
  model: string;
  startedAt: string;
  durationMs: number;
  numTurns: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  notionalCostUsd: number;
  /** Project-relative paths Claude actually opened with Read during the run. */
  readFiles: string[];
  /** Project-relative paths/dirs Claude searched with Grep/Glob. */
  searchedPaths: string[];
}
