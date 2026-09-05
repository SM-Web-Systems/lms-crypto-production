const BUILD_SHA_PATTERN = /^[0-9a-f]{7,64}$/;

export function validateBuildSha(raw: string | undefined): string {
  if (!raw || !BUILD_SHA_PATTERN.test(raw)) return 'unknown';
  return raw;
}

export function getShortSha(sha: string): string {
  if (sha.length <= 7) return sha;
  return sha.slice(0, 7);
}
