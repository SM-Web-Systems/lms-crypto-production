const { test } = require('node:test');
const assert = require('node:assert/strict');
let calls = 0;
globalThis.fetch = async () => { calls++; return {ok:true}; };
require('./no-external-network.cjs');
test('external provider fetch is rejected before transport', async () => {
  await assert.rejects(fetch('https://api.paystack.co/transaction/initialize'),/external HTTP/);
  assert.equal(calls,0);
});
test('loopback fetch remains available', async () => {
  assert.equal((await fetch('http://127.0.0.1:1/health')).ok,true);
  assert.equal(calls,1);
});
test('external http and https request/get are rejected before transport', () => {
  for (const client of [require('node:http'),require('node:https')]) {
    assert.throws(()=>client.request({hostname:'example.invalid',path:'/'}),/external HTTP/);
    assert.throws(()=>client.get('https://example.invalid/'),/external HTTP/);
  }
});
