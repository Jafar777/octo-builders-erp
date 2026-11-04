import { cleanReviewFlags, pendingLevel, reviewPlan } from "../lib/reviewFlow.js";

let fails = 0;
const ok = (name, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${name} ${c ? "" : x}`); if (!c) fails++; };
const approve = (level, covers) => ({ level, covers: covers || [level], decision: "approve" });

// Order: department manager → GM / CEO → customer.
const all = { review: { manager: true, gm: true, customer: true }, reviews: [] };
ok("all three review in order", reviewPlan(all).join() === "manager,gm,customer", reviewPlan(all).join());
ok("the manager reviews first", pendingLevel(all) === "manager");
ok("then the GM", pendingLevel({ ...all, reviews: [approve("manager")] }) === "gm");
ok("then the customer", pendingLevel({ ...all, reviews: [approve("manager"), approve("gm")] }) === "customer");
ok("approved once every level approved", pendingLevel({ ...all, reviews: [approve("manager"), approve("gm"), approve("customer")] }) === null);
// The GM / CEO stepping in at the manager's level covers both internal levels.
ok("the GM stepping in covers both internal levels", pendingLevel({ ...all, reviews: [approve("manager", ["manager", "gm"])] }) === "customer");
// A rejection never counts as passing a level.
ok("a rejection doesn't pass a level", pendingLevel({ ...all, reviews: [{ level: "manager", covers: ["manager"], decision: "reject" }] }) === "manager");
// Only the chosen levels.
ok("customer only", pendingLevel({ review: { manager: false, gm: false, customer: true }, reviews: [] }) === "customer");
ok("GM only", reviewPlan({ review: { manager: false, gm: true, customer: false } }).join() === "gm");
// Older tasks: the department manager.
ok("older tasks wait for the manager", pendingLevel({ reviews: [] }) === "manager");
ok("nothing chosen falls back to the manager", reviewPlan({ review: { manager: false, gm: false, customer: false } }).join() === "manager");

// Validation from the forms.
// The department manager always reviews; the CEO only when the manager asks at review time.
const forced = cleanReviewFlags({ manager: false, gm: true, customer: false }).value;
ok("the department manager always reviews, the CEO isn't chosen up front", forced.manager === true && forced.gm === false);
// "Accept if the CEO accepts": the manager approved, now the CEO's turn; then the customer.
const asked = { review: { manager: true, gm: false, customer: true }, ceoApproval: true, reviews: [{ level: "manager", decision: "approve" }] };
ok("asking for the CEO adds the CEO after the manager", reviewPlan(asked).join() === "manager,gm,customer", reviewPlan(asked).join());
ok("after the manager's conditional accept it waits for the CEO", pendingLevel(asked) === "gm", pendingLevel(asked));
const plain = { review: { manager: true, gm: false, customer: false }, reviews: [{ level: "manager", decision: "approve" }] };
ok("a plain accept needs nobody else", pendingLevel(plain) === null);
ok("the customer review needs a customer", cleanReviewFlags({ customer: true }, { hasCustomer: false }).error === "customer_review_needs_customer");
ok("customer review with a customer", cleanReviewFlags({ customer: true }, { hasCustomer: true }).value?.customer === true);
ok("default is the manager", cleanReviewFlags(undefined).value.manager === true);

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
