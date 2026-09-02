import "dotenv/config";
import { db } from "../index";
import { tokens } from "../schema";

// ════════════════════════════════════════════
// Icon URL strategy (multi-source fallback):
//
// 1. CryptoLogos.cc — https://cryptologos.cc/logos/{slug}-logo.png
//    Best quality, ~570 major coins. Verified slugs below.
//
// 2. CoinMarketCap CDN — https://s2.coinmarketcap.com/static/img/coins/128x128/{cmc_id}.png
//    Huge coverage. CMC IDs: XLM=512, BTC=1, ETH=1027, USDC=3408, EURC=20641
//
// 3. spothq/cryptocurrency-icons via jsDelivr CDN:
//    https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/128/color/{symbol}.png
//    CC0 license, ~500 coins, reliable CDN.
//
// 4. Token project's own domain (stellar.toml image) — last resort.
//
// The `tomlImage` field below uses the BEST available URL for each token.
// The backend icon-resolver job will later download these locally.
// ════════════════════════════════════════════

const KNOWN_TOKENS = [
  {
    assetType: "native" as const,
    assetCode: "XLM",
    assetIssuer: null,
    homeDomain: "stellar.org",
    tomlName: "Stellar Lumens",
    tomlOrg: "Stellar Development Foundation",
    tomlImage: "https://cryptologos.cc/logos/stellar-xlm-logo.png",
    ratingAverage: "10.0",
    isVerified: true,
    isFeatured: true,
  },
  {
    assetType: "credit_alphanum4" as const,
    assetCode: "yXLM",
    assetIssuer: "GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55",
    homeDomain: "ultracapital.xyz",
    tomlName: "Yield XLM",
    tomlOrg: "Ultra Capital LLC dba Ultra Capital",
    // yXLM has no CryptoLogos entry — use CMC CDN (CMC ID 13573)
    tomlImage: "https://s2.coinmarketcap.com/static/img/coins/128x128/13573.png",
    anchorAsset: "XLM",
    anchorType: "crypto",
    ratingAverage: "9.7",
    isVerified: true,
    isFeatured: true,
  },
  {
    assetType: "credit_alphanum4" as const,
    assetCode: "USDC",
    assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    homeDomain: "circle.com",
    tomlName: "USD Coin",
    tomlOrg: "Circle Internet Financial, LLC",
    // CryptoLogos slug: "usd-coin-usdc"
    tomlImage: "https://cryptologos.cc/logos/usd-coin-usdc-logo.png",
    anchorAsset: "USD",
    anchorType: "fiat",
    ratingAverage: "9.0",
    isVerified: true,
    isFeatured: true,
  },
  {
    assetType: "credit_alphanum4" as const,
    assetCode: "BTC",
    assetIssuer: "GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM",
    homeDomain: "ultracapital.xyz",
    tomlName: "Bitcoin",
    tomlOrg: "Ultra Capital LLC dba Ultra Capital",
    // CryptoLogos slug: "bitcoin-btc"
    tomlImage: "https://cryptologos.cc/logos/bitcoin-btc-logo.png",
    anchorAsset: "BTC",
    anchorType: "crypto",
    ratingAverage: "8.3",
    isVerified: true,
    isFeatured: true,
  },
  {
    assetType: "credit_alphanum4" as const,
    assetCode: "AQUA",
    assetIssuer: "GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA",
    homeDomain: "aqua.network",
    tomlName: "Aquarius",
    tomlOrg: "Aquarius",
    // AQUA is not on CryptoLogos — use the project's own logo (known stable)
    tomlImage: "https://aqua.network/assets/img/aqua-logo.png",
    ratingAverage: "7.8",
    isVerified: true,
    isFeatured: true,
  },
  {
    assetType: "credit_alphanum4" as const,
    assetCode: "EURC",
    assetIssuer: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP",
    homeDomain: "circle.com",
    tomlName: "Euro Coin",
    tomlOrg: "Circle",
    // CryptoLogos slug: "eurc-eurc"  (listed as "EURC (EURC)")
    tomlImage: "https://cryptologos.cc/logos/eurc-eurc-logo.png",
    anchorAsset: "EUR",
    anchorType: "fiat",
    ratingAverage: "7.5",
    isVerified: true,
    isFeatured: true,
  },
  {
    assetType: "credit_alphanum4" as const,
    assetCode: "ETH",
    assetIssuer: "GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM",
    homeDomain: "ultrastellar.com",
    tomlName: "Ethereum",
    tomlOrg: "Ultra Stellar LLC",
    // CryptoLogos slug: "ethereum-eth"
    tomlImage: "https://cryptologos.cc/logos/ethereum-eth-logo.png",
    ratingAverage: "7.0",
    isVerified: true,
    isFeatured: true,
  },
];

async function seed() {
  console.log("Seeding known tokens...");

  for (const token of KNOWN_TOKENS) {
    await db
      .insert(tokens)
      .values(token)
      .onConflictDoUpdate({
        target: [tokens.assetCode, tokens.assetIssuer],
        set: {
          // Always refresh metadata & icon URLs on re-seed
          tomlImage: token.tomlImage,
          tomlName: token.tomlName,
          tomlOrg: token.tomlOrg,
          homeDomain: token.homeDomain ?? null,
          anchorAsset: token.anchorAsset ?? null,
          anchorType: token.anchorType ?? null,
          // Also update these so the seed can fix rating/flags if needed
          ratingAverage: token.ratingAverage,
          isVerified: token.isVerified,
          isFeatured: token.isFeatured,
          updatedAt: new Date(),
        },
      });
    console.log(`  ✓ ${token.assetCode}`);
  }

  console.log("Done! Seeded", KNOWN_TOKENS.length, "tokens.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
