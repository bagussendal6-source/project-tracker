import type { AnalysisStatus, ProjectSummary } from "../../src/core/api-types.ts";
import { age } from "../lib/format.ts";

export interface OutlineItem {
  id: string;
  label: string;
}

export function Sidebar({
  projects,
  selected,
  statuses,
  outline,
  activeSection,
  onSelect,
  onAdd,
}: {
  projects: ProjectSummary[];
  selected: string | null;
  statuses: Map<string, AnalysisStatus>;
  outline: OutlineItem[];
  activeSection: string | null;
  onSelect: (id: string | null) => void;
  onAdd: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-top drag" />
      <div className="sidebar-scroll">
        <button className={`nav home${selected === null ? " on" : ""}`} onClick={() => onSelect(null)}>
          Home
        </button>
        {projects.length > 0 && <div className="sidebar-label">Projects</div>}
        {projects.map((p) => {
          const s = statuses.get(p.id);
          const reading = !!s && !["done", "error", "cancelled"].includes(s.stage);
          const on = selected === p.id;
          return (
            <div key={p.id}>
              <button className={`nav${on ? " on" : ""}`} onClick={() => onSelect(p.id)} title={p.root}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                <span className="sub">{reading ? "reading…" : !p.exists ? "missing" : p.analyzedAt ? age(p.lastActivity) : "new"}</span>
              </button>
              {on && outline.length > 0 && (
                <div className="outline">
                  {outline.map((o) => (
                    <button
                      key={o.id}
                      className={activeSection === o.id ? "on" : ""}
                      onClick={() => document.getElementById(`sec-${o.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="sidebar-foot">
        <button className="add" onClick={onAdd} title="Add a project folder (⌘O)">
          Add Project…
        </button>
      </div>
    </aside>
  );
}
