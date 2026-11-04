const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/** Polls Mailpit for the newest email to `email` and returns its code. */
export async function signInCodeFor(email: string): Promise<string> {
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
