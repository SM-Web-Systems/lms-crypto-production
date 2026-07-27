import crypto from "node:crypto";
import { config } from "../config";

const IV_LENGTH = 12; // AES-GCM standard
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  return Buffer.from(config.TOTP_ENCRYPTION_KEY, "hex");
}

export function encryptTotpSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: base64(iv || ciphertext || authTag)
  return Buffer.concat([iv, encrypted, authTag]).toString("base64");
}

export function decryptTotpSecret(ciphertext: string): string {
  const combined = Buffer.from(ciphertext, "base64");
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const encryptedData = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encryptedData), decipher.final()]).toString("utf8");
}
