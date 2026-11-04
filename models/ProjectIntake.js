import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// A new-project intake form (استمارة مشروع جديد), filled by the secretary from the
// client's request. The GM / CEO add the money side (`finance`, visible only to them),
// then create the project from it (lib/intake). Statuses:
//   new        → handed in by the secretary, waiting for the GM / CEO
//   ready      → priced by the GM / CEO, can become a project
//   converting → a project is being created from it right now (a lock)
//   converted  → the project exists (`workProject`)
//   declined   → the GM / CEO won't take it (`declineReason`); can be reopened
export const INTAKE_STATUSES = ["new", "ready", "converting", "converted", "declined"];

const text = { type: String, default: "" };

const ProjectIntakeSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true, unique: true },
    status: { type: String, enum: INTAKE_STATUSES, default: "new" },

    client: {
      name: { type: String, required: true },
      number: text, // the client's own reference / ID
      contactMethod: text,
      phone: text,
      receivedAt: text, // YYYY-MM-DD: when the request came in
      requiredDelivery: text, // YYYY-MM-DD: the date the client asks for
    },
    project: {
      name: { type: String, required: true },
      location: text,
      area: text, // approximate area, as the client gives it
      expectedDelivery: text, // YYYY-MM-DD: our estimate
      types: [{ type: String }], // developers | interior | technical
      priority: { type: String, enum: ["urgent", "medium", "normal"], default: "normal" },
    },
    requirements: {
      style: text,
      deliverables: text,
      colorsMaterials: text,
      floors: text,
      currentIssues: text,
      conditions: text, // municipality / regulatory / technical
      priorities: text, // speed / quality / budget / luxury
      special: text,
      other: text,
    },
    documents: [{ type: String }], // received documents (lib/intake DOC_KEYS)
    documentsOther: text,
    scope: [{ type: String }], // the work asked for (lib/intake SCOPE_KEYS)
    summary: text,
    missing: [new mongoose.Schema({ item: text, responsible: text, status: text }, { _id: false })],

    // The money side: GM / CEO only (stripped from every response for anyone else).
    finance: {
      contractValue: { type: Number, default: null },
      currency: text,
      rate: { type: Number, default: null },
      budget: { type: Number, default: null }, // planned cost, base currency
      branch: { type: ObjectId, ref: "Branch", default: null },
      client: { type: ObjectId, ref: "Client", default: null }, // the finance client (else made from `client`)
      advancePaid: { type: Number, default: 0 },
      advanceDate: text,
      paymentTerms: text,
      notes: text,
      by: { type: ObjectId, ref: "User", default: null },
      at: { type: Date, default: null },
    },

    createdBy: { type: ObjectId, ref: "User", required: true },
    // The project set-up a department manager (or the CEO) asks for: template, stages,
    // hours, employees, reviews (the POST /api/work-projects body, never money). The
    // project only starts when the CEO accepts it.
    proposal: {
      body: { type: mongoose.Schema.Types.Mixed, default: null },
      by: { type: ObjectId, ref: "User", default: null },
      at: { type: Date, default: null },
    },
    workProject: { type: ObjectId, ref: "WorkProject", default: null }, // once converted
    convertedBy: { type: ObjectId, ref: "User", default: null },
    convertedAt: { type: Date, default: null },
    declineReason: text,
    declinedBy: { type: ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

ProjectIntakeSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.ProjectIntake || mongoose.model("ProjectIntake", ProjectIntakeSchema);
