import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const guard = fileURLToPath(new URL('./loopback-only.cjs', import.meta.url));
function child(source) {
    const result = spawnSync(process.execPath, ['--require', guard, '--input-type=module', '-e', source], { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
}
test('real local HTTP and TCP work, wildcard listeners become loopback', () => {
    const out = child(`import assert from 'node:assert/strict';import http from 'node:http';import net from 'node:net';
 const server=http.createServer((req,res)=>res.end('local-only')); await new Promise(r=>server.listen(0,'0.0.0.0',r));
 assert.equal(server.address().address,'127.0.0.1');const port=server.address().port;
 assert.equal(await (await fetch('http://127.0.0.1:'+port)).text(),'local-only');
 await new Promise((resolve,reject)=>{const s=net.connect({host:'127.0.0.1',port},()=>{s.end();resolve();});s.on('error',reject);});
 await new Promise(r=>server.close(r)); console.log('PASS');`);
    assert.match(out, /PASS/);
});
test('HTTP, TLS, TCP, fetch, DNS, HTTP2 and UDP refuse remote targets before connecting', () => {
    child(`import assert from 'node:assert/strict';import http from 'node:http';import https from 'node:https';import net from 'node:net';import tls from 'node:tls';import dns from 'node:dns';import h2 from 'node:http2';import dgram from 'node:dgram';
 for(const attempt of [()=>http.get('http://ammawallet.com'),()=>https.get('https://lms.smwebsystems.com'),()=>net.connect(443,'1.1.1.1'),()=>new net.Socket().connect({host:'example.invalid',port:443}),()=>tls.connect({host:'example.invalid',port:443}),()=>dns.lookup('example.invalid',()=>{}),()=>h2.connect('https://example.invalid'),()=>dgram.createSocket('udp4')])assert.throws(attempt,/LOCAL_SERVICES_REMOTE_NETWORK_BLOCKED/);
 await assert.rejects(fetch('https://ammawallet.com'),/LOCAL_SERVICES_REMOTE_NETWORK_BLOCKED/);`);
});
test('a local HTTP redirect cannot escape to an external target', () => {
    child(`import assert from 'node:assert/strict';import http from 'node:http';
 const server=http.createServer((req,res)=>{res.writeHead(302,{Location:'https://example.invalid'});res.end();});await new Promise(r=>server.listen(0,r));
 await assert.rejects(fetch('http://127.0.0.1:'+server.address().port));await new Promise(r=>server.close(r));`);
});
test('all direct DNS and Resolver variants are blocked before native implementations run', () => {
    const source = `const assert=require('node:assert/strict');const dns=require('node:dns');let calls=0;
 const blocked=/^(resolve|reverse|lookupService)/;
 for(const [api,async] of [[dns,false],[dns.promises,true]])for(const target of [api,api.Resolver.prototype]){
  for(let proto=target;proto&&proto!==Object.prototype;proto=Object.getPrototypeOf(proto))for(const name of Object.getOwnPropertyNames(proto))if(blocked.test(name)&&typeof target[name]==='function')target[name]=async?async()=>{calls++;throw Error('UNGUARDED_DNS_TRAP');}:()=>{calls++;throw Error('UNGUARDED_DNS_TRAP');};
 }
 require(${JSON.stringify(guard)});
 (async()=>{for(const [api,async] of [[dns,false],[dns.promises,true]])for(const target of [api,new api.Resolver()]){
   const names=new Set();for(let proto=target;proto&&proto!==Object.prototype;proto=Object.getPrototypeOf(proto))for(const name of Object.getOwnPropertyNames(proto))if(blocked.test(name)&&typeof target[name]==='function')names.add(name);
   assert.ok(names.size>0);for(const name of names){if(async)await assert.rejects(()=>target[name]('outside.invalid'),/LOCAL_SERVICES_REMOTE_NETWORK_BLOCKED/);else assert.throws(()=>target[name]('outside.invalid',()=>{}),/LOCAL_SERVICES_REMOTE_NETWORK_BLOCKED/);}
 }assert.equal(calls,0);})().catch(e=>{console.error(e);process.exitCode=1;});`;
    const result = spawnSync(process.execPath, ['-e', source], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
});
