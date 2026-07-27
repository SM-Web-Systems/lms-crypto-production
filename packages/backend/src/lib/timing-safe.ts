import crypto from "node:crypto";

export function timingSafeCompare(a: string, b: string): boolean {
  // Ensure constant-time comparison regardless of input length.
  // Use SHA-256 to normalize both strings to the same buffer length
  // before calling crypto.timingSafeEqual (which requires equal-length buffers).
  // The a.length === b.length check prevents hash-collision false positives
  // for different-length inputs (vanishingly unlikely but defense-in-depth).
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB) && a.length === b.length;
}
