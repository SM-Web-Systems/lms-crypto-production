import test from 'node:test';
import assert from 'node:assert/strict';
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
function check(value, expected=sha) {
  const directory=mkdtempSync(join(tmpdir(),'mobile acceptance fixture '));
  try {
    const path=join(directory,'report.json');writeFileSync(path,JSON.stringify(value));
    return spawnSync(process.execPath,[script,'--file',path,'--expected-sha',expected],{encoding:'utf8'});
  } finally {rmSync(directory,{recursive:true,force:true});}
}
test('complete synthetic schema fixture is an attestation, never hardware verification',()=>{
  const result=check(evidence());assert.equal(result.status,0,result.stderr);
  const output=JSON.parse(result.stdout);assert.equal(output.status,'COMPLETE_ATTESTATION');
  assert.equal(output.hardware_verified,false);
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
