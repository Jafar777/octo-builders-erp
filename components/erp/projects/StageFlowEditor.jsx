"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, ListOrdered, Rows3 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { allAtOnce, moveStage, stageAfter, stageColumns, stepByStep } from "@/lib/stageFlow";

// The project's stages as tasks in order. Drag a row (or use the arrows) to reorder,
// and tick which earlier tasks it waits for: a task can wait for several, and several
// can wait for one. `renderRow(stage, i)` adds the row's own fields (hours, employee…).
export default function StageFlowEditor({ stages, onChange, renderRow }) {
  const { t, lang } = useLanguage();
  const [armed, setArmed] = useState(null); // row whose handle was grabbed
  const [from, setFrom] = useState(null);
  const [over, setOver] = useState(null);
  const name = (s, i) => s.name?.[lang] || s.name?.en || `${i + 1}`;

  const toggle = (i, key) => {
    const after = stageAfter(stages, i);
    const next = after.includes(key) ? after.filter((k) => k !== key) : [...after, key];
    onChange(stages.map((s, j) => (j === i ? { ...s, after: next, waitForPrevious: next.length > 0 } : { ...s, after: stageAfter(stages, j) })));
  };
  const move = (a, b) => onChange(moveStage(stages, a, b));
  const endDrag = () => {
    setArmed(null);
    setFrom(null);
    setOver(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-white/50">{t("erp.stageFlow.hint")}</p>
        <div className="flex gap-1 rounded-lg border border-white/10 p-0.5">
          <button type="button" onClick={() => onChange(stepByStep(stages))} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white">
            <ListOrdered size={12} /> {t("erp.stageFlow.stepByStep")}
          </button>
          <button type="button" onClick={() => onChange(allAtOnce(stages))} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white">
            <Rows3 size={12} /> {t("erp.stageFlow.allAtOnce")}
          </button>
        </div>
      </div>

      <ol className="space-y-2">
        {stages.map((s, i) => {
          const after = stageAfter(stages, i);
          const target = from !== null && over === i && from !== i;
          return (
            <li
              key={s.key || i}
              draggable={armed === i}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                setFrom(i);
              }}
              onDragOver={(e) => {
                if (from === null) return;
                e.preventDefault();
                setOver(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (from !== null) move(from, i);
                endDrag();
              }}
              onDragEnd={endDrag}
              className={`rounded-lg bg-white/[0.03] px-3 py-2.5 text-sm transition-shadow ${from === i ? "opacity-50" : ""} ${
                target ? (from < i ? "shadow-[0_2px_0_0] shadow-brand-orange" : "shadow-[0_-2px_0_0] shadow-brand-orange") : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  onPointerDown={() => setArmed(i)}
                  onPointerUp={() => from === null && setArmed(null)}
                  title={t("erp.stageFlow.drag")}
                  className="cursor-grab text-white/55 hover:text-white active:cursor-grabbing"
                >
                  <GripVertical size={15} />
                </span>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] text-white/70">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate" dir="auto">
                  {name(s, i)}
                </span>
                <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className="p-1 text-white/60 hover:text-white disabled:opacity-20">
                  <ArrowUp size={13} />
                </button>
                <button type="button" onClick={() => move(i, i + 1)} disabled={i === stages.length - 1} className="p-1 text-white/60 hover:text-white disabled:opacity-20">
                  <ArrowDown size={13} />
                </button>
              </div>

              {renderRow && <div className="mt-2">{renderRow(s, i)}</div>}

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-white/60">{t("erp.stageFlow.waitsFor")}:</span>
                {i === 0 && <span className="text-white/60">{t("erp.stageFlow.startsFirst")}</span>}
                {stages.slice(0, i).map((p, j) => {
                  const on = after.includes(p.key);
                  return (
                    <button
                      key={p.key || j}
                      type="button"
                      onClick={() => toggle(i, p.key)}
                      title={name(p, j)}
                      aria-pressed={on}
                      className={`min-w-[26px] rounded-full border px-2 py-0.5 ${on ? "border-brand-orange bg-brand-orange/20 text-white" : "border-white/10 text-white/60 hover:text-white"}`}
                    >
                      {j + 1}
                    </button>
                  );
                })}
                {i > 0 && !after.length && <span className="text-white/60">— {t("erp.stageFlow.startsFirst")}</span>}
              </div>
            </li>
          );
        })}
      </ol>

      <FlowDiagram stages={stages} name={name} rtl={lang === "ar"} label={t("erp.stageFlow.diagram")} />
    </div>
  );
}

const NODE = 28;
const GAP_X = 56;
const GAP_Y = 38;
const PAD = 6;

// The order as a small graph: tasks that can run together share a column, and the
// lines show what each one waits for.
function FlowDiagram({ stages, name, rtl, label }) {
  if (!stages.length) return null;
  const col = stageColumns(stages);
  const perCol = {};
  const pos = {};
  stages.forEach((s, i) => {
    const c = col[s.key];
    const r = (perCol[c] = (perCol[c] ?? -1) + 1);
    pos[s.key] = { c, r, i };
  });
  const cols = Math.max(...Object.values(col)) + 1;
  const rows = Math.max(...Object.values(perCol)) + 1;
  const width = PAD * 2 + cols * NODE + (cols - 1) * GAP_X;
  const height = PAD * 2 + rows * NODE + (rows - 1) * GAP_Y;
  const xOf = (c) => {
    const x = PAD + c * (NODE + GAP_X);
    return rtl ? width - x - NODE : x;
  };
  const yOf = (r) => PAD + r * (NODE + GAP_Y);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
      <p className="mb-1 text-[11px] text-white/60">{label}</p>
      <div className="overflow-x-auto">
        <div className="relative" style={{ width, height }}>
          <svg className="absolute inset-0" width={width} height={height}>
            {stages.flatMap((s, i) =>
              stageAfter(stages, i).map((k) => {
                const a = pos[k];
                const b = pos[s.key];
                if (!a) return null;
                const x1 = xOf(a.c) + (rtl ? 0 : NODE);
                const x2 = xOf(b.c) + (rtl ? NODE : 0);
                const y1 = yOf(a.r) + NODE / 2;
                const y2 = yOf(b.r) + NODE / 2;
                const mid = (x1 + x2) / 2;
                return (
                  <path
                    key={`${k}-${s.key}`}
                    d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-brand-orange/60"
                  />
                );
              })
            )}
          </svg>
          {stages.map((s, i) => (
            <span
              key={s.key || i}
              title={name(s, i)}
              className="absolute flex items-center justify-center rounded-full border border-white/25 bg-brand-navy text-[11px] font-semibold text-white"
              style={{ left: xOf(pos[s.key].c), top: yOf(pos[s.key].r), width: NODE, height: NODE }}
            >
              {i + 1}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
