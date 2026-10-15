// Creates a local key without printing it or replacing an existing key.
const { mkdirSync, writeFileSync } = require("node:fs");
const { randomBytes } = require("node:crypto");
mkdirSync(".local", { recursive: true });
try {
  writeFileSync(
    ".local/context-encryption.key",
    randomBytes(32).toString("base64") + "\n",
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "Created ignored local context key. Set FOLIO_CONTEXT_KEY_FILE=.local/context-encryption.key for the server. Back up this key separately from the database.",
  );
} catch (e) {
  if (e.code === "EEXIST")
    console.log("Local context key already exists; left unchanged.");
  else throw e;
}
