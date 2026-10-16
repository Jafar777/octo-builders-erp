import { addWorkHours } from "@/lib/gantt";

// The scale a project uses, from settings.tasks.projectScales (or null).
export function projectScale(project, taskSettings) {
  if (!project?.scale) return null;
  return (taskSettings.projectScales || []).find((s) => s.key === project.scale) || null;
}

// Due date for a task of `maxHours` working hours starting at `from`.
export const scaledDue = (from, maxHours, cal) => new Date(addWorkHours(from.getTime ? from.getTime() : from, maxHours, cal));
