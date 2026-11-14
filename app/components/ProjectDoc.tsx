import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisStatus, Overrides, ProjectDetail } from "../../src/core/api-types.ts";
import { computeProgress, SIZE_WEIGHT, withMvpOverrides } from "../../src/report/progress.ts";
import type { Feature, FeatureStatus, Report } from "../../src/types.ts";
import { api } from "../api.ts";
import { ago, fmtMinutes, humanType, shortPath, STATUS_WORD, VERDICT_SENTENCE } from "../lib/format.ts";
import { Rich } from "./Rich.tsx";
import type { OutlineItem } from "./Sidebar.tsx";
import { Timeline } from "./Timeline.tsx";
import { Check, Detail, FileRef, Glyph, Menu, Switch } from "./ui.tsx";

const norm = (ref: string) => ref.replace(/^\.\//, "").replace(/:\d+(-\d+)?$/, "");
const ORDER: FeatureStatus[] = ["done", "partial", "stub", "planned"];
const SECTIONS: OutlineItem[] = [
  { id: "leftoff", label: "Where you left off" },
  { id: "next", label: "Next steps" },
  { id: "verdict", label: "Verdict" },
  { id: "built", label: "What's built" },
  { id: "goal", label: "The goal" },
  { id: "remaining", label: "What's left" },
  { id: "history", label: "History" },
  { id: "outlook", label: "Outlook" },
];
const STOPPED: Record<string, string> = {
  clean: "You stopped at a clean point",
  mid_change: "You stopped in the middle of this",
  broken: "You left it in a broken state",
  unknown: "In progress",
};

export function ProjectDoc({
  id,
  status,
  onOutline,
  onActiveSection,
  onChanged,
  onRemoved,
}: {
  id: string;
  status: AnalysisStatus | undefined;
  onOutline: (o: OutlineItem[]) => void;
  onActiveSection: (id: string | null) => void;
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [useSessions, setUseSessions] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => setDetail(await api.getProject(id)), [id]);
  useEffect(() => {
    load();
  }, [load]);

  const running = !!status && !["done", "error", "cancelled"].includes(status.stage);
  useEffect(() => {
    if (status?.stage === "done") load();
  }, [status?.stage, load]);

  const report = useMemo(() => (detail?.report ? withMvpOverrides(detail.report, detail.overrides.mvp) : null), [detail]);

  useEffect(() => {
    onOutline(report ? SECTIONS : []);
    return () => onOutline([]);
  }, [report, onOutline]);

  const analyze = useCallback(() => {
    if (!running) api.analyze(id, { sessions: useSessions });
  }, [id, running, useSessions]);

  // ⌘R refreshes the briefing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        analyze();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [analyze]);

  // Toolbar title + sidebar scroll-spy.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setScrolled(el.scrollTop > 90);
    let current: string | null = null;
    for (const s of SECTIONS) {
      const node = document.getElementById(`sec-${s.id}`);
      if (node && node.offsetTop - el.scrollTop < 140) current = s.id;
    }
    onActiveSection(current);
  };

  if (!detail) return <div className="toolbar drag" />;
  const { entry, facts, meta, overrides } = detail;
  const readSet = new Set(meta?.readFiles ?? []);
  const seen = (ref: string) => readSet.has(norm(ref));
  const openFile = (ref: string) => {
    api.openFile(id, norm(ref)).catch(() => api.reveal(id, norm(ref)));
  };

  async function save(next: Overrides) {
    setDetail((d) => (d ? { ...d, overrides: next } : d));
    await api.saveOverrides(id, next);
    onChanged();
  }
  const toggleCheck = (key: string, v: boolean) => save({ ...overrides, checked: { ...overrides.checked, [key]: v } });

  async function remove() {
    if (!confirm(`Stop tracking “${entry.name}”?\n\nIts briefings are removed from Project Tracker. The folder itself is not touched.`)) return;
    await api.removeProject(id);
    onRemoved();
  }

  const title = report?.identity.name ?? entry.name;

  return (
    <>
      <div className={`toolbar drag${scrolled ? " scrolled" : ""}`}>
        <span className="t">{title}</span>
        <span className="spacer" />
        {report && (
          <button className="tbtn no-drag" onClick={analyze} disabled={running} title="Read the project again (⌘R)">
            {running ? "Reading…" : "Refresh Briefing"}
          </button>
        )}
        <Menu>
          {(close) => (
            <>
              <button className="mi" onClick={() => (api.reveal(id), close())}>
                Show in Finder
              </button>
              <div className="row-item">
                <Switch on={useSessions} onChange={setUseSessions} label="Use my Claude conversations" />
              </div>
              <hr />
              <button className="mi" onClick={() => (close(), remove())}>
                Stop Tracking…
              </button>
            </>
          )}
        </Menu>
      </div>

      <div className="scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="doc">
          {!report ? (
            <div className="empty-doc">
              <h1>{entry.name}</h1>
              <div className="meta">{shortPath(entry.root)}</div>
              {running ? (
                <Reading status={status!} onCancel={() => api.cancel(id)} />
              ) : (
                <>
                  <p>
                    This project hasn't been read yet. Claude will look through the code
                    {useSessions ? ", its history, and your past conversations about it" : " and its history"}, then write a short briefing. It takes a
                    minute or two and doesn't change anything.
                  </p>
                  {status?.stage === "error" && <p className="error">The last attempt failed: {status.error}</p>}
                  <div className="act">
                    <button className="btn primary" onClick={analyze}>
                      Read Project
                    </button>
                    <Switch on={useSessions} onChange={setUseSessions} label="Include Claude conversations" />
                  </div>
                </>
              )}
            </div>
          ) : (
            <Briefing
              report={report}
              detail={detail}
              facts={facts}
              running={running}
              status={status}
              seen={seen}
              openFile={openFile}
              onCancel={() => api.cancel(id)}
              onToggleCheck={toggleCheck}
              onSave={save}
            />
          )}
        </div>
      </div>
    </>
  );
}

