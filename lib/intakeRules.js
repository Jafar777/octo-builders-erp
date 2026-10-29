// Rules of the new-project intake form (models/ProjectIntake). Pure functions (no
// database), shared by the API, the screens and the tests.

export const PROJECT_TYPES = ["developers", "interior", "technical"];
export const INTAKE_PRIORITIES = ["urgent", "medium", "normal"];
// The intake's priority → the project's.
export const PROJECT_PRIORITY = { urgent: "urgent", medium: "important", normal: "normal" };
export const REQUIREMENT_KEYS = ["style", "deliverables", "colorsMaterials", "floors", "currentIssues", "conditions", "priorities", "special", "other"];
export const DOC_KEYS = ["dwg", "pdf", "architectural", "electrical", "structural", "mechanical", "site_photos", "map_location", "survey", "media", "other"];
export const SCOPE_KEYS = ["architectural", "interior", "facades", "shop_drawings", "technical", "structural", "mep", "quantities", "render_3d", "electrical"];

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
