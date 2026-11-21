/** Full-page navigation to AmmaWallet, behind an object so tests can replace it. */
export const walletNavigation = { go: (url: string) => window.location.assign(url) };
