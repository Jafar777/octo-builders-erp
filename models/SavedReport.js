import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// A report someone built and kept (Reports page). Shared ones are listed for everyone
// with reports.build, but each person still only sees the rows their access allows.
const SavedReportSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    owner: { type: ObjectId, ref: "User", required: true },
    shared: { type: Boolean, default: false },
    config: { type: Object, default: {} },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.SavedReport) mongoose.deleteModel("SavedReport");

export default mongoose.models.SavedReport || mongoose.model("SavedReport", SavedReportSchema);
