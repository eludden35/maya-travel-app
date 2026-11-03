import { devices, expect, test, type Page } from "@playwright/test";

import { signInCodeFor } from "./support/mailpit";

/** Sign in with an emailed code, starting from the email step. */
async function signInWithCode(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.getByLabel("Code").fill(await signInCodeFor(email));
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function onboard(page: Page, handle: string, displayName: string) {
  await expect(page).toHaveURL(/\/onboarding\/handle/);
  await page.getByRole("textbox", { name: /^Handle/ }).fill(handle);
  await page.getByRole("textbox", { name: /^Display name/ }).fill(displayName);
  await page.getByLabel(/I have read and agree/).check();
  await page.getByRole("button", { name: "Mail it" }).click();
}

// UAT-1 S3, with S2 steps 3-4 and S7 step 6: the organizer makes a link, a
// friend whose email isn't on the allow-list joins from it on another phone,
// and a replaced or turned-off link stops working.
test("a friend joins a trip from its invite link", async ({ browser, page }) => {
  const suffix = Date.now().toString(36);
  const tripName = `Porto ${suffix}`;

  await page.goto("/auth/sign-in");
  await signInWithCode(page, `org-${suffix}@example.com`);
  await onboard(page, `org_${suffix}`, "Olive Organizer");
  await expect(page.getByRole("heading", { name: "Hello, Olive Organizer" })).toBeVisible();

  await page.getByRole("link", { name: "Plan a trip" }).click();
  await page.getByLabel("Trip name").fill(tripName);
  await page.getByLabel("Starts").fill("2026-12-04");
  await page.getByLabel("Ends").fill("2026-12-07");
  await page.getByRole("button", { name: "Create trip" }).click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
  const tripUrl = page.url();

  // The founder's defaults: a week and 10 people (test plan §12 Q6).
  await expect(page.getByLabel("Works for")).toHaveValue("7");
  await expect(page.getByLabel("Lets in")).toHaveValue("10");
  await page.getByRole("button", { name: "Create invite link" }).click();
  const linkField = page.getByLabel("Invite link");
  await expect(linkField).toHaveValue(/\/join\/[A-Za-z0-9_-]{22}$/);
  const link = await linkField.inputValue();
  await expect(page.getByText("Expires in 7 days · 0 of 10 joined")).toBeVisible();

  // Copy is the fallback where the browser has no share sheet.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByText("Link copied.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

  // A friend opens the link: the preview, and the token leaves the URL.
  const friendContext = await browser.newContext({ ...devices["Pixel 7"] });
  const friend = await friendContext.newPage();
  await friend.goto(link);
  await expect(friend).toHaveURL(/\/join$/);
  await expect(friend).toHaveTitle("You're invited · Jettison");
  await expect(friend.getByRole("heading", { level: 1, name: tripName })).toBeVisible();
  await expect(friend.getByText(/^Dec 4\s–\s7, 2026$/)).toBeVisible();
  await expect(friend.getByText("Olive Organizer")).toBeVisible();
  await expect(friend.getByText(/1\s+person is going so far/)).toBeVisible();
  await expect(friend.getByText(/@example/)).toHaveCount(0);
  const inviteCookie = (await friendContext.cookies()).find(
    (cookie) => cookie.name === "jtsn_invite",
  );
  expect(inviteCookie?.httpOnly).toBe(true);

  // Sign in with a code and onboard, although the email isn't allow-listed.
  await friend.getByRole("link", { name: "Join trip" }).click();
  await expect(friend).toHaveURL(/\/auth\/sign-in\?next=%2Fjoin$/);
  await signInWithCode(friend, `friend-${suffix}@example.org`);
  await expect(
    friend.getByText(`Then you're in ${tripName}, with Olive Organizer.`),
  ).toBeVisible();
  await onboard(friend, `friend_${suffix}`, "Fran Friend");

  await expect(friend).toHaveURL(tripUrl);
  await expect(friend.getByRole("heading", { name: /Who.s going · 2/ })).toBeVisible();
  expect(
    (await friendContext.cookies()).some((cookie) => cookie.name === "jtsn_invite"),
  ).toBe(false);
  // S3-N4: members get no invite controls and never see the link.
  await expect(friend.getByText("Invite people")).toHaveCount(0);
  await expect(friend.getByLabel("Invite link")).toHaveCount(0);

  // S3 step 3: the organizer sees them, and the link counts one use.
  await page.reload();
  await expect(page.getByText("Fran Friend")).toBeVisible();
  await expect(page.getByText("Expires in 7 days · 1 of 10 joined")).toBeVisible();

  // S3 step 5: opening the link again goes straight to the trip.
  await friend.goto(link);
  await expect(friend).toHaveURL(tripUrl);

  // S2 step 4, S7 step 6: a new link; the old one stops working.
  await page.getByRole("button", { name: "New link", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Make a new link?" })
    .getByRole("button", { name: "Make new link" })
    .click();
  await expect(linkField).not.toHaveValue(link);
  await expect(page.getByText("Expires in 7 days · 0 of 10 joined")).toBeVisible();
  const newLink = await linkField.inputValue();

  const strangerContext = await browser.newContext({ ...devices["Pixel 7"] });
  const stranger = await strangerContext.newPage();
  await stranger.goto(link);
  await expect(
    stranger.getByRole("heading", { name: "This invite no longer works." }),
  ).toBeVisible();
  await expect(stranger.getByText(tripName)).toHaveCount(0);

  // Turning a link off: same answer, and the organizer can make another.
  await page.getByRole("button", { name: "Turn off link" }).click();
  await page
    .getByRole("dialog", { name: "Turn off this link?" })
    .getByRole("button", { name: "Turn off link" })
    .click();
  await expect(page.getByText("Your last link is turned off.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create invite link" })).toBeVisible();
  await stranger.goto(newLink);
  await expect(
    stranger.getByRole("heading", { name: "This invite no longer works." }),
  ).toBeVisible();

  await friendContext.close();
  await strangerContext.close();
});
