// T010 (moved here from T011): the fixed list that turns openFDA field names into
// the section names people see (research R7), for example
// warnings_and_cautions → "Warnings and Precautions".
//
// A section "really exists" (FR-018) only when its field is in the saved label and
// isn't empty. Fields not on this list (like product codes or package images) are
// never shown as sections.
//
// Note: scripts/seed-labels.ts imports this file and Node runs that script directly
// by stripping out the type labels. So this file can't use `enum` or `namespace`,
// and any import it adds needs its full `.ts` file ending.

/** openFDA field name → section name people see. The order here is the order shown. */
export const SECTION_NAMES: Readonly<Record<string, string>> = {
  boxed_warning: "Boxed Warning",
  recent_major_changes: "Recent Major Changes",
  indications_and_usage: "Indications and Usage",
  dosage_and_administration: "Dosage and Administration",
  dosage_forms_and_strengths: "Dosage Forms and Strengths",
  contraindications: "Contraindications",
  warnings_and_cautions: "Warnings and Precautions",
  warnings: "Warnings",
  precautions: "Precautions",
  adverse_reactions: "Adverse Reactions",
  drug_interactions: "Drug Interactions",
  use_in_specific_populations: "Use in Specific Populations",
  pregnancy: "Pregnancy",
  lactation: "Lactation",
  nursing_mothers: "Nursing Mothers",
  pediatric_use: "Pediatric Use",
  geriatric_use: "Geriatric Use",
  drug_abuse_and_dependence: "Drug Abuse and Dependence",
  controlled_substance: "Controlled Substance",
  abuse: "Abuse",
  dependence: "Dependence",
  overdosage: "Overdosage",
  description: "Description",
  clinical_pharmacology: "Clinical Pharmacology",
  mechanism_of_action: "Mechanism of Action",
  pharmacodynamics: "Pharmacodynamics",
  pharmacokinetics: "Pharmacokinetics",
  nonclinical_toxicology: "Nonclinical Toxicology",
  carcinogenesis_and_mutagenesis_and_impairment_of_fertility:
    "Carcinogenesis, Mutagenesis, Impairment of Fertility",
  clinical_studies: "Clinical Studies",
  how_supplied: "How Supplied",
  storage_and_handling: "Storage and Handling",
  information_for_patients: "Patient Counseling Information",
  spl_medguide: "Medication Guide",
  spl_patient_package_insert: "Patient Information",
  instructions_for_use: "Instructions for Use",
};

/** One named part of a label, ready to save in `label_sections`. */
export type LabelSection = {
  field_key: string;
  display_name: string;
  text: string;
};

/**
 * Picks the named sections out of one openFDA label record.
 * openFDA stores each field as a list of text pieces; they're joined with a blank
 * line between them. Fields that are missing, empty, only spaces, or not text are
 * skipped, so every section returned has real text.
 */
export function labelSections(record: Readonly<Record<string, unknown>>): LabelSection[] {
  const sections: LabelSection[] = [];
  for (const [fieldKey, displayName] of Object.entries(SECTION_NAMES)) {
    const value = record[fieldKey];
    if (!Array.isArray(value)) continue;
    const text = value
      .filter((piece): piece is string => typeof piece === "string")
      .map((piece) => piece.trim())
      .filter((piece) => piece !== "")
      .join("\n\n");
    if (text === "") continue;
    sections.push({ field_key: fieldKey, display_name: displayName, text });
  }
  return sections;
}
