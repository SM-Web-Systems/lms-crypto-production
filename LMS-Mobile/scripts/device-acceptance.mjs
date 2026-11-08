// Offline completeness check for operator attestations. Never contacts a device,
// API, browser, provider or build service; cannot prove hardware was tested.
import {readFileSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';

const sha=/^[a-f0-9]{40}$/;
const hash=/^[a-f0-9]{64}$/;
const cases=['wallet_sso','callback_lifecycle','session_lifecycle','role_handoffs',
  'learning_content','learning_progress','account_controls','documents_accessibility'];
const integratedCases=[...cases,'push_notifications','offline_learning'];
const text=value=>typeof value==='string' && value.trim().length>0 && value.length<=512;
function requireValue(condition,code) {if (!condition) throw new Error(code);}
function readReport(path) {
  const file = statSync(path);
  requireValue(file.isFile() && file.size <= 1024 * 1024, 'REPORT_TOO_LARGE');
  const bytes = readFileSync(path);
  requireValue(bytes.length <= 1024 * 1024, 'REPORT_TOO_LARGE');
  return bytes;
}

function verifyBuildPins(path, digest, appSha, reports) {
  const bytes = readReport(path);
  requireValue(createHash('sha256').update(bytes).digest('hex') === digest, 'BUILD_PINS_DIGEST_MISMATCH');
  const pins = JSON.parse(bytes.toString('utf8'));
  requireValue(pins?.version === 1 && pins.environment === 'authorized_staging' &&
    pins.app_sha === appSha && sha.test(pins.api_sha) && sha.test(pins.wallet_sha) &&
    Array.isArray(pins.builds) && pins.builds.length === reports.length, 'INVALID_BUILD_PINS');
  for (const device of reports) {
    const matching = pins.builds.filter(build => build?.platform === device.platform);
    requireValue(matching.length === 1, 'INVALID_BUILD_PINS');
    const [build] = matching;
    requireValue(text(build.app_build_id) && hash.test(build.artifact_sha256), 'INVALID_BUILD_PINS');
    requireValue(device.api_sha === pins.api_sha && device.wallet_sha === pins.wallet_sha &&
      device.app_build_id === build.app_build_id && device.artifact_sha256 === build.artifact_sha256,
      'DEVICE_BUILD_PIN_MISMATCH');
  }
}

try {
  const args=process.argv.slice(2);
  const integrated=args.at(-1)==='--integrated';
  if (integrated) args.pop();
  const requiredCases=integrated ? integratedCases : cases;
  requireValue((args.length===4 || args.length===8) && args[0]==='--file' &&
    args[2]==='--expected-sha' && sha.test(args[3]),'EXPLICIT_FILE_AND_FULL_SHA_REQUIRED');
  const hasPins = args.length === 8;
  requireValue(!hasPins || (args[4] === '--expected-builds' && args[6] === '--expected-builds-sha256' &&
    hash.test(args[7])), 'EXPLICIT_BUILD_PINS_AND_DIGEST_REQUIRED');
  const report=JSON.parse(readReport(args[1]).toString('utf8'));
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
      Object.keys(device.cases).every(id=>integratedCases.includes(id)) &&
      requiredCases.every(id=>Object.hasOwn(device.cases,id)),'ALL_ACCEPTANCE_CASES_REQUIRED');
    for (const id of requiredCases) requireValue(device.cases[id]?.status==='pass' &&
      text(device.cases[id]?.evidence),'DEVICE_ACCEPTANCE_INCOMPLETE');
  }
  const environment = report.reports[0].environment;
  requireValue(!integrated || environment === 'authorized_staging', 'INTEGRATED_STAGING_REQUIRED');
  requireValue(report.reports.every(device => device.environment === environment), 'MATCHING_ENVIRONMENTS_REQUIRED');
  requireValue(environment !== 'authorized_staging' || hasPins, 'STAGING_BUILD_PINS_REQUIRED');
  requireValue(environment !== 'synthetic' || !hasPins, 'SYNTHETIC_BUILD_PINS_FORBIDDEN');
  if (hasPins) verifyBuildPins(args[5], args[7], args[3], report.reports);
  console.log(JSON.stringify({status:'COMPLETE_ATTESTATION',hardware_verified:false,build_pins_verified:hasPins,
    environment,scope:integrated ? 'integrated' : 'core',platforms:2,
    cases_per_platform:requiredCases.length,app_sha:report.app_sha}));
} catch (error) {
  const codes=['EXPLICIT_FILE_AND_FULL_SHA_REQUIRED','REPORT_TOO_LARGE','APP_SHA_MISMATCH',
    'BOTH_PLATFORMS_REQUIRED','PHYSICAL_PLATFORM_REQUIRED','AUTHORIZED_TEST_ENVIRONMENT_REQUIRED',
    'BUILD_AND_DEVICE_METADATA_REQUIRED','UTC_TEST_TIMESTAMP_REQUIRED','ALL_ACCEPTANCE_CASES_REQUIRED','DEVICE_ACCEPTANCE_INCOMPLETE',
    'EXPLICIT_BUILD_PINS_AND_DIGEST_REQUIRED','MATCHING_ENVIRONMENTS_REQUIRED','STAGING_BUILD_PINS_REQUIRED',
    'INTEGRATED_STAGING_REQUIRED','SYNTHETIC_BUILD_PINS_FORBIDDEN','BUILD_PINS_DIGEST_MISMATCH','INVALID_BUILD_PINS','DEVICE_BUILD_PIN_MISMATCH'];
  console.error(JSON.stringify({status:'NOT_ACCEPTED',hardware_verified:false,
    code:codes.includes(error?.message)?error.message:'INVALID_ACCEPTANCE_REPORT'}));
  process.exitCode=2;
}
