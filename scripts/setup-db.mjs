/**
 * NYC Coffee — Database Setup Script
 *
 * Applies the orders table schema to your Supabase project.
 *
 * Usage:
 *   1. Add SUPABASE_SERVICE_ROLE_KEY to .env.local
 *      (find it in Supabase Dashboard → Project Settings → API → service_role key)
 *   2. node scripts/setup-db.mjs
 *
 * Alternatively, paste the contents of supabase/schema.sql directly into
 * the Supabase SQL Editor (Dashboard → SQL Editor → New query).
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env vars from .env.local
const envPath = join(__dirname, "..", ".env.local");
const envContents = readFileSync(envPath, "utf8");
const env = Object.fromEntries(
  envContents
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=").map((s) => s.trim()))
    .filter(([k, v]) => k && v)
    .map(([k, ...rest]) => [k, rest.join("=")])
);

const supabaseUrl = env["NEXT_PUBLIC_SUPABASE_URL"];
const serviceRoleKey = env["SUPABASE_SERVICE_ROLE_KEY"];

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  console.error(
    "\nFind your service role key at:\n  Supabase Dashboard → Project Settings → API → service_role (secret)\n"
  );
  console.error("Then add to .env.local:\n  SUPABASE_SERVICE_ROLE_KEY=your_key");
  process.exit(1);
}

const schemaSQL = readFileSync(
  join(__dirname, "..", "supabase", "schema.sql"),
  "utf8"
);

// Split into individual statements (skip comments and empty lines)
const statements = schemaSQL
  .split(";")
  .map((s) => s.trim())
  .filter(
    (s) =>
      s &&
      !s.startsWith("--") &&
      s.replace(/--[^\n]*/g, "").trim()
  );

console.log(`Applying schema to ${supabaseUrl}...`);

// Use Supabase REST API to execute SQL via the pg endpoint
const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  },
  body: JSON.stringify({ sql: schemaSQL }),
});

if (!response.ok) {
  // Fallback: try the management API approach
  const projectRef = supabaseUrl.replace("https://", "").split(".")[0];
  console.log(
    `\nDirect SQL execution not available. Please run the schema manually:\n`
  );
  console.log(`1. Open: https://supabase.com/dashboard/project/${projectRef}/sql`);
  console.log(`2. Paste the contents of: supabase/schema.sql`);
  console.log(`3. Click "Run"\n`);
  process.exit(0);
}

console.log("Schema applied successfully!");
