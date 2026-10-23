// Loaded only by the disposable E2E API process, never by production startup.
const http = require('node:http');
const https = require('node:https');
const { syncBuiltinESMExports } = require('node:module');
function allowed(input, options) {
  const value = typeof input === 'string' || input instanceof URL ? new URL(input)
    : input?.url ? new URL(input.url) : input || options || {};
  const hostname = value.hostname || value.host;
  if (!['localhost','127.0.0.1','::1','[::1]'].includes(hostname)) {
    throw new Error('E2E external HTTP requests are disabled');
  }
}
for (const client of [http,https]) {
  for (const method of ['request','get']) {
    const original = client[method];
    client[method] = function(input,...args) { allowed(input,args[0]); return original.call(this,input,...args); };
  }
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input,...args) => { allowed(input); return originalFetch(input,...args); };
syncBuiltinESMExports();
