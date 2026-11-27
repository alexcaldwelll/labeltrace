// T032: builds the common first-name list for the scrubber's safeguard (research R22,
// spec PC-9) from the U.S. Social Security Administration's national baby-name data,
// never from memory. Run it with: npm run names:build -- ~/Downloads/names.zip
//
// The SSA site refuses automated downloads, so the owner downloads `names.zip` by
// hand in a browser (owner's decision 4A, 2026-11-27) from the SSA page "Beyond the
// Top 1000 Names" (SOURCE_PAGE). This script reads that file:
// 1. Lists the yearly files inside it (yob1880.txt, yob1881.txt, ...). Each line is
//    "Name,Sex,Births", for example "Olivia,F,17691".
// 2. Adds up each name's births across all years and both sexes.
// 3. Keeps every name with at least MIN_TOTAL_BIRTHS births, lowercase and sorted.
//
// The saved file records the source page and file address, the download date, a
// SHA-256 checksum of the zip (a fingerprint that changes if even one byte changes),
// the years covered, and the number of names.
//
// The zip is read with macOS's built-in `unzip` tool, and nothing is extracted to disk.
//
// Note: Node runs this file directly by stripping out the type labels. So every
// import needs its full `.ts` file ending, and this file can't use `enum` or `namespace`.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** The SSA page the owner downloads the file from. */
export const SOURCE_PAGE = "https://www.ssa.gov/oact/babynames/limits.html";

/** The file's own address on that page. */
export const SOURCE_URL = "https://www.ssa.gov/oact/babynames/names.zip";

export const SOURCE_NAME =
  "U.S. Social Security Administration, national baby-name data " +
  "(first names on Social Security card applications, 1880 on)";

/** A name counts as "common" with at least this many recorded births in total. */
export const MIN_TOTAL_BIRTHS = 1000;

/** The shape of src/lib/scrub/common-first-names.json. */
export type FirstNamesFile = {
  source: string;
  source_page: string;
  source_url: string;
  downloaded_by: string;
  /** The date the owner downloaded the zip, like "2026-11-27". */
  downloaded_on: string;
  sha256: string;
  /** The first and last year in the data. */
  first_year: number;
  last_year: number;
  min_total_births: number;
  /** Number of names in `names`. */
  count: number;
  /** Lowercase names, no repeats, sorted. */
  names: string[];
};

/** One yearly file: its year and its text. */
export type YearFile = { year: number; text: string };

/** The year in a yearly file's name ("yob1990.txt" → 1990), or null for other files. */
export function yearOf(fileName: string): number | null {
  const match = /^yob(\d{4})\.txt$/.exec(fileName);
  return match ? Number(match[1]) : null;
}

/** Adds up births per lowercase name across every yearly file. */
export function totalBirths(files: readonly YearFile[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const { year, text } of files) {
    text.split(/\r?\n/).forEach((line, index) => {
      if (line.trim() === "") return;
      const match = /^([A-Za-z]+),([FM]),(\d+)$/.exec(line.trim());
      if (!match) {
        throw new Error(`yob${year}.txt line ${index + 1} isn't "Name,Sex,Births": ${line}`);
      }
      const name = match[1]!.toLowerCase();
      totals.set(name, (totals.get(name) ?? 0) + Number(match[3]));
    });
  }
  return totals;
}

/** Builds the saved file from the yearly files. */
export function buildFirstNamesFile(
  files: readonly YearFile[],
  sha256: string,
  downloadedOn: string,
): FirstNamesFile {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(downloadedOn)) {
    throw new Error(`The download date must look like 2026-11-27, not "${downloadedOn}".`);
  }
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("The SHA-256 checksum looks wrong.");
  if (files.length === 0) throw new Error("The zip has no yearly files (yob1880.txt, ...).");
  const years = files.map((file) => file.year).sort((a, b) => a - b);
  const totals = totalBirths(files);
  const names = [...totals]
    .filter(([, births]) => births >= MIN_TOTAL_BIRTHS)
    .map(([name]) => name)
    .sort();
  return {
    source: SOURCE_NAME,
    source_page: SOURCE_PAGE,
    source_url: SOURCE_URL,
    downloaded_by:
      "the owner, by hand in a browser (the SSA site refuses automated downloads; " +
      "owner's decision 4A, 2026-11-27)",
    downloaded_on: downloadedOn,
    sha256,
    first_year: years[0]!,
    last_year: years[years.length - 1]!,
    min_total_births: MIN_TOTAL_BIRTHS,
    count: names.length,
    names,
  };
}

/** The local date of a time, like "2026-11-27". */
function localDate(time: Date): string {
  return [
    time.getFullYear(),
    String(time.getMonth() + 1).padStart(2, "0"),
    String(time.getDate()).padStart(2, "0"),
  ].join("-");
}

function main(): void {
  const zipPath = process.argv[2];
  if (!zipPath) {
    throw new Error("Give the path of names.zip: npm run names:build -- ~/Downloads/names.zip");
  }
  const bytes = readFileSync(zipPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const listing = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
  const files: YearFile[] = [];
  for (const fileName of listing.split("\n")) {
    const year = yearOf(fileName.trim());
    if (year === null) continue;
    const text = execFileSync("unzip", ["-p", zipPath, fileName.trim()], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    files.push({ year, text });
  }
  // The download date is the date the zip file was saved on this computer (the
  // project records dates in U.S. Central time).
  const file = buildFirstNamesFile(files, sha256, localDate(statSync(zipPath).mtime));
  const out = new URL("../src/lib/scrub/common-first-names.json", import.meta.url);
  writeFileSync(out, JSON.stringify(file, null, 2) + "\n");
  console.log(
    `Saved ${file.count} names (${file.first_year}–${file.last_year}, ${MIN_TOTAL_BIRTHS}+ births) ` +
      `to src/lib/scrub/common-first-names.json. SHA-256 of the zip: ${sha256}`,
  );
}

// Only run when called as a script, not when a test imports this file.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
