import { expect, test } from "@playwright/test";

import { signInCodeFor } from "./support/mailpit";

test("a new tester signs in, onboards, follows someone and plans a trip", async ({
  browser,
  page,
}) => {
  const suffix = Date.now().toString(36);
  const email = `e2e-${suffix}@example.com`;

  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await page.getByLabel("Code").fill(await signInCodeFor(email));
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/onboarding\/handle/);
  // By role: the "Handle preview" region also matches getByLabel("Handle"),
  // and each field's label includes its hint text.
  await page.getByRole("textbox", { name: /^Handle/ }).fill(`e2e_${suffix}`);
  await page.getByRole("textbox", { name: /^Display name/ }).fill("E2E Tester");
  await page.getByLabel(/I have read and agree/).check();
  await page.getByRole("button", { name: "Mail it" }).click();

  await expect(page.getByRole("heading", { name: "Hello, E2E Tester" })).toBeVisible();

  const follow = page.getByRole("button", { name: /^Follow @/ }).first();
  const handle = (await follow.getAttribute("aria-label"))?.match(/@(\w+)/)?.[1];
  await follow.click();
  await expect(
    page.getByRole("button", { name: `Following @${handle}. Activate to unfollow.` }),
  ).toBeVisible();

  // UAT-1 S2: plan a trip, open it, edit it, find it from home, delete it.
  await page.getByRole("link", { name: "Plan a trip" }).click();
  await expect(page).toHaveURL(/\/trips\/new$/);
  await page.getByLabel("Trip name").fill(`Lisbon ${suffix}`);
  await page.getByLabel("Starts").fill("2026-12-04");
  await page.getByLabel("Ends").fill("2026-12-07");
  await page.getByLabel("Currency").selectOption("EUR");
  await page.getByRole("button", { name: "Create trip" }).click();

  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
  const tripUrl = page.url();
  await expect(page.getByRole("heading", { level: 1, name: `Lisbon ${suffix}` })).toBeVisible();
  await expect(page.getByText(/^Private trip · EUR$/)).toBeVisible();
  await expect(page.getByText(/^Dec 4\s–\s7, 2026$/)).toBeVisible();
  await expect(page.getByText("Organizer", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Edit trip" }).click();
  await page.getByLabel("Trip name").fill(`Porto ${suffix}`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(tripUrl);
  await expect(page.getByRole("heading", { level: 1, name: `Porto ${suffix}` })).toBeVisible();

  await page.getByRole("link", { name: "Your trips" }).click();
  await page.getByRole("link", { name: new RegExp(`Porto ${suffix}`) }).click();
  await expect(page).toHaveURL(tripUrl);

  // S2-N2: signed out, the link goes to sign-in and shows nothing of the trip.
  const signedOut = await browser.newContext();
  const outsider = await signedOut.newPage();
  await outsider.goto(tripUrl);
  await expect(outsider).toHaveURL(/\/auth\/sign-in\?next=%2Ftrips%2F/);
  await expect(outsider.getByText(`Porto ${suffix}`)).toHaveCount(0);
  await signedOut.close();

  await page.getByRole("button", { name: "Delete trip" }).click();
  await page
    .getByRole("dialog", { name: `Delete Porto ${suffix}?` })
    .getByRole("button", { name: "Delete trip" })
    .click();
  await expect(page.getByRole("heading", { name: "Hello, E2E Tester" })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`Porto ${suffix}`) })).toHaveCount(0);

  await page.goto(tripUrl);
  await expect(page.getByRole("heading", { name: "Nothing here." })).toBeVisible();
});
