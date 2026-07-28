import { db } from "../db/index";
import { tokens } from "../db/schema";
import { eq, and, isNull, isNotNull } from "drizzle-orm";
import { validateExternalUrl } from "./url-validator";

function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// Simple TOML parser for stellar.toml [[CURRENCIES]] image field
function extractCurrencyImage(
  tomlText: string,
  assetCode: string,
  assetIssuer: string
): string | null {
  // Split into currency blocks
  const blocks = tomlText.split("[[CURRENCIES]]").slice(1);

  for (const block of blocks) {
    const codeMatch = block.match(/^code\s*=\s*"([^"]+)"/m);
    const issuerMatch = block.match(/^issuer\s*=\s*"([^"]+)"/m);
    const imageMatch = block.match(/^image\s*=\s*"([^"]+)"/m);

    if (
      codeMatch?.[1] === assetCode &&
      issuerMatch?.[1] === assetIssuer &&
      imageMatch?.[1]
    ) {
      return imageMatch[1];
    }
  }
  return null;
}

export async function syncTomlImages() {
  console.log("[toml-sync] Starting toml image sync...");

  // Find tokens that have a homeDomain but no tomlImage
  const tokensToSync = await db
    .select()
    .from(tokens)
    .where(and(isNull(tokens.tomlImage), isNotNull(tokens.homeDomain)));

  console.log(`[toml-sync] Found ${tokensToSync.length} tokens missing images`);

  for (const token of tokensToSync) {
    if (!token.homeDomain || !token.assetCode || !token.assetIssuer) continue;

    // TypeScript now knows these are strings
    const code: string = token.assetCode;
    const issuer: string = token.assetIssuer;

    try {
        const url = `https://${token.homeDomain}/.well-known/stellar.toml`;
        try {
          validateExternalUrl(url);
        } catch (err: any) {
          console.warn(`[toml-sync] Skipping unsafe URL for ${token.assetCode}: ${err.message}`);
          continue;
        }
        const res = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "text/plain" },
        });

        if (!res.ok) {
        console.warn(`[toml-sync] ${code}: HTTP ${res.status} from ${url}`);
        continue;
        }

        const tomlText = await res.text();
        const imageUrl = extractCurrencyImage(tomlText, code, issuer);

        if (imageUrl && isValidImageUrl(imageUrl)) {
        await db
            .update(tokens)
            .set({ tomlImage: imageUrl, updatedAt: new Date() })
            .where(eq(tokens.id, token.id));
        console.log(`[toml-sync] ✓ ${code} → ${imageUrl}`);
        } else {
        const orgLogoMatch = tomlText.match(/^ORG_LOGO\s*=\s*"([^"]+)"/m);
        const orgLogo = orgLogoMatch?.[1];
        if (orgLogo && isValidImageUrl(orgLogo)) {
            await db
            .update(tokens)
            .set({ tomlImage: orgLogo, updatedAt: new Date() })
            .where(eq(tokens.id, token.id));
            console.log(`[toml-sync] ✓ ${code} (org logo) → ${orgLogo}`);
        } else {
            console.log(`[toml-sync] ✗ ${code}: no image found in toml`);
        }
        }
    } catch (err: any) {
        console.warn(`[toml-sync] ${code}: ${err.message}`);
    }
    }

  console.log("[toml-sync] Done.");
}
