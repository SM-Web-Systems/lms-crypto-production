// ── Approved GitHub content source ──────────────────────────────────────────

const APPROVED_ORG = 'SM-Web-Systems';
const PINNED_COMMIT = 'b9fad25e1e0ad1d6bd2c428778decfc1cd6cc472';
const APPROVED_REPOS = [
  'blockchain-foundations-for-vibe-coding',
  'vibe-coding-blockchain',
];
const RAW_HOST = 'https://raw.githubusercontent.com';
/** GitHub owner and repo names are case-insensitive, so instructors may paste either spelling. */
const isApprovedRepo = (owner: string | undefined, repo: string | undefined) =>
  owner?.toLowerCase() === APPROVED_ORG.toLowerCase() && !!repo && APPROVED_REPOS.includes(repo.toLowerCase());
const APPROVED_RAW_BASE = `${RAW_HOST}/${APPROVED_ORG}/blockchain-foundations-for-vibe-coding/${PINNED_COMMIT}`;

/**
 * Convert a GitHub blob/raw URL to an approved pinned raw URL.
 * Returns null if the URL is not from the approved org/repos.
 */
export function toApprovedRawUrl(url: string): string | null {
  const s = url.trim();
  if (!s) return null;

  try {
    const u = new URL(s);

    // Already a raw URL from an approved repo
    if (u.hostname === 'raw.githubusercontent.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      // /org/repo/commit/path...
      if (isApprovedRepo(parts[0], parts[1])) {
        // Extract path after org/repo/commit
        const contentPath = parts.slice(3).join('/');
        return `${APPROVED_RAW_BASE}/${contentPath}`;
      }
      return null;
    }

    // GitHub blob URL: github.com/org/repo/blob/branch/path...
    if (u.hostname === 'github.com' || u.hostname === 'www.github.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (isApprovedRepo(parts[0], parts[1]) && parts[2] === 'blob') {
        // Extract path after org/repo/blob/branch
        const contentPath = parts.slice(4).join('/');
        return `${APPROVED_RAW_BASE}/${contentPath}`;
      }
      return null;
    }
  } catch {
    // Invalid URL
  }

  return null;
}
