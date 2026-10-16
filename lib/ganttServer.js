import { FINAL_STATUSES, finishTime, HOUR, makeCalendar, placeTask, taskSpan, workMsBetween } from "@/lib/gantt";
import { getSettings } from "@/lib/settings";
import { logActivity, publishTaskChange } from "@/lib/tasks";
import Task from "@/models/Task";

export async function getWorkCalendar() {
  return makeCalendar(await getSettings());
}

const idStr = (v) => (v ? v.toString() : null);

export const serializeMilestone = (m) => ({
  id: m._id.toString(),
  name: m.name,
  date: m.date,
  dependsOn: (m.dependsOn || []).map(idStr),
  doneAt: m.doneAt,
  baselineDate: m.baselineDate,
});

// After `rootIds` moved, pushes every not-started task that now starts before one
// of its predecessors finishes to the first working moment after them, keeping
// its working length, then does the same for their successors. Only pushes later,
// never pulls earlier. Returns the moved task documents.
export async function cascadeFrom(rootIds, cal, actor) {
  const moved = new Map();
  const queue = rootIds.map(idStr);
  for (let guard = 0; queue.length && guard < 1000; guard += 1) {
    const id = queue.shift();
    const successors = await Task.find({ dependsOn: id, status: "todo" });
    for (const task of successors) {
      const preds = await Task.find({ _id: { $in: task.dependsOn }, status: { $ne: "cancelled" } }).lean();
      if (!preds.length) continue;
      const ready = Math.max(...preds.map(finishTime));
      const span = taskSpan(task);
      if (span.start >= ready) continue;
      const length = workMsBetween(span.start, span.end, cal) || Math.max(task.estimatedHours || 0, 1) * HOUR;
      const next = placeTask(ready, length, cal);
      task.plannedStart = new Date(next.start);
      task.dueAt = new Date(next.end);
      task.dueReminderSent = false;
      task.overdueNotified = false;
      await task.save();
      await logActivity(task._id, actor, "rescheduled", "", { by: id });
      await publishTaskChange(task);
      moved.set(idStr(task._id), task);
      queue.push(idStr(task._id));
    }
  }
  return [...moved.values()].filter((t) => !FINAL_STATUSES.includes(t.status));
}
