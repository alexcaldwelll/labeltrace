// T034: after the privacy questions go through the pipeline, no raw question and no
// raw personal detail is anywhere in the local database (spec SC-006, FR-021).
//
// Searches every text, varchar, char, json, and jsonb column of every table, in every
// schema except Postgres's own (owner-approved 2026-11-27, item 6), so Supabase's own
// schemas (for example `auth` and `vault`) are searched too. It must find 0 matches. Nothing writes log
// rows yet, so this gets stronger once US6 does (re-run in T047).
//
// Needs the local Supabase database (`npx supabase start`); fast-tests starts it on
// GitHub. The pipeline uses a fake label lookup and a fake AI, like the other
// pipeline tests.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GetLabel } from "@/lib/emergency/respond";
import type { CurrentLabel } from "@/lib/labels/store";
import { ask } from "@/lib/pipeline/ask";
import { FakeAnswerClient } from "../../helpers/fake-ai";

// Local Supabase's fixed, public default address. Not a secret: it only works on
// this computer or the GitHub runner, and the online database never uses it.
const LOCAL_DB_URL =
  process.env.LOCAL_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** The privacy questions (owner-approved 2026-11-27, item 5), each with its details. */
const PRIVACY_QUESTIONS: { question: string; details: string[] }[] = [
  {
    question:
      "Hi, I'm Jane Doe, jane@example.com, 555-123-4567. Does Emgality cause injection site pain?",
    details: ["Jane Doe", "jane@example.com", "555-123-4567"],
  },
  { question: "my name is Sam Lee and I take Reyvow", details: ["Sam Lee"] },
  {
    question: "Bob Johnson said Reyvow made him dizzy. Call him at +44 20 7946 0958",
    details: ["Bob Johnson", "+44 20 7946 0958"],
  },
  {
    question: "I'm Maria Lopez and I weigh 150 pounds. How much Reyvow should I take?",
    details: ["Maria Lopez"],
  },
  // An emergency question with made-up details.
  {
    question: "I'm Jane Doe, 555-123-4567, I can't breathe after taking Reyvow",
    details: ["Jane Doe", "555-123-4567"],
  },
];

const label = (drug: "emgality" | "reyvow"): CurrentLabel => ({
  drug,
  labelId: `${drug}-id`,
  setId: `${drug}-set`,
  labelDate: "2026-06-05",
  sections: [
    {
      field_key: "dosage_and_administration",
      display_name: "Dosage and Administration",
      text: "The recommended dose is 120 mg injected subcutaneously once monthly.",
    },
  ],
});
const getLabel: GetLabel = async (drug) => ({ found: true, label: label(drug) });

const db = new pg.Client({ connectionString: LOCAL_DB_URL });

beforeAll(async () => {
  await db.connect();
});
afterAll(async () => {
  await db.end();
});

/** Double-quotes a name for SQL ("auth"."users"). */
const quoted = (name: string) => `"${name.replace(/"/g, '""')}"`;

describe("SC-006: no raw text in the database", () => {
  it("finds 0 matches for every raw question and detail", async () => {
    for (const { question } of PRIVACY_QUESTIONS) {
      await ask(question, {
        getLabel,
        answerAI: new FakeAnswerClient({
          answer: "Reyvow is taken as needed.",
          sectionsUsed: [],
          answerType: "normal",
        }),
      });
    }

    const needles = [
      ...new Set(PRIVACY_QUESTIONS.flatMap(({ question, details }) => [question, ...details])),
    ];
    const columns = await db.query<{ schema: string; table: string; column: string }>(
      `select c.table_schema as schema, c.table_name as table, c.column_name as column
         from information_schema.columns c
         join information_schema.tables t
           on t.table_schema = c.table_schema and t.table_name = c.table_name
        where t.table_type = 'BASE TABLE'
          and c.table_schema not in ('pg_catalog', 'information_schema')
          and c.table_schema not like 'pg_toast%'
          and c.data_type in ('text', 'character varying', 'character', 'json', 'jsonb')`,
    );
    expect(columns.rows.length).toBeGreaterThan(0);

    const matches: string[] = [];
    for (const { schema, table, column } of columns.rows) {
      const result = await db.query<{ found: number }>(
        `select count(*)::int as found from ${quoted(schema)}.${quoted(table)}
          where exists (
            select 1 from unnest($1::text[]) as needle
             where strpos(${quoted(column)}::text, needle) > 0)`,
        [needles],
      );
      if (result.rows[0]!.found > 0) matches.push(`${schema}.${table}.${column}`);
    }
    expect(matches).toEqual([]);
  });
});
