// Makes a Postgres "SCRAM verifier" (the scrambled form Postgres stores passwords in)
// for one of the project's limited database logins, so the real password is never
// typed into SQL and never lands in any database log.
//
// Run it in your own Terminal (not the `!` prompt in Claude Code), naming the role:
//   node scripts/scram-verifier.mjs ai_tests_writer
//   node scripts/scram-verifier.mjs ai_gate_reader
//
// Only those two roles are allowed. Any other name (or none) is refused before a
// password is asked for, so the printed line can never be for the wrong role. Run
// the printed line exactly as printed, with no editing (T071 steps 2 and 4).
//
// What it does:
//   * Prints which role the password is for.
//   * Asks for the password twice. Your typing is hidden (nothing shows on screen).
//   * Checks: 40 or more characters, letters and numbers only, both entries match.
//   * Prints one SQL line with the scrambled version. Nothing is saved to a file or
//     sent anywhere. It uses only Node's built-in tools (no downloads).
//
// The scrambled version can't be turned back into the password. With a 48-character
// random password, guessing it from the scrambled version isn't practical.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

const ITERATIONS = 4096; // Postgres's default for SCRAM-SHA-256

/** The only roles this script makes passwords for. */
export const ALLOWED_ROLES = ["ai_tests_writer", "ai_gate_reader"];

/** Returns the role if it is allowed; otherwise throws, naming the allowed roles. */
export function checkRole(role) {
  if (!ALLOWED_ROLES.includes(role)) {
    throw new Error(
      `Unknown role "${role ?? ""}". Use one of: ${ALLOWED_ROLES.join(", ")}. ` +
        "Example: node scripts/scram-verifier.mjs ai_gate_reader. Nothing was made.",
    );
  }
  return role;
}

/** The one SQL line to run online, for an allowed role. */
export function alterRoleLine(role, verifier) {
  return `alter role ${checkRole(role)} with login password '${verifier}';`;
}

/** Builds the verifier exactly as Postgres does (RFC 5802 / RFC 7677). */
export function scramVerifier(password, salt = randomBytes(16)) {
  const salted = pbkdf2Sync(Buffer.from(password, "utf8"), salt, ITERATIONS, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return (
    `SCRAM-SHA-256$${ITERATIONS}:${salt.toString("base64")}` +
    `$${storedKey.toString("base64")}:${serverKey.toString("base64")}`
  );
}

/** Reads one line from the terminal without showing what is typed. */
function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY) {
      reject(new Error("Run this in your own Terminal window, so the typing can be hidden."));
      return;
    }
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    let value = "";
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          // Ctrl+C
          input.setRawMode(false);
          process.stdout.write("\nStopped.\n");
          process.exit(1);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    input.on("data", onData);
  });
}

async function main() {
  const role = checkRole(process.argv[2]);
  console.log(`Making a scrambled password for: ${role}`);
  const first = await askHidden(`New ${role} password (hidden): `);
  const second = await askHidden("Type it again (hidden): ");
  if (first !== second) throw new Error("The two entries don't match. Nothing was made.");
  if (!/^[A-Za-z0-9]{40,}$/.test(first)) {
    throw new Error("Use 40 or more letters and numbers only (no symbols). Nothing was made.");
  }
  const verifier = scramVerifier(first);
  console.log("\nPaste this one line into the ONLINE SQL Editor and run it:\n");
  console.log(`${alterRoleLine(role, verifier)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
