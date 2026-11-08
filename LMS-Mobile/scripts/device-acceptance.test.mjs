import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const script = join(dirname(fileURLToPath(import.meta.url)), 'device-acceptance.mjs');
const sha = 'a'.repeat(40);
const cases = ['wallet_sso', 'callback_lifecycle', 'session_lifecycle', 'role_handoffs',
  'learning_content', 'learning_progress', 'account_controls', 'documents_accessibility'];
function evidence() {
  return {version:1, app_sha:sha, reports:['android','ios'].map(platform=>({
    platform, device_type:'physical', device:'synthetic schema fixture', os_version:'fixture',
    app_build_id:'fixture-only', artifact_sha256:'b'.repeat(64), tested_at:new Date().toISOString(),
    tester:'fixture', environment:'synthetic', api_sha:'c'.repeat(40), wallet_sha:'d'.repeat(40),
    cases:Object.fromEntries(cases.map(id=>[id,{status:'pass',evidence:'fixture-only evidence reference'}])),
  }))};
}
function stagingEvidence() {
  const value = evidence();
  for (const device of value.reports) {
    device.environment = 'authorized_staging';
    device.app_build_id = `fixture-${device.platform}`;
  }
  value.reports[1].artifact_sha256 = 'e'.repeat(64);
  return value;
}

function buildPins(value) {
  const [first] = value.reports;
  return {
    version: 1,
    environment: 'authorized_staging',
    app_sha: value.app_sha,
    api_sha: first.api_sha,
    wallet_sha: first.wallet_sha,
    builds: value.reports.map(({platform, app_build_id, artifact_sha256}) =>
      ({platform, app_build_id, artifact_sha256})),
  };
}

function check(value, expected=sha, pins, digest, extraArgs=[]) {
  const directory=mkdtempSync(join(tmpdir(),'mobile acceptance fixture '));
  try {
    const path=join(directory,'report.json');writeFileSync(path,JSON.stringify(value));
    const args = [script, '--file', path, '--expected-sha', expected];
    if (pins) {
      const pinsPath = join(directory, 'approved-builds.json');
      const bytes = JSON.stringify(pins);
      writeFileSync(pinsPath, bytes);
      args.push('--expected-builds', pinsPath, '--expected-builds-sha256',
        digest ?? createHash('sha256').update(bytes).digest('hex'));
    }
    return spawnSync(process.execPath, [...args,...extraArgs], {encoding:'utf8'});
  } finally {rmSync(directory,{recursive:true,force:true});}
}
test('complete synthetic schema fixture is an attestation, never hardware verification',()=>{
  const result=check(evidence());assert.equal(result.status,0,result.stderr);
  const output=JSON.parse(result.stdout);assert.equal(output.status,'COMPLETE_ATTESTATION');
  assert.equal(output.hardware_verified,false);
  assert.equal(output.build_pins_verified,false);
  assert.equal(output.environment,'synthetic');
  assert.equal(output.scope,'core');
  assert.equal(output.cases_per_platform,8);
});
test('pending, failed, missing and duplicate platform evidence cannot pass',()=>{
  for (const mutate of [
    value=>{value.reports[0].cases.wallet_sso.status='not_run';},
    value=>{value.reports[1].cases.learning_progress.status='fail';},
    value=>{delete value.reports[0].cases.callback_lifecycle;},
    value=>{value.reports.pop();},
    value=>{value.reports[1].platform='android';},
  ]) {
    const value=evidence();mutate(value);assert.equal(check(value).status,2);
  }
});
test('wrong build, nonphysical device, absent evidence and invalid metadata cannot pass',()=>{
  for (const mutate of [
    value=>{value.app_sha='e'.repeat(40);},
    value=>{value.reports[0].device_type='emulator';},
    value=>{value.reports[1].cases.role_handoffs.evidence='';},
    value=>{value.reports[0].tested_at='not-UTC';},
    value=>{value.reports[0].tested_at='2026-02-30T10:00:00.000Z';},
    value=>{value.reports[0].tested_at=new Date(Date.now()+3600000).toISOString();},
    value=>{value.reports[1].artifact_sha256='';},
    value=>{value.reports[0].api_sha='short';},
    value=>{value.reports[0].environment='production';},
  ]) {
    const value=evidence();mutate(value);assert.equal(check(value).status,2);
  }
  assert.equal(check(evidence(),'main').status,2);
});

