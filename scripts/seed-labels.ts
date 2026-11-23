// T010: loads the saved openFDA labels (tests/fixtures/openfda/) into the LOCAL
// database as the current Emgality and Reyvow labels, with their sections.
// Run it with: npm run db:seed
//
// Safety: it refuses to run unless the database address is on this computer
// (localhost or 127.0.0.1), so it can never change the online database.
//
// Note: Node runs this file directly by stripping out the type labels. So every
// import needs its full `.ts` file ending, and this file can't use `enum` or `namespace`.
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { labelSections } from "../src/lib/labels/sections.ts";

const DRUGS = ["emgality", "reyvow"] as const;
type Drug = (typeof DRUGS)[number];

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Stops with an error unless `url` points to a database on this computer.
 * Only the exact host names "localhost" and "127.0.0.1" are allowed, so look-alikes
 * such as "localhost.example.com" are refused.
 */
export function assertLocalDatabaseUrl(url: string | undefined): URL {
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set. Start local Supabase and put its address in .env.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`The database address "${url}" isn't a valid web address.`);
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Refusing to seed: the database host is "${parsed.hostname}". ` +
        "This script only runs against a local database (localhost or 127.0.0.1).",
    );
  }
  return parsed;
}

/** Reads one saved openFDA reply and returns its single label record. */
function readFixture(drug: Drug): Record<string, unknown> {
  const file = new URL(`../tests/fixtures/openfda/${drug}.json`, import.meta.url);
  const reply = JSON.parse(readFileSync(file, "utf8")) as { results?: unknown[] };
  if (!Array.isArray(reply.results) || reply.results.length !== 1) {
    throw new Error(`The ${drug} fixture must hold exactly one label.`);
  }
  return reply.results[0] as Record<string, unknown>;
}

/** Turns openFDA's "20260605" into "2026-06-05". */
function toLabelDate(effectiveTime: unknown): string {
  if (typeof effectiveTime !== "string" || !/^\d{8}$/.test(effectiveTime)) {
    throw new Error(`Unexpected effective_time: ${String(effectiveTime)}`);
  }
  return `${effectiveTime.slice(0, 4)}-${effectiveTime.slice(4, 6)}-${effectiveTime.slice(6, 8)}`;
}

async function main(): Promise<void> {
  // Node doesn't read .env by itself, so load it here if it exists.
  if (existsSync(".env")) process.loadEnvFile(".env");

  const url = assertLocalDatabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. Add the local key to .env.");
  }

  const db = createClient(url.toString(), serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const drug of DRUGS) {
    const record = readFixture(drug);
    const setId = record.set_id;
    if (typeof setId !== "string" || setId === "") {
      throw new Error(`The ${drug} fixture has no set_id.`);
    }
    const labelDate = toLabelDate(record.effective_time);
    const sections = labelSections(record);
    if (sections.length === 0) throw new Error(`The ${drug} fixture has no sections.`);

    // Already loaded? Then there's nothing to do, so running the script twice is safe.
    const existing = await db
      .from("drug_labels")
      .select("id")
      .eq("drug", drug)
      .eq("is_current", true)
      .eq("set_id", setId)
      .eq("label_date", labelDate)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      console.log(`${drug}: label dated ${labelDate} is already the current label. Skipped.`);
      continue;
    }

    // Save the new label as not-current first, then its sections. Only when both
    // worked does it become the current label, so a failure never leaves a
    // current label with missing sections.
    const inserted = await db
      .from("drug_labels")
      .insert({ drug, set_id: setId, label_date: labelDate, raw_record: record, is_current: false })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;
    const labelId = inserted.data.id as string;

    const sectionRows = sections.map((s) => ({ label_id: labelId, ...s }));
    const sectionsSaved = await db.from("label_sections").insert(sectionRows);
    if (sectionsSaved.error) {
      await db.from("drug_labels").delete().eq("id", labelId);
      throw sectionsSaved.error;
    }

    const oldOff = await db
      .from("drug_labels")
      .update({ is_current: false })
      .eq("drug", drug)
      .eq("is_current", true);
    if (oldOff.error) throw oldOff.error;
    const newOn = await db.from("drug_labels").update({ is_current: true }).eq("id", labelId);
    if (newOn.error) throw newOn.error;

    console.log(`${drug}: loaded label dated ${labelDate} with ${sections.length} sections.`);
  }
}

// Only seed when run directly (npm run db:seed), not when a test imports this file.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
