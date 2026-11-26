// The project board: each stage's state from its tasks, which stages are still
// locked, and progress. Pure functions (no database), shared by the server and tests.
//
// A project whose work repeats over rows (spaces / sheets, lib/projectRows.js) has a
// board lane per row plus one for the project as a whole: each row goes through the
// stages on its own (its MAX waits for its own CAD), and the whole-project lane waits
// for whole stages. A project without rows has the whole-project lane only.

import { stageAfter } from "./stageFlow.js";
import { lanesOf, stageInEveryRow } from "./projectRows.js";

const idStr = (v) => (v ? v.toString() : null);

const COMPLETE = ["approved", "done", "skip"];

// Board state per stage. A stage can hold several tasks (different people, and
// revision chains where a rejected task is replaced by its revision). It is complete
// once every current task is approved / done, unless a manual Skip/Done is set.
const CLOSED = ["approved", "done"];
// Which status a stage shows when its tasks differ: the most "alive" one.
const STATUS_RANK = ["in_progress", "help", "on_hold", "submitted", "todo"];
const RANK_ALL = ["in_progress", "help", "on_hold", "pending", "todo", "not_started", "approved", "done", "skip", "cancelled"];

// One cell: `list` = its tasks (not cancelled / rejected), `cancelled` = it had only
// cancelled work, `override` = its newest manual state.
function cellOf(list, cancelled, override) {
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const open = list.filter((t) => !CLOSED.includes(t.status));
  let status = "not_started";
  if (override) status = override.status;
  // All its work was cancelled (like an inactive task in MS Project): it holds nothing
  // up and leaves the progress, until new work is given to it.
  else if (!list.length && cancelled) status = "cancelled";
  else if (list.length && !open.length) status = "approved";
  else if (open.length) {
    const top = STATUS_RANK.find((s) => open.some((t) => t.status === s)) || open[0].status;
    status = top === "submitted" ? "pending" : top;
  }
  const shown = open[0] || list[0];
  return {
    status,
    // Every current task handed in: the stages waiting for it may start (see lockedStages).
    handedIn: !override && open.length > 0 && open.every((t) => t.status === "submitted"),
    override: override ? { status: override.status, reason: override.reason, at: override.at } : null,
    taskId: shown ? idStr(shown._id) : null,
    number: shown?.number || null,
    revision: shown?.revision ?? null,
    assignee: shown ? idStr(shown.assignee) : null,
    count: list.length,
    // The cell's planned hours: those of its current tasks.
    hours: list.reduce((n, t) => n + (t.maxHours || t.estimatedHours || 0), 0),
    needed: true,
  };
}

