import { expect, test } from "@playwright/test";
import { signInAs } from "./fixtures.mjs";

test("the CEO opens the permission matrix", async ({ page, context }) => {
  await signInAs(context, "ceo");
  await page.goto("/dashboard/roles?tab=matrix");
  await expect(page.getByRole("table")).toBeVisible();
});

test("an employee can't use the Roles API", async ({ page, context }) => {
  await signInAs(context, "employee");
  const res = await page.request.get("/api/access");
  expect(res.status()).toBe(403);
});

test("an employee can't read the system errors", async ({ page, context }) => {
  await signInAs(context, "employee");
  const res = await page.request.get("/api/system/errors");
  expect(res.status()).toBe(403);
});
