import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DECISION_NOTE_MAX,
  POST_BODY_MAX,
  readDecisionNote,
  readPostBody,
  readReport,
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  reportReasonLabel,
} from "@/lib/post-fields";

/** Every migration, oldest first, as one string. */
function migrations(): string {
  const folder = new URL("../supabase/migrations/", import.meta.url);
  return readdirSync(folder)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(new URL(file, folder), "utf8"))
    .join("\n");
}

/** The body of the newest definition of a function, between its $$ quotes. */
function newestFunctionBody(name: string): string {
  const pattern = new RegExp(
    String.raw`create\s+(?:or\s+replace\s+)?function\s+${name.replace(".", String.raw`\.`)}\s*\([\s\S]*?\$\$([\s\S]*?)\$\$`,
    "gi",
  );
  const body = [...migrations().matchAll(pattern)].at(-1)?.[1];
  if (body === undefined) {
    throw new Error(`No migration defines ${name}()`);
  }
  return body;
}

describe("REPORT_REASONS", () => {
  it("lists exactly the database's report reasons, in its order", () => {
    const definition = migrations().match(
      /create\s+type\s+public\.report_reason\s+as\s+enum\s*\(([\s\S]*?)\);/i,
    );
    expect(definition).not.toBeNull();
    const codes = [...definition![1].matchAll(/'([a-z_]+)'/g)].map(
      (match) => match[1],
    );
    expect(REPORT_REASONS.map((reason) => reason.code)).toEqual(codes);
  });

  it("gives every reason a label", () => {
    expect(reportReasonLabel("private_info")).toBe(
      "Someone's private information",
    );
    expect(new Set(REPORT_REASONS.map((reason) => reason.label)).size).toBe(
      REPORT_REASONS.length,
    );
  });
});

describe("limits", () => {
  it("match the limits the RPCs check", () => {
    expect(newestFunctionBody("public.create_trip_post")).toContain(
      `is_valid_multiline_text(v_body, ${POST_BODY_MAX})`,
    );
    expect(newestFunctionBody("public.report_trip_post")).toContain(
      `is_valid_multiline_text(v_note, ${REPORT_NOTE_MAX})`,
    );
    expect(newestFunctionBody("public.decide_report")).toContain(
      `is_valid_multiline_text(v_note, ${DECISION_NOTE_MAX})`,
    );
  });
});

describe("form readers", () => {
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [name, value] of Object.entries(fields)) {
      data.set(name, value);
    }
    return data;
  };

  it("passes a post's text through as typed, for the RPC to clean", () => {
    expect(readPostBody(form({ body: "  Landing at 3\r\n" }))).toBe(
      "  Landing at 3\r\n",
    );
    expect(readPostBody(new FormData())).toBe("");
  });

  it("trims a report and drops a blank note", () => {
    expect(readReport(form({ reason: " spam ", note: "   " }))).toEqual({
      reason: "spam",
      note: null,
    });
    expect(readReport(form({ reason: "other", note: " Too loud " }))).toEqual({
      reason: "other",
      note: "Too loud",
    });
  });

  it("drops a blank decision note", () => {
    expect(readDecisionNote(form({ note: "\n " }))).toBeNull();
    expect(readDecisionNote(form({ note: " Took it down. " }))).toBe(
      "Took it down.",
    );
  });
});
