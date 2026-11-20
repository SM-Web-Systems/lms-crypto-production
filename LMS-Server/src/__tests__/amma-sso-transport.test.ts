import { once } from 'node:events';
import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

const assertion = 'fixture-wallet-assertion';
const state = 'fixture-signed-state';
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
let SsoVerifyError: typeof import('../services/ammaWalletSSOService.js').SsoVerifyError;
let retryPolicy: typeof import('../services/ammaWalletSSOService.js').verifyRetryPolicy;
let calls = 0;

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
  ({ verifyAssertion, SsoVerifyError, verifyRetryPolicy: retryPolicy } = await import('../services/ammaWalletSSOService.js'));
  retryPolicy.rateLimitDelayMs = 5;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

it('sends the assertion and the state only to the configured verification endpoint and parses the identity', async () => {
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

  await expect(verifyAssertion(assertion, state)).resolves.toEqual(identity);
  expect(received).toEqual({
    path: '/api/v1/sso/verify', method: 'POST', apiKey, body: JSON.stringify({ assertion, state }),
  });
});

it.each([307, 308])('refuses a provider redirect with HTTP %s before sending anything to its target', async status => {
  reply = (_req, res) => {
    res.writeHead(status, { location: redirectOrigin });
    res.end();
  };
  await expect(verifyAssertion(assertion, state)).rejects.toThrow();
  expect(redirectedRequests).toBe(0);
});

it.each([
  [503, 'SSO verify failed (503)'],
  [200, 'SSO verify failed (200)'],
])('omits provider response content from errors on HTTP %s', async (status, message) => {
  reply = (_req, res) => {
    res.statusCode = status;
    res.end(`fixture-sensitive-provider-body ${assertion} ${state}`);
  };
  const error = await verifyAssertion(assertion, state).catch(e => e);
  expect(error).toMatchObject({ message });
  expect(JSON.stringify({ ...error, message: error.message })).not.toMatch(/fixture-sensitive|fixture-wallet|fixture-signed/);
});

// AUTH-14 section 2.3: every documented /sso/verify response maps to one LMS action.
it.each([
  [400, 'state is required', 'request_rejected'],
  [400, 'state must be a string of at most 4096 characters', 'request_rejected'],
  [401, 'Invalid or missing API key', 'config'],
  [401, 'Invalid or expired assertion', 'assertion_rejected'],
  [403, 'SSO verify needs a tenant API key', 'config'],
  [403, 'API key missing required scope: sso:verify', 'config'],
  [409, 'Assertion already used', 'already_used'],
  [503, 'SSO not configured', 'config'],
  [502, 'Bad gateway', 'unavailable'],
])('classifies HTTP %s "%s" as %s and keeps only a documented error text', async (status, text, failure) => {
  calls = 0;
  reply = (_req, res) => { calls += 1; res.statusCode = status; res.end(JSON.stringify({ error: text })); };
  const error = await verifyAssertion(assertion, state).catch(e => e);
  expect(error).toBeInstanceOf(SsoVerifyError);
  expect(error).toMatchObject({ failure, status, ammaError: text === 'Bad gateway' ? 'unrecognised' : text });
  expect(calls).toBe(1); // only a 429 is retried
});

it('retries once after a 429 with the same assertion and state, then succeeds', async () => {
  const bodies: string[] = [];
  reply = (req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      bodies.push(body);
      if (bodies.length === 1) { res.statusCode = 429; res.end(JSON.stringify({ error: 'API key rate limit exceeded' })); }
      else res.end(JSON.stringify(identity));
    });
  };
  await expect(verifyAssertion(assertion, state)).resolves.toEqual(identity);
  expect(bodies).toEqual([JSON.stringify({ assertion, state }), JSON.stringify({ assertion, state })]);
});

it('gives up after a second 429', async () => {
  calls = 0;
  reply = (_req, res) => { calls += 1; res.statusCode = 429; res.end(JSON.stringify({ error: 'API key rate limit exceeded' })); };
  await expect(verifyAssertion(assertion, state)).rejects.toMatchObject({ failure: 'rate_limited', status: 429 });
  expect(calls).toBe(2);
});

it('treats a network failure as unavailable', async () => {
  reply = (req) => { req.socket.destroy(); };
  await expect(verifyAssertion(assertion, state)).rejects.toMatchObject({ failure: 'unavailable', status: null });
});
