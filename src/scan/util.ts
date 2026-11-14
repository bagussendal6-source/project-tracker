import { execFile } from "node:child_process";

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/** Run a command without a shell. Never throws; check `ok`. */
export function run(cmd: string, args: string[], cwd: string, timeoutMs = 60_000): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { cwd, maxBuffer: 256 * 1024 * 1024, timeout: timeoutMs, encoding: "utf8" },
      (err, stdout, stderr) => resolve({ ok: !err, stdout: stdout ?? "", stderr: stderr ?? "" }),
    );
  });
}

/** Monday-based week start as YYYY-MM-DD (UTC). */
export function weekOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export function histogram(dates: Date[]): { week: string; count: number }[] {
  const m = new Map<string, number>();
  for (const d of dates) {
    if (Number.isNaN(d.getTime())) continue;
    const w = weekOf(d);
    m.set(w, (m.get(w) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, count]) => ({ week, count }));
}

export function truncate(s: string, max: number): string {
  const clean = s.replace(/\s+\n/g, "\n").trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1) + "…";
}

export function isoDate(d: Date | null): string | null {
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}
