// Rules of the new-project intake form (models/ProjectIntake). Pure functions (no
// database), shared by the API, the screens and the tests.

export const PROJECT_TYPES = ["developers", "interior", "technical"];
export const INTAKE_PRIORITIES = ["urgent", "medium", "normal"];
// The intake's priority → the project's.
export const PROJECT_PRIORITY = { urgent: "urgent", medium: "important", normal: "normal" };
export const REQUIREMENT_KEYS = ["style", "deliverables", "colorsMaterials", "floors", "perFloor", "spaces", "references", "floorsCeilings", "currentIssues", "conditions", "priorities", "special", "other"];
export const DOC_KEYS = ["dwg", "pdf", "architectural", "electrical", "structural", "mechanical", "site_photos", "map_location", "survey", "media", "other"];
export const SCOPE_KEYS = ["all", "architectural", "structural", "mechanical", "electrical", "quantities", "facades", "video", "interior", "mep", "shop_drawings", "technical", "render_3d"];

// The client's form (the Word file, two versions): the questions each project type asks.
// Several types: all their questions. Technical work keeps the general set.
export const REQUIREMENTS_BY_TYPE = {
  developers: ["style", "floors", "perFloor", "colorsMaterials", "currentIssues", "conditions", "special", "other"],
  interior: ["style", "spaces", "colorsMaterials", "references", "floorsCeilings", "special", "other"],
  technical: ["style", "deliverables", "floors", "currentIssues", "conditions", "priorities", "special", "other"],
};
const DOCS_BY_TYPE = {
  developers: DOC_KEYS,
  interior: ["dwg", "pdf", "architectural", "electrical", "structural", "mechanical", "media", "other"],
  technical: DOC_KEYS,
};
// The scope list of the form, in its order ("all" = the whole list).
export const SCOPE_FORM = ["all", "architectural", "structural", "mechanical", "electrical", "quantities", "facades", "video"];

const forTypes = (byType, all, types, keep) => {
  const chosen = (types || []).filter((t) => byType[t]);
  const wanted = new Set((chosen.length ? chosen : ["developers"]).flatMap((t) => byType[t]));
  // Anything already filled stays visible (an older form, a type changed later).
  for (const k of keep) wanted.add(k);
  return all.filter((k) => wanted.has(k));
};
// The requirement questions to show for these types (and any already answered).
export const requirementKeysFor = (types, values = {}) => forTypes(REQUIREMENTS_BY_TYPE, REQUIREMENT_KEYS, types, REQUIREMENT_KEYS.filter((k) => String(values?.[k] || "").trim()));
// The documents to show for these types (and any already ticked).
export const docKeysFor = (types, ticked = []) => forTypes(DOCS_BY_TYPE, DOC_KEYS, types, ticked);
// The scope choices: the form's list, and any older choice already ticked.
export const scopeKeysFor = (ticked = []) => SCOPE_KEYS.filter((k) => SCOPE_FORM.includes(k) || ticked.includes(k));

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, max = 1000) => String(v ?? "").trim().slice(0, max);
const date = (v) => {
  const s = str(v, 10);
  return DATE.test(s) && !Number.isNaN(Date.parse(s)) ? s : "";
};
const pick = (list, allowed) => [...new Set((Array.isArray(list) ? list : []).map(String))].filter((k) => allowed.includes(k));

