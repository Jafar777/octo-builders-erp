import { ASSET_STATUSES, ASSET_TYPES } from "@/models/Asset";

const idStr = (v) => (v ? v.toString() : null);
const isObjectId = (v) => /^[a-f0-9]{24}$/i.test(String(v || ""));

export function serializeAsset(a, names, money) {
  return {
    id: idStr(a._id),
    tag: a.tag,
    name: a.name,
    type: a.type,
    serial: a.serial,
    holder: idStr(a.holder),
    holderName: names[idStr(a.holder)] || "",
    branch: idStr(a.branch),
    status: a.status,
    purchaseDate: a.purchaseDate,
    ...(money ? { cost: a.cost, currency: a.currency } : {}),
    licenseExpiry: a.licenseExpiry,
    notes: a.notes,
    history: (a.history || []).map((h) => ({ at: h.at, action: h.action, holderName: names[idStr(h.holder)] || "", by: names[idStr(h.by)] || "", note: h.note })),
  };
}

export function cleanAsset(b) {
  return {
    name: String(b.name || "").trim().slice(0, 200),
    type: ASSET_TYPES.includes(b.type) ? b.type : "other",
    serial: String(b.serial || "").trim().slice(0, 120),
    branch: isObjectId(b.branch) ? b.branch : null,
    status: ASSET_STATUSES.includes(b.status) ? b.status : undefined,
    purchaseDate: /^\d{4}-\d{2}-\d{2}$/.test(b.purchaseDate || "") ? b.purchaseDate : "",
    cost: Math.max(0, Number(b.cost) || 0),
    currency: String(b.currency || "").slice(0, 5),
    licenseExpiry: /^\d{4}-\d{2}-\d{2}$/.test(b.licenseExpiry || "") ? b.licenseExpiry : "",
    notes: String(b.notes || "").trim().slice(0, 1000),
  };
}

