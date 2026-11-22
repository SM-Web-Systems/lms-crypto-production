// Pure EAS schema reads and a network-blocked version probe, never eas config,
// login, build, submit, account lookup or cloud API calls.
require('./deny-tooling-network.cjs');
const {readFileSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {createHash}=require('node:crypto');
const {createRequire}=require('node:module');
const {spawnSync}=require('node:child_process');

async function validateProfiles(accessor,version) {
  const configuration=await accessor.readAsync();
  if (configuration.cli?.version!==version) throw new Error('EAS_CONFIG_CLI_PIN_MISMATCH');
  const packageFile=require.resolve('eas-cli/package.json');
  const {EasJsonUtils}=createRequire(packageFile)('@expo/eas-json');
  const names=await EasJsonUtils.getBuildProfileNamesAsync(accessor);
  if (!names.length) throw new Error('NO_BUILD_PROFILES');
  for (const name of names) for (const platform of ['android','ios']) await EasJsonUtils.getBuildProfileAsync(accessor,platform,name);
  const submitNames=await EasJsonUtils.getSubmitProfileNamesAsync(accessor);
  for (const name of submitNames) await EasJsonUtils.getSubmitProfileAsync(accessor,'android',name);
  return {build_profiles:names.length,platform_profiles:names.length*2,android_submit_profiles:submitNames.length};
}

const previewTargets = {
  EXPO_PUBLIC_API_BASE_URL: 'https://lms.smwebsystems.com/api/v1',
  EXPO_PUBLIC_WEB_BASE_URL: 'https://lms.smwebsystems.com',
  EXPO_PUBLIC_AMMA_WALLET_URL: 'https://ammawallet.com',
};

async function validateStagingPreview(accessor, exp) {
  const { EasJsonUtils } = createRequire(require.resolve('eas-cli/package.json'))('@expo/eas-json');
  for (const platform of ['android', 'ios']) {
    const profile = await EasJsonUtils.getBuildProfileAsync(accessor, platform, 'preview');
    if (profile.autoIncrement !== true) throw new Error('STAGING_PREVIEW_BUILD_NUMBER_MUST_INCREMENT');
    if (profile.distribution !== 'internal' || profile.developmentClient ||
        (platform === 'android' && profile.buildType !== 'apk')) {
      throw new Error('INVALID_STAGING_PREVIEW_DISTRIBUTION');
    }
    const publicEnv = Object.entries(profile.env ?? {}).filter(([key]) => key.startsWith('EXPO_PUBLIC_'));
    if (publicEnv.length !== Object.keys(previewTargets).length ||
        publicEnv.some(([key, value]) => previewTargets[key] !== value)) {
      throw new Error('INVALID_STAGING_PREVIEW_PUBLIC_ENV');
    }
  }
  if (exp.scheme !== 'lmsmobile' || exp.android?.package !== 'com.smwebsystems.lms' ||
      exp.ios?.bundleIdentifier !== 'com.smwebsystems.lms') {
    throw new Error('INVALID_STAGING_PREVIEW_APP_IDENTITY');
  }
}

async function checkProject() {
  const project=join(__dirname,'..');
  const files=['package.json','eas.json','app.config.ts'];
  const digest=()=>files.map(file=>createHash('sha256').update(readFileSync(join(project,file))).digest('hex')).join(':');
  const before=digest();
  const packageFile=require.resolve('eas-cli/package.json');
  const version=require(packageFile).version;
  if (require('../package.json').devDependencies['eas-cli']!==version) throw new Error('INSTALLED_CLI_PIN_MISMATCH');
  const child=spawnSync(process.execPath,['--require',join(__dirname,'deny-tooling-network.cjs'),join(dirname(packageFile),'bin','run'),'--version'],
    {encoding:'utf8',timeout:30000,env:{...process.env,CI:'1',EXPO_NO_TELEMETRY:'1',EXPO_OFFLINE:'1'}});
  if (child.status!==0 || !child.stdout.startsWith('eas-cli/'+version+' ')) throw new Error('OFFLINE_CLI_STARTUP_FAILED');
  const {EasJsonAccessor}=createRequire(packageFile)('@expo/eas-json');
  const accessor=EasJsonAccessor.fromProjectPath(project);
  const profiles=await validateProfiles(accessor,version);
  const { getConfig } = createRequire(require.resolve('expo/package.json'))('@expo/config');
  const { exp } = getConfig(project, { isPublicConfig: true, skipPlugins: true });
  await validateStagingPreview(accessor, exp);
  if (before!==digest()) throw new Error('PROJECT_CONFIGURATION_CHANGED');
  console.log(JSON.stringify({status:'OFFLINE_TOOLING_VALID',cli:version,...profiles,staging_preview:'TARGETS_AND_APP_IDENTITY_VERIFIED',config_changed:false}));
}

module.exports={validateProfiles,validateStagingPreview};
if (require.main===module) checkProject().catch(()=>{console.error('Offline EAS startup/schema validation failed.');process.exitCode=1;});
