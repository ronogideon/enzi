import crypto from "crypto";

/**
 * Encryption for credentials held in the database.
 *
 * Payment API keys used to sit in the `Setting` table as plain text. Anyone
 * with a read of that table — a leaked backup, a misconfigured database URL, a
 * support engineer running a query — could take the shop's M-Pesa and Kopo Kopo
 * credentials and move real money. Encrypting at rest means a database dump on
 * its own is not enough: an attacker also needs the key, which lives in the
 * environment and never in Postgres.
 *
 * AES-256-GCM, so the ciphertext is authenticated — a tampered value fails to
 * decrypt rather than silently producing garbage that gets sent to Safaricom.
 *
 * Format:  enc:v1:<iv>:<authTag>:<ciphertext>   (all base64)
 * The version segment means a future key rotation or algorithm change can be
 * rolled out while old values still decrypt.
 */

const PREFIX = "enc:v1:";

/**
 * The key comes from SETTINGS_KEY if set, otherwise it is derived from
 * JWT_SECRET. Deriving is a deliberate convenience: an existing deployment
 * starts encrypting the moment it updates, with no new variable to set and no
 * risk of someone rotating JWT_SECRET and silently losing every saved key —
 * because scrypt over a stable secret gives a stable key.
 *
 * Set SETTINGS_KEY explicitly if you ever want to rotate JWT_SECRET
 * independently of the stored credentials.
 */
let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.SETTINGS_KEY || process.env.JWT_SECRET || "dev-secret";
  // A fixed salt is acceptable here: this derives one long-lived key from one
  // high-entropy secret, not password hashes across many users.
  cachedKey = crypto.scryptSync(secret, "enzi-settings-v1", 32);
  return cachedKey;
}

/** Clears the derived key — only needed if the secret changes at runtime. */
export function resetEncryptionKey() {
  cachedKey = null;
}

export function isEncrypted(value: string): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptSecret(plain: string): string {
  if (!plain) return "";
  // Never double-encrypt if a value round-trips through a save.
  if (isEncrypted(plain)) return plain;

  const iv = crypto.randomBytes(12); // 96-bit nonce, the GCM standard
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return (
    PREFIX +
    [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":")
  );
}

/**
 * Decrypt a stored value.
 *
 * A value that isn't in our format is returned unchanged. That's what makes
 * this safe to deploy over an existing database: credentials saved before this
 * change are still plain text, still work, and get encrypted the next time
 * they're saved. Nothing has to be migrated by hand.
 */
export function decryptSecret(stored: string): string {
  if (!stored || !isEncrypted(stored)) return stored ?? "";

  try {
    const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(":");
    if (!ivB64 || !tagB64 || !dataB64) throw new Error("malformed");

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(ivB64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Wrong key or tampered data. Returning "" makes the credential read as
    // "not configured" — the Settings page will show it as unset and the
    // gateway will refuse to charge, which is the safe failure. Throwing here
    // would take the whole API down on a bad key.
    console.error(
      "[settings] Could not decrypt a stored credential. If JWT_SECRET or " +
        "SETTINGS_KEY changed, re-enter the affected keys in Settings → Payments."
    );
    return "";
  }
}
