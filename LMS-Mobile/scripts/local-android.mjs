import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync, spawn} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
const mobile=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const avd='LMS_Local_API_35';
export function validateDevelopmentTargets(values, approved={}) {
  const production=new Set(['lms.smwebsystems.com','ammawallet.com','www.ammawallet.com']);
  for (const key of ['EXPO_PUBLIC_API_BASE_URL','EXPO_PUBLIC_WEB_BASE_URL','EXPO_PUBLIC_AMMA_WALLET_URL']) {
    if (!values[key]) throw Error('Missing development endpoint: '+key);
    if (typeof values[key]!=='string' || /[\r\n\0]/.test(values[key])) throw Error('Invalid development endpoint: '+key);
    const url=new URL(values[key]);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
      || production.has(url.hostname.replace(/\.$/,''))) throw Error('Unsafe development endpoint: '+key);
    const loopback=['localhost','127.0.0.1'].includes(url.hostname);
    if (!loopback && (url.protocol!=='https:' || !approved[key] || new URL(approved[key]).href!==url.href))
      throw Error('Staging endpoint must match the explicit local target configuration: '+key);
  }
  return values;
}
export function assertEmulatorIdentity(serial, output) {
  if (serial!=='emulator-5554' || output.trim().split(/[\r\n]+/)[0]!==avd)
    throw Error('Refusing to modify an unrelated emulator or physical device.');
}
function requireEmulator(adb, serial, env) {
  const current=spawnSync(adb,['-s',serial,'emu','avd','name'],{env,encoding:'utf8',windowsHide:true,timeout:10000});
  if (current.status!==0) throw Error('The local emulator is not ready. Start it and wait for Android to finish booting.');
  assertEmulatorIdentity(serial,current.stdout);
}
function localEnvironment() {
  const values=Object.fromEntries(fs.readFileSync(path.join(mobile,'.env.local'),'utf8').split(/\r?\n/)
    .filter(line=>line.trim()&&!line.startsWith('#')).map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1).trim()]}));
  const targetsFile=path.join(mobile,'.local-development','targets.json');
  const approved=fs.existsSync(targetsFile)?JSON.parse(fs.readFileSync(targetsFile,'utf8')):{};
  validateDevelopmentTargets(values,approved);
  const local=process.env.LOCALAPPDATA;
  if (!local) throw Error('This launcher requires Windows LOCALAPPDATA.');
  const tools=path.join(local,'LmsMobile','tools','jdk17');
  const javaHome=fs.readdirSync(tools).map(name=>path.join(tools,name)).find(dir=>fs.existsSync(path.join(dir,'bin','java.exe')));
  if (!javaHome) throw Error('JDK17 is not installed.');
  const sdk=process.env.ANDROID_HOME||path.join(local,'Android','Sdk');
  return {...process.env,...values,JAVA_HOME:javaHome,ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk,
    GRADLE_USER_HOME:path.join(local,'LmsMobile','gradle'),CMAKE_BUILD_PARALLEL_LEVEL:'2',
    EXPO_NO_TELEMETRY:'1',EXPO_OFFLINE:'1',
    Path:[path.join(javaHome,'bin'),path.join(sdk,'platform-tools'),path.join(sdk,'emulator'),process.env.Path||process.env.PATH].join(path.delimiter)};
}
function run(file,args,env,cwd=mobile,input) {
  // SDK and Gradle .bat files require cmd.exe on Windows. Arguments are fixed
  // here, with metacharacters refused rather than accepting arbitrary commands.
  const batch=/\.bat$/i.test(file);
  if (batch && [file,...args].some(arg=>/[&|<>^%!"\r\n]/.test(arg))) throw Error('Unsupported shell metacharacter in tool path/argument');
  const result=spawnSync(batch&&file.includes(' ')?'"'+file+'"':file,args,
    {cwd,env,stdio:input===undefined?'inherit':['pipe','inherit','inherit'],input,shell:batch,windowsHide:true});
  if (result.error) throw result.error;
  if (result.status!==0) throw Error(path.basename(file)+' failed ('+result.status+')');
}
async function main() {
  const action=process.argv[2]||'doctor';
  if (!['configure','doctor','emulator','build','start','install'].includes(action)) throw Error('Use configure, doctor, emulator, build, start or install.');
  if (action==='configure') {
    const args=process.argv.slice(3);
    const flags=new Map();
    for (let i=0;i<args.length;i+=2) {
      if (!['--api','--web','--wallet'].includes(args[i]) || !args[i+1] || flags.has(args[i])) throw Error('Provide --api, --web and --wallet once each.');
      flags.set(args[i],args[i+1]);
    }
    const values={EXPO_PUBLIC_API_BASE_URL:flags.get('--api'),EXPO_PUBLIC_WEB_BASE_URL:flags.get('--web'),EXPO_PUBLIC_AMMA_WALLET_URL:flags.get('--wallet')};
    validateDevelopmentTargets(values,values);
    const config=path.join(mobile,'.local-development');fs.mkdirSync(config,{recursive:true});
    fs.writeFileSync(path.join(config,'targets.json'),JSON.stringify(values,null,2)+'\n');
    const envFile=path.join(mobile,'.env.local');
    const existing=fs.existsSync(envFile)?fs.readFileSync(envFile,'utf8').split(/\r?\n/).filter(line=>!Object.keys(values).some(key=>line.startsWith(key+'='))):[];
    fs.writeFileSync(envFile,[...existing,...Object.entries(values).map(([key,value])=>key+'='+value)].join('\n')+'\n');
    console.log('Development targets configured locally. Restart Metro after changing targets.');return;
  }
  const env=localEnvironment(),sdk=env.ANDROID_HOME;
  const adb=path.join(sdk,'platform-tools','adb.exe'),emulator=path.join(sdk,'emulator','emulator.exe');
  const serial='emulator-5554';
  if (process.env.LMS_ANDROID_SERIAL && process.env.LMS_ANDROID_SERIAL!==serial) throw Error('This setup targets only the dedicated local emulator.');
  const localDir=path.join(mobile,'.local-development');fs.mkdirSync(localDir,{recursive:true});
  if (action==='doctor') {
    console.log(JSON.stringify({project:mobile,java:env.JAVA_HOME,sdk,gradle:env.GRADLE_USER_HOME,device:serial},null,2));
    run(path.join(env.JAVA_HOME,'bin','java.exe'),['-version'],env);
    run(adb,['version'],env);run(emulator,['-accel-check'],env);return;
  }
  if (action==='emulator') {
    const current=spawnSync(adb,['-s','emulator-5554','emu','avd','name'],{env,encoding:'utf8',windowsHide:true,timeout:10000});
    if (current.status===0) {
      assertEmulatorIdentity(serial,current.stdout);
      console.log('The local emulator is already running.');return;
    }
    const avdDirectory=path.join(os.homedir(),'.android','avd',avd+'.avd');
    if (!fs.existsSync(avdDirectory)) {
      run(path.join(sdk,'cmdline-tools','19.0','bin','avdmanager.bat'),
        ['create','avd','--name',avd,'--package','system-images;android-35;google_apis;x86_64','--device','pixel_5'],env,mobile,'no\n');
    }
    const log=fs.openSync(path.join(localDir,'emulator.log'),'a');
    const child=spawn(emulator,['-avd',avd,'-port','5554','-memory','2048','-no-audio','-no-snapshot','-gpu','swiftshader_indirect'],
      {env,detached:true,stdio:['ignore',log,log],windowsHide:false});
    child.unref();fs.closeSync(log);console.log('Emulator requested; see .local-development/emulator.log.');return;
  }
  if (action==='build') {
    if (!fs.existsSync(path.join(mobile,'android','gradlew.bat'))) throw Error('Generate Android first: npx expo prebuild --platform android --no-install');
    run(path.join(mobile,'android','gradlew.bat'),['app:assembleDebug','--no-daemon','--max-workers=2','-PreactNativeArchitectures=x86_64'],env,path.join(mobile,'android'));return;
  }
  if (action==='start') {
    run(process.execPath,[path.join(mobile,'node_modules','expo','bin','cli'),'start','--dev-client','--localhost','--port','8081','--max-workers','2'],env);return;
  }
  const apk=path.join(mobile,'android','app','build','outputs','apk','debug','app-debug.apk');
  if (!fs.existsSync(apk)) throw Error('Build the debug APK first.');
  requireEmulator(adb,serial,env);
  for (const port of [3001,3002,5173,5174,8081]) run(adb,['-s',serial,'reverse','tcp:'+port,'tcp:'+port],env);
  run(adb,['-s',serial,'install','-r',apk],env);
  run(adb,['-s',serial,'shell','am','start','-n','com.smwebsystems.lms/.MainActivity'],env);
}
if (process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)
  main().catch(error=>{console.error(error.message);process.exitCode=1});
