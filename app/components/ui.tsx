import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FeatureStatus } from "../../src/types.ts";

/** Round checkbox, Things-style. */
export function Check({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      className={`check${on ? " on" : ""}`}
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
    >
      <svg width="9" height="9" viewBox="0 0 9 9">
        <path d="M1.5 4.8 3.6 6.8 7.6 2.2" fill="none" stroke="var(--bg)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="k" />
      {label}
    </label>
  );
}

/** Monochrome status glyph: full disc = done, half = partial, sliver = stub, ring = planned. */
export function Glyph({ status }: { status: FeatureStatus }) {
  const r = 5.5;
  return (
    <svg className="glyph" width="13" height="13" viewBox="0 0 13 13" aria-label={status}>
      <circle cx="6.5" cy="6.5" r={r} fill="none" stroke="var(--ink-3)" strokeWidth="1.1" strokeDasharray={status === "planned" ? "2 2" : undefined} />
      {status === "done" && <circle cx="6.5" cy="6.5" r={r} fill="var(--ink)" stroke="var(--ink)" strokeWidth="1.1" />}
      {status === "partial" && <path d={`M6.5 1 A${r} ${r} 0 0 1 6.5 12 Z`} fill="var(--ink-2)" />}
      {status === "stub" && <path d={`M6.5 6.5 L6.5 1 A${r} ${r} 0 0 1 11.27 3.75 Z`} fill="var(--ink-3)" />}
    </svg>
  );
}

export function FileRef({ path, seen, onOpen }: { path: string; seen: boolean; onOpen: (p: string) => void }) {
  return (
    <button className="fileref" title={seen ? "Read during the analysis. Click to open." : "Click to open"} onClick={() => onOpen(path)}>
      {seen && <span className="seen" />}
      {path}
    </button>
  );
}

/** Animated disclosure (height via CSS grid rows). */
export function Detail({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`detail${open ? " open" : ""}`} aria-hidden={!open}>
      <div>{children}</div>
    </div>
  );
}

export function Menu({ children }: { children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="menu-wrap no-drag" ref={ref}>
      <button className="tbtn" onClick={() => setOpen((o) => !o)} aria-label="More" style={{ letterSpacing: 1.5 }}>
        •••
      </button>
      {open && <div className="menu">{children(() => setOpen(false))}</div>}
    </div>
  );
}
