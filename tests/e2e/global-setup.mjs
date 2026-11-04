import mongoose from "mongoose";
import { IDS, PROJECT_NAME } from "./fixtures.mjs";

// Wipes the test database and creates a CEO, an employee, a department and one project
// with three linked tasks on the Gantt. Refuses to run on a database whose name doesn't
// look like a test one.
export default async function globalSetup() {
  const uri = process.env.MONGODB_URI || "";
  const dbName = uri.split("?")[0].split("/").pop() || "";
  if (!/test|ci|e2e/i.test(dbName)) throw new Error(`Refusing to wipe a non-test database: ${dbName}`);
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  await db.dropDatabase();
  const oid = (s) => new mongoose.Types.ObjectId(s);
  const now = new Date();
  const day = 24 * 3600 * 1000;

  await db.collection("departments").insertOne({ _id: oid(IDS.department), code: "ID", name: { ar: "التصميم الداخلي", en: "Interior Design" }, color: "#f37b20" });
  await db.collection("users").insertMany([
    { _id: oid(IDS.ceo), email: "ceo@e2e.test", name: "E2E CEO", role: "ceo", status: "active", department: oid(IDS.department), createdAt: now },
    { _id: oid(IDS.employee), email: "employee@e2e.test", name: "E2E Designer", role: "staff", status: "active", department: oid(IDS.department), createdAt: now },
  ]);
  const stages = [
    { key: "cad", name: { ar: "CAD", en: "CAD" }, taskType: "cad" },
    { key: "max", name: { ar: "MAX", en: "MAX" }, taskType: "max" },
    { key: "render", name: { ar: "RENDER", en: "RENDER" }, taskType: "final_render" },
  ];
  await db.collection("workprojects").insertOne({
    _id: oid(IDS.project),
    code: "E2E-1",
    name: { ar: PROJECT_NAME, en: PROJECT_NAME },
    department: oid(IDS.department),
    status: "active",
    priority: "normal",
    flow: "ordered",
    stages,
    milestones: [],
    baselines: [],
    delays: [],
    startDate: now,
    dueDate: new Date(now.getTime() + 30 * day),
    createdBy: oid(IDS.ceo),
    createdAt: now,
    updatedAt: now,
  });
  const ids = ["650000000000000000000301", "650000000000000000000302", "650000000000000000000303"].map(oid);
  await db.collection("tasks").insertMany(
    stages.map((s, i) => ({
      _id: ids[i],
      number: 900001 + i,
      kind: "task",
      project: oid(IDS.project),
      stage: s.key,
      department: oid(IDS.department),
      type: s.taskType,
      assignee: oid(IDS.employee),
      createdBy: oid(IDS.ceo),
      status: "todo",
      priority: "normal",
      dependsOn: i ? [ids[i - 1]] : [],
      plannedStart: new Date(now.getTime() + i * 2 * day),
      dueAt: new Date(now.getTime() + (i * 2 + 1) * day),
      estimatedHours: 8,
      maxHours: 8,
      review: { manager: true, gm: false, customer: false },
      reviews: [],
      createdAt: now,
      updatedAt: now,
    }))
  );
  await mongoose.disconnect();
}
