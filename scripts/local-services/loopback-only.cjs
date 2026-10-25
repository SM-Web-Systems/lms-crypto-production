// Development preload only; never imported by deployed application code.
const net = require('node:net');
const local = host => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(host).toLowerCase());
const deny = () => { throw Error('LOCAL_SERVICES_REMOTE_NETWORK_BLOCKED'); };
function socketTarget(args) {
    if (Array.isArray(args[0]))
        return socketTarget(args[0]);
    const first = args[0];
    if (first && typeof first === 'object') {
        if (first.path)
            return { path: first.path };
        return { host: first.host || 'localhost' };
    }
    if (typeof first === 'string' && !/^\d+$/.test(first))
        return { path: first };
    return { host: typeof args[1] === 'string' ? args[1] : 'localhost' };
}
function check(target) {
    if (target.path) {
        if (process.platform === 'win32' && target.path.startsWith('\\\\.\\pipe\\'))
            return;
        deny();
    }
    if (!local(target.host))
        deny();
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) { check(socketTarget(args)); return connect.apply(this, args); };
function requestTarget(args) {
    const first = args[0];
    if (typeof first === 'string' || first instanceof URL)
        return { host: new URL(first).hostname };
    return { host: first?.hostname || first?.host || 'localhost' };
}
for (const name of ['node:http', 'node:https']) {
    const api = require(name);
    for (const method of ['request', 'get']) {
        const original = api[method];
        api[method] = function (...args) { check(requestTarget(args)); return original.apply(this, args); };
    }
}
const tls = require('node:tls'), tlsConnect = tls.connect;
tls.connect = function (...args) { check(socketTarget(args)); return tlsConnect.apply(this, args); };
const fetch = globalThis.fetch;
globalThis.fetch = async function (input, ...args) { check({ host: new URL(typeof input === 'string' || input instanceof URL ? input : input.url).hostname }); return fetch(input, ...args); };
const http2 = require('node:http2'), h2Connect = http2.connect;
http2.connect = function (authority, ...args) { check({ host: new URL(authority).hostname }); return h2Connect.call(this, authority, ...args); };
// No UDP integration is required by these development services.
require('node:dgram').createSocket = deny;
const dns = require('node:dns');
for (const [api, asynchronous] of [[dns, false], [dns.promises, true]]) {
    const lookup = api.lookup;
    api.lookup = asynchronous ? async function (host, ...args) { if (!local(host))
        deny(); return lookup.call(this, host, ...args); }
        : function (host, ...args) { if (!local(host))
            deny(); return lookup.call(this, host, ...args); };
    for (const target of [api, api.Resolver.prototype]) {
        for (let proto = target; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
            for (const name of Object.getOwnPropertyNames(proto)) {
                if (/^(resolve|reverse|lookupService)/.test(name) && typeof target[name] === 'function')
                    target[name] = asynchronous ? async () => deny() : deny;
            }
        }
    }
}
// Both applications currently request wildcard binds; confine them to this laptop.
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
    if (args[0] && typeof args[0] === 'object') {
        if (args[0].path) {
            check({ path: args[0].path });
            return listen.apply(this, args);
        }
        args[0] = { ...args[0], host: '127.0.0.1' };
    }
    else if (typeof args[0] === 'number' || /^\d+$/.test(args[0])) {
        if (typeof args[1] === 'string')
            args[1] = '127.0.0.1';
        else
            args.splice(1, 0, '127.0.0.1');
    }
    else {
        check({ path: args[0] });
    }
    return listen.apply(this, args);
};
require('node:module').syncBuiltinESMExports();
