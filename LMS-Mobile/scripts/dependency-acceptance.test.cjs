const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join, dirname } = require('node:path');

const routerRequire = createRequire(require.resolve('expo-router/package.json'));

test('Router resolves the patched parser with its named CommonJS API', () => {
  const parser = routerRequire('query-string');
  assert.equal(typeof parser.stringify, 'function');
  assert.equal(typeof parser.parse, 'function');
  const values = { q: 'Cape Town / 学生', empty: '', repeated: ['one', 'two'], flag: null };
  const encoded = parser.stringify(values, { sort: false });
  assert.equal(encoded, 'q=Cape%20Town%20%2F%20%E5%AD%A6%E7%94%9F&empty=&repeated=one&repeated=two&flag');
  assert.deepEqual({ ...parser.parse(encoded) }, values);
  assert.equal(JSON.parse(readFileSync(join(dirname(require.resolve('query-string-modern')), 'package.json'))).version, '9.5.1');
});

test('malformed percent-encoding terminates in an isolated parser process', () => {
  const child = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const parser = require(${JSON.stringify(routerRequire.resolve('query-string'))});
    for (const input of ['%E0%A4%A', '%', '%FF'.repeat(50000), '%E0%A4'.repeat(50000)]) {
      const parsed = parser.parse('q=' + input);
      assert.equal(typeof parsed.q, 'string');
      assert.ok(parser.stringify(parsed).startsWith('q='));
    }
  `], { encoding: 'utf8', timeout: 10000 });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
});

test('the patched Metro reads actual project image dimensions on both platforms', async () => {
  const metro = createRequire(require.resolve('metro/package.json'));
  const { getAssetData } = metro('./src/Assets.js');
  const assets = join(__dirname, '../assets/images');
  for (const name of ['icon.png', 'splash-icon.png']) {
    const file = join(assets, name);
    const png = readFileSync(file);
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    for (const platform of ['android', 'ios']) {
      const data = await getAssetData(file, `assets/images/${name}`, [], platform, '/assets');
      assert.equal(data.width, png.readUInt32BE(16));
      assert.equal(data.height, png.readUInt32BE(20));
      assert.equal(data.type, 'png');
      assert.ok(data.hash);
    }
  }
});

test('patched glob consumers retain sync/async matching and cancellation', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const folder = mkdtempSync(join(tmpdir(), 'lms-dependency-glob-'));
  try {
    mkdirSync(join(folder, 'nested folder'));
    writeFileSync(join(folder, 'nested folder', 'lesson.ts'), 'synthetic');
    writeFileSync(join(folder, 'ignore.txt'), 'synthetic');
    const expo = createRequire(require.resolve('expo/package.json'));
    const prebuild = createRequire(require.resolve('@expo/prebuild-config/package.json'));
    for (const [name, resolver] of [['@expo/config', expo], ['@expo/config-plugins', expo],
      ['@expo/metro-config', expo], ['sucrase', prebuild]]) {
      const consumer = createRequire(resolver.resolve(`${name}/package.json`));
      const glob = consumer('glob');
      assert.deepEqual(glob.sync('**/*.ts', { cwd: folder }), [join('nested folder', 'lesson.ts')]);
      assert.deepEqual(await glob.glob('**/*.ts', { cwd: folder }), [join('nested folder', 'lesson.ts')]);
      await assert.rejects(glob.glob('**/*', { cwd: folder, signal: AbortSignal.abort(new Error('fixture-abort')) }), /fixture-abort/);
    }
  } finally {
    assert.equal(require('node:path').dirname(folder), tmpdir());
    rmSync(folder, { recursive: true, force: true });
  }
});

test('EAS and Xcode UUID consumers retain their supported methods', () => {
  const xcode = require('xcode');
  const project = xcode.project('synthetic-project.pbxproj');
  project.hash = { project: { objects: {} } };
  assert.match(project.generateUuid(), /^[A-F0-9]{24}$/);
  for (const name of ['@expo/bunyan', '@expo/rudder-sdk-node', 'xcode', 'eas-cli']) {
    const uuid = createRequire(require.resolve(`${name}/package.json`))('uuid');
    assert.equal(uuid.validate(uuid.v1()), true);
    assert.equal(uuid.validate(uuid.v4()), true);
    assert.throws(() => uuid.v5('fixture', uuid.v5.DNS, Buffer.alloc(1)), /buffer|offset|length|bounds/i);
  }
});

test('patched diff preserves EAS update patch behavior', () => {
  const diff = createRequire(require.resolve('eas-cli/package.json'))('diff');
  const before = 'first\nsecond\n';
  const after = 'first\nchanged\n';
  const patch = diff.createPatch('fixture.txt', before, after);
  assert.equal(diff.parsePatch(patch).length, 1);
  assert.equal(diff.applyPatch(before, patch), after);
});

test('Expo config and Jest preset merges reject inherited configuration from hostile nested keys', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const folder = mkdtempSync(join(tmpdir(), 'lms-dependency-deepmerge-'));
  const hostile = () => JSON.parse('{"session":{"__proto__":{"allowed":true},"retained":"safe"},"list":["app"]}');
  const assertSafe = result => {
    assert.deepEqual(result.list, ['base', 'app']);
    assert.equal(result.session.retained, 'safe');
    assert.equal(result.session.allowed, undefined);
    assert.equal(Object.hasOwn(result.session, '__proto__'), false);
    assert.equal(Object.getPrototypeOf(result.session), Object.prototype);
  };
  try {
    const { packages } = require('../package-lock.json');
    const resolvedMergers = Object.entries(packages).filter(([name]) => name.endsWith('/deepmerge'));
    assert.ok(resolvedMergers.length > 0);
    for (const [, entry] of resolvedMergers) {
      assert.equal(entry.name, '@stackline/deepmerge');
      assert.equal(entry.version, '1.1.2');
    }
    writeFileSync(join(folder, 'package.json'), JSON.stringify({name: 'fixture', version: '1.0.0'}));
    writeFileSync(join(folder, 'app.json'), JSON.stringify({
      expo: {name: 'Fixture', slug: 'fixture', extra: {session: null, list: ['base']}},
    }));
    const fromExpo = createRequire(require.resolve('expo/package.json'));
    const fromEas = createRequire(require.resolve('eas-cli/package.json'));
    const fromEasPrebuild = createRequire(fromEas.resolve('@expo/prebuild-config/package.json'));
    const origins = [fromExpo, fromEas, fromEasPrebuild];
    for (const origin of origins) {
      const fromConfig = createRequire(origin.resolve('@expo/config/package.json'));
      const { modifyConfigAsync } = origin('@expo/config');
      const result = await modifyConfigAsync(folder, {extra: hostile()},
        {skipSDKVersionRequirement: true, skipPlugins: true}, {dryRun: true});
      assert.equal(result.type, 'success');
      assertSafe(result.config.extra);
      const merge = fromConfig('deepmerge');
      const nullPrototype = Object.assign(Object.create(null), hostile().session);
      assertSafe(merge({session: null, list: ['base']}, {session: nullPrototype, list: ['app']}));
      assertSafe(merge({session: nullPrototype, list: ['base']}, {list: ['app']}));
    }

    mkdirSync(join(folder, 'preset'));
    writeFileSync(join(folder, 'preset', 'jest-preset.js'),
      'module.exports = {globals: {session: null, list: ["base"]}};');
    const { normalize } = require('jest-config');
    const { options } = await normalize({
      rootDir: folder, preset: '<rootDir>/preset', globals: hostile(), transform: {},
      testEnvironment: require.resolve('jest-environment-node'),
      testRunner: require.resolve('jest-circus/runner'),
    }, {}, null);
    assertSafe(options.globals);
  } finally {
    assert.equal(dirname(folder), tmpdir());
    rmSync(folder, { recursive: true, force: true });
  }
});

test('the actual EAS project generator merges configuration through the patched API', async () => {
  require('./deny-tooling-network.cjs');
  const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const folder = mkdtempSync(join(tmpdir(), 'lms-dependency-eas-'));
  try {
    writeFileSync(join(folder, 'app.json'), JSON.stringify({ expo: {
      name: 'Template', extra: { retained: true }, ios: { supportsTablet: true },
    } }));
    const eas = createRequire(require.resolve('eas-cli/package.json'));
    const merge = eas('ts-deepmerge');
    const value = merge({}, JSON.parse('{"toString":"hostile","valueOf":null,"__proto__":{"polluted":true}}'));
    assert.doesNotThrow(() => String(value));
    assert.equal({}.polluted, undefined);
    const { generateAppConfigAsync } = eas('./build/commandUtils/new/projectFiles.js');
    await generateAppConfigAsync(folder, { id: '00000000-0000-4000-8000-000000000001', name: 'Synthetic App', slug: 'synthetic-app', ownerAccount: { name: 'fixture' } });
    const { expo } = JSON.parse(readFileSync(join(folder, 'app.json')));
    assert.equal(expo.name, 'Synthetic App');
    assert.equal(expo.extra.retained, true);
    assert.equal(expo.extra.eas.projectId, '00000000-0000-4000-8000-000000000001');
    assert.equal(expo.ios.supportsTablet, true);
    assert.equal(expo.ios.bundleIdentifier, 'com.fixture.syntheticapp');
  } finally {
    assert.equal(dirname(folder), tmpdir());
    rmSync(folder, { recursive: true, force: true });
  }
});
