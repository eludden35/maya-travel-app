import { expect, test } from "@playwright/test";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/** Polls Mailpit for the newest email to `email` and returns its code. */
async function signInCodeFor(email: string): Promise<string> {
  const query = encodeURIComponent(`to:"${email}"`);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
    if (search.ok) {
      const { messages } = (await search.json()) as { messages?: { ID: string }[] };
      const id = messages?.[0]?.ID;
      if (id) {
        const message = (await (
          await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)
        ).json()) as { Text?: string; HTML?: string };
        const code = `${message.Text ?? ""} ${message.HTML ?? ""}`.match(/\b(\d{6})\b/);
        if (code) return code[1];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`No sign-in email arrived for ${email}`);
}

test("a new tester signs in with a code, onboards and follows someone", async ({ page }) => {
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
});
