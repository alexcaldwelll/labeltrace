// T024: builds the other-drug name list from openFDA data, never from memory
// (research R20, R14, FR-013). Run it with: npm run drugs:build
//
// 1. Runs 4 openFDA queries (QUERY_URLS): brand and generic names on labels that
//    mention migraine, and the 1,000 most common brand and generic names overall.
// 2. Splits every name into words ("Sumatriptan Succinate" → sumatriptan, succinate)
//    and drops words under 4 letters.
// 3. A word that ISN'T an everyday English word (src/lib/pipeline/english-words.json)
//    is kept automatically: imitrex, ubrelvy, sumatriptan.
// 4. A word that IS an English word (aspirin, water, headache, dove) is kept only if
//    the owner ticked it in src/lib/refusals/english-word-drugs.json (owner's
//    decision 1A, 2026-11-26). An English word that the owner hasn't reviewed yet is
//    left off and printed, so nothing is added without the owner.
// 5. Our 4 names and the "never on the list" words are always removed.
// 6. Common brands the count queries miss (src/lib/refusals/common-brands.json, owner-
//    reviewed 2026-11-26) are each confirmed by an openFDA query: the drug label data
//    first, then Drugs@FDA. If any brand isn't confirmed, the script stops.
//
// The saved file records the query addresses, the download date, the count, and how
// each common brand was confirmed.
//
// Note: Node runs this file directly by stripping out the type labels. So every
// import needs its full `.ts` file ending, and this file can't use `enum` or `namespace`.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const BASE = "https://api.fda.gov/drug/label.json";

/** The exact openFDA queries (T024). */
export const QUERY_URLS = [
  `${BASE}?search=indications_and_usage:migraine&count=openfda.brand_name.exact&limit=1000`,
  `${BASE}?search=indications_and_usage:migraine&count=openfda.generic_name.exact&limit=1000`,
  `${BASE}?count=openfda.brand_name.exact&limit=1000`,
  `${BASE}?count=openfda.generic_name.exact&limit=1000`,
] as const;

/** Our own names: never on the other-drug list. */
export const OUR_NAMES = ["emgality", "galcanezumab", "reyvow", "lasmiditan"] as const;

/**
 * Words that are never on the other-drug list (owner's decision, 2026-11-26): words
 * that describe our own drugs, and words too general to mean another drug.
 */
export const NEVER_OTHER_DRUG = [
  "cgrp",
  "ditan",
  "antibody",
  "monoclonal",
  "serotonin",
  "medicine",
  "medication",
  "drug",
  "vitamin",
  "supplement",
] as const;

/** Words shorter than this are dropped. */
export const MIN_WORD_LENGTH = 4;

/** The owner's review of English-word names (src/lib/refusals/english-word-drugs.json). */
export type EnglishWordReview = {
  reviewed_by: string;
  reviewed_on: string;
  note: string;
  /** English words the owner ticked as drugs: kept on the list. */
  kept: string[];
  /** English words the owner decided aren't drugs: left off. */
  dropped: string[];
};

/** The shape of src/lib/refusals/other-drugs.json. */
export type OtherDrugsFile = {
  source: string;
  query_urls: string[];
  /** The date the queries were run, like "2026-11-26". */
  downloaded_on: string;
  /** Number of names in `names`. */
  count: number;
  /** Lowercase name words, no repeats, sorted. */
  names: string[];
  /** How each owner-reviewed common brand was confirmed in openFDA. */
  common_brands: BrandCheck[];
};

/** The owner's list of common brands (src/lib/refusals/common-brands.json). */
export type CommonBrandsFile = {
  reviewed_by: string;
  reviewed_on: string;
  note: string;
  brands: string[];
};

/** One common brand's openFDA confirmation. */
export type BrandCheck = {
  brand: string;
  /** Which openFDA data confirmed it. */
  dataset: "drug_label" | "drugsfda";
  url: string;
  /** How many records matched. */
  matches: number;
};

/** The queries that confirm a brand, in order: the label data, then Drugs@FDA. */
export function brandQueryUrls(brand: string): { dataset: BrandCheck["dataset"]; url: string }[] {
  const quoted = encodeURIComponent(`"${brand}"`);
  return [
    {
      dataset: "drug_label",
      url: `https://api.fda.gov/drug/label.json?search=openfda.brand_name:${quoted}&limit=1`,
    },
    {
      dataset: "drugsfda",
      url: `https://api.fda.gov/drug/drugsfda.json?search=products.brand_name:${quoted}&limit=1`,
    },
  ];
}

/**
 * Adds the confirmed common brands to the list. Stops if any brand wasn't confirmed
 * (no check, or 0 matches), or is one of our names or a "never on the list" word.
 */
export function addCommonBrands(
  file: Omit<OtherDrugsFile, "common_brands">,
  brands: readonly string[],
  checks: readonly BrandCheck[],
): OtherDrugsFile {
  const removed = new Set<string>([...OUR_NAMES, ...NEVER_OTHER_DRUG]);
  const byBrand = new Map(checks.map((check) => [check.brand, check]));
  const unconfirmed = brands.filter((brand) => (byBrand.get(brand)?.matches ?? 0) < 1);
  if (unconfirmed.length > 0) {
    throw new Error(`These brands weren't confirmed in openFDA: ${unconfirmed.join(", ")}`);
  }
  const blocked = brands.filter((brand) => removed.has(brand));
  if (blocked.length > 0) {
    throw new Error(`These can't be on the other-drug list: ${blocked.join(", ")}`);
  }
  const names = [...new Set([...file.names, ...brands])].sort();
  return {
    ...file,
    count: names.length,
    names,
    common_brands: brands.map((brand) => byBrand.get(brand)!),
  };
}

