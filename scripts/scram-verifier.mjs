// Makes a Postgres "SCRAM verifier" (the scrambled form Postgres stores passwords in)
// for the ai_tests_writer login, so the real password is never typed into SQL and
// never lands in any database log.
//
// Run it in your own Terminal (not the `!` prompt in Claude Code):
//   node scripts/scram-verifier.mjs
//
// What it does:
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
  const first = await askHidden("New ai_tests_writer password (hidden): ");
  const second = await askHidden("Type it again (hidden): ");
  if (first !== second) throw new Error("The two entries don't match. Nothing was made.");
  if (!/^[A-Za-z0-9]{40,}$/.test(first)) {
    throw new Error("Use 40 or more letters and numbers only (no symbols). Nothing was made.");
  }
  const verifier = scramVerifier(first);
  console.log("\nPaste this one line into the ONLINE SQL Editor and run it:\n");
  console.log(`alter role ai_tests_writer with login password '${verifier}';\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
