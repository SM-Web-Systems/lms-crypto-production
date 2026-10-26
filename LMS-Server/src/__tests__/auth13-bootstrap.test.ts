import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const directories: string[] = [];
const checks: Database.Database[] = [];
const schema = readFileSync(path.resolve('database/schema.sql'), 'utf8');
const runtime = `import('./src/config/database.ts').then(({db,close}) => {
  console.log(JSON.stringify({users:db.prepare('SELECT count(*) n FROM users').get().n,
    provider:db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='ammawallet_user_id'),
    progress:db.prepare('PRAGMA table_info(lesson_completions)').all().some(c=>c.name==='progress_pct'),
    permissions:db.prepare('SELECT count(*) n FROM permissions').get().n,
    foreignKeys:db.pragma('foreign_keys',{simple:true})}));close();
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
afterEach(() => {
  for (const check of checks.splice(0)) if (check.open) check.close();
  for (const dir of directories.splice(0)) rmSync(dir, {recursive:true,force:true});
});

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
    const db = new Database(file); db.exec("INSERT INTO users(id,name,email,password_hash) VALUES('sentinel','Keep','keep@example.invalid','synthetic-hash')"); db.close();
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
    const db = new Database(file); db.exec("INSERT INTO users(id,name,email,password_hash,authorization_version) VALUES('sentinel','Keep','keep@example.invalid','synthetic-hash',3)");
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
      writer.exec("INSERT INTO users(id,name,email,password_hash,authorization_version) VALUES('wal-user','WAL','wal@example.invalid','synthetic-hash',2)");
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
  it('recreates a missing role-assignment trigger during migration', () => {
    const file = location(); canonical(file); const db = new Database(file);
    db.exec('DROP TRIGGER trg_auto_assign_user_role');
    db.close();
    const result = run(file); expect(result.status, result.stderr).toBe(0);
    // Verify the trigger was recreated
    const check = new Database(file, { readonly: true });
    expect(check.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='trg_auto_assign_user_role'").get()).toBeTruthy();
    check.close();
  });
  it('rejects a changed canonical role-assignment trigger', () => {
    const file = location(); canonical(file); const db = new Database(file);
    db.exec('DROP TRIGGER trg_auto_assign_user_role');
    db.exec("CREATE TRIGGER trg_auto_assign_user_role AFTER INSERT ON users BEGIN INSERT INTO user_roles(user_id,role_id) VALUES(NEW.id,'role_super_admin'); END");
    db.close(); const before = readFileSync(file);
    const result = run(file); expect(result.status).not.toBe(0); expect(result.stderr).toContain('role trigger');
    expect(readFileSync(file)).toEqual(before);
  });
  it('rolls back earlier additive migrations if a later migration fails', () => {
    const file = location(); canonical(file); const db = new Database(file);
    db.exec("ALTER TABLE users DROP COLUMN auth_provider; CREATE TRIGGER fail_role_seed BEFORE INSERT ON roles BEGIN SELECT RAISE(ABORT,'synthetic failure'); END"); db.close();
    const result = run(file); expect(result.status).not.toBe(0); expect(result.stderr).toContain('synthetic failure');
    const check = new Database(file,{readonly:true}); expect(check.prepare('PRAGMA table_info(users)').all().map((row:any)=>row.name)).not.toContain('auth_provider'); check.close();
  });

  it('upgrades legacy NOT NULL completion timestamps without changing completion evidence or dependents', () => {
    const file = location(); canonical(file); const db = new Database(file);
    const ddl = (db.prepare("SELECT sql FROM sqlite_master WHERE name='lesson_completions'").get() as {sql:string}).sql;
    db.pragma('foreign_keys=OFF');
    db.exec('DROP TABLE lesson_completions');
    db.exec(ddl.replace('completed_at TEXT', 'completed_at TEXT NOT NULL'));
    db.exec(`INSERT INTO users(id,name,email,password_hash) VALUES('learner','Synthetic','synthetic@example.invalid','hash');
      INSERT INTO courses(id,title,course_code) VALUES('course','Synthetic','SYNTHETIC');
      INSERT INTO lesson_completions(rowid,id,user_id,course_id,item_id,section_id,completed_at,progress_pct,last_position_s)
        VALUES(23,'completed','learner','course','first','section','2026-01-01 10:00:00',100,91);
      CREATE TABLE completion_evidence(completion_id TEXT REFERENCES lesson_completions(id));
      INSERT INTO completion_evidence VALUES('completed');
      CREATE INDEX completion_section_idx ON lesson_completions(section_id) WHERE completed_at IS NOT NULL;
      CREATE TABLE completion_audit(value TEXT);
      CREATE TRIGGER completion_update_audit AFTER UPDATE OF progress_pct ON lesson_completions
        BEGIN INSERT INTO completion_audit VALUES(NEW.id); END;
      CREATE VIEW completion_history AS SELECT id,completed_at FROM lesson_completions;`);
    db.close();
    const result = run(file); expect(result.status,result.stderr).toBe(0);
    const check = new Database(file);
    checks.push(check);
    expect((check.pragma('table_info(lesson_completions)') as any[]).find(c=>c.name==='completed_at').notnull).toBe(0);
    expect(check.prepare('SELECT rowid,id,completed_at,progress_pct,last_position_s FROM lesson_completions').get())
      .toEqual({rowid:23,id:'completed',completed_at:'2026-01-01 10:00:00',progress_pct:100,last_position_s:91});
    check.exec(`INSERT INTO lesson_completions(id,user_id,course_id,item_id,section_id,completed_at,progress_pct,last_position_s)
      VALUES('pending','learner','course','second','section',NULL,25,19)`);
    expect(check.prepare("SELECT completed_at FROM lesson_completions WHERE id='pending'").get()).toEqual({completed_at:null});
    expect(check.prepare("SELECT sql FROM sqlite_master WHERE name='completion_section_idx'").get()).toBeTruthy();
    check.exec("UPDATE lesson_completions SET progress_pct=100 WHERE id='completed'");
    expect(check.prepare('SELECT * FROM completion_audit').all()).toEqual([{value:'completed'}]);
    expect(check.prepare('SELECT COUNT(*) n FROM completion_history').get()).toEqual({n:2});
    expect(check.pragma('foreign_key_check')).toEqual([]); check.close();
    expect(run(file).status).toBe(0);
  });

  it('rejects migration-created FK orphans and rolls back earlier writes', () => {
    const file = location(); canonical(file); const db = new Database(file);
    db.exec(`ALTER TABLE users DROP COLUMN auth_provider;
      CREATE TABLE migration_fk_probe(id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id));
      CREATE TRIGGER migration_orphan BEFORE INSERT ON roles
        BEGIN INSERT OR REPLACE INTO migration_fk_probe VALUES('synthetic-orphan','missing-user'); END;`);
    db.close();
    const result = run(file); expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('foreign key');
    const check = new Database(file,{readonly:true});
    expect(check.prepare('SELECT * FROM migration_fk_probe').all()).toEqual([]);
    expect((check.pragma('table_info(users)') as any[]).map(c=>c.name)).not.toContain('auth_provider'); check.close();
  });

  it('retains exact legacy orphan evidence without exposing identifiers and enables runtime FK enforcement', () => {
    const file = location(); canonical(file); const db = new Database(file);
    db.pragma('foreign_keys=OFF');
    db.exec(`CREATE TABLE legacy_fk_probe(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id));
      INSERT INTO legacy_fk_probe VALUES('private-child-identity','private-missing-user');`);
    db.close();
    const result = run(file); expect(result.status,result.stderr).toBe(0);
    expect(result.stdout).toContain('"foreignKeys":1');
    expect(result.stderr).toContain('1 unchanged legacy foreign key violation');
    expect(result.stderr).not.toMatch(/private-child-identity|private-missing-user|legacy_fk_probe/);
    const check = new Database(file); checks.push(check);
    expect(check.prepare('SELECT * FROM legacy_fk_probe').all())
      .toEqual([{id:'private-child-identity',user_id:'private-missing-user'}]);
    expect(()=>check.exec("INSERT INTO legacy_fk_probe VALUES('new-child','another-missing-user')")).toThrow(/FOREIGN KEY/);
  });
});
