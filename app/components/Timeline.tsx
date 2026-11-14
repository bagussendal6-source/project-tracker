import { useMemo, useState } from "react";
import { activitySeries } from "../../src/report/activity.ts";
import type { FactSheet } from "../../src/types.ts";
import { useWidth } from "../lib/useWidth.ts";

const DAY = 86_400_000;
const t = (d: string) => new Date(d + "T00:00:00Z").getTime();

/** Quiet weekly activity strip: thin ink bars, month labels, a hairline for today. */
export function Timeline({ facts }: { facts: FactSheet }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const s = useMemo(() => activitySeries(facts), [facts]);

  const H = 64;
  const AXIS = 20;
  if (!s.weeks.length) return <div ref={ref} />;

  const from = t(s.weeks[0]) - 2 * DAY;
  const to = Date.now() + 6 * DAY;
  const x = (ms: number) => ((ms - from) / (to - from)) * W;
  const totals = s.weeks.map((_, i) => s.commits[i] + s.prompts[i] + s.edits[i]);
  const max = Math.max(1, ...totals);
  const slot = x(from + 7 * DAY) - x(from);
  const bw = Math.max(2, Math.min(10, slot * 0.45));

  const months: number[] = [];
  const d = new Date(from);
  d.setUTCDate(1);
  while (d.getTime() <= to) {
    if (d.getTime() >= from) months.push(d.getTime());
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  const every = Math.max(1, Math.ceil(months.length / Math.max(1, Math.floor(W / 70))));
  const crossesYear = new Date(from).getUTCFullYear() !== new Date(to).getUTCFullYear();

  const describe = (i: number) =>
    [
      s.commits[i] && `${s.commits[i]} commit${s.commits[i] > 1 ? "s" : ""}`,
      s.prompts[i] && `${s.prompts[i]} message${s.prompts[i] > 1 ? "s" : ""} to Claude`,
      s.edits[i] && `${s.edits[i]} files changed`,
    ]
      .filter(Boolean)
      .join(", ") || "Nothing";

  return (
    <div className="tl" ref={ref}>
      {W > 0 && (
        <svg
          width={W}
          height={H + AXIS}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const ms = from + ((e.clientX - e.currentTarget.getBoundingClientRect().left) / W) * (to - from);
            const i = s.weeks.findIndex((w) => ms >= t(w) && ms < t(w) + 7 * DAY);
            setHover(i >= 0 ? i : null);
          }}
        >
          <line x1={0} x2={W} y1={H + 0.5} y2={H + 0.5} stroke="var(--line)" />
          {s.weeks.map((w, i) => {
            const v = totals[i];
            const h = v ? Math.max(3, (Math.sqrt(v) / Math.sqrt(max)) * (H - 6)) : 0;
            const cx = x(t(w)) + slot / 2;
            return (
              <g key={w}>
                {hover === i && <rect x={cx - slot / 2} y={0} width={slot} height={H} fill="var(--hover)" />}
                {v > 0 && <rect x={cx - bw / 2} y={H - h} width={bw} height={h} rx={bw / 2} fill={hover === i ? "var(--accent)" : "var(--ink-3)"} />}
              </g>
            );
          })}
          {months
            .filter((_, i) => i % every === 0)
            .map((ms) => (
              <text key={ms} x={x(ms)} y={H + 15} fill="var(--ink-3)" fontSize={11}>
                {new Date(ms).toLocaleDateString(undefined, { month: "short", ...(crossesYear ? { year: "2-digit" } : {}), timeZone: "UTC" })}
              </text>
            ))}
          <line x1={x(Date.now())} x2={x(Date.now())} y1={4} y2={H} stroke="var(--accent)" strokeWidth={1} />
        </svg>
      )}
      {hover !== null && (
        <div className="tl-tip" style={{ left: x(t(s.weeks[hover])) + slot / 2, top: 0 }}>
          Week of {new Date(t(s.weeks[hover])).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}: {describe(hover)}
        </div>
      )}
    </div>
  );
}
