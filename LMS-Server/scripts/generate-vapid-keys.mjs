// Prints a fresh VAPID key pair for WEB_PUSH_VAPID_PUBLIC_KEY / WEB_PUSH_VAPID_PRIVATE_KEY.
// Put the output in the server's environment (secret store / .env on the host). Never commit it.
import { generateKeyPairSync } from 'node:crypto';
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = privateKey.export({ format: 'jwk' });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
void publicKey;
console.log(`WEB_PUSH_ENABLED=true`);
console.log(`WEB_PUSH_VAPID_PUBLIC_KEY=${pub.toString('base64url')}`);
console.log(`WEB_PUSH_VAPID_PRIVATE_KEY=${jwk.d}`);
console.log(`WEB_PUSH_SUBJECT=mailto:you@example.com`);