function Reading({ status, onCancel }: { status: AnalysisStatus; onCancel: () => void }) {
  const last = status.tools.at(-1);
  const text =
    status.stage === "scanning" ? "Looking through the folder" : status.stage === "writing" ? "Writing the briefing" : "Reading the code";
  return (
    <div className="reading">
      <span className="pulse" />
      <span>{text}</span>
      <span className="file" key={last?.n}>
        {last?.label.replace(/^(read|grep|glob)\s+/, "") ?? ""}
      </span>
      <button className="quiet" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

function Briefing({
  report,
  detail,
  facts,
  running,
  status,
  seen,
  openFile,
  onCancel,
  onToggleCheck,
  onSave,
}: {
  report: Report;
  detail: ProjectDetail;
  facts: ProjectDetail["facts"];
  running: boolean;
  status: AnalysisStatus | undefined;
  seen: (r: string) => boolean;
  openFile: (r: string) => void;
  onCancel: () => void;
  onToggleCheck: (key: string, v: boolean) => void;
  onSave: (o: Overrides) => void;
}) {
  const { overrides, meta, entry } = detail;
  const checked = overrides.checked;
  const p = computeProgress(report);
  const L = report.where_you_left_off;
  const [openStep, setOpenStep] = useState<number | null>(0);
  const [openFeature, setOpenFeature] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const goal = overrides.charter ?? report.identity.charter.mvp_definition;
  const [goalDraft, setGoalDraft] = useState(goal);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  const blocking = report.remaining.filter((r) => r.blocks_mvp);
  const later = report.remaining.filter((r) => !r.blocks_mvp);
  const openBlocking = blocking.filter((r) => !checked[`rem:${r.title}`]);
  const daysLeft = Math.round(openBlocking.reduce((s, r) => s + ({ S: 0.5, M: 2.5, L: 6 })[r.effort], 0) * 2) / 2;

  const byStatus = (a: Feature, b: Feature) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || SIZE_WEIGHT[b.size] - SIZE_WEIGHT[a.size];
  const mvp = report.features.filter((f) => f.in_mvp).sort(byStatus);
  const extra = report.features.filter((f) => !f.in_mvp).sort(byStatus);
  const segs = mvp.length ? mvp : extra;

  const jumpToFeature = (fid: string) => {
    setOpenFeature(fid);
    requestAnimationFrame(() => document.getElementById(`feat-${fid}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const featureRow = (f: Feature) => {
    const open = openFeature === f.id;
    const files = f.evidence.filter((e) => e.kind === "file");
    return (
      <div id={`feat-${f.id}`} key={f.id}>
        <div className="r clickable" onClick={() => setOpenFeature(open ? null : f.id)}>
          <Glyph status={f.status} />
          <div className="main-t">
            <div className="title">{f.name}</div>
            <Detail open={open}>
              <div className="detail-body" onClick={(e) => e.stopPropagation()}>
                <Rich text={f.description} />
                {f.missing && (
                  <p style={{ marginTop: 8 }}>
                    <span style={{ color: "var(--ink)" }}>Missing:</span> <Rich text={f.missing} />
                  </p>
                )}
                {files.length > 0 && (
                  <div className="files">
                    {files.map((e, i) => (
                      <FileRef key={i} path={e.ref} seen={seen(e.ref)} onOpen={openFile} />
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  <button className="quiet" onClick={() => onSave({ ...overrides, mvp: { ...overrides.mvp, [f.id]: !f.in_mvp } })}>
                    {f.in_mvp ? "Not needed for the first version" : "Needed for the first version"}
                  </button>
                </div>
              </div>
            </Detail>
          </div>
          <span className="aux">{STATUS_WORD[f.status]}</span>
        </div>
      </div>
    );
  };

  const checkRow = (k: string, title: string, aux?: string, children?: React.ReactNode) => (
    <div className={`r${checked[k] ? " done" : ""}`} key={k}>
      <Check on={!!checked[k]} onChange={(v) => onToggleCheck(k, v)} label={title} />
      <div className="main-t">
        <div className="title">
          <Rich text={title} />
        </div>
        {children}
      </div>
      {aux && <span className="aux">{aux}</span>}
    </div>
  );

  const s = report.potential.scores;

  return (
    <>
      <header className="doc-head">
        <h1>{report.identity.name}</h1>
        <p className="sub">
          <Rich text={report.identity.one_liner} />
        </p>
        <p className="meta">
          {humanType(report.identity.project_type)} · Last worked on {ago(L.last_activity)} · {shortPath(entry.root)}
        </p>

        {running && status ? (
          <Reading status={status} onCancel={onCancel} />
        ) : (
          <div className="progress">
            <div className="segs" onMouseLeave={() => setTip(null)}>
              {segs.map((f) => (
                <div
                  key={f.id}
                  className={`seg ${f.status}`}
                  style={{ flexGrow: SIZE_WEIGHT[f.size] }}
                  onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, text: `${f.name} · ${STATUS_WORD[f.status]}` })}
                  onClick={() => jumpToFeature(f.id)}
                />
              ))}
            </div>
            <p>
              {p.mvpPct !== null && (
                <>
                  About <b>{mvpPctText(p.mvpPct)}</b> of the first version is built.{" "}
                </>
              )}
              {openBlocking.length === 0 ? (
                "Nothing stands in the way of it."
              ) : (
                <>
                  <b>
                    {openBlocking.length} {openBlocking.length === 1 ? "thing" : "things"}
                  </b>{" "}
                  stand{openBlocking.length === 1 ? "s" : ""} between you and it, roughly {daysLeft} focused {daysLeft === 1 ? "day" : "days"}.
                </>
              )}
            </p>
            {status?.stage === "error" && <p className="error">The last refresh failed: {status.error}</p>}
          </div>
        )}
      </header>
      {tip && (
        <div className="tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}

      <section className="sec" id="sec-leftoff">
        <div className="lbl">Where you left off</div>
        <div>
          <p className="prose">
            <Rich text={L.summary} />
          </p>
          {L.in_progress_task && (
            <div className="aside">
              <span className="k">{STOPPED[L.state] ?? STOPPED.unknown}</span>
              <Rich text={L.in_progress_task} />
            </div>
          )}
          {L.evidence.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <button className="quiet" onClick={() => setShowSources((v) => !v)}>
                {showSources ? "Hide sources" : `Based on ${L.evidence.length} sources`}
              </button>
              <Detail open={showSources}>
                <div className="files">
                  {L.evidence.map((e, i) =>
                    e.kind === "file" ? (
                      <FileRef key={i} path={e.ref} seen={seen(e.ref)} onOpen={openFile} />
                    ) : (
                      <span key={i} className="fileref" title={e.note}>
                        {e.kind === "commit" ? `commit ${e.ref.slice(0, 7)}` : e.kind === "session" ? "a Claude conversation" : e.ref}
                      </span>
                    ),
                  )}
                </div>
              </Detail>
            </div>
          )}
        </div>
      </section>

      <section className="sec" id="sec-next">
        <div className="lbl">Next steps</div>
        <div className="rows">
          {report.next_steps.map((step, i) => {
            const k = `next:${step.title}`;
            const open = openStep === i;
            return (
              <div key={k} className={`r clickable${checked[k] ? " done" : ""}`} onClick={() => setOpenStep(open ? null : i)}>
                <Check on={!!checked[k]} onChange={(v) => onToggleCheck(k, v)} label={step.title} />
                <div className="main-t">
                  <div className="title">
                    <Rich text={step.title} />
                  </div>
                  <Detail open={open}>
                    <div className="detail-body" onClick={(e) => e.stopPropagation()}>
                      <Rich text={step.why} />
                      <ol>
                        {step.how.map((h, j) => (
                          <li key={j}>
                            <Rich text={h} />
                          </li>
                        ))}
                      </ol>
                      {step.files.length > 0 && (
                        <div className="files">
                          {step.files.map((f) => (
                            <FileRef key={f} path={f} seen={seen(f)} onOpen={openFile} />
                          ))}
                        </div>
                      )}
                    </div>
                  </Detail>
                </div>
                <span className="aux">{fmtMinutes(step.estimate_minutes)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="sec" id="sec-verdict">
        <div className="lbl">Verdict</div>
        <div>
          <p className="prose strong">{VERDICT_SENTENCE[report.potential.verdict]}</p>
          <p className="prose" style={{ color: "var(--ink-2)" }}>
            <Rich text={report.potential.verdict_reasoning} />
          </p>
        </div>
      </section>

      <section className="sec" id="sec-built">
        <div className="lbl">What's built</div>
        <div>
          <div className="rows">
            {mvp.map(featureRow)}
          </div>
          {extra.length > 0 && (
            <>
              <div className="sub-lbl">{mvp.length ? "Beyond the first version" : "Features"}</div>
              <div className="rows">
                {extra.map(featureRow)}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="sec" id="sec-goal">
        <div className="lbl">The goal</div>
        <div>
          {editingGoal ? (
            <>
              <textarea
                className="charter-edit"
                value={goalDraft}
                autoFocus
                onChange={(e) => setGoalDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditingGoal(false);
                  if (e.key === "Enter" && e.metaKey) {
                    onSave({ ...overrides, charter: goalDraft.trim() || null });
                    setEditingGoal(false);
                  }
                }}
              />
              <div style={{ marginTop: 14, display: "flex", gap: 16, alignItems: "center" }}>
                <button
                  className="btn primary"
                  onClick={() => {
                    onSave({ ...overrides, charter: goalDraft.trim() || null });
                    setEditingGoal(false);
                  }}
                >
                  Save
                </button>
                <button className="quiet" onClick={() => setEditingGoal(false)}>
                  Cancel
                </button>
                <span className="quiet" style={{ marginLeft: "auto" }}>
                  ⌘↩ to save
                </span>
              </div>
            </>
          ) : (
            <p className="prose editable" title="Click to edit" onClick={() => (setGoalDraft(goal), setEditingGoal(true))}>
              <Rich text={goal} />
            </p>
          )}
          <p className="quiet" style={{ marginTop: 14, cursor: "default" }}>
            {overrides.charter
              ? "Your own words. The next refresh measures progress against them."
              : "Claude's reading of what you were aiming for. Click to put it in your own words."}
          </p>
          {report.identity.charter.out_of_scope.length > 0 && (
            <p style={{ marginTop: 18, fontSize: 13.5, color: "var(--ink-2)", maxWidth: 620 }}>
              <span style={{ color: "var(--ink-3)" }}>Not needed yet: </span>
              {report.identity.charter.out_of_scope.join(" · ")}
            </p>
          )}
        </div>
      </section>

      <section className="sec" id="sec-remaining">
        <div className="lbl">What's left</div>
        <div>
          <div className="rows">
            {blocking.map((r) =>
              checkRow(
                `rem:${r.title}`,
                r.title,
                effortWord(r.effort),
                <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>
                  <Rich text={r.detail} />
                </p>,
              ),
            )}
            {blocking.length === 0 && <p className="prose" style={{ color: "var(--ink-2)" }}>Nothing is required for the first version.</p>}
          </div>
          {later.length > 0 && (
            <>
              <div className="sub-lbl">Later</div>
              <div className="rows">
                {later.map((r) => checkRow(`rem:${r.title}`, r.title, effortWord(r.effort)))}
              </div>
            </>
          )}
          {report.tech_debt.length > 0 && (
            <>
              <div className="sub-lbl">Worth cleaning up</div>
              <div className="rows">
                {report.tech_debt.map((d) => (
                  <div className="r" key={d.title}>
                    <div className="main-t">
                      <div className="title">{d.title}</div>
                      <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>
                        <Rich text={d.detail} />
                      </p>
                    </div>
                    <span className="aux">{d.severity === "high" ? "Important" : d.severity === "medium" ? "Moderate" : "Minor"}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="sec" id="sec-history">
        <div className="lbl">History</div>
        <div>
          {facts && <Timeline facts={facts} />}
          <div className="rows" style={{ marginTop: 22 }}>
            {report.phases.map((ph, i) => (
              <div className="r" key={i}>
                <div className="main-t">
                  <div className="title" style={{ color: ph.kind === "dormant" ? "var(--ink-3)" : undefined }}>
                    {ph.name}
                  </div>
                  <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>
                    <Rich text={ph.summary} />
                  </p>
                </div>
                <span className="aux">{fmtRange(ph.start, ph.end)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" id="sec-outlook">
        <div className="lbl">Outlook</div>
        <div>
          <p className="prose">
            <Rich text={report.potential.could_become} />
          </p>
          <dl className="kv">
            <dt>Close to done</dt>
            <dd>
              <Dots n={6 - s.remaining_effort} />
            </dd>
            <dt>Momentum</dt>
            <dd>
              <Dots n={s.momentum} />
            </dd>
            <dt>Usefulness</dt>
            <dd>
              <Dots n={s.usefulness} />
            </dd>
            <dt>Novelty</dt>
            <dd>
              <Dots n={s.novelty} />
            </dd>
          </dl>
          {report.potential.use_cases.length > 0 && (
            <>
              <div className="sub-lbl">It could be used for</div>
              <div className="rows">
                {report.potential.use_cases.map((u) => (
                  <div className="r" key={u}>
                    <div className="title">{u}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          {report.potential.risks.length > 0 && (
            <>
              <div className="sub-lbl">What could make it not worth it</div>
              <div className="rows">
                {report.potential.risks.map((r) => (
                  <div className="r" key={r}>
                    <div className="title">
                      <Rich text={r} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {report.open_questions.length > 0 && (
            <>
              <div className="sub-lbl">Questions only you can answer</div>
              <div className="rows">
                {report.open_questions.map((q) => (
                  <div className="r" key={q}>
                    <div className="title">
                      <Rich text={q} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {report.potential.similar_tools.length > 0 && (
            <p style={{ marginTop: 22, fontSize: 13, color: "var(--ink-3)" }}>Similar: {report.potential.similar_tools.join(", ")}</p>
          )}
        </div>
      </section>

      <p className="foot">
        Briefing written {meta ? ago(meta.startedAt) : "earlier"}
        {meta ? ` after Claude read ${meta.readFiles?.length ?? 0} files.` : "."} Press ⌘R to refresh it.
      </p>
    </>
  );
}

function Dots({ n }: { n: number }) {
  const v = Math.max(0, Math.min(5, n));
  return (
    <span className="dots" aria-label={`${v} of 5`}>
      <b>{"●".repeat(v)}</b>
      {"●".repeat(5 - v)}
    </span>
  );
}

const effortWord = (e: "S" | "M" | "L") => (e === "S" ? "Small" : e === "M" ? "Medium" : "Large");
const mvpPctText = (n: number) => `${n}%`;

function fmtRange(a: string, b: string) {
  const f = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return a === b ? f(a) : `${f(a)} – ${f(b)}`;
}
