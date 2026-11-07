#!/usr/bin/env bash
set -euo pipefail

# CI-only rehearsal. The only mounted files are generated synthetic fixtures.
[[ "${V1_REVISION:-}" =~ ^[a-f0-9]{40}$ ]]
[[ "${V2_IMAGE:-}" =~ ^sha256:[a-f0-9]{64}$ ]]
test "$(git -C .ci-rbac-v1 rev-parse HEAD)" = "$V1_REVISION"
schema_label='{{index .Config.Labels "org.smwebsystems.lms.authorization-schema"}}'
revision_label='{{index .Config.Labels "org.opencontainers.image.revision"}}'
test "$(docker image inspect --format "$schema_label" "$V2_IMAGE")" = rbac-only-v2
test "$(docker image inspect --format "$revision_label" "$V2_IMAGE")" = "$GITHUB_SHA"

workspace="$(mktemp -d "${RUNNER_TEMP}/lms-rbac-pair.XXXXXXXX")"
mkdir "$workspace/source" "$workspace/fixtures"
# Docker's node user writes fixtures. The enclosing runner directory is private.
chmod 0777 "$workspace/fixtures"
git -C .ci-rbac-v1 archive "$V1_REVISION" LMS-Server | tar -x -C "$workspace/source"
v1_tag="lms-ci-recovery-api:$V1_REVISION"
docker build --build-arg "BUILD_SHA=$V1_REVISION" --tag "$v1_tag" "$workspace/source/LMS-Server"
v1_image="$(docker image inspect --format '{{.Id}}' "$v1_tag")"
[[ "$v1_image" =~ ^sha256:[a-f0-9]{64}$ ]]
test "$(docker image inspect --format "$schema_label" "$v1_image")" = rbac-only-v1
test "$(docker image inspect --format "$revision_label" "$v1_image")" = "$V1_REVISION"
echo "Synthetic RBAC image pair v1 $V1_REVISION $v1_image v2 $GITHUB_SHA $V2_IMAGE"

docker run --rm --network none --read-only --tmpfs /tmp:size=128m \
  --mount "type=bind,src=$workspace/fixtures,dst=/rehearsal-output" \
  --env RBAC_REHEARSAL_EXPORT_DIR=/rehearsal-output "$V2_IMAGE" node scripts/test-rbac-runtime.mjs

docker run --rm -i --network none --read-only --tmpfs /tmp:size=128m \
  --mount "type=bind,src=$workspace/fixtures,dst=/fixtures,readonly" \
  "$v1_image" node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const directory = mkdtempSync('/tmp/lms-rbac-recovery-');
function start(database, verify = '') {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const { db, close } = await import('/app/dist/config/database.js');
    try { ${verify} } finally { close(); }
  `], {
    cwd: directory, env: { ...process.env, NODE_ENV: 'production', DATABASE_PATH: database },
    encoding: 'utf8', timeout: 60_000,
  });
}

const incompatible = path.join(directory, 'incompatible.db');
copyFileSync('/fixtures/v2-contracted.db', incompatible);
const before = readFileSync(incompatible);
const refused = start(incompatible);
assert.ifError(refused.error);
assert.ok(refused.status > 0, 'v1 must refuse the contracted database');
assert.match(refused.stderr, /Database startup refused/);
assert.deepEqual(readFileSync(incompatible), before);
assert.deepEqual(readdirSync(directory), ['incompatible.db']);

const restored = path.join(directory, 'restored.db');
copyFileSync('/fixtures/v1-backup.db', restored);
const recovered = start(restored, `
  assert.ok(db.pragma('table_info(users)').some(column => column.name === 'role'));
  assert.deepEqual(db.prepare('SELECT user_id, role_id FROM user_roles ORDER BY user_id, role_id').all(),
    [{user_id: 'learner', role_id: 'role_student'}]);
  assert.equal(db.prepare("SELECT authorization_version FROM users WHERE id='revoked'").get().authorization_version, 9);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
`);
assert.ifError(recovered.error);
assert.equal(recovered.status, 0, recovered.stderr);
console.log('Synthetic v1 recovery image refused v2 without writes and restored v1 with intact grants and integrity.');
NODE
