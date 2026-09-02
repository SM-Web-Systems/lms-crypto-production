import * as SecureStore from "expo-secure-store";

export async function encryptSecret(secret: string, pin: string): Promise<string> {
  // Store encrypted with pin as key suffix
  const key = `stellar_secret_${hashPin(pin)}`;
  await SecureStore.setItemAsync(key, secret);
  return key;
}

export async function decryptSecret(encryptedKey: string, pin: string): Promise<string> {
  const key = `stellar_secret_${hashPin(pin)}`;
  const secret = await SecureStore.getItemAsync(key);
  if (!secret) throw new Error("Invalid PIN or no secret found");
  return secret;
}

function hashPin(pin: string): string {
  // Simple hash for key derivation — not crypto-grade but SecureStore handles encryption
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    const char = pin.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
