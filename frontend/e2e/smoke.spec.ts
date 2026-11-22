/**
 * Smoke tests against mock mode (recorded backend responses and replayed WebSocket messages).
 * `pnpm e2e` builds the mock bundle, serves it on :4173 and runs these with the installed Chrome.
 */
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, role: "Operations" | "Compute buyer" | "Host business") {
  await page.addInitScript(() => sessionStorage.setItem("dh.intro", "1")); // skip the intro flight
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(role) }).click();
}

test("each role lands in its own experience", async ({ page }) => {
  await login(page, "Operations");
  await expect(page).toHaveURL(/\/ops$/);
  await expect(page.getByText("OPERATIONS CONSOLE")).toBeVisible();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();

  await login(page, "Compute buyer");
  await expect(page).toHaveURL(/\/compute$/);
  await expect(page.getByRole("heading", { name: /ACME AI/ })).toBeVisible();

  await page.goto("/ops");
  await expect(page.getByText("This area is for another role")).toBeVisible();
});

test("fleet map renders, a site opens its drawer, and a replayed migration draws an arc", async ({ page }) => {
  await login(page, "Operations");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  const site = page.getByRole("button", { name: /^Hallenbad Gundeli, Indoor pool/ });
  await expect(site).toBeVisible();
  await site.click();
  await expect(page.getByRole("dialog", { name: "Site Hallenbad Gundeli" })).toBeVisible();
  await expect(page).toHaveURL(/site=H1/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Site Hallenbad Gundeli" })).toBeHidden();
  // the replay pushes task.migrated between sites within a few 5-second slots
  await expect.poll(async () => Number((await page.locator("[data-arcs]").getAttribute("data-arcs")) ?? 0), { timeout: 45_000 }).toBeGreaterThan(0);
});

test("the map has a list alternative", async ({ page }) => {
  await login(page, "Operations");
  await page.getByRole("button", { name: "View as list" }).click();
  await expect(page.getByRole("table", { name: "Sites of the fleet" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Wohnblock Matthäus/ })).toBeVisible();
});

test("host business sees a plain-language status sentence", async ({ page }) => {
  await login(page, "Host business");
  await expect(page).toHaveURL(/\/host$/);
  await expect(page.getByText(/hot water|backup heater|tank/i).first()).toBeVisible();
  await expect(page.getByText(/household|homeowner/i)).toHaveCount(0);
});

test("job submission validates and posts", async ({ page }) => {
  await login(page, "Compute buyer");
  await page.goto("/compute/submit");
  const name = page.getByLabel("Job name");
  await name.fill("");
  await page.getByRole("button", { name: "Submit job" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await name.fill("Embed contract archive");
  await page.getByRole("button", { name: "Submit job" }).click();
  await expect(page).toHaveURL(/\/compute\/jobs\?job=/);
});
