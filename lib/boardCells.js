// The project board: each stage's state from its tasks, which stages are still
// locked, and progress. Pure functions (no database), shared by the server and tests.

import { stageAfter } from "./stageFlow.js";

const idStr = (v) => (v ? v.toString() : null);

const COMPLETE = ["approved", "done", "skip"];

// Board state per stage. A stage can hold several tasks (different people, and
// revision chains where a rejected task is replaced by its revision). It is complete
// once every current task is approved / done, unless a manual Skip/Done is set.
const CLOSED = ["approved", "done"];
// Which status a stage shows when its tasks differ: the most "alive" one.
const STATUS_RANK = ["in_progress", "help", "on_hold", "submitted", "todo"];

export function buildCells(project, tasks) {
  const byStage = {};
  const cancelled = new Set();
  for (const t of tasks) {
    if (!["task", "revision"].includes(t.kind) || !t.stage) continue;
    if (t.status === "cancelled") cancelled.add(t.stage);
    if (t.status === "cancelled" || t.status === "rejected") continue;
    (byStage[t.stage] ||= []).push(t);
  }

  const cells = {};
  const hours = {};
  let complete = 0;
  for (const stage of project.stages) {
    // Newest manual state of the stage.
    const override = (project.overrides || [])
      .filter((o) => o.stage === stage.key)
      .sort((a, b) => new Date(b.at) - new Date(a.at))[0];
    const list = (byStage[stage.key] || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const open = list.filter((t) => !CLOSED.includes(t.status));
    let status = "not_started";
    if (override) status = override.status;
    // All its work was cancelled (like an inactive task in MS Project): it holds nothing
    // up and leaves the progress, until new work is given to it.
    else if (!list.length && cancelled.has(stage.key)) status = "cancelled";
    else if (list.length && !open.length) status = "approved";
    else if (open.length) {
      const top = STATUS_RANK.find((s) => open.some((t) => t.status === s)) || open[0].status;
      status = top === "submitted" ? "pending" : top;
    }
    const shown = open[0] || list[0];

    cells[stage.key] = {
      status,
      // Every current task handed in: the stages waiting for it may start (see lockedStages).
      handedIn: !override && open.length > 0 && open.every((t) => t.status === "submitted"),
      override: override ? { status: override.status, reason: override.reason, at: override.at } : null,
      taskId: shown ? idStr(shown._id) : null,
      number: shown?.number || null,
      revision: shown?.revision ?? null,
      assignee: shown ? idStr(shown.assignee) : null,
      count: list.length,
    };
    if (COMPLETE.includes(status)) complete += 1;
    // The stage's planned hours: those of its current tasks.
    hours[stage.key] = list.reduce((n, t) => n + (t.maxHours || t.estimatedHours || 0), 0);
  }
  // Cancelled stages are out of the project's scope.
  const counted = project.stages.filter((s) => cells[s.key].status !== "cancelled");
  const total = counted.length;
  // Progress weighs each stage by its hours (a stage with no hours yet counts as an
  // average one), so finishing a long stage moves it more than a short one.
  const known = Object.values(hours).filter((h) => h > 0);
  const average = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const weight = (key) => hours[key] || average;
  const all = counted.reduce((n, s) => n + weight(s.key), 0);
  const done = counted.filter((s) => COMPLETE.includes(cells[s.key].status)).reduce((n, s) => n + weight(s.key), 0);
  return { cells, progress: all ? done / all : 0, complete, total, locked: lockedStages(project, cells) };
}

// A stage stays locked until every stage it waits for is handed in for review or
// finished (approved, done or skipped). A rejection locks it again until the redo is
// handed in. A cancelled stage passes its own waits on: the stages after it wait for
// what it waited for.
export function lockedStages(project, cells) {
  const index = new Map(project.stages.map((s, i) => [s.key, i]));
  const released = (key, depth = 0) => {
    const cell = cells[key];
    if (COMPLETE.includes(cell?.status) || cell?.handedIn) return true;
    if (cell?.status === "cancelled" && index.has(key) && depth < 50) return stageAfter(project.stages, index.get(key)).every((k) => released(k, depth + 1));
    return false;
  };
  return project.stages
    .filter((stage, i) => stageAfter(project.stages, i).some((k) => !released(k)))
    .map((s) => s.key);
}
