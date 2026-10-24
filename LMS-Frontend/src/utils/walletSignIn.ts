export const AMMA_WALLET_URL = 'https://ammawallet.com';

export const SSO_ERROR_MESSAGES: Record<string, string> = {
  invalid_state: 'The sign-in session expired or was tampered with. Please try again.',
  assertion_failed: 'AmmaWallet could not verify your identity. Please try again.',
  user_error: 'Could not create your LMS session. Please contact support.',
  verify_failed: 'AmmaWallet could not verify your identity. Please try again.',
  email_required: 'LMS needs an email address. Add and verify an email in AmmaWallet settings, then return here to sign in.',
  email_unverified: 'Verify your email in AmmaWallet, then return here to sign in.',
  link_required: 'An LMS account already uses this email. Sign in with its LMS password below, open your profile, and choose Connect AmmaWallet.',
  identity_conflict: 'This account is connected to a different Wallet identity. Use the original AmmaWallet account or contact your LMS administrator for account recovery.',
  link_email_mismatch: 'Use an AmmaWallet account with the same verified email as your LMS account, then start connecting again from your profile.',
  link_expired: 'Your LMS session changed or expired while connecting. Sign in again and restart from your profile.',
  account_unavailable: 'This LMS account is unavailable. Contact your LMS administrator.',
  cancelled: 'AmmaWallet sign-in was cancelled. You can try again.',
};
