import mongoose from "mongoose";

const { ObjectId, Mixed } = mongoose.Schema.Types;

// One upload of the old Excel program's Access file (lib/legacySync.js): what it added,
// and the tasks it changed as they were before.
const LegacyImportSchema = new mongoose.Schema({
  by: { type: ObjectId, ref: "User", required: true },
  at: { type: Date, default: Date.now },
  fileName: { type: String, default: "" },
  fileHash: { type: String, default: "" },
  rows: { type: Number, default: 0 },
  // The highest row ID seen: an older row missing here was deleted here.
  maxId: { type: Number, default: 0 },
  summary: { type: Mixed, default: {} },
  created: [{ type: ObjectId, ref: "Task" }],
  createdProjects: [{ type: ObjectId, ref: "WorkProject" }],
  createdUsers: [{ type: ObjectId, ref: "User" }],
  before: { type: [Mixed], default: [] },
});

LegacyImportSchema.index({ at: -1 });

export default mongoose.models.LegacyImport || mongoose.model("LegacyImport", LegacyImportSchema);
