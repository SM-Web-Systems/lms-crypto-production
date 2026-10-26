import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const directories: string[] = [];
const schema = readFileSync(path.resolve('database/schema.sql'), 'utf8');
const runtime = `import('./src/config/database.ts').then(({db,close}) => {
  console.log(JSON.stringify({users:db.prepare('SELECT count(*) n FROM users').get().n,
    provider:db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='ammawallet_user_id'),
    progress:db.prepare('PRAGMA table_info(lesson_completions)').all().some(c=>c.name==='progress_pct'),
    permissions:db.prepare('SELECT count(*) n FROM permissions').get().n}));close();
}).catch(error=>{console.error(error.message);process.exitCode=1});`;
function location() { const dir = mkdtempSync(path.join(tmpdir(), 'auth13-db-')); directories.push(dir); return path.join(dir, 'isolated database.db'); }
function run(file: string, initialize = false, extra: Record<string,string> = {}) {
  const env = {...process.env, DATABASE_PATH: file, NODE_ENV: 'production', ...extra};
  delete env.VITEST; delete env.VITEST_WORKER_ID; delete env.VITEST_POOL_ID;
  return spawnSync(process.execPath, initialize ? ['--import','tsx','src/scripts/initDb.ts','--initialize-new'] : ['--import','tsx','--input-type=module','-e',runtime],
    {env, encoding:'utf8', timeout:30000, windowsHide:true});
}
function canonical(file: string) {
  const db = new Database(file); db.exec(schema); db.close();
  const result = run(file); expect(result.status, result.stderr).toBe(0);
}
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, {recursive:true,force:true}); });

