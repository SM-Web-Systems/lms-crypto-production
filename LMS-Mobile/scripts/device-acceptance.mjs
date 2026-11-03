// Offline completeness check for operator attestations. Never contacts a device,
// API, browser, provider or build service; cannot prove hardware was tested.
import {readFileSync, statSync} from 'node:fs';

const sha=/^[a-f0-9]{40}$/;
const hash=/^[a-f0-9]{64}$/;
const cases=['wallet_sso','callback_lifecycle','session_lifecycle','role_handoffs',
  'learning_content','learning_progress','account_controls','documents_accessibility'];
const text=value=>typeof value==='string' && value.trim().length>0 && value.length<=512;
function requireValue(condition,code) {if (!condition) throw new Error(code);}
try {
  const args=process.argv.slice(2);
  requireValue(args.length===4 && args[0]==='--file' && args[2]==='--expected-sha' && sha.test(args[3]),'EXPLICIT_FILE_AND_FULL_SHA_REQUIRED');
  requireValue(statSync(args[1]).size<=1024*1024,'REPORT_TOO_LARGE');
  const report=JSON.parse(readFileSync(args[1],'utf8'));
  requireValue(report.version===1 && report.app_sha===args[3],'APP_SHA_MISMATCH');
  requireValue(Array.isArray(report.reports) && report.reports.length===2 &&
    new Set(report.reports.map(item=>item.platform)).size===2,'BOTH_PLATFORMS_REQUIRED');
  for (const device of report.reports) {
    requireValue(['android','ios'].includes(device.platform) && device.device_type==='physical','PHYSICAL_PLATFORM_REQUIRED');
    requireValue(['synthetic','authorized_staging'].includes(device.environment),'AUTHORIZED_TEST_ENVIRONMENT_REQUIRED');
    requireValue(['device','os_version','app_build_id','tester'].every(key=>text(device[key])) &&
      hash.test(device.artifact_sha256) && sha.test(device.api_sha) && sha.test(device.wallet_sha),'BUILD_AND_DEVICE_METADATA_REQUIRED');
    requireValue(typeof device.tested_at==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(device.tested_at) &&
      Number.isFinite(Date.parse(device.tested_at)) && new Date(device.tested_at).toISOString()===device.tested_at &&
      Date.parse(device.tested_at)<=Date.now()+300000,'UTC_TEST_TIMESTAMP_REQUIRED');
    requireValue(device.cases && typeof device.cases==='object' &&
      Object.keys(device.cases).length===cases.length,'ALL_ACCEPTANCE_CASES_REQUIRED');
    for (const id of cases) requireValue(device.cases[id]?.status==='pass' &&
      text(device.cases[id]?.evidence),'DEVICE_ACCEPTANCE_INCOMPLETE');
  }
  console.log(JSON.stringify({status:'COMPLETE_ATTESTATION',hardware_verified:false,platforms:2,cases_per_platform:cases.length,app_sha:report.app_sha}));
} catch (error) {
  const codes=['EXPLICIT_FILE_AND_FULL_SHA_REQUIRED','REPORT_TOO_LARGE','APP_SHA_MISMATCH',
    'BOTH_PLATFORMS_REQUIRED','PHYSICAL_PLATFORM_REQUIRED','AUTHORIZED_TEST_ENVIRONMENT_REQUIRED',
    'BUILD_AND_DEVICE_METADATA_REQUIRED','UTC_TEST_TIMESTAMP_REQUIRED','ALL_ACCEPTANCE_CASES_REQUIRED','DEVICE_ACCEPTANCE_INCOMPLETE'];
  console.error(JSON.stringify({status:'NOT_ACCEPTED',hardware_verified:false,
    code:codes.includes(error?.message)?error.message:'INVALID_ACCEPTANCE_REPORT'}));
  process.exitCode=2;
}
