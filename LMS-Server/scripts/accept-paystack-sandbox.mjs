// Manual Paystack acceptance against the compiled LMS API and a new SQLite database.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
const preflight = mode === '--preflight';
const testKey = preflight ? 'sk_test_local_fixture' : process.env.LMS_PAYSTACK_TEST_KEY?.trim();
const signingSecret = preflight ? 'whsec_local_fixture' : process.env.LMS_PAYSTACK_TEST_WEBHOOK_SECRET?.trim();
if (process.argv.length !== 3 || (!preflight && mode !== '--execute-test-mode')) {
  console.error('Usage: node scripts/accept-paystack-sandbox.mjs --preflight|--execute-test-mode');
  process.exit(2);
}
if (!testKey || !/^sk_test_[A-Za-z0-9_-]+$/.test(testKey) ||
    (!preflight && (!process.stdin.isTTY || !process.stdout.isTTY)) ||
    (signingSecret && !/^whsec_\S+$/.test(signingSecret))) {
  console.error('REFUSED: a private interactive terminal and a Paystack test secret key are required for provider acceptance.');
  process.exit(2);
}

const startupDirectory = process.cwd();
const root = realpathSync(tmpdir());
const directory = mkdtempSync(path.join(root, 'lms-paystack-acceptance-'));
const transport = globalThis.fetch;
const amount = 1000;
const currency = 'ZAR';
const courseId = randomUUID();
const applicationId = randomUUID();
const learnerId = randomUUID();
const otherId = randomUUID();
const adminId = randomUUID();
const email = 'lms-paystack-' + randomBytes(8).toString('hex') + '@example.com';
let listener, closeDatabase, terminal;
let chargeReference, refundReference;
const revision = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', windowsHide: true,
}).stdout?.trim();
const fingerprint = value => createHash('sha256').update(value).digest('hex');
const scriptSha256 = fingerprint(readFileSync(fileURLToPath(import.meta.url)));
let stage = 'isolation';

