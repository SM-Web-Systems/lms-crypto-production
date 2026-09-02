import * as StellarSdk from "@stellar/stellar-sdk";
import { config } from "../config";
import { stellarClient } from "./stellar-client";

interface LiquifyResult {
  asset: string;
  amount: string;
  xlmReceived: string;
  txHash: string;
}

/**
 * Auto-liquifier: converts all non-XLM balances in the platform wallet to XLM
 * using Stellar DEX path payments (strict send).
 */
export async function liquifyPlatformFees(): Promise<{
  converted: LiquifyResult[];
  skipped: string[];
  errors: string[];
}> {
  const converted: LiquifyResult[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  const platformKey = config.PLATFORM_WALLET;
  const platformSecret = config.PLATFORM_SECRET;

  if (!platformKey || !platformSecret) {
    errors.push("Platform wallet not configured");
    return { converted, skipped, errors };
  }

  try {
    const account = await stellarClient.horizon.loadAccount(platformKey);
    const nonXlmBalances = account.balances.filter(
      (b: any) => b.asset_type !== "native" && parseFloat(b.balance) > 0.0000001
    );

    if (nonXlmBalances.length === 0) {
      return { converted, skipped: ["No non-XLM balances to convert"], errors };
    }

    console.log(`[liquifier] Found ${nonXlmBalances.length} non-XLM balance(s) to convert`);

    for (const bal of nonXlmBalances) {
      const assetCode = (bal as any).asset_code;
      const assetIssuer = (bal as any).asset_issuer;
      const amount = (bal as any).balance;
      const assetLabel = `${assetCode}:${assetIssuer.slice(0, 8)}...`;

      // Skip dust amounts (less than 0.001)
      if (parseFloat(amount) < 0.001) {
        skipped.push(`${assetLabel} (dust: ${amount})`);
        continue;
      }

      try {
        // Find a DEX path from this asset to XLM
        const asset = new StellarSdk.Asset(assetCode, assetIssuer);
        const xlmAsset = StellarSdk.Asset.native();

        // Use strict send path payment — send all of the token, receive whatever XLM we get
        const paths = await stellarClient.horizon
          .strictSendPaths(asset, amount, [xlmAsset])
          .call();

        if (!paths.records || paths.records.length === 0) {
          skipped.push(`${assetLabel} (no DEX path to XLM)`);
          continue;
        }

        // Pick the best path (highest destination amount)
        const bestPath = paths.records.reduce((best: any, curr: any) =>
          parseFloat(curr.destination_amount) > parseFloat(best.destination_amount) ? curr : best
        );

        const destMin = (parseFloat(bestPath.destination_amount) * 0.98).toFixed(7); // 2% slippage
        const pathAssets = (bestPath.path || []).map((p: any) => {
          if (p.asset_type === "native") return StellarSdk.Asset.native();
          return new StellarSdk.Asset(p.asset_code, p.asset_issuer);
        });

        // Build and submit the swap transaction
        const freshAccount = await stellarClient.horizon.loadAccount(platformKey);
        const tx = new StellarSdk.TransactionBuilder(freshAccount, {
          fee: StellarSdk.BASE_FEE,
          networkPassphrase: stellarClient.networkPassphrase,
        })
          .addOperation(
            StellarSdk.Operation.pathPaymentStrictSend({
              sendAsset: asset,
              sendAmount: amount,
              destination: platformKey, // send to self
              destAsset: xlmAsset,
              destMin,
              path: pathAssets,
            })
          )
          .setTimeout(180)
          .build();

        const keypair = StellarSdk.Keypair.fromSecret(platformSecret);
        tx.sign(keypair);

        const result = await stellarClient.horizon.submitTransaction(tx);
        const txHash = (result as any).hash || "unknown";

        converted.push({
          asset: assetLabel,
          amount,
          xlmReceived: bestPath.destination_amount,
          txHash,
        });

        console.log(`[liquifier] ✅ Converted ${amount} ${assetCode} → ~${bestPath.destination_amount} XLM (tx: ${txHash.slice(0, 12)}...)`);
      } catch (swapErr: any) {
        const errMsg = swapErr?.response?.data?.extras?.result_codes
          ? JSON.stringify(swapErr.response.data.extras.result_codes)
          : swapErr.message;
        errors.push(`${assetLabel}: ${errMsg}`);
        console.error(`[liquifier] ❌ Failed to convert ${assetLabel}:`, errMsg);
      }
    }
  } catch (err: any) {
    errors.push(`Account load failed: ${err.message}`);
  }

  return { converted, skipped, errors };
}

/**
 * Remove empty trustlines (zero balance) to free up reserves
 */
export async function cleanupEmptyTrustlines(): Promise<string[]> {
  const removed: string[] = [];
  const platformKey = config.PLATFORM_WALLET;
  const platformSecret = config.PLATFORM_SECRET;

  if (!platformKey || !platformSecret) return removed;

  try {
    const account = await stellarClient.horizon.loadAccount(platformKey);
    const emptyTrustlines = account.balances.filter(
      (b: any) => b.asset_type !== "native" && parseFloat(b.balance) === 0
    );

    for (const bal of emptyTrustlines) {
      try {
        const asset = new StellarSdk.Asset((bal as any).asset_code, (bal as any).asset_issuer);
        const freshAccount = await stellarClient.horizon.loadAccount(platformKey);
        const tx = new StellarSdk.TransactionBuilder(freshAccount, {
          fee: StellarSdk.BASE_FEE,
          networkPassphrase: stellarClient.networkPassphrase,
        })
          .addOperation(StellarSdk.Operation.changeTrust({ asset, limit: "0" }))
          .setTimeout(180)
          .build();

        const keypair = StellarSdk.Keypair.fromSecret(platformSecret);
        tx.sign(keypair);
        await stellarClient.horizon.submitTransaction(tx);
        removed.push(`${(bal as any).asset_code}`);
        console.log(`[liquifier] 🧹 Removed empty trustline: ${(bal as any).asset_code}`);
      } catch (e: any) {
        console.warn(`[liquifier] Failed to remove trustline ${(bal as any).asset_code}:`, e.message);
      }
    }
  } catch {}

  return removed;
}
