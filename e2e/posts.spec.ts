import { expect, test, type Browser, type Page } from "@playwright/test";

import { signIn } from "./support/sign-in";

// Seed data (supabase/seed.sql): Alice organizes the Lisbon trip, Bob is in
// it, and the founder is a moderator in no trip. Bob is also in Alice's
// Amalfi trip, which has 26 notes.
const LISBON = "/trips/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AMALFI = "/trips/cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** A signed-in page in its own browser context, recording any JS dialog. */
async function personaPage(browser: Browser, email: string, dialogs: string[]) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await signIn(page, email);
  await expect(page.getByRole("heading", { name: /^Hello, / })).toBeVisible();
  return page;
}

function noteFrom(page: Page, author: string, text: string) {
  return page.getByRole("article", { name: `Note from ${author}` }).filter({ hasText: text });
}

test("UAT-1 S6: a member posts, another reports it, and the founder takes it down", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString(36);
  // S6 step 4 rides along: markup in a note must show as text and never run.
  const text = `Lisbon plan ${suffix} <b>hi</b> <script>alert(1)</script>`;
  const dialogs: string[] = [];

  // Step 1: Bob pins a note.
  const bob = await personaPage(browser, "bob@example.com", dialogs);
  await bob.goto(LISBON);
  await bob.getByLabel("Write a trip note").fill(text);
  await bob.getByRole("button", { name: "Pin to trip" }).click();
  const bobsNote = noteFrom(bob, "Bob Okafor", suffix);
  await expect(bobsNote.getByText(text, { exact: true })).toBeVisible();
  await expect(bobsNote.locator("b, script")).toHaveCount(0);
  await expect(bob.getByLabel("Write a trip note")).toHaveValue("");

  // Alice sees it with Bob's name and the time, then reports it (step 2).
  const alice = await personaPage(browser, "alice@example.com", dialogs);
  await alice.goto(LISBON);
  const seenByAlice = noteFrom(alice, "Bob Okafor", suffix);
  await expect(seenByAlice.getByText(text, { exact: true })).toBeVisible();
  await expect(seenByAlice.getByText(/Today, \d{1,2}:\d{2}/)).toBeVisible();

  await seenByAlice.getByRole("button", { name: "Report Bob Okafor's note" }).click();
  const reportDialog = alice.getByRole("dialog", { name: "Report this note?" });
  await reportDialog.getByLabel("Harassment or threats").check();
  await reportDialog.getByLabel(/Anything to add/).fill(`E2E report ${suffix}`);
  await reportDialog.getByRole("button", { name: "Send report" }).click();
  const thanks = alice.getByRole("dialog", { name: "Thanks for telling us." });
  await expect(thanks.getByText("Bob Okafor won't be told who reported it.")).toBeVisible();
  await thanks.getByRole("button", { name: "Done" }).click();
  await expect(seenByAlice.getByText("Reported", { exact: true })).toBeVisible();

  // Bob isn't told anything.
  await bob.reload();
  await expect(bobsNote).toBeVisible();
  await expect(bobsNote.getByText(/report/i)).toHaveCount(0);

  // S6-N3: someone who isn't a moderator gets "not found".
  await alice.goto("/admin/reports");
  await expect(alice.getByRole("heading", { name: "Nothing here." })).toBeVisible();

  // Step 3: the founder finds the report from home and takes the note down.
  const founder = await personaPage(browser, "founder@example.com", dialogs);
  await founder.getByRole("link", { name: /^Reports/ }).click();
  await expect(founder).toHaveURL(/\/admin\/reports$/);
  const report = founder.getByRole("article").filter({ hasText: suffix });
  await expect(report.getByText(text, { exact: true })).toBeVisible();
  await expect(report.getByText("Lisbon long weekend")).toBeVisible();
  await expect(report.getByText(/Reported by Alice Moreno/)).toBeVisible();
  await expect(report.getByText(`E2E report ${suffix}`)).toBeVisible();
  await report.getByLabel(/Note for the record/).fill(`Taken down by E2E ${suffix}`);
  await report.getByRole("button", { name: "Take down Bob Okafor's note" }).click();
  await expect(founder.getByRole("article").filter({ hasText: suffix })).toHaveCount(0);
  await expect(
    founder.getByRole("listitem").filter({ hasText: `Taken down by E2E ${suffix}` }),
  ).toContainText("Resolved by @founder");

  // Bob still sees his note, marked; Alice no longer sees it.
  await bob.reload();
  await expect(bobsNote.getByText("Taken down", { exact: true })).toBeVisible();
  await alice.goto(LISBON);
  await expect(alice.getByRole("heading", { name: "Trip notes" })).toBeVisible();
  await expect(alice.getByText(suffix)).toHaveCount(0);

  // Only its author can delete it.
  await bobsNote.getByRole("button", { name: "Delete your note" }).click();
  await bob
    .getByRole("dialog", { name: "Delete this note?" })
    .getByRole("button", { name: "Delete note" })
    .click();
  await expect(bob.getByText(suffix)).toHaveCount(0);

  expect(dialogs).toEqual([]);
});

// S6-N9: a page this size once never updated after pinning or deleting in a
// production build (Next 16.2.4, tripplanner-tyl), while small pages did.
test("S6-N9: a member pins and deletes a note on a trip with 26 notes", async ({ browser }) => {
  test.setTimeout(60_000);
  const suffix = Date.now().toString(36);
  const text = `Amalfi plan ${suffix}`;
  const dialogs: string[] = [];

  const bob = await personaPage(browser, "bob@example.com", dialogs);
  await bob.goto(AMALFI);
  await expect(bob.getByRole("article").nth(25)).toBeVisible();

  await bob.getByLabel("Write a trip note").fill(text);
  await bob.getByRole("button", { name: "Pin to trip" }).click();
  const bobsNote = noteFrom(bob, "Bob Okafor", suffix);
  await expect(bobsNote.getByText(text, { exact: true })).toBeVisible();
  await expect(bob.getByLabel("Write a trip note")).toHaveValue("");

  await bobsNote.getByRole("button", { name: "Delete your note" }).click();
  await bob
    .getByRole("dialog", { name: "Delete this note?" })
    .getByRole("button", { name: "Delete note" })
    .click();
  await expect(bob.getByText(suffix)).toHaveCount(0);

  expect(dialogs).toEqual([]);
});
