import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDevelopmentTargets,assertEmulatorIdentity} from './local-android.mjs';
const values={EXPO_PUBLIC_API_BASE_URL:'http://localhost:3001/api/v1',EXPO_PUBLIC_WEB_BASE_URL:'http://localhost:5173',EXPO_PUBLIC_AMMA_WALLET_URL:'http://localhost:5174'};
test('local endpoints allow loopback and preserve the existing Wallet flow',()=>{
 assert.deepEqual(validateDevelopmentTargets(values),values);
 assert.doesNotThrow(()=>validateDevelopmentTargets({...values,EXPO_PUBLIC_API_BASE_URL:'http://127.0.0.1:3001/api/v1'}));
});
test('missing, production and credential-bearing endpoints refuse local launch',()=>{
 for(const value of ['', 'https://lms.smwebsystems.com/api/v1','https://lms.smwebsystems.com./api/v1','http://localhost.evil.invalid','http://user:password@localhost:3001','http://localhost:3001?token=secret','file:///local'])
  assert.throws(()=>validateDevelopmentTargets({...values,EXPO_PUBLIC_API_BASE_URL:value}));
 assert.throws(()=>validateDevelopmentTargets({...values,EXPO_PUBLIC_AMMA_WALLET_URL:'https://ammawallet.com'}));
});

test('remote staging requires an exact explicit HTTPS target and still rejects production',()=>{
 const staging={...values,EXPO_PUBLIC_API_BASE_URL:'https://staging.example.invalid/api/v1'};
 assert.throws(()=>validateDevelopmentTargets(staging));
 assert.doesNotThrow(()=>validateDevelopmentTargets(staging,staging));
 assert.throws(()=>validateDevelopmentTargets({...staging,EXPO_PUBLIC_API_BASE_URL:'https://other.example.invalid/api/v1'},staging));
 const production={...values,EXPO_PUBLIC_API_BASE_URL:'https://lms.smwebsystems.com/api/v1'};
 assert.throws(()=>validateDevelopmentTargets(production,production));
});

test('newline-bearing targets cannot inject local environment variables',()=>{
 const bad={...values,EXPO_PUBLIC_API_BASE_URL:'https://staging.example.invalid/\nINJECTED=1'};
 assert.throws(()=>validateDevelopmentTargets(bad,bad));
});

test('APK installation requires the dedicated AVD and refuses unrelated or physical devices',()=>{
 assert.doesNotThrow(()=>assertEmulatorIdentity('emulator-5554','LMS_Local_API_35\r\nOK\r\n'));
 assert.doesNotThrow(()=>assertEmulatorIdentity('emulator-5554','LMS_Local_API_35\r\r\nOK\r\r\n'));
 assert.throws(()=>assertEmulatorIdentity('emulator-5554','Personal_Device\nOK'));
 assert.throws(()=>assertEmulatorIdentity('emulator-5554','LMS_Local_API_35_other\nOK'));
 assert.throws(()=>assertEmulatorIdentity('phone-serial','LMS_Local_API_35\nOK'));
});
