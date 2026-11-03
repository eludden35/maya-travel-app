import { expect, type Page } from "@playwright/test";

import { signInCodeFor } from "./mailpit";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/**
 * Signs `email` in with a code from Mailpit. The seed accounts get a new code
 * on every run, so their older emails go first: `signInCodeFor` reads the
 * newest one, which must be this sign-in's.
 */
export async function signIn(page: Page, email: string): Promise<void> {
  const query = encodeURIComponent(`to:"${email}"`);
  const cleared = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`, {
    method: "DELETE",
  });
  expect(cleared.ok, "Mailpit deletes the older sign-in emails").toBe(true);
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.getByLabel("Code").fill(await signInCodeFor(email));
  await page.getByRole("button", { name: "Sign in" }).click();
}
