// Preload for offline tooling probes only. Never loaded by the application.
const denied = () => { throw new Error('OFFLINE_TOOLING_NETWORK_BLOCKED'); };
for (const protocol of ['node:http','node:https']) {
  require(protocol).request=denied;require(protocol).get=denied;
}
require('node:net').connect=denied;
require('node:net').createConnection=denied;
require('node:net').Socket.prototype.connect=denied;
require('node:tls').connect=denied;
require('node:http2').connect=denied;
require('node:dgram').createSocket=denied;
require('node:dgram').Socket.prototype.send=denied;
require('node:dgram').Socket.prototype.connect=denied;
const dns=require('node:dns');
function denyDns(api, asynchronous=false) {
  for (const name of Object.getOwnPropertyNames(api)) {
    if (/^(lookup|resolve|reverse)/.test(name) && typeof api[name]==='function') {
      api[name]=asynchronous?async()=>denied():denied;
    }
  }
}
denyDns(dns);
denyDns(dns.Resolver.prototype);
denyDns(dns.promises,true);
denyDns(dns.promises.Resolver.prototype,true);
globalThis.fetch=async()=>denied();
require('node:module').syncBuiltinESMExports();
