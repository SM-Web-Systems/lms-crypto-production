import { fixtureWeeks, repairFixtureReadings } from './fixtures.mjs';
import './loopback-only.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { settings, assertWalletDatabase } from './stack.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const c = settings();
assertWalletDatabase(c);
const owner = await fetch('http://127.0.0.1:28081/health', { headers: { authorization: 'Bearer ' + c.controlToken }, signal: AbortSignal.timeout(3000) });
assert.equal(owner.status, 200);
assert.equal((await owner.json()).id, c.id);
const accountsFile = path.join(root, '.local-services/accounts.json');
if (!fs.existsSync(accountsFile))
    fs.writeFileSync(accountsFile, JSON.stringify({
        operator: { email: 'operator.local@example.test', password: crypto.randomBytes(16).toString('hex') + 'Aa1!' },
        learner: { email: 'learner.local@example.test', password: crypto.randomBytes(16).toString('hex') + 'Aa1!' }
    }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
const accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
async function api(url, { method = 'GET', body, token, expected = 200 } = {}) {
    const r = await fetch(url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (r.status !== expected)
        throw Error('Local smoke request failed: ' + new URL(url).pathname + ' HTTP ' + r.status);
    return r;
}
async function account(info, firstName) {
    assert.match(info.email, /@example[.]test$/);
    assert.ok(info.password.length >= 20);
    const firstLogin = await fetch('http://127.0.0.1:3002/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(info), redirect: 'manual', signal: AbortSignal.timeout(20000) });
    let login;
    if (firstLogin.status === 200)
        login = await firstLogin.json();
    else {
        assert.equal(firstLogin.status, 401, 'Local fixture login failed: HTTP ' + firstLogin.status);
        const register = await fetch('http://127.0.0.1:3002/api/v1/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...info, firstName, lastName: 'Local Test' }), redirect: 'manual', signal: AbortSignal.timeout(20000) });
        assert.equal(register.status, 200, 'Synthetic registration failed: HTTP ' + register.status);
        login = await register.json();
    }
    if (!login.user.isEmailVerified) {
        // Recover a previous partial smoke run through the real authenticated resend flow.
        await api('http://127.0.0.1:3002/api/v1/auth/resend-verification', { method: 'POST', body: {}, token: login.accessToken });
        let verify;
        for (let i = 0; i < 20; i++) {
            const list = await (await api('http://127.0.0.1:8025/api/v1/messages')).json();
            for (const message of list.messages || []) {
                if (!(message.To || []).some(to => to.Address === info.email))
                    continue;
                const full = await (await api('http://127.0.0.1:8025/api/v1/message/' + encodeURIComponent(message.ID))).json();
                const match = (full.HTML || full.Text || '').match(new RegExp('http://localhost:5174/verify-email[?]token=([a-f0-9]{64})'));
                if (match) {
                    verify = match[1];
                    break;
                }
            }
            if (verify)
                break;
            await new Promise(r => setTimeout(r, 500));
        }
        assert.ok(verify, 'No verification email arrived in local Mailpit');
        await api('http://127.0.0.1:3002/api/v1/auth/verify-email?token=' + verify);
        login = await (await api('http://127.0.0.1:3002/api/v1/auth/login', { method: 'POST', body: info })).json();
    }
    assert.equal(login.user.isEmailVerified, true);
    assert.ok(login.accessToken);
    return login;
}
// Reserve the legacy local Wallet ID 1 operator account; learner is distinct.
const operator = await account(accounts.operator, 'Operator');
assert.equal(operator.user.id, 1);
const learner = await account(accounts.learner, 'Learner');
assert.notEqual(learner.user.id, 1);
console.log('PASS: synthetic Wallet registration, captured STARTTLS email, email verification and login.');
const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const state = crypto.randomBytes(32).toString('base64url');
const start = new URL('http://127.0.0.1:3001/api/v1/auth/amma-login');
for (const [key, value] of Object.entries({ client: 'mobile', code_challenge: challenge, code_challenge_method: 'S256', app_state: state }))
    start.searchParams.set(key, value);
const initiate = await api(start, { expected: 302 });
const location = new URL(initiate.headers.get('location'));
assert.equal(location.origin, 'http://localhost:5174');
const callback = new URL(location.searchParams.get('callback'));
assert.equal(callback.origin, 'http://localhost:5173');
const assertion = await (await api('http://127.0.0.1:3002/api/v1/sso/token', { method: 'POST', token: learner.accessToken, body: { callbackUrl: callback.href, state: location.searchParams.get('state') } })).json();
callback.searchParams.set('assertion', assertion.assertionToken);
callback.searchParams.set('state', location.searchParams.get('state'));
const callbackResponse = await api(callback, { expected: 302 });
const handoff = new URL(callbackResponse.headers.get('location'));
assert.equal(handoff.protocol, 'lmsmobile:');
assert.equal(handoff.hostname, 'sso-callback');
assert.equal(handoff.searchParams.get('state'), state);
assert.ok(handoff.searchParams.get('code'));
const exchangeBody = { code: handoff.searchParams.get('code'), code_verifier: verifier };
const session = await (await api('http://127.0.0.1:3001/api/v1/auth/amma-mobile-session', { method: 'POST', body: exchangeBody })).json();
assert.equal(session.success, true);
assert.equal(session.data.user.authProvider, 'ammawallet');
assert.equal(session.data.user.email, accounts.learner.email);
assert.equal(session.data.user.role, 'student');
assert.ok(!session.data.user.permissions.includes('user.manage'));
await api('http://127.0.0.1:3001/api/v1/auth/amma-mobile-session', { method: 'POST', body: exchangeBody, expected: 401 });
console.log('PASS: real local Wallet assertion -> LMS callback -> one-use PKCE mobile session, replay refused.');
const require = createRequire(path.join(root, 'LMS-Server/package.json'));
const Database = require('better-sqlite3');
const db = new Database(path.join(c.data, 'lms.sqlite'));
db.pragma('foreign_keys=ON');
db.pragma('busy_timeout=5000');
const course = 'local-mobile-learning', item = 'local-reading-1';
const weeks = fixtureWeeks();
db.transaction(() => {
    db.prepare("INSERT OR IGNORE INTO courses(id,title,description,course_code,sections,approval_status) VALUES(?,?,?,?,?,'published')").run(course, 'Local Mobile Acceptance', 'Synthetic local test content', 'LOCAL-MOBILE', JSON.stringify(weeks));
    const stored = db.prepare("SELECT sections FROM courses WHERE id=? AND course_code='LOCAL-MOBILE'").get(course);
    const existing = JSON.parse(stored.sections);
    if (repairFixtureReadings(existing))
        db.prepare('UPDATE courses SET sections=? WHERE id=?').run(JSON.stringify(existing), course);
    db.prepare('INSERT OR IGNORE INTO user_course_codes(user_id,course_code) VALUES(?,?)').run(session.data.user.id, 'LOCAL-MOBILE');
})();
const token = session.data.token;
const reading = await api(fixtureWeeks()[0].sections[0].items[1].url);
assert.match(await reading.text(), /Your local learning check/);
await api('http://127.0.0.1:3001/api/v1/courses/' + course, { token });
await api(`http://127.0.0.1:3001/api/v1/courses/${course}/lessons/${item}/progress`, { method: 'PUT', token, body: { positionSeconds: 12, progressPercent: 40 } });
await api(`http://127.0.0.1:3001/api/v1/courses/${course}/lessons/${item}/complete`, { method: 'POST', token, body: {} });
const completion = db.prepare('SELECT completed_at,progress_pct,last_position_s FROM lesson_completions WHERE user_id=? AND course_id=? AND item_id=?').get(session.data.user.id, course, item);
assert.ok(completion.completed_at);
assert.equal(completion.progress_pct, 100);
assert.equal(completion.last_position_s, 12);
db.close();
console.log('PASS: authorized course read, progress write, completion write and persisted SQLite result.');
console.log('Local-only account credentials: ' + accountsFile);
console.log('No blockchain wallets were created/funded; no provider transaction or production service was used.');
