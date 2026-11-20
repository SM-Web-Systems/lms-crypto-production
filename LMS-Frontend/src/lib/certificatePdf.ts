/** URL of the certificate PDF served by the API (public, no auth). */
export function certificatePdfApiUrl(credentialId: string): string {
  const apiBase = import.meta.env?.VITE_API_BASE_URL || '/api/v1';
  return `${apiBase}/credentials/${encodeURIComponent(credentialId)}/pdf`;
}

/** In-app route that shows the certificate PDF with a Back button. */
export function certificatePdfViewPath(credentialId: string): string {
  return `/certificate/${encodeURIComponent(credentialId)}/pdf`;
}
