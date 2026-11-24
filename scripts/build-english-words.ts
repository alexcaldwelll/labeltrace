// T013: downloads a published English word list and saves it to
// src/lib/pipeline/english-words.json for the language check (research R19, FR-055).
// Run it with: npm run words:build
//
// The list is SCOWL size 60, American English, made by the English Speller Database
// (ESDB, the newer name for SCOWL) web tool. It is downloaded, never written from
// memory. The saved file records where the list came from, the download date, a
// SHA-256 checksum of the exact bytes downloaded (a fingerprint that changes if
// even one byte changes), the license, and the number of words.
//
// Note: Node runs this file directly by stripping out the type labels. So every
// import needs its full `.ts` file ending, and this file can't use `enum` or `namespace`.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** The exact address the list is downloaded from. */
export const SOURCE_URL =
  "https://app.aspell.net/create?max_size=60&spelling=US&diacritic=strip&download=wordlist&encoding=utf-8&format=inline";

export const SOURCE_NAME =
  "SCOWL (Spell Checker Oriented Word Lists), size 60, American English, " +
  "made with the English Speller Database (ESDB) web tool by Kevin Atkinson";

export const LICENSE_SUMMARY =
  "SCOWL/ESDB license: free to use, copy, change, share, and sell, as long as the " +
  "copyright notice and permission notice (saved in `notice`) are kept with every copy.";

/** The shape of src/lib/pipeline/english-words.json. */
export type EnglishWordsFile = {
  source: string;
  source_url: string;
  /** The date the list was downloaded, like "2026-11-23". */
  downloaded_on: string;
  /** SHA-256 checksum of the exact bytes downloaded, as 64 hex characters. */
  sha256: string;
  license: string;
  /** The list's own header, word for word: its settings, copyright, and permission notice. */
  notice: string;
  /** Number of words in `words`. */
  count: number;
  /** Lowercase words, no repeats, in sorted order. */
  words: string[];
};

/**
 * Splits the downloaded text into its header (everything before the line "---") and
 * its words. Words are made lowercase; repeats (like "La" and "la") are kept once.
 */
export function parseWordList(raw: string): { notice: string; words: string[] } {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const divider = lines.indexOf("---");
  if (divider === -1) {
    throw new Error('The downloaded list has no "---" line between its header and its words.');
  }
  const notice = lines.slice(0, divider).join("\n").trim();
  if (!/Copyright/.test(notice)) {
    throw new Error("The downloaded list's header has no copyright notice.");
  }
  const words = new Set<string>();
  for (const line of lines.slice(divider + 1)) {
    const word = line.trim().toLowerCase();
    if (word) words.add(word);
  }
  if (words.size === 0) {
    throw new Error("The downloaded list has no words.");
  }
  return { notice, words: [...words].sort() };
}

/** SHA-256 checksum of `bytes`, as 64 hex characters. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Builds the saved file from the downloaded bytes and the download date. */
export function buildWordFile(bytes: Uint8Array, downloadedOn: string): EnglishWordsFile {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(downloadedOn)) {
    throw new Error(`The download date must look like 2026-11-23, not "${downloadedOn}".`);
  }
  const { notice, words } = parseWordList(new TextDecoder("utf-8").decode(bytes));
  return {
    source: SOURCE_NAME,
    source_url: SOURCE_URL,
    downloaded_on: downloadedOn,
    sha256: sha256Hex(bytes),
    license: LICENSE_SUMMARY,
    notice,
    count: words.length,
    words,
  };
}

async function main(): Promise<void> {
  const reply = await fetch(SOURCE_URL);
  if (!reply.ok) {
    throw new Error(`Download failed: HTTP ${reply.status} from ${SOURCE_URL}`);
  }
  const bytes = new Uint8Array(await reply.arrayBuffer());
  // The local date on this computer (the project records dates in U.S. Central time),
  // not the UTC date, which is a day ahead in the evening.
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const file = buildWordFile(bytes, today);
  const out = new URL("../src/lib/pipeline/english-words.json", import.meta.url);
  mkdirSync(new URL(".", out), { recursive: true });
  writeFileSync(out, JSON.stringify(file, null, 2) + "\n");
  console.log(
    `Saved ${file.count} words to src/lib/pipeline/english-words.json ` +
      `(downloaded ${file.downloaded_on}, SHA-256 ${file.sha256}).`,
  );
}

// Only download when run as a script, not when a test imports this file.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
