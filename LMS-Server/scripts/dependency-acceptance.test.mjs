import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ZipArchive } from 'archiver';
import AdmZip from 'adm-zip';

const require = createRequire(import.meta.url);
function fixture(prefix) {
  const folder = mkdtempSync(path.join(tmpdir(), prefix));
  return { folder, cleanup() {
    assert.equal(path.dirname(folder), tmpdir());
    rmSync(folder, { recursive: true, force: true });
  } };
}

test('Swagger discovers and parses actual annotated source with the patched glob', () => {
  const { folder, cleanup } = fixture('lms-dependency-swagger-');
  try {
    mkdirSync(path.join(folder, 'nested folder'));
    writeFileSync(path.join(folder, 'nested folder', 'route.ts'), `/**
 * @openapi
 * /synthetic-report:
 *   get:
 *     responses:
 *       '200':
 *         description: Synthetic success
 */`);
    const swagger = require('swagger-jsdoc');
    const result = swagger({ failOnErrors: true,
      definition: { openapi: '3.0.3', info: { title: 'Fixture', version: '1' } },
      apis: [path.join(folder, '**/*.ts').replaceAll('\\', '/')],
    });
    assert.equal(result.paths['/synthetic-report'].get.responses['200'].description, 'Synthetic success');
    const glob = createRequire(require.resolve('swagger-jsdoc/package.json'))('glob');
    assert.equal(glob.globSync('**/*.ts', { cwd: folder }).length, 1);
  } finally { cleanup(); }
});

test('Archive traversal preserves nested files and applies patched minimatch exclusions', async () => {
  const { folder, cleanup } = fixture('lms-dependency-archive-');
  try {
    mkdirSync(path.join(folder, 'nested folder'));
    writeFileSync(path.join(folder, 'nested folder', 'report.txt'), 'synthetic report');
    writeFileSync(path.join(folder, 'excluded.private'), 'synthetic excluded fixture');
    const archive = new ZipArchive({ zlib: { level: 1 } });
    const chunks = [];
    const finished = new Promise((resolve, reject) => {
      archive.on('data', chunk => chunks.push(chunk));
      archive.on('error', reject);
      archive.on('end', resolve);
    });
    archive.glob('**/*', { cwd: folder, ignore: ['**/*.private'] });
    await archive.finalize();
    await finished;
    const zip = new AdmZip(Buffer.concat(chunks));
    const files = zip.getEntries().filter(entry => !entry.isDirectory);
    assert.deepEqual(files.map(entry => entry.entryName), ['nested folder/report.txt']);
    assert.equal(files[0].getData().toString(), 'synthetic report');
  } finally { cleanup(); }
});
