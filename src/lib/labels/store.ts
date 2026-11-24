// T011: gets a drug's current saved FDA label (its date and its sections) from the
// database.
//
// The lookup itself is the database function get_current_label
// (supabase/migrations/0003_get_current_label.sql). This file calls it, checks the
// reply's shape, and puts the sections in the order people see them.
import "server-only";

import { z } from "zod";

import { getServerDb } from "@/lib/db/client";
import { SECTION_NAMES, type LabelSection } from "@/lib/labels/sections";

/** The drugs LabelTrace answers about (same list the database allows). */
export type Drug = "emgality" | "reyvow";

/** A drug's current saved label. */
export type CurrentLabel = {
  drug: Drug;
  labelId: string;
  setId: string;
  /** The label's effective date from openFDA, like "2026-06-05". */
  labelDate: string;
  /** Named sections, in the order of SECTION_NAMES. Never empty text. */
  sections: LabelSection[];
};

/**
 * The result of a lookup. "Not found" is a normal result, not an error, so callers
 * must handle it on purpose.
 */
export type CurrentLabelResult =
  { found: true; label: CurrentLabel } | { found: false; drug: Drug };

const sectionSchema = z.object({
  field_key: z.string(),
  display_name: z.string(),
  text: z.string(),
});

const labelSchema = z.object({
  drug: z.enum(["emgality", "reyvow"]),
  label_id: z.string(),
  set_id: z.string(),
  label_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sections: z.array(sectionSchema),
});

const SECTION_ORDER = new Map(Object.keys(SECTION_NAMES).map((key, index) => [key, index]));

function sectionRank(fieldKey: string): number {
  return SECTION_ORDER.get(fieldKey) ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Returns the current saved label for `drug`, or `{ found: false }` when there
 * isn't one. Throws only for real problems: the database can't be reached, or it
 * sends back something that isn't a label for the drug that was asked for.
 */
export async function getCurrentLabel(drug: Drug): Promise<CurrentLabelResult> {
  const { data, error } = await getServerDb().rpc("get_current_label", { p_drug: drug });
  if (error) {
    throw new Error(`Couldn't read the current ${drug} label: ${error.message}`);
  }
  if (data === null || data === undefined) {
    return { found: false, drug };
  }

  const parsed = labelSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`The database sent back a ${drug} label in an unexpected shape.`);
  }
  const row = parsed.data;
  // Safety check: never hand back a different drug's label.
  if (row.drug !== drug) {
    throw new Error(`Asked for the ${drug} label but got the ${row.drug} label.`);
  }

  const sections = [...row.sections].sort(
    (a, b) => sectionRank(a.field_key) - sectionRank(b.field_key),
  );
  return {
    found: true,
    label: {
      drug: row.drug,
      labelId: row.label_id,
      setId: row.set_id,
      labelDate: row.label_date,
      sections,
    },
  };
}
