import type { Href, Router } from 'expo-router';

/** Pop to the screen below (its state intact); a screen opened straight from a link has none, so go home. */
export function backOr(router: Pick<Router, 'canGoBack' | 'back' | 'replace'>, fallback: Href): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
