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
  if (before!==digest()) throw new Error('PROJECT_CONFIGURATION_CHANGED');
  console.log(JSON.stringify({status:'OFFLINE_TOOLING_VALID',cli:version,...profiles,config_changed:false}));
}

module.exports={validateProfiles};
if (require.main===module) checkProject().catch(()=>{console.error('Offline EAS startup/schema validation failed.');process.exitCode=1;});