// Everything the secretary fills in (never money). Returns { value } or { error }.
export function cleanIntake(body) {
  const b = body || {};
  const value = {
    client: {
      name: str(b.client?.name, 150),
      number: str(b.client?.number, 60),
      contactMethod: str(b.client?.contactMethod, 100),
      phone: str(b.client?.phone, 40),
      receivedAt: date(b.client?.receivedAt),
      requiredDelivery: date(b.client?.requiredDelivery),
    },
    project: {
      name: str(b.project?.name, 150),
      location: str(b.project?.location, 200),
      area: str(b.project?.area, 60),
      expectedDelivery: date(b.project?.expectedDelivery),
      types: pick(b.project?.types, PROJECT_TYPES),
      priority: INTAKE_PRIORITIES.includes(b.project?.priority) ? b.project.priority : "normal",
    },
    requirements: Object.fromEntries(REQUIREMENT_KEYS.map((k) => [k, str(b.requirements?.[k])])),
    documents: pick(b.documents, DOC_KEYS),
    documentsOther: str(b.documentsOther, 300),
    scope: pick(b.scope, SCOPE_KEYS),
    summary: str(b.summary, 4000),
    missing: (Array.isArray(b.missing) ? b.missing : [])
      .slice(0, 30)
      .map((m) => ({ item: str(m?.item, 200), responsible: str(m?.responsible, 100), status: str(m?.status, 100) }))
      .filter((m) => m.item),
  };
  if (!value.client.name) return { error: "intake_client_required" };
  if (!value.project.name) return { error: "intake_project_required" };
  return { value };
}

// The GM / CEO's money side. `money(amount, currency, rate)` validates an amount
// (lib/finance cleanMoney with the configured currencies). Branch / client ids are
// checked by the caller. Returns { value } or { error }.
export function cleanIntakeFinance(body, money) {
  const b = body || {};
  const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
  const contractValue = num(b.contractValue);
  if (contractValue === null || !Number.isFinite(contractValue) || contractValue < 0) return { error: "intake_contract_required" };
  const contract = money(contractValue, b.currency, b.rate);
  if (contract.error) return contract;
  const budget = num(b.budget);
  if (budget !== null && !(Number.isFinite(budget) && budget >= 0 && budget <= 1e11)) return { error: "invalid_amount" };
  const advancePaid = num(b.advancePaid) || 0;
  if (!(Number.isFinite(advancePaid) && advancePaid >= 0)) return { error: "invalid_amount" };
  if (advancePaid > contractValue) return { error: "intake_advance_too_high" };
  const advanceDate = date(b.advanceDate);
  if (advancePaid > 0 && !advanceDate) return { error: "invalid_date" };
  // Advance money goes into a branch fund.
  if (advancePaid > 0 && !b.branch) return { error: "branch_required" };
  // Payment stages: shares of the contract (%), 1–20 of them, adding up to 100% at most.
  const payments = (Array.isArray(b.payments) ? b.payments : []).map(Number).filter((p) => p !== 0);
  if (payments.length > 20 || payments.some((p) => !(Number.isFinite(p) && p > 0 && p <= 100))) return { error: "invalid_payments" };
  if (payments.reduce((s, p) => s + p, 0) > 100.001) return { error: "invalid_payments" };
  return {
    value: {
      contractValue,
      currency: contract.currency,
      rate: contract.rate,
      budget: budget === null ? null : Math.round(budget * 100) / 100,
      branch: b.branch || null,
      client: b.client || null,
      advancePaid,
      advanceDate: advancePaid > 0 ? advanceDate : "",
      paymentTerms: str(b.paymentTerms),
      payments: payments.map((p) => Math.round(p * 100) / 100),
      notes: str(b.notes),
    },
  };
}

// The project's notes from an intake: what the team needs to know, never money.
// `label(group, key)` gives the words for a key in the viewer's language.
export function intakeNotes(intake, label) {
  const lines = [];
  const add = (title, value) => value && lines.push(`${title}: ${value}`);
  add(label("field", "location"), intake.project?.location);
  add(label("field", "area"), intake.project?.area);
  add(label("field", "expectedDelivery"), intake.project?.expectedDelivery);
  add(label("field", "types"), (intake.project?.types || []).map((k) => label("type", k)).join("، "));
  for (const k of REQUIREMENT_KEYS) add(label("req", k), intake.requirements?.[k]);
  add(label("field", "scope"), (intake.scope || []).map((k) => label("scope", k)).join("، "));
  add(label("field", "documents"), [...(intake.documents || []).map((k) => label("doc", k)), intake.documentsOther].filter(Boolean).join("، "));
  for (const m of intake.missing || []) add(label("field", "missing"), [m.item, m.responsible, m.status].filter(Boolean).join(" — "));
  if (intake.summary) lines.push("", intake.summary);
  return lines.join("\n").slice(0, 4000);
}
