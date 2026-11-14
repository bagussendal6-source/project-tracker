// Weekly activity series derived from the fact sheet (pure; used by main and renderer).

import type { FactSheet } from "../types.ts";

export function weekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

export function weeksBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(from + "T00:00:00Z"); d <= new Date(to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 7)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export interface ActivitySeries {
  weeks: string[];
  commits: number[];
  prompts: number[];
  edits: number[];
}

/** Full weekly series from the first recorded activity until `until` (default: this week). */
export function activitySeries(f: FactSheet, until: Date = new Date()): ActivitySeries {
  const commits = new Map(f.git.weeklyCommits.map((x) => [x.week, x.commits]));
  const prompts = new Map(f.sessions.weeklyPrompts.map((x) => [x.week, x.prompts]));
  const edits = new Map(f.files.weeklyModified.map((x) => [x.week, x.files]));
  const useEdits = commits.size === 0 && prompts.size === 0;
  const starts = [...commits.keys(), ...prompts.keys(), ...(useEdits ? edits.keys() : [])].sort();
  const last = weekStart(until);
  if (!starts.length) return { weeks: [], commits: [], prompts: [], edits: [] };
  const weeks = weeksBetween(starts[0] < last ? starts[0] : last, last);
  return {
    weeks,
    commits: weeks.map((w) => commits.get(w) ?? 0),
    prompts: weeks.map((w) => prompts.get(w) ?? 0),
    edits: weeks.map((w) => (useEdits ? (edits.get(w) ?? 0) : 0)),
  };
}

/** Last `n` weeks of combined activity, for sparklines. */
export function recentActivity(f: FactSheet, n = 26): number[] {
  const s = activitySeries(f);
  const total = s.weeks.map((_, i) => s.commits[i] + s.prompts[i] + s.edits[i]);
  const tail = total.slice(-n);
  return [...Array(Math.max(0, n - tail.length)).fill(0), ...tail];
}
