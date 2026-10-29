import { cleanIntake, cleanIntakeFinance, intakeNotes, PROJECT_PRIORITY } from "../lib/intakeRules.js";

let fails = 0;
const ok = (name, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${name} ${c ? "" : x}`); if (!c) fails++; };

// The secretary's part.
const form = {
  client: { name: " Ahmad ", phone: "0559", receivedAt: "2026-10-29", requiredDelivery: "not a date" },
  project: { name: "Villa", types: ["interior", "bogus"], priority: "urgent" },
  requirements: { style: "Modern", hacked: "x" },
  documents: ["dwg", "pdf", "nope"],
  scope: ["interior", "render_3d", "x"],
  missing: [{ item: "Survey", responsible: "Client" }, { item: "" }],
  // Money sent by someone who shouldn't: it's never part of the form.
  finance: { contractValue: 99999 },
  contractValue: 5,
};
const c = cleanIntake(form);
ok("valid form", !c.error, c.error);
ok("text is trimmed", c.value.client.name === "Ahmad");
ok("bad dates are dropped", c.value.client.requiredDelivery === "" && c.value.client.receivedAt === "2026-10-29");
ok("only known types, documents and scope", c.value.project.types.join() === "interior" && c.value.documents.join() === "dwg,pdf" && c.value.scope.join() === "interior,render_3d");
ok("unknown requirement keys dropped", !("hacked" in c.value.requirements) && c.value.requirements.style === "Modern");
ok("empty missing rows dropped", c.value.missing.length === 1);
ok("money is never part of the secretary's form", !("finance" in c.value) && !("contractValue" in c.value));
ok("client name required", cleanIntake({ project: { name: "x" } }).error === "intake_client_required");
ok("project name required", cleanIntake({ client: { name: "x" } }).error === "intake_project_required");
ok("priority maps to the project's", PROJECT_PRIORITY.medium === "important" && PROJECT_PRIORITY.urgent === "urgent");

// The GM / CEO's money side.
const money = (amount, currency) => (["USD", "SAR"].includes(currency || "USD") ? { amount, currency: currency || "USD", rate: currency === "SAR" ? 3.8 : 1 } : { error: "invalid_currency" });
ok("contract value required", cleanIntakeFinance({}, money).error === "intake_contract_required");
ok("zero contract allowed", !cleanIntakeFinance({ contractValue: 0 }, money).error);
ok("negative contract refused", cleanIntakeFinance({ contractValue: -5 }, money).error === "intake_contract_required");
ok("unknown currency refused", cleanIntakeFinance({ contractValue: 10, currency: "EUR" }, money).error === "invalid_currency");
ok("advance needs a branch", cleanIntakeFinance({ contractValue: 100, advancePaid: 10, advanceDate: "2026-10-29" }, money).error === "branch_required");
ok("advance needs a date", cleanIntakeFinance({ contractValue: 100, advancePaid: 10, branch: "b" }, money).error === "invalid_date");
ok("advance can't exceed the contract", cleanIntakeFinance({ contractValue: 100, advancePaid: 200, branch: "b", advanceDate: "2026-10-29" }, money).error === "intake_advance_too_high");
const f = cleanIntakeFinance({ contractValue: "5000", currency: "SAR", budget: "1200.555", branch: "b", advancePaid: "1000", advanceDate: "2026-10-29" }, money);
ok("valid money side", !f.error && f.value.contractValue === 5000 && f.value.rate === 3.8 && f.value.budget === 1200.56 && f.value.advancePaid === 1000, JSON.stringify(f));

// Project notes: the team's view, never money.
const notes = intakeNotes({ ...c.value, finance: { contractValue: 99999 } }, (group, key) => `${group}.${key}`);
ok("notes carry the requirements and scope", notes.includes("req.style: Modern") && notes.includes("scope.render_3d"));
ok("notes never carry money", !notes.includes("99999"));

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
