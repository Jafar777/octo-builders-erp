import { expect, test } from "@playwright/test";
import { PROJECT_NAME, signInAs } from "./fixtures.mjs";

// The Gantt is the company's most important screen: these run before every release.

test("the CEO sees the project and its tasks on the Gantt", async ({ page, context }) => {
  await signInAs(context, "ceo");
  await page.goto("/dashboard/projects");
  await expect(page.getByText(PROJECT_NAME).first()).toBeVisible();
  // One bar per stage: each bar's title holds its task number.
  await expect(page.locator('[title*="900001"]').first()).toBeVisible();
  await expect(page.locator('[title*="900003"]').first()).toBeVisible();
});

test("the CEO opens a task's schedule from its bar", async ({ page, context }) => {
  await signInAs(context, "ceo");
  await page.goto("/dashboard/projects");
  const bar = page.locator('[title*="900002"]').first();
  await expect(bar).toBeVisible();
  await bar.click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("an employee doesn't get the Gantt", async ({ page, context }) => {
  await signInAs(context, "employee");
  await page.goto("/dashboard/projects");
  await expect(page.locator('[title*="900001"]')).toHaveCount(0);
});

test("the timeline API refuses employees", async ({ page, context }) => {
  await signInAs(context, "employee");
  const res = await page.request.get("/api/work-projects/timeline");
  expect(res.status()).toBe(403);
});