/** Confirms one brand with openFDA (label data first, then Drugs@FDA). */
async function confirmBrand(brand: string): Promise<BrandCheck> {
  let last: BrandCheck | null = null;
  for (const { dataset, url } of brandQueryUrls(brand)) {
    const reply = await fetch(url);
    // openFDA answers 404 when nothing matches.
    if (reply.status === 404) {
      last = { brand, dataset, url, matches: 0 };
      continue;
    }
    if (!reply.ok) throw new Error(`Query failed: HTTP ${reply.status} from ${url}`);
    const body = (await reply.json()) as { meta?: { results?: { total?: number } } };
    const matches = body.meta?.results?.total ?? 0;
    last = { brand, dataset, url, matches };
    if (matches > 0) return last;
  }
  return last!;
}

/** One openFDA "count" reply: `results` is a list of `{ term, count }`. */
type CountReply = { results?: { term?: unknown }[] };

/** The name words in one openFDA count reply, lowercase, 4 letters or more. */
export function nameWords(reply: CountReply): string[] {
  if (!Array.isArray(reply.results) || reply.results.length === 0) {
    throw new Error("An openFDA reply has no results.");
  }
  const found = new Set<string>();
  for (const row of reply.results) {
    if (typeof row.term !== "string") continue;
    for (const word of row.term.toLowerCase().match(/[a-z]+/g) ?? []) {
      if (word.length >= MIN_WORD_LENGTH) found.add(word);
    }
  }
  return [...found];
}

/**
 * Builds the saved list. Returns the file and the English words the owner hasn't
 * reviewed yet (left off the list, for the owner to review).
 */
export function buildDrugNameFile(
  replies: readonly CountReply[],
  englishWords: ReadonlySet<string>,
  review: Pick<EnglishWordReview, "kept" | "dropped">,
  downloadedOn: string,
): { file: Omit<OtherDrugsFile, "common_brands">; needsReview: string[] } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(downloadedOn)) {
    throw new Error(`The download date must look like 2026-11-26, not "${downloadedOn}".`);
  }
  if (replies.length !== QUERY_URLS.length) {
    throw new Error(`Expected ${QUERY_URLS.length} openFDA replies, got ${replies.length}.`);
  }
  const kept = new Set(review.kept);
  const reviewed = new Set([...review.kept, ...review.dropped]);
  const removed = new Set<string>([...OUR_NAMES, ...NEVER_OTHER_DRUG]);
  const names = new Set<string>();
  const needsReview = new Set<string>();
  for (const reply of replies) {
    for (const word of nameWords(reply)) {
      if (removed.has(word)) continue;
      if (!englishWords.has(word)) names.add(word);
      else if (kept.has(word)) names.add(word);
      else if (!reviewed.has(word)) needsReview.add(word);
    }
  }
  const sorted = [...names].sort();
  return {
    file: {
      source: "openFDA drug label endpoint (api.fda.gov/drug/label.json), count queries",
      query_urls: [...QUERY_URLS],
      downloaded_on: downloadedOn,
      count: sorted.length,
      names: sorted,
    },
    needsReview: [...needsReview].sort(),
  };
}

async function main(): Promise<void> {
  const replies: CountReply[] = [];
  for (const url of QUERY_URLS) {
    const reply = await fetch(url);
    if (!reply.ok) throw new Error(`Download failed: HTTP ${reply.status} from ${url}`);
    replies.push((await reply.json()) as CountReply);
  }
  const english = JSON.parse(
    readFileSync(new URL("../src/lib/pipeline/english-words.json", import.meta.url), "utf8"),
  ) as { words: string[] };
  const review = JSON.parse(
    readFileSync(new URL("../src/lib/refusals/english-word-drugs.json", import.meta.url), "utf8"),
  ) as EnglishWordReview;
  // The local date on this computer (the project records dates in U.S. Central time).
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const built = buildDrugNameFile(replies, new Set(english.words), review, today);
  const common = JSON.parse(
    readFileSync(new URL("../src/lib/refusals/common-brands.json", import.meta.url), "utf8"),
  ) as CommonBrandsFile;
  const checks: BrandCheck[] = [];
  for (const brand of common.brands) {
    checks.push(await confirmBrand(brand));
    // Stay well under openFDA's limit of 240 requests a minute without a key.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  const file = addCommonBrands(built.file, common.brands, checks);
  const needsReview = built.needsReview;
  const out = new URL("../src/lib/refusals/other-drugs.json", import.meta.url);
  writeFileSync(out, JSON.stringify(file, null, 2) + "\n");
  console.log(`Saved ${file.count} names to src/lib/refusals/other-drugs.json (${today}).`);
  if (needsReview.length > 0) {
    console.log(
      `${needsReview.length} English-word names are new and were left off. Review them, ` +
        `then add each to "kept" or "dropped" in src/lib/refusals/english-word-drugs.json:\n` +
        needsReview.join(", "),
    );
  }
}

// Only download when run as a script, not when a test imports this file.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
