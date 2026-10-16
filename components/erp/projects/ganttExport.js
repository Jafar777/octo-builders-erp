// Gantt exports: an Excel workbook (schedule, milestones, workload) and a printable
// landscape PDF (the browser's "Save as PDF"). Loaded on demand from ProjectsTimeline.
// `m` = { groups, cal, critical, tasksById, people, load, now, lang, t, from, to, opts }

import { DAY, HOUR, milestoneState, officeClock, officeDate, taskProgress, taskSpan, workMsBetween } from "@/lib/gantt";
import { locale } from "@/lib/formatTime";

const STATUS_HEX = {
  todo: "#94a3b8",
  in_progress: "#38bdf8",
  on_hold: "#f59e0b",
  help: "#a78bfa",
  submitted: "#f97316",
  approved: "#10b981",
  done: "#10b981",
  rejected: "#ef4444",
  cancelled: "#cbd5e1",
};
const MILESTONE_HEX = { done: "#10b981", late: "#ef4444", risk: "#f87171", ok: "#f97316" };

const heading = (task, lang) => {
  if (task.title && !task.stage) return task.title;
  return [task.title, task.stage?.name?.[lang]].filter(Boolean).join(" · ") || "—";
};
const groupTitle = (g, lang) => (g.kind === "project" ? g.project.name?.[lang] : g.person.name) || "—";
const stamp = () => new Date().toISOString().slice(0, 10);

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Excel ----------

