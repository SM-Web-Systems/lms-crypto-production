import * as StellarSdk from "@stellar/stellar-sdk";
import { getNetworkConfig, HORIZON_URL } from "./constants";
import { signingApi, txApi } from "./api";
import { useAuthStore } from "../store/auth";
import { useWalletStore } from "../store/wallet";

// Default server (mainnet) — used as fallback; HORIZON_URL = https://horizon.stellar.org
const defaultServer = new StellarSdk.Horizon.Server(HORIZON_URL);

/**
 * Get the Horizon server for the current network.
 */
function getServer(): StellarSdk.Horizon.Server {
  const network = useWalletStore.getState().network;
  const config = getNetworkConfig(network);
  return new StellarSdk.Horizon.Server(config.horizonUrl);
}

/**
 * Get the network passphrase for the current network.
 */
function getPassphrase(): string {
  const network = useWalletStore.getState().network;
  return getNetworkConfig(network).networkPassphrase;
}

export function generateKeypair() {
  const pair = StellarSdk.Keypair.random();
  return { publicKey: pair.publicKey(), secretKey: pair.secret() };
}

export function keypairFromSecret(secret: string) {
  const pair = StellarSdk.Keypair.fromSecret(secret);
  return { publicKey: pair.publicKey(), secretKey: pair.secret() };
}

export async function fundTestnet(publicKey: string) {
  const network = useWalletStore.getState().network;
  if (network === "public") throw new Error("Friendbot is not available on mainnet");
  const config = getNetworkConfig(network);
  const res = await fetch(`${config.friendbotUrl}?addr=${publicKey}`);
  if (!res.ok) throw new Error("Friendbot funding failed");
  return res.json();
}

export async function loadAccount(publicKey: string) {
  return getServer().loadAccount(publicKey);
}

function getSigningMode(): "self" | "delegated" {
  const state = useAuthStore.getState();
  return state.signingMode === "delegated" ? "delegated" : "self";
}

export async function signAndSubmitXdr(
  xdr: string,
  networkPassphrase: string,
  secretKey: string
): Promise<any> {
  const mode = getSigningMode();
  if (mode === "delegated") {
    return signingApi.signAndSubmit(xdr, networkPassphrase);
  }
  return signAndSubmitLocal(xdr, networkPassphrase, secretKey);
}

async function signAndSubmitLocal(
  xdr: string,
  networkPassphrase: string,
  secretKey: string
): Promise<any> {
  const tx = StellarSdk.TransactionBuilder.fromXDR(xdr, networkPassphrase);
  if (tx instanceof StellarSdk.FeeBumpTransaction) {
    throw new Error("Fee bump transactions are not supported for local signing");
  }
  const keypair = StellarSdk.Keypair.fromSecret(secretKey);
  tx.sign(keypair);
  return txApi.submit(tx.toXDR());
}

export function signXdr(xdr: string, secretKey: string): string {
  const passphrase = getPassphrase();
  const tx = StellarSdk.TransactionBuilder.fromXDR(xdr, passphrase);
  if (tx instanceof StellarSdk.FeeBumpTransaction) {
    throw new Error("Fee bump transactions are not supported for local signing");
  }
  const keypair = StellarSdk.Keypair.fromSecret(secretKey);
  tx.sign(keypair);
  return tx.toXDR();
}

// Platform fee config
// VITE_PLATFORM_WALLET is baked at build time per environment.
// Mainnet: GDDTYCZLPCPK7PN4IDHHJ7NS4Q7KL6D5BUV6XFRI7WZST23PCOLWJ6LG (funded 2026-07-18)
// Testnet: GAIYVA5B333KNWNXEGMUB3POATDAFWHI74QJ7LTG7OJEEE4ZWSDFMSN5 (Friendbot-funded 2026-07-20)
const PLATFORM_WALLET: string = import.meta.env.VITE_PLATFORM_WALLET || "";
const PLATFORM_FEE_PERCENT = 0.1; // 0.1%

export function calculatePlatformFee(amount: string): string {
  const fee = (parseFloat(amount) * PLATFORM_FEE_PERCENT / 100);
  return fee > 0.0000001 ? fee.toFixed(7) : "0";
}

