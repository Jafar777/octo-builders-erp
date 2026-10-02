import mongoose from "mongoose";

const DepartmentSchema = new mongoose.Schema(
  {
    name: { ar: { type: String, default: "" }, en: { type: String, default: "" } },
    code: { type: String, default: "", trim: true },
    color: { type: String, default: "#f37b20" },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.Department || mongoose.model("Department", DepartmentSchema);