export async function exportExcel(m) {
  const mod = await import("exceljs");
  const ExcelJS = mod.default || mod;
  const { t, lang, cal } = m;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Octo Builders";
  const rtl = lang === "ar";
  const dateFmt = "yyyy-mm-dd hh:mm";
  const clock = (ms) => (ms ? officeClock(ms, cal) : null);
  const head = (ws) => {
    const row = ws.getRow(1);
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    ws.views = [{ rightToLeft: rtl, state: "frozen", ySplit: 1 }];
  };

  // Schedule
  const ws = wb.addWorksheet(t("erp.gantt.sheet.schedule"));
  ws.columns = [
    { header: t("erp.gantt.col.group"), key: "group", width: 26 },
    { header: "#", key: "number", width: 7 },
    { header: t("erp.gantt.col.task"), key: "task", width: 38 },
    { header: t(m.groups[0]?.kind === "person" ? "erp.gantt.col.project" : "erp.gantt.col.assignee"), key: "other", width: 22 },
    { header: t("erp.gantt.col.status"), key: "status", width: 14 },
    { header: t("erp.tasks.priorityLabel"), key: "priority", width: 11 },
    { header: t("erp.gantt.start"), key: "start", width: 17, style: { numFmt: dateFmt } },
    { header: t("erp.gantt.due"), key: "end", width: 17, style: { numFmt: dateFmt } },
    { header: t("erp.gantt.col.workHours"), key: "work", width: 11 },
    { header: t("erp.gantt.estimatedHours"), key: "estimate", width: 11 },
    { header: t("erp.gantt.progress"), key: "progress", width: 10, style: { numFmt: "0%" } },
    { header: t("erp.gantt.col.baselineStart"), key: "bStart", width: 17, style: { numFmt: dateFmt } },
    { header: t("erp.gantt.col.baselineEnd"), key: "bEnd", width: 17, style: { numFmt: dateFmt } },
    { header: t("erp.gantt.col.slip"), key: "slip", width: 10 },
    { header: t("erp.gantt.critical"), key: "critical", width: 9 },
    { header: t("erp.tasks.dependsOn"), key: "deps", width: 16 },
  ];
  head(ws);
  for (const g of m.groups) {
    const gRow = ws.addRow({ group: groupTitle(g, lang) });
    gRow.font = { bold: true };
    gRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    for (const task of g.tasks) {
      const span = taskSpan(task);
      const bEnd = task.baselineEnd ? new Date(task.baselineEnd).getTime() : null;
      const row = ws.addRow({
        group: groupTitle(g, lang),
        number: task.number,
        task: heading(task, lang),
        other: g.kind === "person" ? task.project?.name?.[lang] || "" : task.assignee?.name || "",
        status: t(`erp.tasks.status.${task.status}`),
        priority: t(`erp.tasks.priority.${task.priority}`),
        start: clock(span.start),
        end: clock(span.end),
        work: Math.round((workMsBetween(span.start, span.end, cal) / HOUR) * 10) / 10,
        estimate: task.estimatedHours || null,
        progress: taskProgress(task, m.now),
        bStart: task.baselineStart ? clock(new Date(task.baselineStart).getTime()) : null,
        bEnd: bEnd ? clock(bEnd) : null,
        slip: bEnd ? Math.round((span.end - bEnd) / DAY) : null,
        critical: m.critical.has(task.id) ? "●" : "",
        deps: (task.dependsOn || []).map((d) => `#${d.number}`).join(", "),
      });
      row.getCell("status").fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${(STATUS_HEX[task.status] || "#cbd5e1").slice(1)}` } };
      if (m.critical.has(task.id)) row.getCell("critical").font = { color: { argb: "FFE11D48" }, bold: true };
      if (bEnd && span.end - bEnd > DAY / 2) row.getCell("slip").font = { color: { argb: "FFDC2626" }, bold: true };
    }
  }
  ws.autoFilter = { from: "A1", to: "P1" };

  // Milestones
  const milestones = m.groups.flatMap((g) => (g.milestones || []).map((ms) => ({ g, ms })));
  if (milestones.length) {
    const wm = wb.addWorksheet(t("erp.gantt.sheet.milestones"));
    wm.columns = [
      { header: t("erp.gantt.col.project"), key: "project", width: 28 },
      { header: t("erp.gantt.milestoneName"), key: "name", width: 30 },
      { header: t("erp.gantt.milestoneDate"), key: "date", width: 17, style: { numFmt: dateFmt } },
      { header: t("erp.gantt.col.status"), key: "state", width: 16 },
      { header: t("erp.gantt.col.baselineEnd"), key: "baseline", width: 17, style: { numFmt: dateFmt } },
      { header: t("erp.gantt.col.slip"), key: "slip", width: 10 },
    ];
    head(wm);
    for (const { g, ms } of milestones) {
      const at = new Date(ms.date).getTime();
      const state = milestoneState(ms, m.tasksById, m.now);
      const base = ms.baselineDate ? new Date(ms.baselineDate).getTime() : null;
      const row = wm.addRow({
        project: groupTitle(g, lang),
        name: ms.name,
        date: clock(at),
        state: t(`erp.gantt.milestoneState.${state}`),
        baseline: base ? clock(base) : null,
        slip: base ? Math.round((at - base) / DAY) : null,
      });
      row.getCell("state").fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${MILESTONE_HEX[state].slice(1)}` } };
    }
  }

  // Workload: people × office days, coloured against each person's capacity.
  const today = officeDate(m.now, cal);
  const dates = [...new Set(Object.values(m.load).flatMap((days) => Object.keys(days)))].filter((d) => d >= today).sort().slice(0, 60);
  if (dates.length) {
    const wl = wb.addWorksheet(t("erp.gantt.sheet.workload"));
    wl.columns = [
      { header: t("erp.gantt.col.person"), key: "person", width: 24 },
      { header: t("erp.gantt.col.capacity"), key: "capacity", width: 10 },
      ...dates.map((d) => ({ header: d.slice(5), key: d, width: 7 })),
    ];
    head(wl);
    for (const person of m.people) {
      const days = m.load[person.id];
      if (!days) continue;
      const row = wl.addRow({ person: person.name, capacity: person.dailyHours, ...Object.fromEntries(dates.map((d) => [d, days[d] ? Math.round(days[d] * 10) / 10 : null])) });
      for (const d of dates) {
        if (!days[d]) continue;
        const ratio = days[d] / person.dailyHours;
        const color = ratio > 1.001 ? "FFFCA5A5" : ratio >= 0.8 ? "FFFDE68A" : "FFBBF7D0";
        row.getCell(d).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
      }
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  download(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `octo-timeline-${stamp()}.xlsx`);
}

// ---------- PDF (print) ----------

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const PAGE_W = 1060;
const LABEL = 280;
const CHART = PAGE_W - LABEL;
const HEAD = 34;
const G_H = 24;
const T_H = 19;
const ROWS_H = 610;

export function exportPdf(m) {
  const { t, lang, cal } = m;
  // Range: from the earliest to the latest bar (with a little room).
  let min = Infinity;
  let max = -Infinity;
  for (const g of m.groups) {
    for (const task of g.tasks) {
      const s = taskSpan(task);
      min = Math.min(min, s.start);
      max = Math.max(max, s.end);
    }
    for (const ms of g.milestones || []) max = Math.max(max, new Date(ms.date).getTime());
  }
  if (!Number.isFinite(min)) {
    min = m.from;
    max = m.to;
  }
  const from = min - 2 * DAY;
  const to = max + 3 * DAY;
  const scale = CHART / (to - from);
  const X = (ms) => LABEL + (ms - from) * scale;
  const fmt = (opts) => new Intl.DateTimeFormat(locale(lang), opts);

  // Rows split into pages.
  const pages = [[]];
  let used = 0;
  for (const g of m.groups) {
    const need = G_H + g.tasks.length * T_H;
    if (used + G_H + Math.min(need - G_H, 3 * T_H) > ROWS_H && used > 0) {
      pages.push([]);
      used = 0;
    }
    pages.at(-1).push({ kind: "group", g });
    used += G_H;
    for (const task of g.tasks) {
      if (used + T_H > ROWS_H) {
        pages.push([{ kind: "group", g, cont: true }]);
        used = G_H;
      }
      pages.at(-1).push({ kind: "task", task, g });
      used += T_H;
    }
  }

  // Time scale ticks.
  const spanDays = (to - from) / DAY;
  const ticks = [];
  const months = [];
  for (let d = new Date(from); d.getTime() < to; d.setDate(d.getDate() + 1)) {
    const at = d.getTime();
    if (d.getDate() === 1 || !months.length) months.push({ at, label: fmt({ month: "long", year: "numeric" }).format(d) });
    if (spanDays <= 45 || (spanDays <= 200 && d.getDay() === 1) || (spanDays > 200 && d.getDate() === 1)) {
      ticks.push({ at, label: spanDays > 200 ? fmt({ month: "short" }).format(d) : String(d.getDate()) });
    }
  }
  const nonWorking =
    spanDays <= 120
      ? (() => {
          const out = [];
          for (let d = new Date(from); d.getTime() < to; d.setDate(d.getDate() + 1)) {
            const at = new Date(d).setHours(0, 0, 0, 0);
            const iso = officeDate(at + 12 * HOUR, cal);
            const weekday = new Date(`${iso}T12:00:00Z`).getUTCDay();
            if (cal.weekend.includes(weekday) || cal.holidays.includes(iso)) out.push(at);
          }
          return out;
        })()
      : [];

  const svgPage = (rows) => {
    const height = HEAD + rows.reduce((h, r) => h + (r.kind === "group" ? G_H : T_H), 0) + 4;
    const parts = [];
    const rowY = {};
    // Background, non-working days, grid.
    parts.push(`<rect x="0" y="0" width="${PAGE_W}" height="${height}" fill="#fff"/>`);
    for (const at of nonWorking) {
      const x1 = Math.max(LABEL, X(at));
      const w = Math.min(X(at + DAY), PAGE_W) - x1;
      if (w > 0) parts.push(`<rect x="${x1}" y="${HEAD}" width="${w}" height="${height - HEAD}" fill="#f1f5f9"/>`);
    }
    for (const tk of ticks) {
      const x = X(tk.at);
      if (x < LABEL || x > PAGE_W) continue;
      parts.push(`<line x1="${x}" y1="${HEAD / 2}" x2="${x}" y2="${height}" stroke="#e2e8f0" stroke-width="0.6"/>`);
      parts.push(`<text x="${x + 2}" y="${HEAD - 5}" font-size="8" fill="#64748b">${esc(tk.label)}</text>`);
    }
    for (const mo of months) {
      const x = Math.max(LABEL, X(mo.at));
      parts.push(`<text x="${x + 2}" y="12" font-size="9" font-weight="600" fill="#334155">${esc(mo.label)}</text>`);
    }
    parts.push(`<line x1="0" y1="${HEAD}" x2="${PAGE_W}" y2="${HEAD}" stroke="#94a3b8"/>`);
    parts.push(`<line x1="${LABEL}" y1="0" x2="${LABEL}" y2="${height}" stroke="#94a3b8"/>`);

    let y = HEAD;
    for (const r of rows) {
      if (r.kind === "group") {
        parts.push(`<rect x="0" y="${y}" width="${PAGE_W}" height="${G_H}" fill="#f8fafc"/>`);
        parts.push(
          `<text x="6" y="${y + 16}" font-size="10" font-weight="700" fill="#0f172a">${esc(cut(groupTitle(r.g, lang), 42))}${r.cont ? " …" : ""}</text>`
        );
        if (r.g.kind === "project" && r.g.span) {
          const pct = r.g.project.progress || 0;
          const x1 = Math.max(LABEL, X(r.g.span.start));
          const w = Math.max(3, Math.min(PAGE_W, X(r.g.span.end)) - x1);
          parts.push(`<rect x="${x1}" y="${y + 8}" width="${w}" height="8" rx="2" fill="#e2e8f0" stroke="#94a3b8" stroke-width="0.5"/>`);
          parts.push(`<rect x="${x1}" y="${y + 8}" width="${w * pct}" height="8" rx="2" fill="#fb923c"/>`);
        }
        for (const ms of r.g.milestones || []) {
          const cx = X(new Date(ms.date).getTime());
          const state = milestoneState(ms, m.tasksById, m.now);
          parts.push(
            `<rect x="${cx - 5}" y="${y + G_H / 2 - 5}" width="10" height="10" transform="rotate(45 ${cx} ${y + G_H / 2})" fill="${MILESTONE_HEX[state]}" stroke="#334155" stroke-width="0.6"/>`
          );
          parts.push(`<text x="${cx + 8}" y="${y + 9}" font-size="7.5" fill="#334155">${esc(cut(ms.name, 30))}</text>`);
        }
        y += G_H;
        continue;
      }
      const { task } = r;
      const span = taskSpan(task);
      rowY[task.id] = { y: y + T_H / 2, span };
      const crit = m.critical.has(task.id);
      const other = r.g.kind === "person" ? task.project?.code || task.project?.name?.[lang] || "" : task.assignee?.name || "";
      parts.push(`<line x1="0" y1="${y + T_H}" x2="${PAGE_W}" y2="${y + T_H}" stroke="#f1f5f9"/>`);
      parts.push(`<text x="14" y="${y + 13}" font-size="8.5" fill="${crit ? "#e11d48" : "#1e293b"}">#${task.number} ${esc(cut(heading(task, lang), 34))}</text>`);
      parts.push(`<text x="${LABEL - 6}" y="${y + 13}" font-size="7.5" fill="#64748b" text-anchor="end">${esc(cut(other, 16))}</text>`);
      if (m.opts.baseline && task.baselineStart && task.baselineEnd) {
        const bx = X(new Date(task.baselineStart).getTime());
        const bw = Math.max(2, X(new Date(task.baselineEnd).getTime()) - bx);
        parts.push(`<rect x="${bx}" y="${y + T_H - 5}" width="${bw}" height="2.5" fill="#94a3b8"/>`);
      }
      const bx = X(span.start);
      const bw = Math.max(3, X(span.end) - bx);
      const color = STATUS_HEX[task.status] || "#94a3b8";
      parts.push(`<rect x="${bx}" y="${y + 3}" width="${bw}" height="11" rx="2" fill="${color}" fill-opacity="0.35" stroke="${crit ? "#e11d48" : color}" stroke-width="${crit ? 1.6 : 0.8}"/>`);
      parts.push(`<rect x="${bx}" y="${y + 3}" width="${bw * taskProgress(task, m.now)}" height="11" rx="2" fill="${color}"/>`);
      y += T_H;
    }
    // Dependency arrows between bars on this page.
    for (const r of rows) {
      if (r.kind !== "task") continue;
      for (const dep of r.task.dependsOn || []) {
        const a = rowY[dep.id];
        const b = rowY[r.task.id];
        if (!a || !b) continue;
        const x1 = X(a.span.end);
        const x2 = X(b.span.start);
        const crit = m.critical.has(dep.id) && m.critical.has(r.task.id);
        const stroke = b.span.start < a.span.end ? "#ef4444" : crit ? "#e11d48" : "#64748b";
        parts.push(`<path d="M${x1},${a.y} H${x1 + 5} V${b.y} H${x2}" fill="none" stroke="${stroke}" stroke-width="0.8"/>`);
        parts.push(`<path d="M${x2 - 4},${b.y - 2.5} L${x2},${b.y} L${x2 - 4},${b.y + 2.5} z" fill="${stroke}"/>`);
      }
    }
    if (m.now > from && m.now < to) parts.push(`<line x1="${X(m.now)}" y1="${HEAD}" x2="${X(m.now)}" y2="${height}" stroke="#f97316" stroke-width="1.2"/>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${height}" viewBox="0 0 ${PAGE_W} ${height}" font-family="Segoe UI, Tahoma, Arial, sans-serif">${parts.join("")}</svg>`;
  };

  const legend = [
    [`<span class="sw" style="background:#38bdf8"></span>`, t("erp.gantt.progress")],
    [`<span class="sw" style="border:1.6px solid #e11d48;background:#fff"></span>`, t("erp.gantt.critical")],
    [`<span class="sw" style="height:3px;background:#94a3b8"></span>`, t("erp.gantt.baseline")],
    [`<span class="sw" style="width:9px;height:9px;transform:rotate(45deg);background:#f97316"></span>`, t("erp.gantt.milestone")],
    [`<span class="sw" style="background:#f1f5f9;border:1px solid #e2e8f0"></span>`, t("erp.gantt.nonWorking")],
  ]
    .map(([sw, label]) => `<span class="lg">${sw}${esc(label)}</span>`)
    .join("");

  const title = `${t("erp.nav.projects")} — ${t("erp.gantt.timeline")}`;
  const date = fmt({ dateStyle: "long" }).format(new Date());
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@page { size: A4 landscape; margin: 8mm; }
body { margin: 0; font-family: "Segoe UI", Tahoma, Arial, sans-serif; color: #0f172a; }
.page { page-break-after: always; }
.page:last-child { page-break-after: auto; }
header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
h1 { font-size: 15px; margin: 0; }
.meta { font-size: 10px; color: #475569; }
.legend { font-size: 9px; color: #475569; display: flex; gap: 14px; margin-bottom: 6px; }
.lg { display: inline-flex; align-items: center; gap: 5px; }
.sw { display: inline-block; width: 16px; height: 8px; border-radius: 2px; }
svg { display: block; width: 100%; height: auto; }
</style></head><body>
${pages
  .map(
    (rows, i) => `<section class="page"><header><h1>${esc(title)}</h1><span class="meta">${esc(date)} · ${i + 1} / ${pages.length}</span></header>
${i === 0 ? `<div class="legend">${legend}</div>` : ""}${svgPage(rows)}</section>`
  )
  .join("")}
<script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</script>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) throw new Error("popup_blocked");
  win.document.open();
  win.document.write(html);
  win.document.close();
}
