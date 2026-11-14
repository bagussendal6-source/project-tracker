import type { FeatureStatus, Report } from "../../src/types.ts";

export type Verdict = Report["potential"]["verdict"];

/** The verdict as a plain sentence, not a badge. */
export const VERDICT_SENTENCE: Record<Verdict, string> = {
  continue: "Keep going.",
  narrow_scope: "Keep going, with a narrower scope.",
  pivot: "Change direction before going further.",
  park: "Set it aside for now.",
  archive: "Let it go.",
};

export const STATUS_WORD: Record<FeatureStatus, string> = {
  done: "Works",
  partial: "Partly works",
  stub: "Scaffolding only",
  planned: "Planned",
};

export function daysSince(date: string | null | undefined): number | null {
  if (!date) return null;
  const t = new Date(date.length <= 10 ? date + "T12:00:00Z" : date).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export function ago(date: string | null | undefined): string {
  const d = daysSince(date);
  if (d === null) return "a while ago";
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  if (d < 365) return `${Math.round(d / 30)} months ago`;
  const y = Math.floor(d / 365);
  return `${y} year${y > 1 ? "s" : ""} ago`;
}

/** Short relative age for the sidebar: 3d, 5w, 4mo. */
export function age(date: string | null | undefined): string {
  const d = daysSince(date);
  if (d === null) return "";
  if (d < 1) return "today";
  if (d < 14) return `${d}d`;
  if (d < 60) return `${Math.round(d / 7)}w`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${Math.floor(d / 365)}y`;
}

export const fmtMinutes = (m: number) => (m < 60 ? `${m} min` : `${Math.round((m / 60) * 10) / 10} h`);

export const shortPath = (p: string) => p.replace(/^\/Users\/[^/]+/, "~");

export const humanType = (t: string | null | undefined) => {
  const s = (t ?? "").replace(/_/g, " ");
  const map: Record<string, string> = { "cli tool": "Command-line tool", "web app": "Web app", "bot automation": "Automation", "data ml": "Data / ML" };
  return map[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
};
