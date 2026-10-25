import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanEnvironment, validateSettings } from './stack.mjs';
const c = { version: 1, id: 'abcdef0123456789' };
for (const [i, key] of ['dbPassword', 'lmsJwt', 'walletJwt', 'walletRefresh', 'adminJwt', 'totpKey', 'ssoSecret', 'apiKey', 'controlToken'].entries())
    c[key] = (i + 1).toString(16).repeat(64);
test('service environment excludes inherited credentials, remote endpoints and Node preloads', () => {
    const env = cleanEnvironment({ Path: 'tools', SystemRoot: 'Windows', DATABASE_URL: 'postgres://production', JWT_SECRET: 'production', SMTP_HOST: 'production', NODE_OPTIONS: '--require bad', HTTP_PROXY: 'remote', AWS_SECRET_ACCESS_KEY: 'secret' });
    assert.deepEqual(env, { SystemRoot: 'Windows', Path: 'tools' });
});
test('local identities reject traversal, malformed credentials and secret reuse', () => {
    assert.match(validateSettings(c, 'C:/local').data, /stack-abcdef0123456789$/);
    for (const bad of [{ ...c, id: '../production' }, { ...c, version: 2 }, { ...c, apiKey: 'placeholder' }, { ...c, adminJwt: c.walletJwt }])
        assert.throws(() => validateSettings(bad, 'C:/local'));
    assert.throws(() => validateSettings(c, ''));
});
