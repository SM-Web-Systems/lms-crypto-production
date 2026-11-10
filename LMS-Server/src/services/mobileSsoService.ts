import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export interface MobileSsoContext {
  client: 'mobile';
  codeChallenge: string;
  appState: string;
}

function parseBuild(value: unknown, platform: 'android' | 'ios'): number[] | null {
  const format = platform === 'android' ? /^[0-9]{1,10}$/ : /^[0-9]{1,10}(?:\.[0-9]{1,10}){0,2}$/;
  if (typeof value !== 'string' || value.trim() !== value || !format.test(value)) return null;
  const parts = value.split('.').map(Number);
  return parts[0] > 0 ? parts : null;
}

export function mobileBuildObservation(platform: unknown, build: unknown) {
  if (platform !== 'android' && platform !== 'ios') return {platform: 'unknown', build: null};
  return {platform, build: parseBuild(build, platform)?.join('.') ?? null};
}

export function mobileBuildStatus(platform: unknown, build: unknown): 'allowed' | 'update_required' | 'unavailable' {
  const android = process.env.LMS_MIN_ANDROID_WALLET_BUILD;
  const ios = process.env.LMS_MIN_IOS_WALLET_BUILD;
  if (android === undefined && ios === undefined) return 'allowed';

  const androidFloor = parseBuild(android, 'android');
  const iosFloor = parseBuild(ios, 'ios');
  if (!androidFloor || !iosFloor) return 'unavailable';
  if (platform !== 'android' && platform !== 'ios') return 'update_required';

  const candidate = parseBuild(build, platform);
  if (!candidate) return 'update_required';
  const floor = platform === 'android' ? androidFloor : iosFloor;
  for (let index = 0; index < 3; index++) {
    const delta = (candidate[index] ?? 0) - (floor[index] ?? 0);
    if (delta !== 0) return delta > 0 ? 'allowed' : 'update_required';
  }
  return 'allowed';
}

export const MOBILE_SSO_CALLBACK = 'lmsmobile://sso-callback';
const HANDOFF_TTL_MS = 60_000;
const MAX_HANDOFFS = 1000;
interface Handoff { userId: string; authorizationVersion: number; challenge: string; expiresAt: number }
// Same single-process deployment requirement as the existing SSO nonce replay cache.
// A restart discards pending sign-ins; users restart sign-in. No persistent schema is added.
const handoffs = new Map<string, Handoff>();
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export function isMobileSsoContext(value: unknown): value is MobileSsoContext {
  const context = value as Partial<MobileSsoContext> | null;
  return !!context && context.client === 'mobile'
    && typeof context.codeChallenge === 'string' && /^[A-Za-z0-9_-]{43}$/.test(context.codeChallenge)
    && typeof context.appState === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(context.appState);
}

export function createMobileHandoff(userId: string, authorizationVersion: number, context: MobileSsoContext): string {
  for (const [key, value] of handoffs) if (value.expiresAt <= Date.now()) handoffs.delete(key);
  if (handoffs.size >= MAX_HANDOFFS) throw new Error('Too many pending mobile sign-ins');
  const code = randomBytes(32).toString('hex');
  handoffs.set(digest(code), {userId, authorizationVersion, challenge: context.codeChallenge, expiresAt: Date.now()+HANDOFF_TTL_MS});
  const destination = new URL(MOBILE_SSO_CALLBACK);
  destination.searchParams.set('code',code);
  destination.searchParams.set('state',context.appState);
  return destination.toString();
}

export function consumeMobileHandoff(code: unknown, verifier: unknown): Handoff | null {
  if (typeof code !== 'string' || !/^[a-f0-9]{64}$/.test(code)
    || typeof verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return null;
  const key = digest(code);
  const value = handoffs.get(key);
  if (!value) return null;
  if (value.expiresAt <= Date.now()) { handoffs.delete(key); return null; }
  const proof = createHash('sha256').update(verifier).digest('base64url');
  if (!timingSafeEqual(Buffer.from(proof),Buffer.from(value.challenge))) return null;
  handoffs.delete(key); // Consume synchronously before issuing any session.
  return value;
}
