import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { signInCodeFor } from "./support/mailpit";
import { signIn } from "./support/sign-in";

// Seed data (supabase/seed.sql): Alice organizes the public Joshua Tree trip,
// which Bob isn't in, and the Amalfi trip, which Bob is in, with 36 costs.
const JOSHUA_TREE = "/trips/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AMALFI = "/trips/cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const OLIVE = "Olive Organizer";
const BEN = "Ben Bridge";
const CLEO = "Cleo Cross";
const DREW = "Drew Dunes";

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

/** Someone new, on their own phone, who joins from the invite link. */
async function joinFromLink(
  browser: Browser,
  contexts: BrowserContext[],
  link: string,
  tripUrl: string,
  id: string,
  name: string,
): Promise<Page> {
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(link);
  await page.getByRole("link", { name: "Join trip" }).click();
  await signInWithCode(page, `${id}@example.org`);
  await onboard(page, id, name);
  await expect(page).toHaveURL(tripUrl);
  return page;
}

type Cost = {
  description: string;
  amount: string;
  payer?: string;
  exact?: Record<string, string>;
};

async function fillCost(page: Page, cost: Cost) {
  const sheet = page.getByRole("dialog", { name: "Add a cost" });
  await sheet.getByLabel("What was it?").fill(cost.description);
  await sheet.getByLabel(/^How much/).fill(cost.amount);
  if (cost.payer) {
    await sheet.getByLabel("Who paid?").selectOption({ label: cost.payer });
  }
  if (cost.exact) {
    await sheet.getByText("Exact amounts", { exact: true }).click();
    for (const [label, value] of Object.entries(cost.exact)) {
      await sheet.getByLabel(label, { exact: true }).fill(value);
    }
  }
  return sheet;
}

