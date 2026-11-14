import type { ProjectSummary } from "../../src/core/api-types.ts";
import { ago, daysSince } from "../lib/format.ts";

/** A few sentences, not a dashboard: what you touched last, and what's been waiting. */
export function Home({ projects, onOpen, onAdd }: { projects: ProjectSummary[]; onOpen: (id: string) => void; onAdd: () => void }) {
  const read = projects.filter((p) => p.analyzedAt && p.exists);
  const byRecent = [...read].sort((a, b) => (daysSince(a.lastActivity) ?? 1e9) - (daysSince(b.lastActivity) ?? 1e9));
  const recent = byRecent[0];
  const waiting = byRecent
    .slice(1)
    .filter((p) => (daysSince(p.lastActivity) ?? 0) > 21 && p.verdict !== "archive")
    .sort((a, b) => (b.mvpPct ?? 0) - (a.mvpPct ?? 0))[0];
  const unread = projects.filter((p) => !p.analyzedAt && p.exists);

  const Name = ({ p }: { p: ProjectSummary }) => (
    <button className="textlink" style={{ fontWeight: 600, color: "var(--ink)" }} onClick={() => onOpen(p.id)}>
      {p.name}
    </button>
  );

  return (
    <div className="center">
      <div className="home">
        <h1>{projects.length ? "Pick up where you left off." : "Nothing here yet."}</h1>
        <div className="lines">
          {projects.length === 0 && <p>Add a project folder and Project Tracker will read it for you.</p>}
          {recent && (
            <p>
              You last worked on <Name p={recent} /> {ago(recent.lastActivity)}
              {recent.mvpPct !== null ? <>, and it's about {recent.mvpPct}% of the way to a first version.</> : "."}
            </p>
          )}
          {waiting && (
            <p>
              <Name p={waiting} /> has been quiet for {ago(waiting.lastActivity).replace(" ago", "")}
              {waiting.mvpPct !== null && waiting.mvpPct >= 60 ? ", though it's close to done." : "."}
            </p>
          )}
          {unread.length > 0 && (
            <p>
              {unread.length === 1 ? (
                <>
                  <Name p={unread[0]} /> hasn't been read yet.
                </>
              ) : (
                <>{unread.length} projects haven't been read yet. Pick one in the sidebar when you're ready.</>
              )}
            </p>
          )}
        </div>
        <div className="act">
          {recent && (
            <button className="btn primary" onClick={() => onOpen(recent.id)}>
              Open {recent.name}
            </button>
          )}
          <button className={recent ? "textlink" : "btn primary"} onClick={onAdd}>
            Add a project…
          </button>
        </div>
      </div>
    </div>
  );
}
