import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
// Dedicated key; never derive encryption from authentication secrets.
export function contextKey(): Buffer {
  const encoded =
    process.env.FOLIO_CONTEXT_KEY ||
    (process.env.FOLIO_CONTEXT_KEY_FILE
      ? readFileSync(process.env.FOLIO_CONTEXT_KEY_FILE, "utf8").trim()
      : "");
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded))
    throw Error("Context encryption is unavailable.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded)
    throw Error("Context encryption is unavailable.");
  return key;
}
export function encryptContext(
  text: string,
  userId: string,
  key = contextKey(),
): Uint8Array<ArrayBuffer> {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from("folio-reading-context:v1:" + userId));
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return new Uint8Array(
    Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), data]),
  );
}
export function decryptContext(
  bytes: Uint8Array,
  userId: string,
  key = contextKey(),
): string {
  const data = Buffer.from(bytes);
  if (data.length < 29 || data[0] !== 1) throw Error("Invalid context data.");
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(1, 13), {
    authTagLength: 16,
  });
  decipher.setAAD(Buffer.from("folio-reading-context:v1:" + userId));
  decipher.setAuthTag(data.subarray(13, 29));
  return Buffer.concat([
    decipher.update(data.subarray(29)),
    decipher.final(),
  ]).toString("utf8");
}
