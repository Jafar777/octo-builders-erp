import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// Deleted items (lib/trash.js): a deleted project or task, with everything that belonged
// to it, kept as it was for 30 days so it can be restored, then erased by the daily job.
// `docs` holds the raw documents by collection name ({ workprojects: [...], tasks: [...] }).
const TrashSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["project", "task"], required: true },
    refId: { type: ObjectId, required: true }, // the deleted project / task
    label: { type: String, default: "" }, // its name, for the list
    counts: { type: mongoose.Schema.Types.Mixed, default: {} }, // { tasks: 12, files: 3 }
    docs: { type: mongoose.Schema.Types.Mixed, default: {} },
    deletedBy: { type: ObjectId, ref: "User", default: null },
    deletedAt: { type: Date, default: Date.now },
    purgeAt: { type: Date, required: true },
  },
  { minimize: false }
);

TrashSchema.index({ purgeAt: 1 });
TrashSchema.index({ refId: 1 });

export default mongoose.models.Trash || mongoose.model("Trash", TrashSchema);
