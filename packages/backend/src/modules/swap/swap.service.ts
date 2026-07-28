import * as StellarSdk from "@stellar/stellar-sdk";
import { stellarClient } from "../../lib/stellar-client";
import { cache } from "../../lib/cache.js";

interface SwapQuote {
  source: string;                // "SDEX" | "AMM" | "SOROSWAP" | "PATH"
  sourceAsset: { code: string; issuer?: string };
  destAsset: { code: string; issuer?: string };
  sourceAmount: string;
  destAmount: string;
  path: Array<{ code: string; issuer?: string }>;
  priceImpact: string;
  fee: string;
}

export class SwapService {
  // ─── Get best quote across all liquidity sources ───
  async getBestQuote(
    fromCode: string, fromIssuer: string | null,
    toCode: string, toIssuer: string | null,
    amount: string,
    direction: "send" | "receive" = "send"
  ): Promise<SwapQuote[]> {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      throw new Error("amount must be a positive number");
    }

    const sourceAsset = fromIssuer
      ? new StellarSdk.Asset(fromCode, fromIssuer)
      : StellarSdk.Asset.native();

    const destAsset = toIssuer
      ? new StellarSdk.Asset(toCode, toIssuer)
      : StellarSdk.Asset.native();

    // Query all sources in parallel
    const [horizonPaths, directOrderbook, ammPrice] = await Promise.all([
      this.getHorizonPaths(sourceAsset, destAsset, amount, direction),
      this.getDirectOrderbookQuote(sourceAsset, destAsset, amount),
      this.getAmmQuote(sourceAsset, destAsset, amount),
    ]);

    const allQuotes: SwapQuote[] = [
      ...horizonPaths,
      ...(directOrderbook ? [directOrderbook] : []),
      ...(ammPrice ? [ammPrice] : []),
    ];

    // Sort by best destination amount (descending)
    allQuotes.sort((a, b) =>
      parseFloat(b.destAmount) - parseFloat(a.destAmount)
    );

