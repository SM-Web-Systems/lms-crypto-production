// packages/mobile/src/shared/lib/stellar.ts
import * as StellarSdk from "@stellar/stellar-sdk";
import * as SecureStore from "expo-secure-store";
import { useWalletStore } from "../store/wallet";
import { useAuthStore } from "../store/auth";

const API_BASE = "https://ammawallet.com";

/**
 * Get the current signing mode from the auth store user preferences.
 * Falls back to "self" if not set.
 */
function getSigningMode(): "self" | "delegated" {
  const state = useAuthStore.getState();
  return state.signingMode === "delegated" ? "delegated" : "self";
}

/**
 * Sign and submit a transaction XDR.
 *
 * - Self-custody mode: signs locally using SecureStore secret key
 * - Delegated mode: sends unsigned XDR to backend for signing + submission
 */
export async function signAndSubmitXdr(
  xdr: string,
  networkPassphrase: string
): Promise<any> {
  const mode = getSigningMode();

  if (mode === "delegated") {
    return signAndSubmitDelegated(xdr, networkPassphrase);
  }

  return signAndSubmitLocal(xdr, networkPassphrase);
}

/**
 * Self-custody: sign locally with SecureStore secret, then submit via API.
 */
async function signAndSubmitLocal(
  xdr: string,
  networkPassphrase: string
): Promise<any> {
  const store = useWalletStore.getState();
  const activeAccount = store.accounts.find(
    (a) => a.id === store.activeAccountId
  );
  if (!activeAccount) throw new Error("No active wallet");

  // Try the correct SecureStore key format
  let secretKey = await SecureStore.getItemAsync(
    `secret_${activeAccount.publicKey}`
  );

  // Fallback to legacy key format
  if (!secretKey) {
    secretKey = await SecureStore.getItemAsync(
      `wallet_secret_${activeAccount.id}`
    );
  }

  if (!secretKey) throw new Error("Secret key not found. Unlock your wallet first.");

  const tx = StellarSdk.TransactionBuilder.fromXDR(xdr, networkPassphrase);
  if (tx instanceof StellarSdk.FeeBumpTransaction) {
    throw new Error("Fee bump transactions are not supported for local signing");
  }
  const keypair = StellarSdk.Keypair.fromSecret(secretKey);
  tx.sign(keypair);

  const res = await fetch(`${API_BASE}/api/v1/transactions/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedXdr: tx.toXDR() }),
  });

  const result = await res.json();
  if (result.error) throw new Error(result.error);
  return result;
}

/**
 * Delegated: send unsigned XDR to backend, which signs and submits.
 */
async function signAndSubmitDelegated(
  xdr: string,
  networkPassphrase: string
): Promise<any> {
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) throw new Error("Not authenticated. Please log in.");

  const res = await fetch(`${API_BASE}/api/v1/transactions/sign-and-submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ xdr, networkPassphrase }),
  });

  if (res.status === 401) {
    // Try to refresh session
    const refreshed = await useAuthStore.getState().refreshSession();
    if (refreshed) {
      const newToken = useAuthStore.getState().accessToken;
      const retryRes = await fetch(
        `${API_BASE}/api/v1/transactions/sign-and-submit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${newToken}`,
          },
          body: JSON.stringify({ xdr, networkPassphrase }),
        }
      );
      const retryResult = await retryRes.json();
      if (retryResult.error) throw new Error(retryResult.error);
      return retryResult;
    }
    throw new Error("Session expired. Please log in again.");
  }

  const result = await res.json();
  if (result.error) throw new Error(result.error);
  return result;
}
