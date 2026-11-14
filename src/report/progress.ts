// Progress is computed here, not by the model, so the number is stable and explainable:
// size-weighted feature completion against the charter's MVP scope.

import type { Evidence, Feature, FeatureStatus, Report, Size } from "../types.ts";

export const SIZE_WEIGHT: Record<Size, number> = { S: 1, M: 3, L: 8 };
export const STATUS_CREDIT: Record<FeatureStatus, number> = { done: 1, partial: 0.5, stub: 0.15, planned: 0 };
const SIZE_DAYS: Record<Size, number> = { S: 0.5, M: 2.5, L: 6 };

export interface Progress {
  mvpPct: number | null;
  overallPct: number | null;
  counts: Record<FeatureStatus, number>;
  mvpCounts: Record<FeatureStatus, number>;
  blockingItems: number;
  blockingDays: number;
}

function pct(features: Feature[]): number | null {
  const total = features.reduce((s, f) => s + SIZE_WEIGHT[f.size], 0);
  if (!total) return null;
  const earned = features.reduce((s, f) => s + SIZE_WEIGHT[f.size] * STATUS_CREDIT[f.status], 0);
  return Math.round((earned / total) * 100);
}

function countBy(features: Feature[]): Record<FeatureStatus, number> {
  const c: Record<FeatureStatus, number> = { done: 0, partial: 0, stub: 0, planned: 0 };
  for (const f of features) c[f.status]++;
  return c;
}

const normRef = (ref: string) => ref.replace(/^\.\//, "").replace(/:\d+(-\d+)?$/, "");

/** Was this file evidence actually opened by Claude during the run? */
export function evidenceRead(e: Evidence, readFiles: Set<string>): boolean {
  return e.kind === "file" && readFiles.has(normRef(e.ref));
}

/** A done/partial feature counts as verified when at least one cited file was actually read. */
export function featureVerified(f: Feature, readFiles: Set<string>): boolean {
  return f.evidence.some((e) => evidenceRead(e, readFiles));
}

/** Apply the developer's MVP toggles to a report (returns a copy). */
export function withMvpOverrides(r: Report, mvp: Record<string, boolean>): Report {
  if (!Object.keys(mvp).length) return r;
  return { ...r, features: r.features.map((f) => (f.id in mvp ? { ...f, in_mvp: mvp[f.id] } : f)) };
}

export function computeProgress(r: Report): Progress {
  const mvp = r.features.filter((f) => f.in_mvp);
  const blocking = r.remaining.filter((x) => x.blocks_mvp);
  return {
    mvpPct: pct(mvp),
    overallPct: pct(r.features),
    counts: countBy(r.features),
    mvpCounts: countBy(mvp),
    blockingItems: blocking.length,
    blockingDays: Math.round(blocking.reduce((s, x) => s + SIZE_DAYS[x.effort], 0) * 2) / 2,
  };
}
