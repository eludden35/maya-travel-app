#!/usr/bin/env node
/*
 * Secret-boundary check (run in CI as `pnpm check:secrets`).
 *
 * Fails when a "use client" module references the Supabase secret key or
 * imports the admin client, or when an env template puts a secret behind a
 * NEXT_PUBLIC_ name (which Next.js inlines into the browser bundle).
 * Comments are stripped first, so documentation that names the variables
 * does not trip it. Transitive imports are covered by `import "server-only"`
 * in lib/supabase/admin.ts, which this script also checks is present.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "lib"];
const FORBIDDEN_IN_CLIENT = [
  /SUPABASE_SECRET_KEY/,
  /SUPABASE_SERVICE_ROLE_KEY/,
  /sb_secret_/,
  /@\/lib\/supabase\/admin/,
];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(name) ? [path] : [];
  });
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const problems = [];

for (const file of ROOTS.flatMap(walk)) {
  const code = stripComments(readFileSync(file, "utf8"));
  if (!/^\s*["']use client["']/.test(code)) continue;
  for (const pattern of FORBIDDEN_IN_CLIENT) {
    if (pattern.test(code)) problems.push(`${file}: client module matches ${pattern}`);
  }
}

if (!/^import "server-only";/m.test(readFileSync("lib/supabase/admin.ts", "utf8"))) {
  problems.push('lib/supabase/admin.ts: missing import "server-only"');
}

for (const file of [".env.local.example"]) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (/^\s*#?\s*NEXT_PUBLIC_[A-Z0-9_]*(SECRET|SERVICE_ROLE)/.test(line)) {
      problems.push(`${file}: secret-looking NEXT_PUBLIC_ variable: ${line.trim()}`);
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("Secret boundary OK");
