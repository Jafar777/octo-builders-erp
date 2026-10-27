import { addWorkHours } from "@/lib/gantt";

// Due date for a task of `maxHours` working hours starting at `from`.
export const scaledDue = (from, maxHours, cal) => new Date(addWorkHours(from.getTime ? from.getTime() : from, maxHours, cal));
