/**
 * Client-side key encryption/decryption.
 * Secret keys NEVER leave the browser unencrypted.
 * They are NEVER sent to the backend.
 */

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;
const ITERATIONS = 100000;

export async function encryptSecretKey(
  secretKey: string,
  pin: string
): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const derivedKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt"]
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    derivedKey,
    encoder.encode(secretKey)
  );

  // Pack: salt (16) + iv (12) + ciphertext
  const packed = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  packed.set(salt, 0);
  packed.set(iv, salt.length);
  packed.set(new Uint8Array(encrypted), salt.length + iv.length);

  return btoa(String.fromCharCode(...packed));
}

export async function decryptSecretKey(
  encryptedBlob: string,
  pin: string
): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const packed = Uint8Array.from(atob(encryptedBlob), (c) => c.charCodeAt(0));

  const salt = packed.slice(0, SALT_LENGTH);
  const iv = packed.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = packed.slice(SALT_LENGTH + IV_LENGTH);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const derivedKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    derivedKey,
    ciphertext
  );

  return decoder.decode(decrypted);
}
