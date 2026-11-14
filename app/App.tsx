import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnalysisStatus, KnownProject, ProjectSummary } from "../src/core/api-types.ts";
import { api } from "./api.ts";
import { Home } from "./components/Home.tsx";
import { ProjectDoc } from "./components/ProjectDoc.tsx";
import { Sidebar, type OutlineItem } from "./components/Sidebar.tsx";
import { Welcome } from "./components/Welcome.tsx";
import { daysSince } from "./lib/format.ts";

const ONBOARDED = "pt.onboarded.v1";
const readFlag = () => {
  try {
    return localStorage.getItem(ONBOARDED) === "1";
  } catch {
    return false;
  }
};

export function App() {
  const [onboarded, setOnboarded] = useState(readFlag);
  const [selected, setSelected] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [known, setKnown] = useState<KnownProject[]>([]);
  const [statuses, setStatuses] = useState<Map<string, AnalysisStatus>>(new Map());
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const refresh = useCallback(() => api.listProjects().then(setProjects), []);

  useEffect(() => {
    refresh();
    api.knownProjects().then(setKnown);
    api.statuses().then((list) => setStatuses(new Map(list.map((s) => [s.id, s]))));
    return api.onStatus((s) => {
      setStatuses((m) => new Map(m).set(s.id, s));
      if (["done", "error", "cancelled"].includes(s.stage)) refresh();
    });
  }, [refresh]);

  // Most recently active first: the sidebar reads like a recent-documents list.
  const ordered = useMemo(
    () => [...projects].sort((a, b) => (daysSince(a.lastActivity) ?? 1e9) - (daysSince(b.lastActivity) ?? 1e9)),
    [projects],
  );

  const addProject = useCallback(async () => {
    const root = await api.pickFolder();
    if (!root) return;
    const e = await api.addProject(root);
    await refresh();
    setSelected(e.id);
  }, [refresh]);

  // Keyboard: ↑/↓ move through the sidebar, ⌘O adds a project.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea, [contenteditable]");
      if (e.metaKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        addProject();
      } else if (!typing && !e.metaKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        const ids: (string | null)[] = [null, ...ordered.map((p) => p.id)];
        const i = ids.indexOf(selected);
        const next = ids[Math.max(0, Math.min(ids.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
        setSelected(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ordered, selected, addProject]);

  useEffect(() => {
    if (selected === null) {
      setOutline([]);
      setActiveSection(null);
    }
  }, [selected]);

  if (!onboarded) {
    return (
      <Welcome
        known={known}
        tracked={new Set(projects.map((p) => p.root))}
        onDone={() => {
          try {
            localStorage.setItem(ONBOARDED, "1");
          } catch {
            /* private mode: show again next time */
          }
          setOnboarded(true);
          refresh();
        }}
      />
    );
  }

  return (
    <div className="window">
      <Sidebar
        projects={ordered}
        selected={selected}
        statuses={statuses}
        outline={outline}
        activeSection={activeSection}
        onSelect={setSelected}
        onAdd={addProject}
      />
      <main className="main">
        {selected === null ? (
          <>
            <div className="toolbar drag" />
            <div className="scroll">
              <Home projects={ordered} onOpen={setSelected} onAdd={addProject} />
            </div>
          </>
        ) : (
          <ProjectDoc
            key={selected}
            id={selected}
            status={statuses.get(selected)}
            onOutline={setOutline}
            onActiveSection={setActiveSection}
            onChanged={refresh}
            onRemoved={() => {
              setSelected(null);
              refresh();
            }}
          />
        )}
      </main>
    </div>
  );
}
