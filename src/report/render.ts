import type { Evidence, FactSheet, FeatureStatus, Report, RunMeta } from "../types.ts";
import { computeProgress, evidenceRead, featureVerified } from "./progress.ts";

const STATUS_ICON: Record<FeatureStatus, string> = { done: "✅", partial: "🟡", stub: "🧱", planned: "💭" };
const VERDICT: Record<Report["potential"]["verdict"], string> = {
  continue: "🟢 Continue",
  narrow_scope: "🟢 Continue, with a narrower scope",
  pivot: "🔀 Pivot",
  park: "⏸️ Park",
  archive: "📦 Archive",
};

const esc = (s: string) => (s ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ");
const bar = (p: number, width = 20) => "█".repeat(Math.round((p / 100) * width)).padEnd(width, "░");
const dots = (n: number) => "●".repeat(n) + "○".repeat(Math.max(0, 5 - n));
let READ = new Set<string>();
const ev = (e: Evidence[]) =>
  e
    .slice(0, 4)
    .map((x) => `\`${x.ref}\`${evidenceRead(x, READ) ? " 👁" : ""}`)
    .join(", ");

/** Weekly sparkline across the full range, zero weeks included; compresses long ranges. */
function sparkline(series: { week: string; n: number }[], maxWidth = 60): { line: string; from: string; to: string } | null {
  if (!series.length) return null;
  const byWeek = new Map(series.map((s) => [s.week, s.n]));
  const weeks: string[] = [];
  for (let d = new Date(series[0].week + "T00:00:00Z"); d <= new Date(series.at(-1)!.week + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 7)) {
    weeks.push(d.toISOString().slice(0, 10));
  }
  let values = weeks.map((w) => byWeek.get(w) ?? 0);
  if (values.length > maxWidth) {
    const group = Math.ceil(values.length / maxWidth);
    const grouped: number[] = [];
    for (let i = 0; i < values.length; i += group) grouped.push(values.slice(i, i + group).reduce((a, b) => a + b, 0));
    values = grouped;
  }
  const max = Math.max(...values);
  const ticks = "▁▂▃▄▅▆▇█";
  const line = values.map((v) => (v === 0 ? "·" : ticks[Math.min(7, Math.floor((v / max) * 7.999))])).join("");
  return { line, from: weeks[0], to: weeks.at(-1)! };
}

function activity(f: FactSheet) {
  const lines: string[] = [];
  const add = (label: string, s: { week: string; n: number }[]) => {
    const sp = sparkline(s);
    if (sp) lines.push(`${label.padEnd(16)} ${sp.line}  ${sp.from} → ${sp.to}`);
  };
  if (f.git.weeklyCommits.length) add("commits/week", f.git.weeklyCommits.map((x) => ({ week: x.week, n: x.commits })));
  if (f.sessions.weeklyPrompts.length) add("prompts/week", f.sessions.weeklyPrompts.map((x) => ({ week: x.week, n: x.prompts })));
  if (!lines.length) add("file edits/week", f.files.weeklyModified.map((x) => ({ week: x.week, n: x.files })));
  return lines;
}

export function renderMarkdown(r: Report, f: FactSheet, meta: RunMeta | null): string {
  const p = computeProgress(r);
  READ = new Set(meta?.readFiles ?? []);
  const claimed = r.features.filter((x) => x.status === "done" || x.status === "partial");
  const verified = meta?.readFiles ? claimed.filter((x) => featureVerified(x, READ)).length : null;
  const id = r.identity;
  const L = r.where_you_left_off;
  const out: string[] = [];
  const push = (...s: string[]) => out.push(...s);

  push(`# ${id.name}`, "", `> ${id.one_liner}`, "");
  push(`\`${id.project_type}\` · ${id.stack.join(", ")} · \`${f.root}\``, "");

  // ---- At a glance
  push("## At a glance", "");
  push("```");
  if (p.mvpPct !== null) push(`MVP progress     ${bar(p.mvpPct)} ${p.mvpPct}%`);
  if (p.overallPct !== null) push(`All features     ${bar(p.overallPct)} ${p.overallPct}%`);
  push(
    `Features         ${p.counts.done} done · ${p.counts.partial} partial · ${p.counts.stub} stub · ${p.counts.planned} planned`,
  );
  push(`Left for MVP     ${p.blockingItems} items, roughly ${p.blockingDays} focused days`);
  if (verified !== null) push(`Verified         ${verified} of ${claimed.length} done/partial features backed by code Claude read`);
  const s = r.potential.scores;
  push(`Remaining effort ${dots(s.remaining_effort)}   Momentum ${dots(s.momentum)}`);
  push(`Usefulness       ${dots(s.usefulness)}   Novelty  ${dots(s.novelty)}`);
  push("```", "");
  push(`**Verdict: ${VERDICT[r.potential.verdict]}.** ${r.potential.verdict_reasoning}`, "");

  // ---- Where you left off
  push("## Where you left off", "");
  push(`**Last activity:** ${L.last_activity} · **State:** \`${L.state}\``, "");
  push(L.summary, "");
  if (L.in_progress_task) push(`**In progress:** ${L.in_progress_task}`, "");
  if (L.evidence.length) push(`<sub>Evidence: ${ev(L.evidence)}</sub>`, "");

  // ---- Next steps
  push("## ▶ Start here", "");
  r.next_steps.forEach((n, i) => {
    push(`### ${i + 1}. ${n.title} · ~${n.estimate_minutes} min`, "", n.why, "");
    n.how.forEach((h) => push(`- ${h}`));
    if (n.files.length) push("", `Open: ${n.files.map((x) => `\`${x}\``).join(", ")}`);
    push("");
  });

  // ---- What it is
  push("## What it is", "");
  push(`**Problem:** ${id.problem}`, "", `**For:** ${id.target_users}`, "");
  push(`**MVP (inferred charter):** ${id.charter.mvp_definition}`, "");
  if (id.charter.in_scope.length) push("In scope:", ...id.charter.in_scope.map((x) => `- ${x}`), "");
  if (id.charter.out_of_scope.length) push("Out of scope for now:", ...id.charter.out_of_scope.map((x) => `- ${x}`), "");

  // ---- Features
  push("## What you've built", "");
  push("| | Feature | Size | MVP | Conf. | Missing | Evidence |", "|---|---|---|---|---|---|---|");
  const order: FeatureStatus[] = ["done", "partial", "stub", "planned"];
  for (const ft of [...r.features].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))) {
    push(
      `| ${STATUS_ICON[ft.status]} | **${esc(ft.name)}** — ${esc(ft.description)} | ${ft.size} | ${ft.in_mvp ? "✓" : ""} | ${ft.confidence} | ${esc(ft.missing) || "—"} | ${esc(ev(ft.evidence))} |`,
    );
  }
  push("", "<sub>✅ done · 🟡 partial · 🧱 stub · 💭 planned · 👁 file was actually read during analysis</sub>", "");

  // ---- History
  push("## How it evolved", "");
  const act = activity(f);
  if (act.length) push("```", ...act, "```", "");
  for (const ph of r.phases) push(`- **${ph.start} → ${ph.end} · ${ph.name}** (${ph.kind}) — ${ph.summary}`);
  push("");

  // ---- Remaining
  push("## What's left", "");
  const rem = [...r.remaining].sort((a, b) => Number(b.blocks_mvp) - Number(a.blocks_mvp));
  if (rem.length) {
    push("| | Task | Kind | Effort | Detail |", "|---|---|---|---|---|");
    for (const x of rem) push(`| ${x.blocks_mvp ? "🚧" : ""} | **${esc(x.title)}** | ${x.category} | ${x.effort} | ${esc(x.detail)} |`);
    push("", "<sub>🚧 blocks the MVP</sub>", "");
  }
  if (r.tech_debt.length) {
    push("### Technical debt", "");
    for (const d of r.tech_debt) push(`- **${d.title}** (${d.severity}) — ${d.detail}${d.refs.length ? ` ${d.refs.map((x) => `\`${x}\``).join(", ")}` : ""}`);
    push("");
  }

  // ---- Potential
  push("## Potential", "", r.potential.could_become, "");
  if (r.potential.use_cases.length) push("**Use cases:**", ...r.potential.use_cases.map((x) => `- ${x}`), "");
  if (r.potential.similar_tools.length) push(`**Similar tools:** ${r.potential.similar_tools.join(", ")}`, "");
  if (r.potential.risks.length) push("**Risks:**", ...r.potential.risks.map((x) => `- ${x}`), "");

  if (r.open_questions.length) push("## Questions for you", "", ...r.open_questions.map((q) => `- ${q}`), "");

  // ---- Footer
  push("---", "");
  const scan = `${f.files.totalFiles} files, ${f.files.totalLines.toLocaleString()} lines; ${
    f.git.hasCommits ? `${f.git.commitCount} commits` : f.git.isRepo ? "git repo, no commits" : "no git"
  }; ${f.sessions.count} Claude sessions; ${f.markers.total} TODO-style markers`;
  const run = meta
    ? ` · ${meta.model}, ${(meta.durationMs / 1000).toFixed(0)}s, ${meta.toolCalls} tool calls, ${(
        meta.inputTokens + meta.cacheReadTokens + meta.cacheWriteTokens
      ).toLocaleString()} input / ${meta.outputTokens.toLocaleString()} output tokens`
    : "";
  push(`<sub>Analyzed ${f.generatedAt.slice(0, 10)} · ${scan}${run}</sub>`, "");
  return out.join("\n");
}
