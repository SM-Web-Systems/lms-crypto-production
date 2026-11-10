const test = require('node:test');
const assert = require('node:assert/strict');
const { resolve, relative, sep } = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const easRequire = createRequire(require.resolve('eas-cli/package.json'));
const { Ignore } = easRequire('./build/vcs/local.js');

test('every shared repository source resolved by the native compiler survives the EAS upload filter', async () => {
  const mobile = resolve(__dirname, '..');
  const repository = resolve(mobile, '..');
  const configFile = ts.readConfigFile(resolve(mobile, 'tsconfig.json'), ts.sys.readFile);
  assert.equal(configFile.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, mobile);
  assert.equal(parsed.errors.length, 0);
  const program = ts.createProgram(parsed.fileNames, {
    ...parsed.options, allowJs: true, checkJs: false, noEmit: true,
  });
  const shared = program.getSourceFiles().map(source => resolve(source.fileName)).filter(file => {
    const local = relative(repository, file);
    return !local.startsWith('..') && !local.split(sep).includes('node_modules') &&
      !file.startsWith(mobile + sep);
  });
  assert.ok(shared.some(file => file.endsWith('rolePresentation.ts')), 'Runtime role presentation import was not resolved');
  const ignore = await Ignore.createForCopyingAsync(repository);
  for (const source of shared) {
    const file = relative(repository, source).split(sep).join('/');
    assert.equal(ignore.ignores(file), false, 'Required shared source missing from archive: ' + file);
  }
});
