import { once } from 'node:events';
import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

const assertion = 'fixture-wallet-assertion';
const apiKey = 'fixture-wallet-key';
const identity = {
  userId: 'fixture-learner',
  email: 'learner@example.invalid',
  firstName: null,
  lastName: null,
  isEmailVerified: true,
  mainnetWalletAddress: null,
};
const servers: Server[] = [];
let redirectedRequests = 0;
let redirectOrigin: string;
let reply: RequestListener;
let verifyAssertion: typeof import('../services/ammaWalletSSOService.js').verifyAssertion;

async function listen(handler: RequestListener) {
  const server = createServer(handler);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  redirectOrigin = await listen((_req, res) => {
    redirectedRequests += 1;
    res.end(JSON.stringify(identity));
  });
  const provider = await listen((req, res) => reply(req, res));
  vi.stubEnv('AMMA_WALLET_URL', provider);
  vi.stubEnv('AMMA_WALLET_API_KEY', apiKey);
  vi.resetModules();
  ({ verifyAssertion } = await import('../services/ammaWalletSSOService.js'));
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

it('sends the assertion only to the configured verification endpoint and parses the identity', async () => {
  let received: { path?: string; method?: string; apiKey?: string | string[]; body: string } | undefined;
  reply = (req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      received = { path: req.url, method: req.method, apiKey: req.headers['x-api-key'], body };
      res.end(JSON.stringify(identity));
    });
  };

  await expect(verifyAssertion(assertion)).resolves.toEqual(identity);
  expect(received).toEqual({
    path: '/api/v1/sso/verify', method: 'POST', apiKey, body: JSON.stringify({ assertion }),
  });
});

it.each([307, 308])('refuses a provider redirect with HTTP %s before sending anything to its target', async status => {
  reply = (_req, res) => {
    res.writeHead(status, { location: redirectOrigin });
    res.end();
  };
  await expect(verifyAssertion(assertion)).rejects.toThrow();
  expect(redirectedRequests).toBe(0);
});

it.each([
  [503, 'SSO verify failed (503)'],
  [200, 'Invalid Wallet identity response'],
])('omits provider response content from errors on HTTP %s', async (status, message) => {
  reply = (_req, res) => {
    res.statusCode = status;
    res.end(`fixture-sensitive-provider-body ${assertion}`);
  };
  await expect(verifyAssertion(assertion)).rejects.toMatchObject({ message });
});
