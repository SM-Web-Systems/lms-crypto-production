const test = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');

const guard = join(__dirname, 'deny-tooling-network.cjs');
function probe(body) {
  // Replace underlying network functions with traps before loading the guard:
  // a broken guard fails the test without making an actual network request.
  const result = spawnSync(process.execPath, ['-e', body], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
}

test('the offline guard blocks HTTP, socket and TLS APIs before their implementations run', () => {
  for (const [name, method] of [['node:http', 'request'], ['node:https', 'get'],
    ['node:net', 'connect'], ['node:tls', 'connect']]) {
    probe(`const assert=require('node:assert/strict');const api=require(${JSON.stringify(name)});
      api[${JSON.stringify(method)}]=()=>{throw Error('NETWORK_ESCAPE')};
      require(${JSON.stringify(guard)});
      assert.throws(()=>api[${JSON.stringify(method)}](),/OFFLINE_TOOLING_NETWORK_BLOCKED/);`);
  }
});

test('the offline guard also blocks DNS variants and resolver instances', () => {
  for (const expression of ['dns.resolve4', 'dns.Resolver.prototype.resolveTxt']) {
    probe(`const assert=require('node:assert/strict');const dns=require('node:dns');
      ${expression}=()=>{throw Error('NETWORK_ESCAPE')};require(${JSON.stringify(guard)});
      assert.throws(()=>${expression}(),/OFFLINE_TOOLING_NETWORK_BLOCKED/);`);
  }
  probe(`(async()=>{const assert=require('node:assert/strict');const dns=require('node:dns');
    dns.promises.resolve6=async()=>{throw Error('NETWORK_ESCAPE')};require(${JSON.stringify(guard)});
    await assert.rejects(dns.promises.resolve6(),/OFFLINE_TOOLING_NETWORK_BLOCKED/);
    })().catch(error=>{console.error(error.message);process.exitCode=1});`);
});

test('the offline guard blocks HTTP/2, datagrams and fetch', () => {
  for (const [name, method] of [['node:http2', 'connect'], ['node:dgram', 'createSocket']]) {
    probe(`const assert=require('node:assert/strict');const api=require(${JSON.stringify(name)});
      api[${JSON.stringify(method)}]=()=>{throw Error('NETWORK_ESCAPE')};require(${JSON.stringify(guard)});
      assert.throws(()=>api[${JSON.stringify(method)}](),/OFFLINE_TOOLING_NETWORK_BLOCKED/);`);
  }
  probe(`(async()=>{const assert=require('node:assert/strict');
    globalThis.fetch=async()=>{throw Error('NETWORK_ESCAPE')};require(${JSON.stringify(guard)});
    await assert.rejects(fetch('https://example.invalid'),/OFFLINE_TOOLING_NETWORK_BLOCKED/);
    })().catch(error=>{console.error(error.message);process.exitCode=1});`);
});

test('the CLI schema validator rejects malformed profiles and an incorrect CLI pin', async () => {
  const { validateProfiles } = require('./check-eas-tooling.cjs');
  const easPackage = require.resolve('eas-cli/package.json');
  const { EasJsonAccessor } = createRequire(easPackage)('@expo/eas-json');
  const version = require(easPackage).version;
  const accessor = value => EasJsonAccessor.fromRawString(JSON.stringify(value));
  await assert.rejects(validateProfiles(accessor({ cli: { version }, build: { preview: { distribution: 'wrong' } } }), version));
  await assert.rejects(validateProfiles(accessor({ cli: { version: '0.0.0' }, build: { preview: {} } }), version), /EAS_CONFIG_CLI_PIN_MISMATCH/);
  await assert.rejects(validateProfiles(accessor({ cli: { version }, build: {} }), version), /NO_BUILD_PROFILES/);
});

test('the actual EAS metadata validator preserves draft-06 formats and readable errors', () => {
  require('./deny-tooling-network.cjs');
  const easPackage = require.resolve('eas-cli/package.json');
  const easRequire = createRequire(easPackage);
  const { createValidator, getReadableErrors } = easRequire('./build/metadata/utils/ajv.js');
  const validator = createValidator().compile({
    $schema: 'http://json-schema.org/draft-06/schema#', type: 'object',
    properties: { contact: { type: 'string', format: 'email' } },
    required: ['contact'], additionalProperties: false,
  });
  assert.equal(validator({ contact: 'synthetic@example.invalid' }), true);
  assert.equal(validator({ contact: 'invalid', unexpected: true }), false);
  assert.ok(getReadableErrors(validator.errors).length > 0);
});

test('staging preview requires pinned public targets, internal builds and the native callback identity', async () => {
  const { validateStagingPreview } = require('./check-eas-tooling.cjs');
  const { EasJsonAccessor } = createRequire(require.resolve('eas-cli/package.json'))('@expo/eas-json');
  const eas = require('../eas.json');
  const identity = {
    scheme: 'lmsmobile',
    android: { package: 'com.smwebsystems.lms' },
    ios: { bundleIdentifier: 'com.smwebsystems.lms' },
  };
  const accessor = value => EasJsonAccessor.fromRawString(JSON.stringify(value));
  await validateStagingPreview(accessor(eas), identity);

  const drifted = structuredClone(eas);
  drifted.build.preview.env.EXPO_PUBLIC_AMMA_WALLET_URL = 'https://other.example.invalid';
  await assert.rejects(validateStagingPreview(accessor(drifted), identity), /INVALID_STAGING_PREVIEW_PUBLIC_ENV/);

  const extraPublicField = structuredClone(eas);
  extraPublicField.build.preview.env.EXPO_PUBLIC_UNKNOWN = 'synthetic';
  await assert.rejects(validateStagingPreview(accessor(extraPublicField), identity), /INVALID_STAGING_PREVIEW_PUBLIC_ENV/);

  const storeBuild = structuredClone(eas);
  storeBuild.build.preview.distribution = 'store';
  await assert.rejects(validateStagingPreview(accessor(storeBuild), identity), /INVALID_STAGING_PREVIEW_DISTRIBUTION/);
  await assert.rejects(validateStagingPreview(accessor(eas), { ...identity, scheme: 'other' }), /INVALID_STAGING_PREVIEW_APP_IDENTITY/);
});
