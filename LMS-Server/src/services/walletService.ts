/**
 * Generates a delegated amma-wallet address for a user.
 *
 * Retry policy: NONE — intentionally.
 *   Step 1 (register): a second call after AmmaWallet silently processed the first
 *   returns 409, which is indistinguishable from a pre-existing account → misclassification risk.
 *   Steps 2-3 (keypair/wallet): require the accessToken from step 1; unavailable on timeout.
 *   Partial-success recovery: if step 1 completes server-side but times out client-side,
 *   the next register attempt returns 409 → handled as existing_account → banner shown. Natural path.
 */

const AMMA_WALLET_BASE = process.env.AMMA_WALLET_URL || "http://localhost:3001/";
// Safe URL join — new URL(relativePath, base) handles trailing-slash normalisation
// and prevents the template-literal concatenation bug (e.g. base + "api/v1/...")
const walletUrl = (path: string) => new URL(path, AMMA_WALLET_BASE).toString();

const AMMA_NETWORK = process.env.AMMA_WALLET_NETWORK || 'testnet';
const AMMA_TIMEOUT_MS = Number(process.env.AMMA_WALLET_TIMEOUT_MS) || 15_000;

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local[0]}***@${domain}`;
}

interface RegisterAmmAWalletResponse {
  user: {
    id: number;
    email: string;
    phoneNumber: string;
    firstName: string;
    lastName: string;
  };
  accessToken: string;
  refreshToken: string;
}

interface KeypairResponse {
  publicKey: string;
  secretKey: string;
}

export async function generateWalletAddress(
  email: string,
  password: string,
  userId = 'unknown',
): Promise<string> {
  const apiKey = process.env.AMMA_WALLET_API_KEY;
  const registerUrl = walletUrl("api/v1/auth/register");
  const masked = maskEmail(email);

  console.log(`[walletService:register] userId=${userId} email=${masked} url=${registerUrl} api-key-present=${!!apiKey}`);

  const registerHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) registerHeaders["x-api-key"] = apiKey;

  // Step 1: Register
  const ctrl1 = new AbortController();
  const timer1 = setTimeout(() => ctrl1.abort(), AMMA_TIMEOUT_MS);
  let res: Response;
  let resText: string;
  try {
    res = await fetch(registerUrl, {
      method: "POST",
      headers: registerHeaders,
      body: JSON.stringify({ email, password }),
      signal: ctrl1.signal,
    });
    resText = await res.text();
  } finally {
    clearTimeout(timer1);
  }

  // Log status only — never log body on success (contains live accessToken/refreshToken)
  if (res.ok) {
    console.log(`[walletService:register] userId=${userId} email=${masked} status=${res.status}`);
  } else {
    let safeBody = resText.slice(0, 200);
    try {
      const parsed = JSON.parse(resText);
      delete parsed.accessToken;
      delete parsed.refreshToken;
      safeBody = JSON.stringify(parsed).slice(0, 200);
    } catch { /* leave resText slice */ }
    console.warn(`[walletService:register] userId=${userId} email=${masked} status=${res.status} body=${safeBody}`);
  }

  if (res.status === 409) {
    console.log(`[walletService:register] userId=${userId} email=${masked} status=409 → AMMA_EMAIL_EXISTS`);
    const err = new Error('Amma register 409: email already registered') as Error & { code: string };
    err.code = 'AMMA_EMAIL_EXISTS';
    throw err;
  }
  if (!res.ok) {
    throw new Error(`Amma register failed (${res.status}): ${resText.slice(0, 200)}`);
  }

  const result = JSON.parse(resText) as RegisterAmmAWalletResponse;
  const accessToken = result.accessToken;

  // Step 2: Generate keypair
  const ctrl2 = new AbortController();
  const timer2 = setTimeout(() => ctrl2.abort(), AMMA_TIMEOUT_MS);
  let keypairRes: Response;
  let keypairText: string;
  try {
    keypairRes = await fetch(walletUrl("api/v1/keypair/generate"), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: ctrl2.signal,
    });
    keypairText = await keypairRes.text();
  } finally {
    clearTimeout(timer2);
  }

  console.log(`[walletService:keypair] userId=${userId} email=${masked} status=${keypairRes.status}`);
  if (!keypairRes.ok) {
    throw new Error(`Amma keypair generation failed (${keypairRes.status}): ${keypairText.slice(0, 200)}`);
  }
  const keyPairRes = JSON.parse(keypairText) as KeypairResponse;

  // Step 3: Create wallet
  const ctrl3 = new AbortController();
  const timer3 = setTimeout(() => ctrl3.abort(), AMMA_TIMEOUT_MS);
  let walletAdditionRes: Response;
  let walletText: string;
  try {
    walletAdditionRes = await fetch(walletUrl("api/v1/wallets"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name: email,
        publicKey: keyPairRes.publicKey,
        encryptedSecret: "",
        network: AMMA_NETWORK,
      }),
      signal: ctrl3.signal,
    });
    walletText = await walletAdditionRes.text();
  } finally {
    clearTimeout(timer3);
  }

  console.log(`[walletService:wallet] userId=${userId} email=${masked} status=${walletAdditionRes.status}`);
  if (!walletAdditionRes.ok) {
    throw new Error(`Amma wallet creation failed (${walletAdditionRes.status}): ${walletText.slice(0, 200)}`);
  }

  return keyPairRes.publicKey;
}

/**
 * Creates a wallet for a new user
 *
 * Steps:
 * 1. Generate a unique wallet address
 * 2. Store it in the database with the user
 * 3. Return the wallet address
 */
export async function createUserWallet(
  email: string,
  password: string,
  userId = 'unknown',
): Promise<string> {
  try {
    const walletAddress = await generateWalletAddress(email, password, userId);
    return walletAddress;
  } catch (error) {
    const e = error as { code?: string; message?: string };
    if (e?.code === 'AMMA_EMAIL_EXISTS') throw error;
    console.error("Error creating wallet:", error);
    throw new Error("Failed to create wallet for user");
  }
}