async function addCost(page: Page, cost: Cost) {
  await page.getByRole("button", { name: "Add a cost" }).click();
  const sheet = await fillCost(page, cost);
  await sheet.getByRole("button", { name: "Add cost" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(costCard(page, cost.description).first()).toBeVisible();
}

function costCard(page: Page, description: string) {
  return page.getByRole("article", { name: `Cost: ${description}` });
}

async function deleteCost(page: Page, description: string) {
  const before = await costCard(page, description).count();
  await costCard(page, description)
    .first()
    .getByRole("button", { name: `Delete ${description}` })
    .click();
  const dialog = page.getByRole("dialog", { name: `Delete ${description}?` });
  await expect(dialog.getByText("It comes off everyone's balance.", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Delete cost" }).click();
  await expect(costCard(page, description)).toHaveCount(before - 1);
}

/** A whole row: the name, the word under it, and the signed amount. */
function balanceRow(page: Page, name: string) {
  return page.locator("#balances dl > div").filter({ hasText: name });
}

async function expectBalance(page: Page, name: string, word: string, amount: string) {
  const row = balanceRow(page, name);
  await expect(row).toContainText(word);
  await expect(row).toContainText(amount);
}

async function markSuggested(page: Page, buttonName: string) {
  await page.getByRole("button", { name: buttonName }).click();
  const sheet = page.getByRole("dialog", { name: "Mark as paid" });
  await sheet.getByRole("button", { name: "Mark as paid" }).click();
  await expect(sheet).toHaveCount(0);
}

async function voidPayment(page: Page, buttonName: string) {
  await page.getByRole("button", { name: buttonName }).click();
  await page
    .getByRole("dialog", { name: "Void this payment?" })
    .getByRole("button", { name: "Void payment" })
    .click();
  await expect(page.getByRole("button", { name: buttonName })).toHaveCount(0);
}

// UAT-1 S4, S5 and S7, through the real UI on phones: create a trip, invite,
// join, costs, balances, mark as paid, void, and the balance rule for leaving.
test("UAT-1 S4, S5, S7: a group splits costs, settles up and leaves", async ({
  browser,
  page: olive,
}) => {
  test.setTimeout(360_000);
  const suffix = Date.now().toString(36);
  const tripName = `Porto ${suffix}`;
  const contexts: BrowserContext[] = [];

  await olive.goto("/auth/sign-in");
  await signInWithCode(olive, `olive-${suffix}@example.com`);
  await onboard(olive, `olive_${suffix}`, OLIVE);
  await olive.getByRole("link", { name: "Plan a trip" }).click();
  await olive.getByLabel("Trip name").fill(tripName);
  await olive.getByRole("button", { name: "Create trip" }).click();
  await expect(olive).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
  const tripUrl = olive.url();

  // Before any costs, the warm empty state.
  await expect(olive.getByText("No costs yet.")).toBeVisible();
  await expect(olive.getByText("Nothing to settle yet.", { exact: false })).toBeVisible();

  await olive.getByRole("button", { name: "Create invite link" }).click();
  const linkField = olive.getByLabel("Invite link");
  await expect(linkField).toHaveValue(/\/join\//);
  const link = await linkField.inputValue();

  const ben = await joinFromLink(browser, contexts, link, tripUrl, `ben_${suffix}`, BEN);
  const cleo = await joinFromLink(browser, contexts, link, tripUrl, `cleo_${suffix}`, CLEO);
  await olive.reload();

  // S4 step 1: the preview shows the odd cent, and the payer takes it.
  await olive.getByRole("button", { name: "Add a cost" }).click();
  const preview = await fillCost(olive, { description: "Deposit", amount: "100" });
  await expect(preview.getByText("$0.01 won't split evenly, so the extra goes to you.")).toBeVisible();
  await expect(preview.locator("label").filter({ hasText: BEN })).toContainText("$33.33");
  await preview.getByRole("button", { name: "Add cost" }).click();
  await expect(preview).toHaveCount(0);
  const deposit = costCard(olive, "Deposit");
  await expect(deposit).toContainText("$100.00");
  await expect(deposit.locator("dl > div").filter({ hasText: "You" })).toContainText("$33.34");
  await expect(deposit.locator("dl > div").filter({ hasText: BEN })).toContainText("$33.33");
  await expect(deposit.locator("dl > div").filter({ hasText: CLEO })).toContainText("$33.33");

  // S4-N1 and the amount refusals: nothing is rounded, and nothing saves.
  await olive.getByRole("button", { name: "Add a cost" }).click();
  let sheet = await fillCost(olive, { description: "Bad", amount: "12.345" });
  await sheet.getByRole("button", { name: "Add cost" }).click();
  await expect(sheet.getByText("Two decimals at most, like 12.34.")).toBeVisible();
  await sheet.getByLabel(/^How much/).fill("0");
  await sheet.getByRole("button", { name: "Add cost" }).click();
  await expect(sheet.getByText("Enter an amount above zero.")).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);

  // S4 steps 2-3: the same shares again, then a delete that asks first.
  await addCost(olive, { description: "Deposit", amount: "100" });
  await expect(costCard(olive, "Deposit")).toHaveCount(2);
  await expect(
    costCard(olive, "Deposit").first().locator("dl > div").filter({ hasText: "You" }),
  ).toContainText("$33.34");
  await deleteCost(olive, "Deposit");

  // S4 steps 4-6: an exact split has to add up before it can be sent.
  await ben.reload();
  await ben.getByRole("button", { name: "Add a cost" }).click();
  sheet = await fillCost(ben, {
    description: "Dinner",
    amount: "90",
    exact: {
      "Your share": "30",
      [`${OLIVE}'s share`]: "30",
      [`${CLEO}'s share`]: "20",
    },
  });
  await expect(sheet.getByText("$10.00 still unassigned.", { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Add cost" }).click();
  await expect(sheet.getByRole("alert")).toHaveText(
    "$10.00 still unassigned. Shares have to add up to $90.00.",
  );
  await sheet.getByLabel(`${CLEO}'s share`, { exact: true }).fill("40");
  await expect(sheet.getByText("$10.00 over.", { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Add cost" }).click();
  await expect(sheet.getByRole("alert")).toHaveText(
    "$10.00 over. Shares have to add up to $90.00.",
  );
  await sheet.getByLabel(`${CLEO}'s share`, { exact: true }).fill("30");
  await expect(sheet.getByText("Adds up to $90.00.")).toBeVisible();
  await sheet.getByRole("button", { name: "Add cost" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(costCard(ben, "Dinner")).toContainText("exact amounts");

  // S4-N5: Cleo didn't pay for or add it, and doesn't organize.
  await cleo.reload();
  await expect(costCard(cleo, "Dinner")).toBeVisible();
  await expect(costCard(cleo, "Dinner").getByRole("button")).toHaveCount(0);

  // S4 step 7: an edit recomputes the shares.
  await olive.reload();
  await costCard(olive, "Deposit").getByRole("button", { name: "Edit Deposit" }).click();
  const edit = olive.getByRole("dialog", { name: "Edit this cost" });
  await expect(edit.getByLabel(/^How much/)).toHaveValue("100.00");
  await edit.getByLabel(/^How much/).fill("120");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).toHaveCount(0);
  await expect(costCard(olive, "Deposit")).toContainText("$120.00");
  await expect(
    costCard(olive, "Deposit").locator("dl > div").filter({ hasText: BEN }),
  ).toContainText("$40.00");

  // S4 step 8: every cost gone, every balance zero.
  await deleteCost(olive, "Deposit");
  await deleteCost(olive, "Dinner");
  await expect(olive.getByText("No costs yet.")).toBeVisible();

  // S5 fixture.
  await addCost(olive, { description: "Hotel deposit", amount: "90" });
  await addCost(olive, { description: "Dinner", amount: "30", payer: BEN });
  await cleo.reload();
  await addCost(cleo, {
    description: "Taxi",
    amount: "12",
    exact: {
      "Your share": "6",
      [`${OLIVE}'s share`]: "2",
      [`${BEN}'s share`]: "4",
    },
  });

  // S5 step 1: each member's own big number, and all three in the balances.
  await olive.reload();
  await ben.reload();
  await cleo.reload();
  await expect(olive.getByText("You're owed", { exact: true })).toBeVisible();
  await expect(olive.getByText("$48.00", { exact: true }).first()).toBeVisible();
  await expect(ben.getByText("You owe", { exact: true })).toBeVisible();
  await expect(cleo.getByText("You owe", { exact: true })).toBeVisible();
  await expectBalance(olive, "You", "are owed", "+$48.00");
  await expectBalance(olive, BEN, "owes", "−$14.00");
  await expectBalance(olive, CLEO, "owes", "−$34.00");
  await expectBalance(ben, "You", "owe", "−$14.00");

  // S5 step 2: two suggested payments, and only the parties can mark them.
  const settle = olive.locator("#settle-up");
  await expect(settle.getByText("2 payments square everyone.")).toBeVisible();
  await expect(settle.getByText(`${BEN} pays you`)).toBeVisible();
  await expect(settle.getByText(`${CLEO} pays you`)).toBeVisible();
  await expect(ben.locator("#settle-up").getByText(`${CLEO} pays ${OLIVE}`)).toBeVisible();
  await expect(
    ben.getByRole("button", { name: new RegExp(`^Mark as paid: ${CLEO}`) }),
  ).toHaveCount(0);

  // S5 steps 4-5.
  await markSuggested(ben, `Mark as paid: You pay ${OLIVE}, $14.00`);
  await expectBalance(ben, "You", "all square", "$0.00");
  await expect(ben.getByText("You're square.")).toBeVisible();
  await markSuggested(cleo, `Mark as paid: You pay ${OLIVE}, $34.00`);
  await expect(cleo.getByText("Everyone's square.", { exact: true })).toBeVisible();
  await expect(cleo.getByText("This trip is settled.", { exact: false })).toBeVisible();

  // S5 step 4: who marked it, and when.
  await olive.reload();
  await expect(olive.getByText("Everyone's square.", { exact: true })).toBeVisible();
  await expect(
    olive.getByRole("article", { name: `Payment: ${BEN} paid you, $14.00` }),
  ).toContainText(`Marked by ${BEN}`);

  // S5 step 6: a void marks the payment and adds no payment of its own.
  await ben.reload();
  await voidPayment(ben, `Void: You paid ${OLIVE}, $14.00`);
  await expect(ben.getByText("You owe", { exact: true })).toBeVisible();
  const payments = ben.locator("#payments article");
  await expect(payments).toHaveCount(2);
  await expect(
    ben.getByRole("article", { name: `Payment: You paid ${OLIVE}, $14.00` }),
  ).toContainText("Voided by you");

  // S5-N1: no second void, and no way to edit a payment.
  await expect(ben.getByRole("button", { name: `Void: You paid ${OLIVE}, $14.00` })).toHaveCount(0);
  await expect(payments.first().getByRole("button", { name: /^Edit/ })).toHaveCount(0);

  // S5 step 7: paid, voided, paid; and the void still isn't its own row.
  await markSuggested(ben, `Mark as paid: You pay ${OLIVE}, $14.00`);
  await expect(payments).toHaveCount(3);
  await expect(ben.getByText("Everyone's square.", { exact: true })).toBeVisible();

  // S7 preconditions: both standing payments voided; Drew joins.
  await cleo.reload();
  await voidPayment(ben, `Void: You paid ${OLIVE}, $14.00`);
  await voidPayment(cleo, `Void: You paid ${OLIVE}, $34.00`);
  const drew = await joinFromLink(browser, contexts, link, tripUrl, `drew_${suffix}`, DREW);
  await expect(drew.locator("#settle-up").getByRole("button")).toHaveCount(0);

  // S7 step 1: refused, with the balance and a way to settle it.
  await cleo.reload();
  await cleo.getByRole("button", { name: "Leave trip" }).click();
  let dialog = cleo.getByRole("dialog", { name: `Leave ${tripName}?` });
  await dialog.getByRole("button", { name: "Leave trip" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "You owe $34.00 on this trip. Settle up and mark it as paid, then you can leave.",
  );
  await dialog.getByRole("link", { name: "Go to Settle up" }).click();
  await expect(dialog).toBeHidden();
  await expect(cleo).toHaveURL(/#settle-up$/);
  await expect(cleo.locator("#settle-up")).toBeInViewport();

  // S7 step 2: the organizer can't remove someone who still owes.
  await olive.reload();
  await olive.getByRole("button", { name: `Remove ${BEN}` }).click();
  dialog = olive.getByRole("dialog", { name: `Remove ${BEN}?` });
  await dialog.getByRole("button", { name: "Remove" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    `${BEN} owes $14.00 on this trip. Once they've settled up and it's marked as paid, you can remove them.`,
  );
  await expect(dialog.getByRole("link", { name: "Go to Settle up" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // S7 step 3: Cleo pays through the manual form, then leaves.
  await cleo.getByRole("button", { name: "Mark a payment" }).click();
  sheet = cleo.getByRole("dialog", { name: "Mark as paid" });
  await sheet.getByLabel("Who did you pay?").selectOption({ label: OLIVE });
  await sheet.getByLabel(/^How much/).fill("34");
  await sheet.getByRole("button", { name: "Mark as paid" }).click();
  await expect(sheet).toHaveCount(0);
  await expectBalance(cleo, "You", "all square", "$0.00");
  await cleo.getByRole("button", { name: "Leave trip" }).click();
  dialog = cleo.getByRole("dialog", { name: `Leave ${tripName}?` });
  await dialog.getByRole("button", { name: "Leave trip" }).click();
  await expect(cleo).not.toHaveURL(tripUrl);
  await expect(cleo.getByText(tripName)).toHaveCount(0);

  // S7 step 4: the trip is gone for them.
  await cleo.goto(tripUrl);
  await expect(cleo.getByText(tripName)).toHaveCount(0);
  await expect(cleo.getByText("Money", { exact: true })).toHaveCount(0);

  // S7 step 5: someone with a zero balance can be removed.
  await olive.reload();
  await olive.getByRole("button", { name: `Remove ${DREW}` }).click();
  await olive
    .getByRole("dialog", { name: `Remove ${DREW}?` })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(olive.getByRole("heading", { name: /Who.s going · 2/ })).toBeVisible();

  // S7-N2 and S7-N5: Cleo's name stays on her taxi, marked, and the cost stays.
  const taxi = costCard(olive, "Taxi");
  await expect(taxi).toContainText(`Paid by ${CLEO} (left)`);
  await expect(taxi).toContainText("Someone on this cost has left the trip, so it stays as it is.");
  await expect(taxi.getByRole("button")).toHaveCount(0);

  // S7-N4: the trip can't be deleted while Ben still owes.
  await olive.getByRole("button", { name: "Delete trip" }).click();
  dialog = olive.getByRole("dialog", { name: `Delete ${tripName}?` });
  await dialog.getByRole("button", { name: "Delete trip" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    `Not everyone is settled up yet: you're owed $14.00 and ${BEN} owes $14.00. Once every balance is settled and marked as paid, you can delete the trip.`,
  );
  await expect(dialog.getByRole("link", { name: "Go to Settle up" })).toBeVisible();

  await Promise.all(contexts.map((context) => context.close()));
});

// tasks/lessons.md, 2026-11-03: a list has to be proven with realistic data.
// On the seeded trip with 36 costs and 8 payments, everything still lands.
test("a long ledger still updates after every change", async ({ page: bob }) => {
  test.setTimeout(120_000);
  const description = `Museum ${Date.now().toString(36)}`;

  await signIn(bob, "bob@example.com");
  await expect(bob.getByRole("heading", { name: /^Hello, / })).toBeVisible();
  await bob.goto(AMALFI);

  await expect(bob.getByText("36 costs", { exact: false })).toBeVisible();
  await expect(bob.locator("#costs article")).toHaveCount(36);
  await expect(bob.locator("#costs article:visible")).toHaveCount(5);
  await bob.getByText("Show 31 older costs").click();
  await expect(bob.locator("#costs article:visible")).toHaveCount(36);

  await addCost(bob, { description, amount: "45.50" });
  await expect(bob.getByText("37 costs", { exact: false })).toBeVisible();

  // A partial payment records as entered.
  await bob.getByRole("button", { name: /^Mark as paid: You pay Alice Moreno/ }).click();
  const sheet = bob.getByRole("dialog", { name: "Mark as paid" });
  await sheet.getByLabel(/^How much/).fill("1.00");
  await sheet.getByRole("button", { name: "Mark as paid" }).click();
  await expect(sheet).toHaveCount(0);
  const name = "Void: You paid Alice Moreno, $1.00";
  await expect(bob.getByRole("button", { name })).toBeVisible();
  await voidPayment(bob, name);

  await deleteCost(bob, description);
  await expect(bob.getByText("36 costs", { exact: false })).toBeVisible();
});

// ADR 0002: money is for members only, even on a public trip.
test("someone outside a public trip gets no money from it", async ({ browser, page: alice }) => {
  test.setTimeout(120_000);
  const description = `Permit ${Date.now().toString(36)}`;

  await signIn(alice, "alice@example.com");
  await expect(alice.getByRole("heading", { name: /^Hello, / })).toBeVisible();
  await alice.goto(JOSHUA_TREE);
  await addCost(alice, { description, amount: "77.77" });

  const context = await browser.newContext({ ...devices["Pixel 7"] });
  const outsider = await context.newPage();
  await signIn(outsider, "bob@example.com");
  await expect(outsider.getByRole("heading", { name: /^Hello, / })).toBeVisible();
  await outsider.goto(JOSHUA_TREE);
  await expect(outsider.getByRole("heading", { name: "Joshua Tree climbing" })).toBeVisible();
  await expect(outsider.getByRole("heading", { name: /^Money/ })).toHaveCount(0);
  const html = await outsider.content();
  expect(html).not.toContain("77.77");
  expect(html).not.toContain(description);
  await context.close();

  await deleteCost(alice, description);
});
