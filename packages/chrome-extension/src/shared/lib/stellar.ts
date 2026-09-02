import * as StellarSdk from "@stellar/stellar-sdk";
import { HORIZON_URL, NETWORK_PASSPHRASE, FRIENDBOT_URL } from "./constants";
import { signingApi } from "./api";
import { useAuthStore } from "../store/auth";

const server = new StellarSdk.Horizon.Server(HORIZON_URL);

export function generateKeypair() {
  const pair = StellarSdk.Keypair.random();
  return { publicKey: pair.publicKey(), secretKey: pair.secret() };
}

export function keypairFromSecret(secret: string) {
  const pair = StellarSdk.Keypair.fromSecret(secret);
  return { publicKey: pair.publicKey(), secretKey: pair.secret() };
}

export async function fundTestnet(publicKey: string) {
  const res = await fetch(`${FRIENDBOT_URL}?addr=${publicKey}`);
  if (!res.ok) throw new Error("Friendbot funding failed");
  return res.json();
}

export async function loadAccount(publicKey: string) {
  return server.loadAccount(publicKey);
}

// ─── Signing mode helper ───────────────────────────────────
function getSigningMode(): "self" | "delegated" {
  const state = useAuthStore.getState();
  return state.signingMode === "delegated" ? "delegated" : "self";
}

// ─── Sign and submit with mode routing ─────────────────────
export async function signAndSubmitXdr(
  xdr: string,
  networkPassphrase: string,
  secretKey?: string
): Promise<any> {
  const mode = getSigningMode();

  if (mode === "delegated") {
    return signingApi.signAndSubmit(xdr, networkPassphrase);
  }

  // Self-custody: sign locally and submit
  if (!secretKey) throw new Error("Secret key is required for self-custody signing");
  const tx = StellarSdk.TransactionBuilder.fromXDR(xdr, networkPassphrase);
  if (tx instanceof StellarSdk.FeeBumpTransaction) {
    throw new Error("Fee bump transactions are not supported for local signing");
  }
  const keypair = StellarSdk.Keypair.fromSecret(secretKey);
  tx.sign(keypair);
  const result = await server.submitTransaction(tx);
  return result;
}

// ─── Legacy functions (kept for backward compatibility) ────
export async function buildPaymentTx(
  senderSecret: string,
  destination: string,
  amount: string,
  assetCode = "XLM",
  assetIssuer?: string
) {
  const keypair = StellarSdk.Keypair.fromSecret(senderSecret);
  const account = await server.loadAccount(keypair.publicKey());
  const asset =
    assetCode === "XLM"
      ? StellarSdk.Asset.native()
      : new StellarSdk.Asset(assetCode, assetIssuer!);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(StellarSdk.Operation.payment({ destination, asset, amount }))
    .setTimeout(180)
    .build();

  tx.sign(keypair);
  return server.submitTransaction(tx);
}

export async function buildTrustlineTx(
  senderSecret: string,
  assetCode: string,
  assetIssuer: string
) {
  const keypair = StellarSdk.Keypair.fromSecret(senderSecret);
  const account = await server.loadAccount(keypair.publicKey());
  const asset = new StellarSdk.Asset(assetCode, assetIssuer);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(StellarSdk.Operation.changeTrust({ asset }))
    .setTimeout(180)
    .build();

  tx.sign(keypair);
  return server.submitTransaction(tx);
}

export function signXdr(xdr: string, secretKey: string): string {
  const tx = StellarSdk.TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
  if (tx instanceof StellarSdk.FeeBumpTransaction) {
    throw new Error("Fee bump transactions are not supported for local signing");
  }
  const keypair = StellarSdk.Keypair.fromSecret(secretKey);
  tx.sign(keypair);
  return tx.toXDR();
}

export { server, StellarSdk };
