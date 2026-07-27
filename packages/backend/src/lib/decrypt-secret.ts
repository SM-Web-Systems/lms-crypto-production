import crypto from "crypto";

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const ITERATIONS = 600_000;

export async function decryptSecret(encrypted: string, pin: string): Promise<string> {
  if (!encrypted || encrypted.length < 60) {
    throw new Error("Encrypted data too short or missing");
  }

  const combined = Buffer.from(encrypted, "base64");
  if (combined.length < SALT_LENGTH + IV_LENGTH + 17) {
    throw new Error("Encrypted data too short or corrupted");
  }

  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH);

  // Derive key using PBKDF2 (same params as frontend)
  const key = crypto.pbkdf2Sync(pin, salt, ITERATIONS, 32, "sha256");

  // Decrypt using AES-256-GCM
  const authTagLength = 16;
  const encryptedData = ciphertext.subarray(0, ciphertext.length - authTagLength);
  const authTag = ciphertext.subarray(ciphertext.length - authTagLength);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
