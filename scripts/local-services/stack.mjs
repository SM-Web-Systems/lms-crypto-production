import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const local = path.join(root, '.local-services');
const guard = path.join(root, 'scripts/local-services/loopback-only.cjs');
const pgUser = 'lms_local', dbName = 'wallet_local', pgPort = 55432, controlPort = 28081;
export function cleanEnvironment(source = process.env) {
    const allowed = ['SystemRoot', 'WINDIR', 'COMSPEC', 'Path', 'PATH', 'PATHEXT', 'LOCALAPPDATA', 'APPDATA', 'TEMP', 'TMP', 'USERPROFILE', 'HOME'];
    return Object.fromEntries(allowed.filter(k => source[k]).map(k => [k, source[k]]));
}
export function validateSettings(c, appData = process.env.LOCALAPPDATA) {
    if (!appData || !c || c.version !== 1 || !/^[a-f0-9]{16}$/.test(c.id))
        throw Error('Invalid local service identity');
    for (const key of ['dbPassword', 'lmsJwt', 'walletJwt', 'walletRefresh', 'adminJwt', 'totpKey', 'ssoSecret', 'apiKey', 'controlToken'])
        if (typeof c[key] !== 'string' || !/^[a-f0-9]{64}$/.test(c[key]))
            throw Error('Invalid local secret: ' + key);
    if (new Set(['lmsJwt', 'walletJwt', 'walletRefresh', 'adminJwt', 'ssoSecret', 'apiKey', 'controlToken'].map(k => c[k])).size !== 7)
        throw Error('Local secrets must be distinct');
    return { ...c, data: path.join(appData, 'LmsMobile', 'services', 'stack-' + c.id), wallet: path.resolve(root, '..', 'wallet-local') };
}
const jsonRead = p => JSON.parse(fs.readFileSync(p, 'utf8'));
export function settings(create = false) {
    fs.mkdirSync(local, { recursive: true });
    const file = path.join(local, 'settings.json');
    if (!fs.existsSync(file)) {
        if (!create)
            throw Error('Initialize first: node scripts/local-services/stack.mjs init');
        const c = { version: 1, id: crypto.randomBytes(8).toString('hex') };
        for (const key of ['dbPassword', 'lmsJwt', 'walletJwt', 'walletRefresh', 'adminJwt', 'totpKey', 'ssoSecret', 'apiKey', 'controlToken'])
            c[key] = crypto.randomBytes(32).toString('hex');
        fs.writeFileSync(file, JSON.stringify(c, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    }
    const c = validateSettings(jsonRead(file));
    const marker = path.join(c.data, 'owner.json');
    if (!fs.existsSync(marker)) {
        if (!create || fs.existsSync(c.data))
            throw Error('Refusing unowned local data directory');
        fs.mkdirSync(c.data, { recursive: true });
        fs.writeFileSync(marker, JSON.stringify({ id: c.id, root }));
    }
    const owner = jsonRead(marker);
    if (owner.id !== c.id || owner.root !== root)
        throw Error('Local data identity does not match this checkout');
    return c;
}
function files(c) {
    const tools = path.join(process.env.LOCALAPPDATA, 'LmsMobile', 'tools');
    return { pg: path.join(tools, 'postgresql-17.11-5', 'pgsql', 'bin'), mail: path.join(tools, 'mailpit-1.32.0', 'mailpit.exe'),
        openssl: 'C:/Program Files/Git/usr/bin/openssl.exe', cluster: path.join(c.data, 'postgres'), ca: path.join(c.data, 'mail-ca.crt') };
}
function command(file, args, c, { cwd = root, env = {}, input, output, background = false } = {}) {
    const fd = background ? fs.openSync(output, 'a') : undefined;
    let result;
    try {
        result = spawnSync(file, args, { cwd, env: { ...cleanEnvironment(), ...env }, input, encoding: 'utf8', stdio: background ? ['ignore', fd, fd] : undefined, windowsHide: true, timeout: background ? 30000 : 180000, maxBuffer: 20 * 1024 * 1024 });
    }
    finally {
        if (fd !== undefined)
            fs.closeSync(fd);
    }
    if (output && !background)
        fs.writeFileSync(output, (result.stdout || '') + (result.stderr || ''));
    if (result.error || result.status !== 0)
        throw Error(path.basename(file) + ' failed: ' + (result.error?.message || result.stderr || result.stdout || '').slice(-3500));
    return result.stdout;
}
function dbEnv(c) { return { PGPASSWORD: c.dbPassword, PGAPPNAME: 'lms-mobile-local', PGCLIENTENCODING: 'UTF8' }; }
function sql(c, statement, database = 'postgres') {
    return command(path.join(files(c).pg, 'psql.exe'), ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(pgPort), '-U', pgUser, '-d', database, '-c', statement], c, { env: dbEnv(c) }).trim();
}
function assertDatabase(c) {
    const actual = sql(c, 'SHOW data_directory');
    if (path.resolve(actual).toLowerCase() !== path.resolve(files(c).cluster).toLowerCase())
        throw Error('PostgreSQL belongs to another cluster');
}
function startDatabase(c) {
    const f = files(c);
    const state = spawnSync(path.join(f.pg, 'pg_ctl.exe'), ['-D', f.cluster, 'status'], { encoding: 'utf8', windowsHide: true });
    if (state.status !== 0)
        command(path.join(f.pg, 'pg_ctl.exe'), ['-D', f.cluster, '-l', path.join(c.data, 'postgres.log'), '-o', `-p ${pgPort} -h 127.0.0.1 -c shared_buffers=64MB -c max_connections=30`, '-w', 'start'], c, { background: true, output: path.join(c.data, 'pg-ctl.log') });
    assertDatabase(c);
    return state.status !== 0;
}
export function assertWalletDatabase(c) {
    assertDatabase(c);
    if (sql(c, 'SELECT instance_id FROM local_stack_identity', dbName) !== c.id)
        throw Error('Wallet database is not owned by this local stack');
}
function stopDatabase(c) {
    const f = files(c);
    const state = spawnSync(path.join(f.pg, 'pg_ctl.exe'), ['-D', f.cluster, 'status'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    if (state.status === 3)
        return;
    if (state.error || state.status !== 0)
        throw Error('Cannot verify local PostgreSQL process state');
    // The owned cluster may be only partly initialized; app tables are not a stop prerequisite.
    assertDatabase(c);
    command(path.join(f.pg, 'pg_ctl.exe'), ['-D', f.cluster, '-m', 'fast', '-w', 'stop'], c);
}
function serviceEnv(c, service) {
    const common = { NODE_ENV: 'development', NODE_EXTRA_CA_CERTS: files(c).ca, SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025', SMTP_USER: 'local', SMTP_PASS: 'local-capture-only' };
    if (service === 'lms')
        return { ...common, PORT: '3001', DATABASE_PATH: path.join(c.data, 'lms.sqlite'), FRONTEND_URL: 'http://localhost:5173', JWT_SECRET: c.lmsJwt,
            ADMIN_EMAILS: '', LECTURER_EMAILS: '', AMMA_WALLET_URL: 'http://localhost:5174', AMMA_WALLET_API_KEY: c.apiKey, AMMA_SSO_STATE_SECRET: c.ssoSecret,
            AMMA_WALLET_NETWORK: 'testnet', NFT_STELLAR_NETWORK: 'testnet', NFT_AUTO_MINT_ENABLED: 'false', EMAIL_FROM: 'LMS Local <lms@example.test>' };
    return { ...common, PORT: '3002', DATABASE_URL: `postgresql://${pgUser}:${c.dbPassword}@127.0.0.1:${pgPort}/${dbName}`,
        JWT_SECRET: c.walletJwt, JWT_REFRESH_SECRET: c.walletRefresh, ADMIN_JWT_SECRET: c.adminJwt, TOTP_ENCRYPTION_KEY: c.totpKey, SSO_SECRET: c.ssoSecret, API_KEYS: c.apiKey,
        SSO_CALLBACK_WHITELIST: 'http://localhost:5173', WEB_APP_URL: 'http://localhost:5174', API_BASE_URL: 'http://localhost:5174',
        STELLAR_NETWORK: 'testnet', HORIZON_URL: 'https://127.0.0.1:9', SOROBAN_RPC_URL: 'https://127.0.0.1:9', MONEYGRAM_RAMPS_URL: 'https://127.0.0.1:9',
        PLATFORM_SECRET: '', PLATFORM_WALLET: '', SIGNING_SECRET_KEY: '', SIGNING_PUBLIC_KEY: '', TURNSTILE_SECRET_KEY: '', SMS_ENABLED: 'false',
        STRIPE_ONRAMP_ENABLED: 'false', TRANSAK_ENABLED: 'false', SMTP_FROM: 'Wallet Local <wallet@example.test>' };
}
function refuseDotenv(directory) {
    if (fs.existsSync(path.join(directory, '.env')))
        throw Error('Local stack refuses an existing backend .env: ' + directory);
}
async function init(c) {
    const f = files(c);
    for (const file of [path.join(f.pg, 'initdb.exe'), f.mail, f.openssl])
        if (!fs.existsSync(file))
            throw Error('Install documented local tool: ' + file);
    for (const dir of [path.join(root, 'LMS-Server'), path.join(c.wallet, 'packages/backend')])
        refuseDotenv(dir);
    if (!fs.existsSync(f.ca)) {
        command(f.openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365', '-subj', '/CN=LMS Local Mail Test CA', '-keyout', path.join(c.data, 'mail-ca.key'), '-out', f.ca], c);
        command(f.openssl, ['req', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=mail.smwebsystems.com', '-keyout', path.join(c.data, 'mail.key'), '-out', path.join(c.data, 'mail.csr')], c);
        const ext = path.join(c.data, 'mail.ext');
        fs.writeFileSync(ext, 'subjectAltName=DNS:mail.smwebsystems.com,DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n');
        command(f.openssl, ['x509', '-req', '-in', path.join(c.data, 'mail.csr'), '-CA', f.ca, '-CAkey', path.join(c.data, 'mail-ca.key'), '-CAcreateserial', '-days', '365', '-extfile', ext, '-out', path.join(c.data, 'mail.crt')], c);
    }
    if (!fs.existsSync(f.cluster)) {
        const pw = path.join(c.data, 'initdb-password');
        fs.writeFileSync(pw, c.dbPassword, { mode: 0o600, flag: 'wx' });
        try {
            command(path.join(f.pg, 'initdb.exe'), ['-D', f.cluster, '-U', pgUser, '-E', 'UTF8', '--locale=C', '--auth=scram-sha-256', '--pwfile=' + pw], c, { output: path.join(c.data, 'initdb.log') });
        }
        finally {
            fs.unlinkSync(pw);
        }
    }
    startDatabase(c);
    if (sql(c, `SELECT count(*) FROM pg_database WHERE datname='${dbName}'`) === '0')
        sql(c, `CREATE DATABASE ${dbName}`);
    const tableCount = Number(sql(c, "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'", dbName));
    if (tableCount === 0) {
        const backend = path.join(c.wallet, 'packages/backend');
        const schema = command(process.execPath, [path.join(backend, 'node_modules/drizzle-kit/bin.cjs'), 'export', '--dialect', 'postgresql', '--schema', './src/db/schema/index.ts'], c, { cwd: backend });
        if (!/^\s*(CREATE|--)/.test(schema))
            throw Error('Schema exporter returned unexpected output');
        const ddl = path.join(c.data, 'wallet-schema.sql');
        fs.writeFileSync(ddl, 'BEGIN;\n' + schema + `\nCREATE TABLE local_stack_identity(instance_id text PRIMARY KEY);\nINSERT INTO local_stack_identity VALUES ('${c.id}');\nCOMMIT;\n`);
        command(path.join(f.pg, 'psql.exe'), ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(pgPort), '-U', pgUser, '-d', dbName, '-f', ddl], c, { env: dbEnv(c), output: path.join(c.data, 'wallet-schema.log') });
    }
    assertWalletDatabase(c);
    // Add only the missing raw-SQL auth table to an already owned local bootstrap.
    // Never run a broad schema push or deployment migration against an existing DB.
    if (!sql(c, "SELECT to_regclass('public.email_verification_tokens')", dbName)) {
        const backend = path.join(c.wallet, 'packages/backend');
        const statements = JSON.parse(command(process.execPath, ['--require', guard, '--import', 'tsx', path.join(root, 'scripts/local-services/email-schema.mjs')], c, { cwd: backend }));
        if (statements.length !== 2 || !/^CREATE TABLE "email_verification_tokens"/.test(statements[0]) || !/^ALTER TABLE "email_verification_tokens"/.test(statements[1]))
            throw Error('Unexpected local auth schema delta');
        const ddl = path.join(c.data, 'wallet-email-schema.sql');
        fs.writeFileSync(ddl, 'BEGIN;\n' + statements.join('\n') + '\nCOMMIT;\n');
        command(path.join(f.pg, 'psql.exe'), ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(pgPort), '-U', pgUser, '-d', dbName, '-f', ddl], c, { env: dbEnv(c), output: path.join(c.data, 'wallet-email-schema.log') });
    }
    if (!fs.existsSync(path.join(c.data, 'lms.sqlite'))) {
        command(process.execPath, ['--require', guard, '--import', 'tsx', 'src/scripts/initDb.ts', '--initialize-new'], c, { cwd: path.join(root, 'LMS-Server'), env: serviceEnv(c, 'lms'), output: path.join(c.data, 'lms-init.log') });
    }
    const csp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://localhost:3001 http://localhost:3002 http://localhost:5173 http://localhost:5174 ws://localhost:5173 ws://localhost:5174; frame-src 'none'; form-action 'self'; base-uri 'self'";
    for (const [name, dir, port, target] of [['lms', path.join(root, 'LMS-Frontend'), 5173, 3001], ['wallet', path.join(c.wallet, 'packages/web-app'), 5174, 3002]]) {
        const url = p => pathToFileURL(p).href;
        const captcha = name === 'wallet' ? `,plugins:[{name:'local-offline-captcha',enforce:'pre',transform(source,id){if(id.endsWith('/components/Turnstile.tsx'))return {code:${JSON.stringify("import {useEffect,createElement} from 'react';export function Turnstile({onVerify}){useEffect(()=>{onVerify('local-captcha-simulation');},[onVerify]);return createElement('p',{'data-local-captcha':'true'},'Local test: CAPTCHA service is simulated.');}")},map:null};}}]` : '';
        const code = `import {mergeConfig} from ${JSON.stringify(url(path.join(dir, 'node_modules/vite/dist/node/index.js')))};\nimport base from ${JSON.stringify(path.join(dir, 'vite.config.ts'))};\nexport default mergeConfig(base,{envDir:${JSON.stringify(local)},server:{host:'127.0.0.1',port:${port},strictPort:true,allowedHosts:['localhost','127.0.0.1'],headers:{'Content-Security-Policy':${JSON.stringify(csp)}},proxy:{'/api':{target:'http://127.0.0.1:${target}',changeOrigin:true}}}${captcha}});\n`;
        fs.writeFileSync(path.join(local, name + '.vite.mjs'), code);
    }
    console.log('Initialized isolated SQLite/PostgreSQL and local mail TLS. No accounts or blockchain wallets created.');
    console.log('Local configuration: ' + path.join(local, 'settings.json'));
    console.log('Local data/logs: ' + c.data);
}
const delay = ms => new Promise(r => setTimeout(r, ms));
async function ready(url, cancelled = () => false) {
    for (let i = 0; i < 120; i++) {
        if (cancelled())
            throw Error('Local startup cancelled');
        try {
            const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
            if (r.ok)
                return;
        }
        catch { }
        await delay(1000);
    }
    throw Error('Service readiness timeout: ' + url);
}
async function portFree(port) { await new Promise((resolve, reject) => { const server = net.createServer(); server.on('error', () => reject(Error('Local port already in use: ' + port))); server.listen(port, '127.0.0.1', () => server.close(resolve)); }); }
async function start(c) {
    assertWalletDatabase(c);
    for (const port of [3001, 3002, 5173, 5174, 1025, 8025, controlPort])
        await portFree(port);
    const f = files(c), children = [];
    let stopping = false;
    const control = http.createServer(async (req, res) => {
        if (req.headers.authorization !== 'Bearer ' + c.controlToken) {
            res.writeHead(403).end();
            return;
        }
        if (req.method === 'GET' && req.url === '/health') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ id: c.id, pid: process.pid }));
            return;
        }
        if (req.method === 'POST' && req.url === '/stop') {
            const okay = await stop();
            res.statusCode = okay ? 200 : 500;
            res.end(okay ? 'Local services stopped' : 'Local stop failed; inspect own logs');
            return;
        }
        res.writeHead(404).end();
    });
    async function stop() {
        if (stopping)
            return true;
        stopping = true;
        let okay = true;
        for (const child of children)
            child.kill();
        control.close();
        try {
            stopDatabase(c);
        }
        catch (error) {
            console.error(error.message);
            process.exitCode = 1;
            okay = false;
        }
        return okay;
    }
    function launch(name, file, args, cwd, env = {}) {
        const fd = fs.openSync(path.join(c.data, name + '.log'), 'a');
        const child = spawn(file, args, { cwd, env: { ...cleanEnvironment(), ...env }, stdio: ['ignore', fd, fd], windowsHide: true });
        fs.closeSync(fd);
        children.push(child);
        child.on('error', error => { console.error(name + ': ' + error.message); stop(); });
        child.on('exit', code => { if (!stopping) {
            console.error(name + ' exited (' + code + '); see local logs.');
            process.exitCode = 1;
            stop();
        } });
    }
    for (const dir of [path.join(root, 'LMS-Server'), path.join(c.wallet, 'packages/backend')])
        refuseDotenv(dir);
    await new Promise((resolve, reject) => { control.once('error', reject); control.listen(controlPort, '127.0.0.1', () => { control.removeListener('error', reject); resolve(); }); });
    control.on('error', error => { console.error(error.message); stop(); });
    try {
        launch('mailpit', f.mail, ['--listen', '127.0.0.1:8025', '--smtp', '127.0.0.1:1025', '--database', path.join(c.data, 'mailpit.sqlite'), '--disable-version-check', '--smtp-disable-rdns', '--smtp-auth-accept-any', '--smtp-require-starttls', '--smtp-tls-cert', path.join(c.data, 'mail.crt'), '--smtp-tls-key', path.join(c.data, 'mail.key'), '--smtp-allowed-recipients', '@example[.]test$'], root);
        for (const [name, cwd] of [['lms', path.join(root, 'LMS-Server')], ['wallet', path.join(c.wallet, 'packages/backend')]])
            launch(name + '-api', process.execPath, ['--require', guard, '--import', 'tsx', 'src/server.ts'], cwd, serviceEnv(c, name));
        for (const [name, dir] of [['lms', path.join(root, 'LMS-Frontend')], ['wallet', path.join(c.wallet, 'packages/web-app')]])
            launch(name + '-web', process.execPath, ['--require', guard, path.join(dir, 'node_modules/vite/bin/vite.js'), '--config', path.join(local, name + '.vite.mjs')], dir, { NODE_ENV: 'development', VITE_API_BASE_URL: '/api/v1', VITE_API_URL: '', VITE_AMMA_WALLET_URL: 'http://localhost:5174', VITE_TURNSTILE_SITE_KEY: '', VITE_PLATFORM_WALLET: '' });
        process.on('SIGINT', stop);
        process.on('SIGTERM', stop);
        await Promise.all(['http://127.0.0.1:3001/health', 'http://127.0.0.1:3002/health', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:8025/readyz'].map(url => ready(url, () => stopping)));
        console.log('LOCAL_SERVICES_READY: LMS http://localhost:5173 | Wallet http://localhost:5174 | Mail http://localhost:8025');
        console.log('Keep this supervisor running. Ctrl+C or the stop command shuts down only this stack.');
    }
    catch (error) {
        await stop();
        throw error;
    }
}
async function stopCommand(c) {
    let r;
    try {
        r = await fetch(`http://127.0.0.1:${controlPort}/health`, { headers: { authorization: 'Bearer ' + c.controlToken }, signal: AbortSignal.timeout(3000) });
    }
    catch (error) {
        if (error.cause?.code !== 'ECONNREFUSED')
            throw error;
        stopDatabase(c);
        console.log('Owned local PostgreSQL stopped; no supervisor was running.');
        return;
    }
    if (!r.ok || (await r.json()).id !== c.id)
        throw Error('Refusing to stop an unrelated service');
    const result = await fetch(`http://127.0.0.1:${controlPort}/stop`, { method: 'POST', headers: { authorization: 'Bearer ' + c.controlToken }, signal: AbortSignal.timeout(30000) });
    if (!result.ok)
        throw Error('Stop failed');
    console.log(await result.text());
}
async function main() {
    const action = process.argv[2];
    if (!['init', 'start', 'stop', 'check'].includes(action))
        throw Error('Use init, start, stop or check');
    const c = settings(action === 'init');
    if (action === 'init')
        return init(c);
    if (action === 'start') {
        const started = startDatabase(c);
        try {
            return await start(c);
        }
        catch (error) {
            if (started)
                stopDatabase(c);
            throw error;
        }
    }
    if (action === 'stop')
        return stopCommand(c);
    assertWalletDatabase(c);
    for (const url of ['http://127.0.0.1:3001/health', 'http://127.0.0.1:3002/health', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:8025/readyz']) {
        const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!r.ok)
            throw Error('Unhealthy service: ' + url);
    }
    console.log('All local services healthy; owned PostgreSQL identity verified.');
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url)
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
