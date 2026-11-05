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
