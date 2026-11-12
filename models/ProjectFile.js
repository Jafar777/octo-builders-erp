import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// A project document kept by stage — a drawing, a render, a BOQ — with every version
// uploaded over time (the latest first on screen). Files live on ImageKit, or on the
// company file server when it's connected (version.server).
const ProjectFileSchema = new mongoose.Schema(
  {
    project: { type: ObjectId, ref: "WorkProject", required: true },
    stage: { type: String, default: "" }, // WorkProject.stages.key ("" = the whole project)
    name: { type: String, required: true },
    versions: [
      new mongoose.Schema(
        {
          n: { type: Number, required: true },
          url: { type: String, default: "" }, // ImageKit; "" when kept on the company server
          fileId: { type: String, default: "" },
          // Kept on the company file server instead: { vol, path } on the office share.
          server: { vol: { type: String, default: "" }, path: { type: String, default: "" } },
          fileName: { type: String, default: "" },
          size: { type: Number, default: 0 },
          note: { type: String, default: "" },
          by: { type: ObjectId, ref: "User" },
          at: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
    ],
    createdBy: { type: ObjectId, ref: "User" },
  },
  { timestamps: true }
);

ProjectFileSchema.index({ project: 1, stage: 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.ProjectFile) mongoose.deleteModel("ProjectFile");

export default mongoose.models.ProjectFile || mongoose.model("ProjectFile", ProjectFileSchema);