describe('AUTH-13 real-process database bootstrap', { timeout: 60000 }, () => {
  it('normal startup refuses a missing file without creating it', () => {
    const file = location(); const result = run(file);
    expect(result.status).not.toBe(0); expect(existsSync(file)).toBe(false);
  });
  it('normal startup refuses a zero-byte database without changing it', () => {
    const file = location(); writeFileSync(file,'');
    expect(run(file).status).not.toBe(0); expect(statSync(file).size).toBe(0);
  });
  it('explicit initialization creates the complete application schema without demo users or credentials', () => {
    const file = location(); const result = run(file,true);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toMatch(/password123|admin123|student123|Password:/i);
    const db = new Database(file,{readonly:true});
    expect(db.prepare('SELECT count(*) n FROM users').get()).toEqual({n:0});
    expect(db.prepare('PRAGMA table_info(users)').all().map((row:any)=>row.name)).toContain('ammawallet_user_id');
    expect(db.prepare('PRAGMA table_info(lesson_completions)').all().map((row:any)=>row.name)).toContain('progress_pct');
    expect(db.prepare('SELECT count(*) n FROM permissions').get()).toMatchObject({n:expect.any(Number)});
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]); db.close();
  });
  it('explicit initialization refuses a zero-byte target', () => {
    const file = location(); writeFileSync(file, '');
    expect(run(file, true).status).not.toBe(0); expect(statSync(file).size).toBe(0);
  });
  it('explicit initialization refuses an existing populated database', () => {
    const file = location(); canonical(file);
    const db = new Database(file); db.exec(`INSERT INTO users(id,name,email,password_hash) VALUES('sentinel','Keep','keep@example.invalid','synthetic-hash');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('sentinel','role_student');
`); db.close();
    const before = readFileSync(file);
    expect(run(file,true).status).not.toBe(0); expect(readFileSync(file)).toEqual(before);
  });
  it.each(['-wal','-shm','-journal'])('rejects orphan %s before opening or creating a database', suffix => {
    const file = location(); writeFileSync(file+suffix,'orphan-evidence');
    expect(run(file,true).status).not.toBe(0); expect(existsSync(file)).toBe(false);
    expect(readFileSync(file+suffix,'utf8')).toBe('orphan-evidence');
  });
  it('rejects corrupt data without changing any bytes', () => {
    const file = location(); writeFileSync(file,'unexpected non-SQLite customer data'); const before = readFileSync(file);
    expect(run(file).status).not.toBe(0); expect(readFileSync(file)).toEqual(before);
  });
  it('rejects a small SQLite file with unrelated tables instead of treating it as fresh', () => {
    const file = location(); const db = new Database(file); db.exec("CREATE TABLE sentinel(value TEXT); INSERT INTO sentinel VALUES('keep')"); db.close();
    const before = readFileSync(file); expect(run(file).status).not.toBe(0); expect(readFileSync(file)).toEqual(before);
  });
  it('rejects a partial users-only database without repairing over missing data', () => {
    const file = location(); const db = new Database(file); db.exec("CREATE TABLE users(id TEXT); INSERT INTO users VALUES('keep')"); db.close();
    const before = readFileSync(file); expect(run(file).status).not.toBe(0); expect(readFileSync(file)).toEqual(before);
  });
  it('restarts a valid database without changing existing identities or credential history', () => {
    const file = location(); canonical(file);
    const db = new Database(file); db.exec(`INSERT INTO users(id,name,email,password_hash,authorization_version) VALUES('sentinel','Keep','keep@example.invalid','synthetic-hash',3);
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('sentinel','role_student');
`);
    db.exec("INSERT INTO nft_credentials(id,user_id,wallet_address,contract_id,mint_status) VALUES('history','sentinel','synthetic-recipient','synthetic-contract','minted')"); db.close();
    const result = run(file); expect(result.status,result.stderr).toBe(0);
    const check = new Database(file,{readonly:true});
    expect(check.prepare("SELECT name,authorization_version FROM users WHERE id='sentinel'").get()).toEqual({name:'Keep',authorization_version:3});
    expect(check.prepare("SELECT wallet_address FROM nft_credentials WHERE id='history'").get()).toEqual({wallet_address:'synthetic-recipient'}); check.close();
  });
  it('preserves committed rows in a live uncheckpointed WAL', () => {
    const file = location(); canonical(file);
    const writer = new Database(file); writer.pragma('journal_mode=WAL'); writer.pragma('wal_autocheckpoint=0');
    try {
      writer.exec(`INSERT INTO users(id,name,email,password_hash,authorization_version) VALUES('wal-user','WAL','wal@example.invalid','synthetic-hash',2);
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('wal-user','role_student');
`);
      expect(existsSync(file+'-wal')).toBe(true);
      const result = run(file); expect(result.status,result.stderr).toBe(0); expect(result.stdout).toContain('"users":1');
      expect(writer.prepare("SELECT name FROM users WHERE id='wal-user'").get()).toEqual({name:'WAL'});
    } finally { writer.close(); }
  });
  it('refuses destructive legacy reward migration and preserves its rows', () => {
    const file = location(); canonical(file); const db = new Database(file);
    db.exec("DROP TABLE rewards; CREATE TABLE rewards(id TEXT PRIMARY KEY,amount_xlm REAL); INSERT INTO rewards VALUES('legacy-evidence',5)"); db.close();
    expect(run(file).status).not.toBe(0);
    const check = new Database(file,{readonly:true}); expect(check.prepare('SELECT * FROM rewards').get()).toEqual({id:'legacy-evidence',amount_xlm:5}); check.close();
  });
  it('rejects missing webhook idempotency constraints before writing', () => {
    const file = location(); canonical(file); const db = new Database(file);
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE name='webhook_events'").get() as {sql:string};
    db.exec('DROP TABLE webhook_events'); db.exec(row.sql.replace(/UNIQUE/gi, ''));
    db.close(); const before = readFileSync(file);
    const result = run(file); expect(result.status).not.toBe(0); expect(result.stderr).toContain('unique constraint');
    expect(readFileSync(file)).toEqual(before);
  });
  it('rejects a same-name partial index that lost its unique constraint', () => {
    const file = location(); canonical(file); const db = new Database(file);
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE name='idx_nft_apps_active'").get() as {sql:string};
    db.exec('DROP INDEX idx_nft_apps_active'); db.exec(row.sql.replace('UNIQUE ', ''));
    db.close(); const before = readFileSync(file);
    const result = run(file); expect(result.status).not.toBe(0); expect(result.stderr).toContain('unique constraint');
    expect(readFileSync(file)).toEqual(before);
  });
  it('refuses a prior authorization schema marker without repairing or writing the database',()=>{
    const file=location();canonical(file);const db=new Database(file);
    db.exec("DELETE FROM authorization_migrations; INSERT INTO authorization_migrations(id,review_reference) VALUES('rbac-only-v1','synthetic')");db.close();const before=readFileSync(file);
    const result=run(file);expect(result.status).not.toBe(0);expect(result.stderr).toContain('reviewed offline rbac-retire-legacy');
    expect(readFileSync(file)).toEqual(before);
  });
  it('rejects a changed canonical role-assignment trigger', () => {
    const file = location(); canonical(file); const db = new Database(file);
    db.exec("CREATE TRIGGER trg_auto_assign_user_role AFTER INSERT ON users BEGIN INSERT INTO user_roles(user_id,role_id) VALUES(NEW.id,'role_super_admin'); END");
    db.close(); const before = readFileSync(file);
    const result = run(file); expect(result.status).not.toBe(0); expect(result.stderr).toContain('retired authorization schema objects remain');
    expect(readFileSync(file)).toEqual(before);
  });
  it('rolls back earlier additive migrations if a later migration fails', () => {
    const file = location(); canonical(file); const db = new Database(file);
    db.exec("ALTER TABLE users DROP COLUMN auth_provider; CREATE TRIGGER fail_role_seed BEFORE INSERT ON roles BEGIN SELECT RAISE(ABORT,'synthetic failure'); END"); db.close();
    const result = run(file); expect(result.status).not.toBe(0); expect(result.stderr).toContain('synthetic failure');
    const check = new Database(file,{readonly:true}); expect(check.prepare('PRAGMA table_info(users)').all().map((row:any)=>row.name)).not.toContain('auth_provider'); check.close();
  });
});
