// icon-resolver.ts
// Multi-source token icon resolver with local download + caching

import fs from 'fs/promises';
import path from 'path';
import { db } from '../db';
import { tokens } from '../db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { validateExternalUrl } from './url-validator';

const ICON_DIR = path.resolve(__dirname, '../../assets/icons');

// Map of asset codes to their CryptoLogos.cc slugs
const CRYPTOLOGOS_SLUGS: Record<string, string> = {
  XLM: 'stellar-xlm',
  BTC: 'bitcoin-btc',
  ETH: 'ethereum-eth',
  USDC: 'usd-coin-usdc',
  EURC: 'euro-coin-eurc',
  AQUA: 'aquarius-aqua',
  yXLM: '', // not on cryptologos
};

// Map of asset codes to CoinMarketCap IDs
const CMC_IDS: Record<string, number> = {
  XLM: 512,
  BTC: 1,
  ETH: 1027,
  USDC: 3408,
  EURC: 20641,
  AQUA: 6636,
  USDT: 825,
  DAI: 4943,
  LINK: 1975,
  DOT: 6636,
  SOL: 5426,
  ADA: 2010,
  DOGE: 74,
  XRP: 52,
};

interface IconSource {
  name: string;
  getUrl: (code: string, issuer?: string) => string | null;
}

const sources: IconSource[] = [
  {
    name: 'cryptologos',
    getUrl: (code: string) => {
      const slug = CRYPTOLOGOS_SLUGS[code.toUpperCase()];
      if (!slug) return null;
      return `https://cryptologos.cc/logos/${slug}-logo.png`;
    },
  },
  {
    name: 'coinmarketcap',
    getUrl: (code: string) => {
      const id = CMC_IDS[code.toUpperCase()];
      if (!id) return null;
      return `https://s2.coinmarketcap.com/static/img/coins/128x128/${id}.png`;
    },
  },
  {
    name: 'spothq',
    getUrl: (code: string) => {
      // jsdelivr CDN for the spothq/cryptocurrency-icons repo
      return `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/128/color/${code.toLowerCase()}.png`;
    },
  },
];

/**
 * Download a single icon from the first source that responds with a valid image.
 * Saves it locally as `{CODE}-{ISSUER_SHORT}.png` and returns the local path.
 */
export async function resolveIcon(
  code: string,
  issuer?: string
): Promise<string | null> {
  // Ensure directory exists
  await fs.mkdir(ICON_DIR, { recursive: true });

  const filename = issuer
    ? `${code.toLowerCase()}-${issuer.substring(0, 8).toLowerCase()}.png`
    : `${code.toLowerCase()}.png`;
  const localPath = path.join(ICON_DIR, filename);

  // If already downloaded, return path
  try {
    await fs.access(localPath);
    return `/assets/icons/${filename}`;
  } catch {
    // not cached yet
  }

  // Try each source in order
  for (const source of sources) {
    const url = source.getUrl(code, issuer);
    if (!url) continue;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('image')) continue;

      const buffer = Buffer.from(await response.arrayBuffer());

      // Sanity check: at least 100 bytes (not an error page)
      if (buffer.length < 100) continue;

      await fs.writeFile(localPath, buffer);
      console.log(
        `[icon-resolver] Downloaded ${code} from ${source.name}: ${filename}`
      );
      return `/assets/icons/${filename}`;
    } catch (err) {
      console.warn(
        `[icon-resolver] Failed ${source.name} for ${code}:`,
        (err as Error).message
      );
      continue;
    }
  }

  // Silent: no icon for this token
  return null;
}

/**
 * Batch-resolve icons for all tokens that are missing a localIcon.
 * Called by the token indexer job.
 */
export async function syncAllIcons(): Promise<void> {
  console.log('[icon-resolver] Starting batch icon sync...');

  // Get tokens that have no local icon yet
  const missing = await db
    .select({
      id: tokens.id,
      assetCode: tokens.assetCode,
      assetIssuer: tokens.assetIssuer,
      tomlImage: tokens.tomlImage,
    })
    .from(tokens)
    .where(isNull(tokens.localIcon));

  let resolved = 0;

  for (const token of missing) {
    // Skip tokens with no asset code — can't resolve an icon without it
    if (!token.assetCode) {
      // console.warn(`[icon-resolver] Skipping token id=${token.id}: no assetCode`);
      continue;
    }

    // At this point TypeScript knows assetCode is string (narrowed by the guard)
    let iconPath = await resolveIcon(
      token.assetCode,
      token.assetIssuer ?? undefined
    );

    // If external sources fail, fall back to TOML image
    if (!iconPath && token.tomlImage) {
      try {
        await fs.mkdir(ICON_DIR, { recursive: true });
        const filename = token.assetIssuer
          ? `${token.assetCode.toLowerCase()}-${token.assetIssuer.substring(0, 8).toLowerCase()}.png`
          : `${token.assetCode.toLowerCase()}.png`;
        const localPath = path.join(ICON_DIR, filename);

        try {
          validateExternalUrl(token.tomlImage);
        } catch {
          // Skip unsafe TOML image URLs
          continue;
        }
        const resp = await fetch(token.tomlImage, {
          signal: AbortSignal.timeout(5000),
        });
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer());
          if (buf.length >= 100) {
            await fs.writeFile(localPath, buf);
            iconPath = `/assets/icons/${filename}`;
          }
        }
      } catch {}
    }

    if (iconPath) {
      await db
        .update(tokens)
        .set({ localIcon: iconPath, updatedAt: new Date() })
        .where(eq(tokens.id, token.id));
      resolved++;
    }

    // Rate limit: 200ms between downloads
    await new Promise((r) => setTimeout(r, 200));
  }


  console.log(
    `[icon-resolver] Resolved ${resolved}/${missing.length} icons`
  );
}