    return allQuotes;
  }

  // ─── Horizon path finding (SDEX + AMM combined) ───
  private async getHorizonPaths(
    source: StellarSdk.Asset,
    dest: StellarSdk.Asset,
    amount: string,
    direction: "send" | "receive"
  ): Promise<SwapQuote[]> {
    try {
      let paths;
      if (direction === "send") {
        paths = await stellarClient.horizon
          .strictSendPaths(source, amount, [dest])
          .limit(5)
          .call();
      } else {
        paths = await stellarClient.horizon
          .strictReceivePaths([source], dest, amount)
          .limit(5)
          .call();
      }

      return paths.records.map((p: any) => ({
        source: "PATH",
        sourceAsset: { code: source.code, issuer: source.issuer },
        destAsset: { code: dest.code, issuer: dest.issuer },
        sourceAmount: p.source_amount,
        destAmount: p.destination_amount,
        path: p.path.map((a: any) => ({
          code: a.asset_type === "native" ? "XLM" : a.asset_code,
          issuer: a.asset_issuer || undefined,
        })),
        priceImpact: "0", // Horizon doesn't directly report this
        fee: "0.0000100", // base fee
      }));
    } catch {
      return [];
    }
  }

  // ─── Direct orderbook quote ───
  private async getDirectOrderbookQuote(
    source: StellarSdk.Asset,
    dest: StellarSdk.Asset,
    amount: string
  ): Promise<SwapQuote | null> {
    try {
      const ob = await stellarClient.horizon
        .orderbook(source, dest)
        .call();

      if (ob.asks.length === 0) return null;

      // Walk the orderbook to fill the amount
      let remaining = parseFloat(amount);
      let totalDest = 0;

      for (const ask of ob.asks) {
        const availableSource = parseFloat(ask.amount);
        const price = parseFloat(ask.price);
        const fillAmount = Math.min(remaining, availableSource);

        totalDest += fillAmount * price;
        remaining -= fillAmount;

        if (remaining <= 0) break;
      }

      if (remaining > 0) return null; // insufficient liquidity

      return {
        source: "SDEX",
        sourceAsset: { code: source.code, issuer: source.issuer },
        destAsset: { code: dest.code, issuer: dest.issuer },
        sourceAmount: amount,
        destAmount: totalDest.toFixed(7),
        path: [],
        priceImpact: this.calcPriceImpact(ob.asks, amount),
        fee: "0.0000100",
      };
    } catch {
      return null;
    }
  }

  // ─── AMM pool quote ───
  private async getAmmQuote(
    source: StellarSdk.Asset,
    dest: StellarSdk.Asset,
    amount: string
  ): Promise<SwapQuote | null> {
    try {
      // Find pool with these two assets
      const pools = await stellarClient.horizon
        .liquidityPools()
        .forAssets(source, dest)
        .limit(1)
        .call();

      if (pools.records.length === 0) return null;

      const pool = pools.records[0];
      const reserveA = parseFloat(pool.reserves[0].amount);
      const reserveB = parseFloat(pool.reserves[1].amount);
      const inputAmount = parseFloat(amount);

      // Determine which reserve is source
      const isSourceA =
        (pool.reserves[0].asset === "native" && source.isNative()) ||
        pool.reserves[0].asset === `${source.code}:${source.issuer}`;

      const [inputReserve, outputReserve] = isSourceA
        ? [reserveA, reserveB]
        : [reserveB, reserveA];

      // Constant product formula with 0.30% fee
      const inputWithFee = inputAmount * 0.997;
      const outputAmount =
        (outputReserve * inputWithFee) / (inputReserve + inputWithFee);

      const priceImpact =
        ((inputAmount / inputReserve) * 100).toFixed(2);

      return {
        source: "AMM",
        sourceAsset: { code: source.code, issuer: source.issuer },
        destAsset: { code: dest.code, issuer: dest.issuer },
        sourceAmount: amount,
        destAmount: outputAmount.toFixed(7),
        path: [],
        priceImpact,
        fee: (inputAmount * 0.003).toFixed(7),
      };
    } catch {
      return null;
    }
  }

  // ─── Build the actual swap transaction ───
  async buildSwapTransaction(
    signerPublicKey: string,
    quote: SwapQuote,
    slippageBps: number = 100 // 1% default slippage
  ): Promise<string> {
    const stellar = stellarClient.stellar;
    const sourceKp = { publicKey: signerPublicKey } as any;

    const sourceAsset = quote.sourceAsset.issuer
      ? new StellarSdk.Asset(quote.sourceAsset.code, quote.sourceAsset.issuer)
      : StellarSdk.Asset.native();

    const destAsset = quote.destAsset.issuer
      ? new StellarSdk.Asset(quote.destAsset.code, quote.destAsset.issuer)
      : StellarSdk.Asset.native();

    const minDest = (
      parseFloat(quote.destAmount) * (1 - slippageBps / 10000)
    ).toFixed(7);

    const account = await stellarClient.horizon.loadAccount(signerPublicKey);

    let tx;
    if (quote.path.length > 0 || quote.source === "PATH") {
      // Path payment (crosses SDEX + AMM automatically)
      const pathAssets = quote.path.map((p) =>
        p.issuer ? new StellarSdk.Asset(p.code, p.issuer) : StellarSdk.Asset.native()
      );

      tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: stellarClient.networkPassphrase,
      })
        .addOperation(
          StellarSdk.Operation.pathPaymentStrictSend({
            sendAsset: sourceAsset,
            sendAmount: quote.sourceAmount,
            destination: signerPublicKey, // self-swap
            destAsset: destAsset,
            destMin: minDest,
            path: pathAssets,
          })
        )
        .setTimeout(180)
        .build();
    } else {
      // Direct SDEX swap via manage sell offer
      tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: stellarClient.networkPassphrase,
      })
        .addOperation(
          StellarSdk.Operation.pathPaymentStrictSend({
            sendAsset: sourceAsset,
            sendAmount: quote.sourceAmount,
            destination: signerPublicKey,
            destAsset: destAsset,
            destMin: minDest,
            path: [],
          })
        )
        .setTimeout(180)
        .build();
    }

    // Return unsigned XDR for client-side signing
    return tx.toXDR();
  }

  private calcPriceImpact(asks: any[], amount: string): string {
    if (asks.length === 0) return "0";
    const parsedAmount = parseFloat(amount);
    if (parsedAmount <= 0 || isNaN(parsedAmount)) return "0";
    const spotPrice = parseFloat(asks[0].price);
    if (spotPrice <= 0 || isNaN(spotPrice)) return "0";
    let remaining = parsedAmount;
    let totalCost = 0;

    for (const ask of asks) {
      const fill = Math.min(remaining, parseFloat(ask.amount));
      totalCost += fill * parseFloat(ask.price);
      remaining -= fill;
      if (remaining <= 0) break;
    }

    const avgPrice = totalCost / parsedAmount;
    return (((avgPrice - spotPrice) / spotPrice) * 100).toFixed(2);
  }
}

