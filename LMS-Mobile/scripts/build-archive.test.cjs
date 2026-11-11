const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { resolve, join, dirname } = require('node:path');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const easRequire = createRequire(require.resolve('eas-cli/package.json'));
const { Ignore, makeShallowCopyAsync } = easRequire('./build/vcs/local.js');
const repository = resolve(__dirname, '../..');

test('the actual EAS copier excludes other services, private records, Git history and mobile secrets', async () => {
  const ignore = await Ignore.createForCopyingAsync(repository);
  const excluded = [
    '.git', '.git/config', '.git/objects/private-commit',
    'LMS-Server/src/app.ts', 'LMS-Frontend/src/App.tsx', 'LMS-Frontend/.env.staging',
    'LMS-Frontend/src/utils/private-other-file.ts', 'LMS-Frontend/src/types/private-record.json',
    'docs/release/private-worksheet.json', 'output/private-evidence.json',
    'new-unrelated-service/config.json', 'package.json', 'package-lock.json',
    'LMS-Mobile/.env', 'LMS-Mobile/.env.staging', 'LMS-Mobile/.env.production.local',
    'LMS-Mobile/.npmrc', 'LMS-Mobile/credentials.json',
    'LMS-Mobile/google-services.json', 'LMS-Mobile/GoogleService-Info.plist',
    'LMS-Mobile/google-play-service-account.json',
    'LMS-Mobile/release.jks', 'LMS-Mobile/release.keystore',
    'LMS-Mobile/signing.p12', 'LMS-Mobile/signing.p8', 'LMS-Mobile/server.key',
    'LMS-Mobile/cert.pem', 'LMS-Mobile/device.mobileprovision',
    'LMS-Mobile/private.sqlite3', 'LMS-Mobile/private.db-wal',
    'LMS-Mobile/.expo/state.json', 'LMS-Mobile/node_modules/example/index.js',
    'LMS-Mobile/android/app/build.gradle', 'LMS-Mobile/ios/Info.plist',
  ];
  for (const file of excluded) assert.equal(ignore.ignores(file), true, file);
});

test('the EAS copier retains app configuration, the lockfile, assets and local compatibility packages', async () => {
  const ignore = await Ignore.createForCopyingAsync(repository);
  for (const file of [
    'LMS-Mobile', 'LMS-Mobile/', 'LMS-Mobile/app.config.ts', 'LMS-Mobile/app.json',
    'LMS-Mobile/eas.json', 'LMS-Mobile/package.json', 'LMS-Mobile/package-lock.json',
    'LMS-Mobile/app/index.tsx', 'LMS-Mobile/src/services/api.ts',
    'LMS-Mobile/assets/images/icon.png',
    'LMS-Mobile/vendor/query-string-compat/package.json',
    'LMS-Mobile/vendor/ts-deepmerge-compat/index.js',
    'LMS-Frontend', 'LMS-Frontend/src', 'LMS-Frontend/src/types', 'LMS-Frontend/src/utils',
    'LMS-Frontend/src/utils/rolePresentation.ts', 'LMS-Frontend/src/types/api.ts',
    'LMS-Frontend/src/types/course.ts', 'LMS-Frontend/src/types/directory.ts',
  ]) assert.equal(ignore.ignores(file), false, file);
});

test('the actual EAS directory copy traverses the app and excludes private sibling records', async () => {
  const temp = realpathSync(tmpdir());
  const fixture = mkdtempSync(join(temp, 'lms-eas-copy-'));
  const source = join(fixture, 'source');
  const archive = join(fixture, 'archive');
  try {
    mkdirSync(join(source, 'LMS-Mobile'), { recursive: true });
    mkdirSync(join(source, 'docs'), { recursive: true });
    mkdirSync(join(source, 'LMS-Frontend', 'src', 'utils'), { recursive: true });
    writeFileSync(join(source, 'LMS-Frontend', 'src', 'utils', 'rolePresentation.ts'), 'export const synthetic = true;');
    writeFileSync(join(source, 'LMS-Frontend', 'src', 'App.tsx'), 'synthetic web app excluded');
    writeFileSync(join(source, '.easignore'), readFileSync(join(repository, '.easignore')));
    writeFileSync(join(source, 'LMS-Mobile', 'app.json'), '{"expo":{"slug":"synthetic"}}');
    writeFileSync(join(source, 'LMS-Mobile', '.env.staging'), 'SYNTHETIC_ONLY=excluded');
    writeFileSync(join(source, 'docs', 'private-review.json'), '{"synthetic":true}');
    await makeShallowCopyAsync(source, archive);
    assert.equal(readFileSync(join(archive, 'LMS-Mobile', 'app.json'), 'utf8'), '{"expo":{"slug":"synthetic"}}');
    assert.equal(existsSync(join(archive, 'LMS-Mobile', '.env.staging')), false);
    assert.equal(existsSync(join(archive, 'docs')), false);
    assert.equal(readFileSync(join(archive, 'LMS-Frontend', 'src', 'utils', 'rolePresentation.ts'), 'utf8'), 'export const synthetic = true;');
    assert.equal(existsSync(join(archive, 'LMS-Frontend', 'src', 'App.tsx')), false);
  } finally {
    const target = realpathSync(fixture);
    assert.equal(dirname(target), temp);
    assert.ok(target.startsWith(join(temp, 'lms-eas-copy-')));
    rmSync(target, { recursive: true, force: true });
  }
});
