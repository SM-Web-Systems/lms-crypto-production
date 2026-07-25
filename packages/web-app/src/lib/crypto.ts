const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const ITERATIONS = 600_000;

function ab(arr: Uint8Array): ArrayBuffer {
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(pin);
  const keyMaterial = await crypto.subtle.importKey("raw", ab(raw), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: ab(salt), iterations: ITERATIONS, hash: "SHA-256" } as Pbkdf2Params,
    keyMaterial,
    { name: "AES-GCM", length: 256 } as AesDerivedKeyParams,
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptSecret(secretKey: string, pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(pin, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ab(iv) } as AesGcmParams,
    key,
    new TextEncoder().encode(secretKey)
  );
  const combined = new Uint8Array(salt.length + iv.length + new Uint8Array(ciphertext).length);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptSecret(encrypted: string, pin: string): Promise<string> {
  if (!encrypted || encrypted.length < 100) {
    throw new Error("Wallet data is missing — please log out and log back in to restore it.");
  }
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  if (combined.length < SALT_LENGTH + IV_LENGTH + 17) {
    throw new Error(`Wallet blob too short (${combined.length} bytes) — data may be corrupted.`);
  }
  const salt = combined.slice(0, SALT_LENGTH);
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);
  let key: CryptoKey;
  try {
    key = await deriveKey(pin, salt);
  } catch (e: any) {
    throw new Error("Failed to derive decryption key: " + (e?.message ?? String(e)));
  }
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ab(iv) } as AesGcmParams,
      key,
      ab(ciphertext)
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error("Incorrect PIN — wallet could not be decrypted.");
  }
}