export function buildCells(project, tasks) {
  const rows = Boolean(project.rows);
  const lanes = lanesOf(project);
  const known = new Set(lanes);
  const laneOf = (v) => {
    const id = rows ? idStr(v) || "" : "";
    return known.has(id) ? id : "";
  };

  const byCell = {};
  const cancelled = new Set();
  for (const t of tasks) {
    if (!["task", "revision"].includes(t.kind) || !t.stage) continue;
    const key = `${laneOf(t.item)}|${t.stage}`;
    if (t.status === "cancelled") cancelled.add(key);
    if (t.status === "cancelled" || t.status === "rejected") continue;
    (byCell[key] ||= []).push(t);
  }
  // Newest manual state of each cell.
  const overrides = {};
  for (const o of [...(project.overrides || [])].sort((a, b) => new Date(a.at) - new Date(b.at))) overrides[`${laneOf(o.item)}|${o.stage}`] = o;

  // Every lane's cells. A cell is "needed" when its work counts: always without rows;
  // with rows, a stage in every row, or where it was given work (optional stages, and
  // the whole-project lane).
  const grid = {};
  for (const lane of lanes) {
    grid[lane] = {};
    for (const stage of project.stages) {
      const key = `${lane}|${stage.key}`;
      const cell = cellOf(byCell[key] || [], cancelled.has(key), overrides[key]);
      if (rows) cell.needed = (lane !== "" && stageInEveryRow(stage)) || cell.count > 0 || Boolean(cell.override) || cell.status === "cancelled";
      if (!cell.needed) cell.status = "none";
      grid[lane][stage.key] = cell;
    }
  }

  // Each stage as a whole: its own cell without rows; with rows, every needed cell.
  const cells = {};
  for (const stage of project.stages) {
    if (!rows) {
      cells[stage.key] = grid[""][stage.key];
      continue;
    }
    const list = lanes.map((l) => grid[l][stage.key]).filter((c) => c.needed);
    const live = list.filter((c) => c.status !== "cancelled");
    const done = live.filter((c) => COMPLETE.includes(c.status));
    const shown = live.find((c) => !COMPLETE.includes(c.status) && c.taskId) || live.find((c) => c.taskId) || null;
    let status = "not_started";
    if (!list.length) status = "none";
    else if (!live.length) status = "cancelled";
    else if (done.length === live.length) status = live.every((c) => c.status === "skip") ? "skip" : "approved";
    else status = RANK_ALL.find((s) => live.some((c) => c.status === s)) || "not_started";
    cells[stage.key] = {
      status,
      handedIn: live.length > 0 && live.every((c) => COMPLETE.includes(c.status) || c.handedIn) && live.some((c) => c.handedIn),
      override: null,
      taskId: shown?.taskId || null,
      number: shown?.number || null,
      revision: shown?.revision ?? null,
      assignee: shown?.assignee || null,
      count: list.reduce((n, c) => n + c.count, 0),
      hours: list.reduce((n, c) => n + c.hours, 0),
      needed: list.length > 0,
      done: done.length,
      of: live.length,
    };
  }

  // Progress weighs each needed cell by its hours (a cell with no hours yet counts as an
  // average one), so finishing a long stage moves it more than a short one. Cancelled
  // cells are out of the project's scope.
  const counted = lanes.flatMap((l) => project.stages.map((s) => grid[l][s.key])).filter((c) => c.needed && c.status !== "cancelled");
  const withHours = counted.map((c) => c.hours).filter((h) => h > 0);
  const average = withHours.length ? withHours.reduce((a, b) => a + b, 0) / withHours.length : 1;
  const weight = (c) => c.hours || average;
  const all = counted.reduce((n, c) => n + weight(c), 0);
  const doneWeight = counted.filter((c) => COMPLETE.includes(c.status)).reduce((n, c) => n + weight(c), 0);
  const complete = counted.filter((c) => COMPLETE.includes(c.status)).length;

  // Locks: a row's cells wait for that row's earlier stages; the whole-project lane waits
  // for whole stages (every row).
  const lockedCells = {};
  for (const lane of lanes) lockedCells[lane] = lockedStages(project, lane === "" ? cells : grid[lane]).filter((k) => lane === "" || grid[lane][k].needed);
  // A stage "is locked" (stage-level screens, hand-over notices) while no lane may work on it.
  const rowLanes = lanes.filter((l) => l !== "");
  const locked = !rows
    ? lockedCells[""]
    : project.stages
        .filter((s) => {
          const open = rowLanes.filter((l) => grid[l][s.key].needed);
          return open.length ? open.every((l) => lockedCells[l].includes(s.key)) : lockedCells[""].includes(s.key);
        })
        .map((s) => s.key);

  return {
    cells,
    progress: all ? doneWeight / all : 0,
    complete,
    total: counted.length,
    locked,
    ...(rows ? { grid, lockedCells } : {}),
  };
}

// A stage stays locked until every stage it waits for is handed in for review or
// finished (approved, done or skipped). A rejection locks it again until the redo is
// handed in. A cancelled stage passes its own waits on: the stages after it wait for
// what it waited for. A stage not needed (rows: not worked in this row) holds nothing up.
export function lockedStages(project, cells) {
  const index = new Map(project.stages.map((s, i) => [s.key, i]));
  const released = (key, depth = 0) => {
    const cell = cells[key];
    if (cell && cell.needed === false) return true;
    if (COMPLETE.includes(cell?.status) || cell?.handedIn) return true;
    if (cell?.status === "cancelled" && index.has(key) && depth < 50) return stageAfter(project.stages, index.get(key)).every((k) => released(k, depth + 1));
    return false;
  };
  return project.stages
    .filter((stage, i) => stageAfter(project.stages, i).some((k) => !released(k)))
    .map((s) => s.key);
}

// One row's state as a whole (a sheet shown on its space): its needed cells together.
export function laneStatus(laneCells = {}) {
  const live = Object.values(laneCells).filter((c) => c.needed && c.status !== "cancelled");
  if (!live.length) return "not_started";
  if (live.every((c) => COMPLETE.includes(c.status))) return "approved";
  return RANK_ALL.find((s) => live.some((c) => c.status === s)) || "not_started";
}
