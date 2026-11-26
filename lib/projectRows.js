// Project rows: what a project's work repeats over (change request "فراغات / مخططات").
//
// - "" (none): one row of stages — the 8-stage real-estate projects.
// - "spaces": interior design — every space (bathroom, kitchen…) goes through the stages.
// - "sheets": technical office — every drawing sheet (number + name) goes through them.
//
// A row is an entry of WorkProject.items; a task belongs to one through Task.item (none =
// the project as a whole). Pure functions, shared by the browser and the server.

export const ROW_KINDS = ["", "spaces", "sheets"];

const idStr = (v) => (v ? v.toString() : "");
const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// What a row is called on screens and in its tasks' titles: "GF-06 · Bathroom",
// "AR-605-A · BF.06 - WC - PLAN".
export function rowLabel(item) {
  if (!item) return "";
  return [item.number, item.name].filter(Boolean).join(" · ");
}

// The group a row shows under: a space's floor (GF, FF…), a sheet's series (AR-000,
// AR-100…, from the number's hundreds).
export function rowGroup(item, kind) {
  const number = String(item?.number || "").toUpperCase().replace(/\s+/g, "");
  if (kind === "sheets") {
    const m = number.match(/^([A-Z]+)-?(\d)\d{2}/);
    return m ? `${m[1]}-${m[2]}00` : "";
  }
  const m = number.match(/^([A-Z]{1,3})[-\d]/);
  return m ? m[1] : "";
}

// A space typed the old way ("GF-06-BATHROOM", "FF-08**-OFFICE", "OTHER") or a sheet
// ("AR-605-A BF.06 - WC - PLAN", "AR -004", "AR-001<TAB>LIST OF DRAWINGS"): number + name.
export function parseRow(text, kind) {
  const line = clean(String(text ?? "").replace(/\t+/g, " | "), 300);
  if (!line) return null;
  if (kind === "sheets") {
    // The sheet number: letters, a dash and digits, maybe a letter suffix (AR-605-A).
    const m = line.match(/^([A-Za-z]{1,4})\s*-\s*(\d{1,4}(?:\s*-\s*[A-Za-z0-9]{1,3})?)\b\s*(?:[|:·\-–—]\s*)?(.*)$/);
    if (m) return { number: `${m[1].toUpperCase()}-${m[2].replace(/\s+/g, "").toUpperCase()}`, name: clean(m[3].replace(/^\|\s*/, ""), 200) };
    return { number: "", name: clean(line.replace(/^\|\s*/, ""), 200) };
  }
  // A space: floor code + number (FF-01** — a second space of that number in the old
  // sheets — keeps its stars), then its name.
  const m = line.match(/^([A-Za-z]{1,3})\s*-\s*(\d{1,3})(\**)\s*(?:[|:·\-–—]\s*)?(.*)$/);
  if (m) return { number: `${m[1].toUpperCase()}-${m[2].padStart(2, "0")}${m[3]}`, name: clean(m[4].replace(/^\|\s*/, "").replace(/\*+/g, ""), 200) };
  return { number: "", name: clean(line.replace(/\*+/g, ""), 200) };
}

// Pasted lines (one row each, Excel / AutoCAD tables too) → rows, without blanks or
// lines already there.
export function parseRows(text, kind, existing = []) {
  const seen = new Set(existing.map((x) => rowKey(x)));
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const row = parseRow(raw, kind);
    if (!row || (!row.number && !row.name)) continue;
    const key = rowKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export const rowKey = (x) => `${String(x?.number || "").toUpperCase().replace(/\s+/g, "")}|${String(x?.name || "").toUpperCase().replace(/[\s*]+/g, "")}`;

// Order of floors in a building, for sorting spaces typed in any order.
const FLOORS = ["BF", "GF", "MF", "FF", "SF", "TF", "RF"];
export function compareRows(a, b) {
  const fa = FLOORS.indexOf(String(a.number || "").slice(0, 2).toUpperCase());
  const fb = FLOORS.indexOf(String(b.number || "").slice(0, 2).toUpperCase());
  if (!a.number !== !b.number) return a.number ? -1 : 1;
  return (fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb) || String(a.number).localeCompare(String(b.number), "en", { numeric: true }) || String(a.name).localeCompare(String(b.name));
}

// Rows in the order shown: by `order`, then number.
export function sortRows(items = []) {
  return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.number || "").localeCompare(String(b.number || ""), "en", { numeric: true }));
}

// Is `stage` worked on in every row (it counts towards progress there), or only where
// it was given work (an optional stage: a presentation, an AI edit…)?
export const stageInEveryRow = (stage) => !stage?.optional;

// The lanes of a project's board: "" = the project as a whole, then one per row.
export function lanesOf(project) {
  if (!project?.rows) return [""];
  return ["", ...sortRows((project.items || []).filter((i) => !i.archived)).map((i) => idStr(i._id ?? i.id))];
}