test('staging requires approved pins and both reports must share the same environment', () => {
  const value = stagingEvidence();
  const pins = buildPins(value);
  const result = check(value);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stderr).code, 'STAGING_BUILD_PINS_REQUIRED');

  value.reports[1].environment = 'synthetic';
  const mixed = check(value, sha, pins);
  assert.equal(mixed.status, 2);
  assert.equal(JSON.parse(mixed.stderr).code, 'MATCHING_ENVIRONMENTS_REQUIRED');

  const synthetic = check(evidence(), sha, pins);
  assert.equal(synthetic.status, 2);
  assert.equal(JSON.parse(synthetic.stderr).code, 'SYNTHETIC_BUILD_PINS_FORBIDDEN');
});

test('matching independently pinned staging builds produce a complete attestation', () => {
  const value = stagingEvidence();
  const result = check(value, sha, buildPins(value));
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, 'COMPLETE_ATTESTATION');
  assert.equal(output.environment, 'authorized_staging');
  assert.equal(output.build_pins_verified, true);
  assert.equal(output.hardware_verified, false);
});

test('integrated staging requires passing push and offline evidence for both pinned devices', () => {
  const value = stagingEvidence();
  const pins = buildPins(value);
  const integrated = () => check(value, sha, pins, undefined, ['--integrated']);
  const missing = integrated();
  assert.equal(missing.status, 2);
  assert.equal(JSON.parse(missing.stderr).code, 'ALL_ACCEPTANCE_CASES_REQUIRED');

  for (const device of value.reports) {
    device.cases.push_notifications = {status:'pass',evidence:'fixture push evidence'};
    device.cases.offline_learning = {status:'not_run',evidence:''};
  }
  const core = check(value, sha, pins);
  assert.equal(core.status, 0, core.stderr);
  assert.equal(JSON.parse(core.stdout).scope, 'core');
  const incomplete = integrated();
  assert.equal(incomplete.status, 2);
  assert.equal(JSON.parse(incomplete.stderr).code, 'DEVICE_ACCEPTANCE_INCOMPLETE');

  for (const device of value.reports) {
    device.cases.offline_learning = {status:'pass',evidence:'fixture offline evidence'};
  }
  const complete = integrated();
  assert.equal(complete.status, 0, complete.stderr);
  assert.equal(JSON.parse(complete.stdout).scope, 'integrated');
  assert.equal(JSON.parse(complete.stdout).cases_per_platform, 10);

  for (const device of value.reports) device.environment = 'synthetic';
  const synthetic = check(value, sha, undefined, undefined, ['--integrated']);
  assert.equal(synthetic.status, 2);
  assert.equal(JSON.parse(synthetic.stderr).code, 'INTEGRATED_STAGING_REQUIRED');
  for (const device of value.reports) device.environment = 'authorized_staging';

  value.reports[1].cases.push_notifications.status = 'fail';
  assert.equal(integrated().status, 2);
});

test('staging rejects an unapproved manifest or invalid platform and revision pins', () => {
  const value = stagingEvidence();
  const pins = buildPins(value);
  const result = check(value, sha, pins, 'f'.repeat(64));
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stderr).code, 'BUILD_PINS_DIGEST_MISMATCH');

  for (const mutate of [
    record => { record.app_sha = 'f'.repeat(40); },
    record => { record.builds[1].platform = 'android'; },
  ]) {
    const invalidPins = buildPins(value);
    mutate(invalidPins);
    const invalid = check(value, sha, invalidPins);
    assert.equal(invalid.status, 2);
    assert.equal(JSON.parse(invalid.stderr).code, 'INVALID_BUILD_PINS');
  }
});

test('staging rejects mismatched deployed revisions and platform artifacts', () => {
  for (const mutate of [
    device => { device.api_sha = 'f'.repeat(40); },
    device => { device.wallet_sha = 'f'.repeat(40); },
    device => { device.app_build_id = 'another-build'; },
    device => { device.artifact_sha256 = 'f'.repeat(64); },
  ]) {
    const value = stagingEvidence();
    const pins = buildPins(value);
    mutate(value.reports[1]);
    const result = check(value, sha, pins);
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stderr).code, 'DEVICE_BUILD_PIN_MISMATCH');
  }
});
