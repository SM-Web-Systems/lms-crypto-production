const test = require('node:test');
const assert = require('node:assert/strict');
const { dirname, join } = require('node:path');
const { copyFileSync, mkdtempSync, realpathSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
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

  const repeatedBuildNumber = structuredClone(eas);
  repeatedBuildNumber.build.preview.autoIncrement = false;
  await assert.rejects(validateStagingPreview(accessor(repeatedBuildNumber), identity), /STAGING_PREVIEW_BUILD_NUMBER_MUST_INCREMENT/);
  const storeBuild = structuredClone(eas);
  storeBuild.build.preview.distribution = 'store';
  await assert.rejects(validateStagingPreview(accessor(storeBuild), identity), /INVALID_STAGING_PREVIEW_DISTRIBUTION/);
  await assert.rejects(validateStagingPreview(accessor(eas), { ...identity, scheme: 'other' }), /INVALID_STAGING_PREVIEW_APP_IDENTITY/);
});

test('Expo resolves the linked project from static config and rejects an environment mismatch', () => {
  const { getConfig } = createRequire(require.resolve('expo/package.json'))('@expo/config');
  const root = realpathSync(tmpdir());
  const fixture = mkdtempSync(join(root, 'lms-eas-link-test-'));
  const priorProject = process.env.EAS_PROJECT_ID;
  const linkedProject = 'b210ba61-836b-4735-af48-547331cf67bf';
  const otherProject = '35cf9fee-a13e-4ef4-873e-fe153f730247';
  const resolve = () => getConfig(fixture, {
    isPublicConfig: true, skipPlugins: true, skipSDKVersionRequirement: true,
  }).exp;

  try {
    copyFileSync(join(__dirname, '..', 'app.config.ts'), join(fixture, 'app.config.ts'));
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({ name: 'lms-eas-test', version: '1.0.0' }));
    delete process.env.EAS_PROJECT_ID;
    const staticConfig = { expo: { owner: 'fixture-team', extra: { eas: { projectId: linkedProject } } } };
    writeFileSync(join(fixture, 'app.json'), JSON.stringify(staticConfig));
    assert.equal(resolve().owner, 'fixture-team');
    assert.equal(resolve().extra.eas.projectId, linkedProject);

    process.env.EAS_PROJECT_ID = linkedProject;
    assert.equal(resolve().extra.eas.projectId, linkedProject);
    process.env.EAS_PROJECT_ID = otherProject;
    assert.throws(resolve, /EAS project ID differs from the linked app configuration/);

    writeFileSync(join(fixture, 'app.json'), JSON.stringify({ expo: {} }));
    assert.equal(resolve().extra.eas.projectId, otherProject);
  } finally {
    if (priorProject === undefined) delete process.env.EAS_PROJECT_ID;
    else process.env.EAS_PROJECT_ID = priorProject;
    const target = realpathSync(fixture);
    assert.equal(dirname(target), root);
    assert.ok(target.startsWith(join(root, 'lms-eas-link-test-')));
    rmSync(target, { recursive: true, force: true });
  }
});
