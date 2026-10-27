// The order of a project's stages: each stage lists the earlier stages it waits for
// (`after`, by stage key). Several stages can wait for one stage, and one stage can
// wait for several. A stage only waits for stages above it, so there are no loops.
// Older projects only had `waitForPrevious` (= wait for every earlier stage).
// Pure functions, shared by the browser and the server.

// The keys `stages[i]` waits for.
export function stageAfter(stages, i) {
  const stage = stages[i];
  if (Array.isArray(stage?.after)) return stage.after;
  return i > 0 && stage?.waitForPrevious ? stages.slice(0, i).map((s) => s.key) : [];
}

// Keeps only waits on earlier stages (once each), and sets `waitForPrevious` to
// "waits for something", which the rest of the system reads.
export function cleanAfter(stages) {
  const raw = stages.map((_, i) => stageAfter(stages, i));
  return stages.map((s, i) => {
    const earlier = new Set(stages.slice(0, i).map((x) => x.key));
    const after = [...new Set(raw[i].map(String))].filter((k) => earlier.has(k));
    return { ...s, after, waitForPrevious: after.length > 0 };
  });
}

// Presets: one after the other, or all at once.
export const stepByStep = (stages) => stages.map((s, i) => ({ ...s, after: i ? [stages[i - 1].key] : [], waitForPrevious: i > 0 }));
export const allAtOnce = (stages) => stages.map((s) => ({ ...s, after: [], waitForPrevious: false }));

// The project type shown on badges: "ordered" (a single chain), "random" (no waits)
// or "mixed" (anything else).
export function flowOf(stages) {
  const after = stages.map((_, i) => stageAfter(stages, i));
  if (after.every((a) => !a.length)) return "random";
  if (after.every((a, i) => (i === 0 ? !a.length : a.length === 1 && a[0] === stages[i - 1].key))) return "ordered";
  return "mixed";
}

// Moves the stage at `from` to `to`; waits that would now point to a later stage are dropped.
export function moveStage(stages, from, to) {
  if (to < 0 || to >= stages.length || from === to) return stages;
  const next = stages.map((s, i) => ({ ...s, after: stageAfter(stages, i) }));
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return cleanAfter(next);
}

// Column of each stage in the flow diagram: 0 for stages that wait for nothing,
// otherwise one more than the furthest stage they wait for. { key: column }
export function stageColumns(stages) {
  const col = {};
  stages.forEach((s, i) => {
    const after = stageAfter(stages, i);
    col[s.key] = after.length ? Math.max(...after.map((k) => col[k] ?? 0)) + 1 : 0;
  });
  return col;
}
