// T028: the dosing number check (spec PC-7; owner-approved 2026-11-26). Plain code, no AI.
//
// Every number claim in the AI's dosing summary must appear in that drug's saved
// "Dosage and Administration" text exactly as written. If any doesn't, the summary
// isn't shown; the section text is shown word for word instead (respond.ts).
//
// A number claim is a number plus the unit right after it, if there is one:
// - Numbers: digits (120, 2.5, 1,000); written-out numbers (one … twenty, thirty …
//   ninety, hundred, thousand, half); once, twice.
// - Units: mg, mcg, g, kg, mL, L, unit(s), %; dose(s), injection(s), tablet(s), pen(s),
//   syringe(s), shot(s), attack(s), time(s); minute(s), hour(s), day(s), week(s),
//   month(s), year(s); and the frequency words daily, weekly, monthly, yearly, hourly,
//   nightly. "half a tablet" and "once a month" (a / an / per / every / each between the
//   number and a unit) are one claim.
// - A range ("50 to 200 mg", "50-200 mg") is one claim, so it must appear as a range.
// - A frequency word on its own ("daily") is a claim too.
//
// Matching: the claim's words must appear next to each other in the label. Spacing
// never matters ("120mg" = "120 mg"), and capitals don't matter in units ("120 MG" =
// "120 mg", owner's decision 3B). Everything else must match exactly: "2" isn't "two",
// "dose" isn't "doses".
//
// Limits (the grader sample covers these, FR-036): the check can't tell which dose a
// number belongs to (240 mg is in the Emgality label as the loading dose), and it can't
// see frequency said without a number or frequency word ("each week").

const NUMBER_WORDS = new Set([
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
  "hundred",
  "thousand",
  "half",
  "once",
  "twice",
]);

const FREQUENCY_WORDS = new Set(["daily", "weekly", "monthly", "yearly", "hourly", "nightly"]);

/** Units, lowercase. Capitals don't matter when matching a unit. */
const UNITS = new Set([
  "mg",
  "mcg",
  "g",
  "kg",
  "ml",
  "l",
  "unit",
  "units",
  "%",
  "dose",
  "doses",
  "injection",
  "injections",
  "tablet",
  "tablets",
  "pen",
  "pens",
  "syringe",
  "syringes",
  "shot",
  "shots",
  "attack",
  "attacks",
  "time",
  "times",
  "minute",
  "minutes",
  "hour",
  "hours",
  "day",
  "days",
  "week",
  "weeks",
  "month",
  "months",
  "year",
  "years",
  ...FREQUENCY_WORDS,
]);

/** Words that may sit between a number and its unit ("once a month"). */
const LINK_WORDS = new Set(["a", "an", "per", "every", "each"]);

/** Words and dashes that join a range ("50 to 200", "50-200"). */
const RANGE_WORDS = new Set(["to", "-", "–", "—"]);

/** Digits (with decimals or commas), words, "%", and dashes. Spaces are dropped. */
const TOKEN = /\d+(?:[.,]\d+)*|[\p{L}]+|%|[-–—]/gu;

function tokens(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

function isDigits(token: string): boolean {
  return /^\d/.test(token);
}

function isNumber(token: string): boolean {
  return isDigits(token) || NUMBER_WORDS.has(token.toLowerCase());
}

function isUnit(token: string | undefined): boolean {
  return token !== undefined && UNITS.has(token.toLowerCase());
}

/** One number claim: its words, in order. */
export type NumberClaim = { text: string; tokens: string[] };

/** Every number claim in the summary, in order. */
export function findNumberClaims(summary: string): NumberClaim[] {
  const all = tokens(summary);
  const claims: NumberClaim[] = [];
  let i = 0;
  while (i < all.length) {
    const token = all[i]!;
    if (isNumber(token)) {
      let end = i + 1;
      // A range: number, "to" or a dash, number.
      if (RANGE_WORDS.has(all[end]?.toLowerCase() ?? "") && isNumber(all[end + 1] ?? "")) {
        end += 2;
      }
      if (isUnit(all[end])) {
        end += 1;
      } else if (LINK_WORDS.has(all[end]?.toLowerCase() ?? "") && isUnit(all[end + 1])) {
        end += 2;
      }
      const claim = all.slice(i, end);
      claims.push({ text: claim.join(" "), tokens: claim });
      i = end;
      continue;
    }
    if (FREQUENCY_WORDS.has(token.toLowerCase())) {
      claims.push({ text: token, tokens: [token] });
    }
    i += 1;
  }
  return claims;
}

function sameToken(claimToken: string, labelToken: string): boolean {
  if (isUnit(claimToken)) return claimToken.toLowerCase() === labelToken.toLowerCase();
  return claimToken === labelToken;
}

/** True if the claim's words appear next to each other in the label's words. */
function inLabel(claim: NumberClaim, labelTokens: readonly string[]): boolean {
  for (let start = 0; start + claim.tokens.length <= labelTokens.length; start++) {
    if (claim.tokens.every((token, k) => sameToken(token, labelTokens[start + k]!))) {
      return true;
    }
  }
  return false;
}

export type DosingNumberResult = { ok: boolean; claims: NumberClaim[]; missing: NumberClaim[] };

/** Checks every number claim in the summary against the section text. */
export function checkDosingNumbers(summary: string, sectionText: string): DosingNumberResult {
  const labelTokens = tokens(sectionText);
  const claims = findNumberClaims(summary);
  const missing = claims.filter((claim) => !inLabel(claim, labelTokens));
  return { ok: missing.length === 0, claims, missing };
}