/**
 * Extract a human-readable error message from a Stellar SDK submission error.
 * The SDK wraps Horizon's JSON response; result codes live in
 * err.response.data.extras.result_codes.
 */
export function extractStellarError(err: any): string {
  const resultCodes = err?.response?.data?.extras?.result_codes;
  if (!resultCodes) {
    return err?.message || "Transaction failed";
  }
  const ops: string[] = resultCodes.operations || [];
  const tx: string = resultCodes.transaction || "";

  if (ops.includes("op_no_destination")) {
    return "Destination account does not exist on Stellar. The recipient must receive at least 1 XLM to activate their account first.";
  }
  if (ops.includes("op_underfunded")) {
    return "Insufficient balance. Each trustline raises your minimum reserve by 0.5 XLM — check your spendable balance before sending.";
  }
  if (ops.includes("op_no_trust")) {
    return "The destination account has no trustline for this asset. They must add the asset first.";
  }
  if (ops.includes("op_line_full")) {
    return "The destination's balance for this asset is at its limit.";
  }
  if (ops.includes("op_not_authorized")) {
    return "The destination is not authorized to hold this asset.";
  }
  if (tx === "tx_bad_seq") {
    return "Transaction sequence error. Please refresh the page and try again.";
  }
  if (tx === "tx_insufficient_fee") {
    return "Network fee too low. Please try again.";
  }
  const code = ops.join(", ") || tx;
  return `Transaction failed: ${code}`;
}

export async function buildPaymentTx(
  senderSecret: string,
  destination: string,
  amount: string,
  assetCode = "XLM",
  assetIssuer?: string
) {
  const srv = getServer();
  const passphrase = getPassphrase();
  const keypair = StellarSdk.Keypair.fromSecret(senderSecret);
  const account = await srv.loadAccount(keypair.publicKey());
  const asset =
    assetCode === "XLM"
      ? StellarSdk.Asset.native()
      : new StellarSdk.Asset(assetCode, assetIssuer!);

  // Pre-flight reserve check for XLM sends
  if (assetCode === "XLM") {
    const subentryCount: number = (account as any).subentry_count ?? 0;
    const minReserve = (2 + subentryCount) * 0.5;
    const xlmBal = parseFloat(
      (account.balances as any[]).find((b) => b.asset_type === "native")?.balance ?? "0"
    );
    const available = xlmBal - minReserve;
    if (parseFloat(amount) > available) {
      throw new Error(
        `Insufficient balance. Spendable: ${available.toFixed(7)} XLM ` +
        `(balance ${xlmBal.toFixed(7)} XLM − reserve ${minReserve.toFixed(1)} XLM` +
        (subentryCount > 0 ? ` incl. ${subentryCount} trustline${subentryCount !== 1 ? "s" : ""}` : "") +
        `).`
      );
    }
  }

  // Calculate fee WITHIN the amount (recipient gets less)
  const feeAmount = calculatePlatformFee(amount);
  const netAmount = feeAmount !== "0"
    ? (parseFloat(amount) - parseFloat(feeAmount)).toFixed(7)
    : amount;

  const builder = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: passphrase,
  })
    .addOperation(StellarSdk.Operation.payment({ destination, asset, amount: netAmount }));

  // Platform fee from the same total
  if (feeAmount !== "0" && PLATFORM_WALLET) {
    builder.addOperation(
      StellarSdk.Operation.payment({
        destination: PLATFORM_WALLET,
        asset,
        amount: feeAmount,
      })
    );
  }

  const tx = builder.setTimeout(180).build();
  tx.sign(keypair);
  return srv.submitTransaction(tx);
}

export async function buildTrustlineTx(senderSecret: string, assetCode: string, assetIssuer: string) {
  const srv = getServer();
  const passphrase = getPassphrase();
  const keypair = StellarSdk.Keypair.fromSecret(senderSecret);
  const account = await srv.loadAccount(keypair.publicKey());
  const asset = new StellarSdk.Asset(assetCode, assetIssuer);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: passphrase,
  })
    .addOperation(StellarSdk.Operation.changeTrust({ asset }))
    .setTimeout(180)
    .build();

  tx.sign(keypair);
  return srv.submitTransaction(tx);
}

// Export for backwards compat
export const server = defaultServer;
export { StellarSdk };