try {
  const systemVariables = /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|PATHEXT|APPDATA|LOCALAPPDATA)$/i;
  for (const name of Object.keys(process.env)) {
    if (!systemVariables.test(name)) delete process.env[name];
  }
  process.chdir(directory);
  Object.assign(process.env, {
    NODE_ENV: 'production',
    LOG_LEVEL: 'silent',
    DATABASE_PATH: path.join(directory, 'synthetic.db'),
    JWT_SECRET: randomBytes(32).toString('hex'),
    AMMA_SSO_STATE_SECRET: randomBytes(32).toString('hex'),
    AMMA_WALLET_URL: 'http://127.0.0.1:1',
    FRONTEND_URL: 'http://127.0.0.1:43123',
    PAYSTACK_REQUIRED_MODE: 'test',
    PAYSTACK_SECRET_KEY: testKey,
  });
  if (signingSecret) process.env.PAYSTACK_WEBHOOK_SECRET = signingSecret;

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    const initialize = method === 'POST' && url.pathname === '/transaction/initialize';
    const verify = method === 'GET' && chargeReference &&
      url.pathname === '/transaction/verify/' + encodeURIComponent(chargeReference);
    const refund = method === 'POST' && url.pathname === '/refund';
    const refundLookup = method === 'GET' && refundReference && url.pathname === '/refund' &&
      url.search === '?reference=' + encodeURIComponent(refundReference);
    assert.equal(url.origin, 'https://api.paystack.co');
    assert.ok(!url.username && !url.password && (!url.search || refundLookup) && !url.hash);
    assert.ok(initialize || verify || refund || refundLookup);
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer ' + testKey);
    const payload = init.body ? JSON.parse(init.body) : {};
    if (initialize) {
      assert.equal(payload.email, email);
      assert.equal(payload.amount, amount);
      assert.equal(payload.currency, currency);
      assert.equal(JSON.parse(payload.metadata).applicationId, applicationId);
      assert.match(payload.reference, /^lms-[A-Za-z0-9-]+$/);
      assert.ok(!chargeReference);
      chargeReference = payload.reference;
    }
    if (refund) {
      assert.equal(payload.transaction, chargeReference);
      assert.equal(payload.amount, amount);
      assert.equal(payload.currency, currency);
      assert.match(payload.reference, /^[A-Za-z0-9_-]{8,64}$/);
      assert.ok(!refundReference);
      refundReference = payload.reference;
    }
    if (!preflight) return transport(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) });
    await delay(50);
    const data = initialize
      ? { reference: chargeReference, authorization_url: 'https://checkout.paystack.com/local-fixture', access_code: 'local-fixture' }
      : refund
        ? { reference: refundReference, transaction: { reference: chargeReference }, status: 'pending', amount, currency }
        : refundLookup
          ? [{ domain: 'test', reference: refundReference, transaction: 1234, status: 'processed', amount, currency }]
          : { id: 1234, domain: 'test', status: 'success', reference: chargeReference, amount, currency };
    return Response.json({ status: true, data });
  };

  stage = 'database';
  const init = spawnSync(process.execPath, [
    fileURLToPath(new URL('../dist/scripts/initDb.js', import.meta.url)), '--initialize-new',
  ], {
    env: { ...process.env, PAYSTACK_SECRET_KEY: '', PAYSTACK_WEBHOOK_SECRET: '' },
    stdio: 'ignore', windowsHide: true, timeout: 60_000,
  });
  assert.equal(init.status, 0);
  const { db, close } = await import('../dist/config/database.js');
  closeDatabase = close;
  db.transaction(() => {
    for (const [id, address, role] of [
      [learnerId, email, 'role_student'],
      [otherId, 'other@example.invalid', 'role_student'],
      [adminId, 'admin@example.invalid', 'role_admin'],
    ]) {
      db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(id, 'Synthetic', address, 'disabled');
      db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, role);
    }
    db.prepare('INSERT INTO courses (id, title, course_code) VALUES (?, ?, ?)').run(courseId, 'Paystack test course', 'TEST-PAYSTACK');
    db.prepare('INSERT INTO course_pricing (id, course_id, price_cents, currency, is_active) VALUES (?, ?, ?, ?, 1)')
      .run(randomUUID(), courseId, amount, currency);
    db.prepare('INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status) VALUES (?, ?, ?, ?, ?)')
      .run(applicationId, learnerId, courseId, 'synthetic', 'approved');
  })();

  stage = 'loopback';
  const { default: app } = await import('../dist/app.js');
  const { generateToken } = await import('../dist/config/jwt.js');
  listener = createServer((req, res) => {
    if (req.method === 'GET' && req.url?.split('?')[0] === '/payment/callback') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end('Test checkout returned. Check signed payment status in the operator terminal.');
      return;
    }
    app(req, res);
  }).listen(preflight ? 0 : 43123, '127.0.0.1');
  await once(listener, 'listening');
  const origin = 'http://127.0.0.1:' + listener.address().port;
  const api = origin + '/api/v1';
  const token = generateToken({ userId: learnerId, email });
  const outsider = generateToken({ userId: otherId, email: 'other@example.invalid' });
  const admin = generateToken({ userId: adminId, email: 'admin@example.invalid' });

  function call(endpoint, session, body) {
    return transport(api + endpoint, {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { authorization: 'Bearer ' + session, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  function syntheticEvent(event, data) {
    assert.ok(preflight);
    const body = JSON.stringify({ event, data });
    const time = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha512', signingSecret).update(time + '.').update(body).digest('hex');
    return transport(api + '/webhooks/paystack', {
      method: 'POST', body, signal: AbortSignal.timeout(15_000),
      headers: { 'content-type': 'application/json', 'paystack-signature': 't=' + time + ',v1=whk_fixture:' + signature },
    });
  }
  async function waitForStatus(endpoint, expected) {
    for (let attempt = 0; attempt < (preflight ? 2 : 45); attempt++) {
      const response = await call(endpoint, token);
      assert.equal(response.status, 200);
      if ((await response.json()).data.status === expected) return;
      await delay(preflight ? 20 : 4000);
    }
    throw new Error('Expected signed webhook state was not observed.');
  }

  if (!preflight) {
    terminal = createInterface({ input: process.stdin, output: process.stdout });
    console.log('Proxy only POST /api/v1/webhooks/paystack to ' + origin + ' from the approved test-mode HTTPS endpoint.');
    assert.equal(await terminal.question('Type TEST MODE once the isolated webhook is ready: '), 'TEST MODE');
  }
  stage = 'checkout';
  const checkoutEndpoint = '/payments/checkout/paystack';
  const checkout = await Promise.all([
    call(checkoutEndpoint, token, { applicationId }),
    call(checkoutEndpoint, token, { applicationId }),
  ]);
  const created = checkout.filter(response => response.status === 201);
  assert.equal(created.length, 1);
  const started = (await created[0].json()).data;
  const concurrent = checkout.find(response => response.status !== 201);
  assert.ok([200, 409].includes(concurrent.status));
  if (concurrent.status === 200) assert.equal((await concurrent.json()).data.paymentId, started.paymentId);
  const replay = await call(checkoutEndpoint, token, { applicationId });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).data.paymentId, started.paymentId);
  assert.equal(started.reference, chargeReference);
  const payment = '/payments/' + started.paymentId;
  const status = payment + '/status';

  stage = 'charge-settlement';
  if (preflight) {
    const charge = { reference: chargeReference, amount, currency };
    assert.equal((await syntheticEvent('charge.success', { ...charge, amount: amount - 1 })).status, 200);
    assert.equal((await (await call(status, token)).json()).data.status, 'pending');
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.equal((await syntheticEvent('charge.success', charge)).status, 200);
    }
  } else {
    console.log('Open this one-time test checkout privately: ' + started.checkoutUrl);
    await terminal.question('Complete payment with an official Paystack test card and press Enter: ');
  }
  await waitForStatus(status, 'confirmed');
  const verified = await globalThis.fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(chargeReference), {
    headers: { authorization: 'Bearer ' + testKey },
  });
  assert.equal(verified.status, 200);
  const transaction = await verified.json();
  assert.equal(transaction.status, true);
  assert.equal(transaction.data.domain, 'test');
  assert.equal(transaction.data.status, 'success');
  assert.equal(transaction.data.reference, chargeReference);
  assert.equal(transaction.data.currency, currency);
  assert.equal(transaction.data.amount, amount);

  stage = 'receipt';
  const receipt = await call(payment + '/receipt', token);
  assert.equal(receipt.status, 200);
  assert.equal(Buffer.from(await receipt.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  assert.equal((await call(payment + '/receipt', outsider)).status, 403);

  stage = 'refund';
  const refund = await call('/admin' + payment + '/refund', admin, {});
  assert.equal(refund.status, 202);
  if (preflight) {
    assert.equal((await syntheticEvent('refund.processed', {
      transaction_reference: chargeReference, refund_reference: refundReference,
      amount: String(amount), currency, status: 'processed',
    })).status, 200);
  }
  await waitForStatus(status, 'refunded');
  const refundCheck = await globalThis.fetch('https://api.paystack.co/refund?reference=' + encodeURIComponent(refundReference), {
    headers: { authorization: 'Bearer ' + testKey },
  });
  assert.equal(refundCheck.status, 200);
  const refundResult = await refundCheck.json();
  assert.equal(refundResult.status, true);
  assert.equal(refundResult.data.length, 1);
  const [settledRefund] = refundResult.data;
  assert.equal(settledRefund.domain, 'test');
  assert.equal(settledRefund.status, 'processed');
  assert.equal(settledRefund.reference, refundReference);
  assert.equal(settledRefund.transaction, transaction.data.id);
  assert.equal(settledRefund.amount, amount);
  assert.equal(settledRefund.currency, currency);
  assert.equal((await call(payment + '/receipt', token)).status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM payments').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM paystack_refund_requests WHERE submitted = 1').get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM webhook_events WHERE provider = 'paystack'").get().n, 2);
  assert.equal(db.pragma('quick_check', { simple: true }), 'ok');
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  console.log(JSON.stringify({ status: 'passed', mode: preflight ? 'synthetic-preflight' : 'paystack-test-mode',
    sourceRevision: revision, scriptSha256, currency, amount,
    chargeReferenceSha256: fingerprint(chargeReference), refundReferenceSha256: fingerprint(refundReference),
    checks: ['checkout-race-and-replay', 'signed-charge', 'test-domain-charge-verification',
      'receipt-scope', 'signed-refund', 'test-domain-refund-verification', 'ledger-integrity'] }));
} catch {
  console.error(JSON.stringify({ status: 'failed', stage, mode: preflight ? 'synthetic-preflight' : 'paystack-test-mode' }));
  if (!preflight && chargeReference) {
    console.error('Reconcile this test charge before rerunning: ' + chargeReference);
    if (refundReference) console.error('Test refund reference: ' + refundReference);
  }
  process.exitCode = 1;
} finally {
  terminal?.close();
  if (listener?.listening) await new Promise(resolve => listener.close(resolve));
  closeDatabase?.();
  process.chdir(startupDirectory);
  const target = realpathSync(directory);
  assert.equal(path.dirname(target), root);
  assert.ok(path.basename(target).startsWith('lms-paystack-acceptance-'));
  rmSync(target, { recursive: true, force: true });
}
