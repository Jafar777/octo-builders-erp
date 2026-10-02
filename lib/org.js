import Department from "@/models/Department";
import Branch from "@/models/Branch";
import JobTitle from "@/models/JobTitle";
import User from "@/models/User";
import { bilingual } from "@/lib/apiUtils";

const cleanName = (body) => ({ name: bilingual(body.name, 80) });
const cleanActive = (body) => (typeof body.active === "boolean" ? { active: body.active } : {});

// The three organisation lists share one API (/api/org/<type>); each entry says how
// to read the editable fields from a request body and which user field points to it.
export const ORG_TYPES = {
  departments: {
    Model: Department,
    userField: "department",
    sort: { order: 1, createdAt: 1 },
    clean: (body) => ({
      ...cleanName(body),
      ...cleanActive(body),
      code: String(body.code || "").trim().toUpperCase().slice(0, 10),
      color: /^#[0-9a-f]{6}$/i.test(body.color || "") ? body.color : "#f37b20",
      ...(Number.isFinite(body.order) ? { order: body.order } : {}),
    }),
  },
  branches: {
    Model: Branch,
    userField: "branch",
    sort: { createdAt: 1 },
    clean: (body) => ({
      ...cleanName(body),
      ...cleanActive(body),
      code: String(body.code || "").trim().toUpperCase().slice(0, 10),
      currency: String(body.currency || "USD").trim().toUpperCase().slice(0, 5),
      timezone: String(body.timezone || "Asia/Riyadh").trim().slice(0, 60),
    }),
  },
  jobTitles: {
    Model: JobTitle,
    userField: "jobTitle",
    sort: { createdAt: 1 },
    clean: (body) => ({ ...cleanName(body), ...cleanActive(body) }),
  },
};

export function serializeOrgItem(doc) {
  const { _id, __v, createdAt, updatedAt, ...rest } = doc;
  return { id: _id.toString(), ...rest };
}

export async function loadOrg() {
  const entries = await Promise.all(
    Object.entries(ORG_TYPES).map(async ([type, { Model, sort }]) => [
      type,
      (await Model.find().sort(sort).lean()).map(serializeOrgItem),
    ])
  );
  return Object.fromEntries(entries);
}

export async function orgItemInUse(type, id) {
  return Boolean(await User.exists({ [ORG_TYPES[type].userField]: id }));
}
