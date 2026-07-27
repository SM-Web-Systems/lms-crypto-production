// packages/backend/src/lib/url-validator.ts
// SSRF prevention: validates that an external URL is safe to fetch.

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
  "instance-data",
]);

function isPrivateIp(hostname: string): boolean {
  // IPv4 patterns
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 127) return true;                       // 127.0.0.0/8 loopback
    if (a === 10) return true;                        // 10.0.0.0/8 private
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true;          // 192.168.0.0/16 private
    if (a === 169 && b === 254) return true;          // 169.254.0.0/16 link-local
    if (a === 0) return true;                         // 0.0.0.0/8
  }

  // IPv6 loopback
  if (hostname === "::1" || hostname === "[::1]") return true;
  // IPv6 unique-local fc00::/7
  if (/^f[cd]/i.test(hostname)) return true;

  return false;
}

export function validateExternalUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`Unsafe URL scheme: ${parsed.protocol} (only https: allowed)`);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    throw new Error(`Blocked hostname: ${hostname}`);
  }

  if (isPrivateIp(hostname)) {
    throw new Error(`Private/reserved IP address: ${hostname}`);
  }
}
