import { afterEach, describe, expect, it } from 'vitest';
import Database, { type Database as SqliteDatabase } from 'better-sqlite3';
import { ensureLessonCompletionSchema } from '../config/lessonCompletionMigration.js';

const handles:SqliteDatabase[]=[];
function fixture(definition="TEXT NOT NULL DEFAULT (datetime('now'))",extra=''):SqliteDatabase {
  const db=new Database(':memory:'); handles.push(db);
  db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE courses(id TEXT PRIMARY KEY);
    INSERT INTO users VALUES('learner'); INSERT INTO courses VALUES('course');
    CREATE TABLE lesson_completions(
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,section_id TEXT NOT NULL,"completed_at" ${definition},
      marked_by TEXT REFERENCES users(id) ON DELETE SET NULL${extra},UNIQUE(user_id,course_id,item_id));
    INSERT INTO lesson_completions(rowid,id,user_id,course_id,item_id,section_id,completed_at)
      VALUES(41,'completed','learner','course','old-item','section','2026-01-01 10:00:00');`);
  return db;
}
function migrate(db:SqliteDatabase):void {
  db.pragma('foreign_keys=OFF');
  try { db.transaction(()=>ensureLessonCompletionSchema(db)).immediate(); }
  finally { db.pragma('foreign_keys=ON'); }
}
function pending(db:SqliteDatabase):void {
  db.exec(`INSERT INTO lesson_completions(id,user_id,course_id,item_id,section_id,completed_at,progress_pct,last_position_s)
    VALUES('pending','learner','course','new-item','section',NULL,25,120)`);
}
afterEach(()=>{for(const db of handles.splice(0)) db.close();});

describe('lesson completion reconstruction preserves metadata and evidence',()=>{
  it('retains rowids, extra values/checks/defaults, custom indexes/triggers/views and inbound FKs',()=>{
    const db=fixture(undefined,",note TEXT NOT NULL DEFAULT ')' CHECK(length(note)>0)");
    db.exec(`CREATE INDEX custom_completion_index ON lesson_completions(section_id) WHERE completed_at IS NOT NULL;
      CREATE TABLE completion_child(completion_id TEXT REFERENCES lesson_completions(id)); INSERT INTO completion_child VALUES('completed');
      CREATE TABLE completion_audit(value TEXT);
      CREATE TRIGGER custom_completion_trigger AFTER UPDATE ON lesson_completions BEGIN INSERT INTO completion_audit VALUES(NEW.id); END;
      CREATE VIEW completion_view AS SELECT id FROM lesson_completions;`);
    const dependencies=()=>db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name IN ('custom_completion_index','custom_completion_trigger','completion_view','completion_child') ORDER BY name").all();
    const before=dependencies(); migrate(db); pending(db);
    expect(dependencies()).toEqual(before);
    expect(db.prepare("SELECT rowid,completed_at,note FROM lesson_completions WHERE id='completed'").get())
      .toEqual({rowid:41,completed_at:'2026-01-01 10:00:00',note:')'});
    expect(db.prepare("SELECT completed_at,progress_pct,last_position_s FROM lesson_completions WHERE id='pending'").get())
      .toEqual({completed_at:null,progress_pct:25,last_position_s:120});
    db.exec("UPDATE lesson_completions SET progress_pct=100 WHERE id='completed'");
    expect(db.prepare('SELECT * FROM completion_audit').all()).toEqual([{value:'completed'}]);
    expect(db.prepare('SELECT COUNT(*) n FROM completion_view').get()).toEqual({n:2});
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(()=>db.exec("UPDATE lesson_completions SET note='' WHERE id='completed'")).toThrow(/CHECK/);
    expect(()=>db.exec("UPDATE lesson_completions SET user_id='missing' WHERE id='completed'")).toThrow(/FOREIGN KEY/);
    expect(()=>db.exec("UPDATE lesson_completions SET item_id='old-item' WHERE id='pending'")).toThrow(/UNIQUE/);
  });
  it.each(['TEXT CONSTRAINT retained_not_null NOT NULL ON CONFLICT ABORT DEFAULT CURRENT_TIMESTAMP',
    "TEXT /* keep comments, ( ) */ NOT /* constraint */ NULL DEFAULT (datetime('now'))"])
  ('handles legacy named/commented NOT NULL constraints: %s',definition=>{
    const db=fixture(definition); migrate(db); pending(db);
    expect(db.prepare("SELECT completed_at FROM lesson_completions WHERE id='pending'").get()).toEqual({completed_at:null});
  });
  it('preserves existing partial progress/position values',()=>{
    const db=fixture(undefined,',progress_pct INTEGER,last_position_s INTEGER');
    db.exec('UPDATE lesson_completions SET progress_pct=83,last_position_s=19'); migrate(db);
    expect(db.prepare('SELECT completed_at,progress_pct,last_position_s FROM lesson_completions').get())
      .toEqual({completed_at:'2026-01-01 10:00:00',progress_pct:83,last_position_s:19});
  });
  it('refuses bespoke completion CHECKs and rolls back earlier additive columns',()=>{
    const db=fixture("TEXT NOT NULL CHECK(completed_at IS NOT NULL) DEFAULT (datetime('now'))");
    const before=db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all();
    expect(()=>migrate(db)).toThrow(/unsupported lesson completion schema/);
    expect(db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all()).toEqual(before);
    expect(db.prepare('SELECT id,completed_at FROM lesson_completions').get())
      .toEqual({id:'completed',completed_at:'2026-01-01 10:00:00'});
  });
  it('preserves a stale reconstruction object and refuses without deleting evidence',()=>{
    const db=fixture(); db.exec("CREATE TABLE _lesson_completions_nullable(evidence TEXT); INSERT INTO _lesson_completions_nullable VALUES('retain')");
    expect(()=>migrate(db)).toThrow(/unsupported lesson completion schema/);
    expect(db.prepare('SELECT * FROM _lesson_completions_nullable').get()).toEqual({evidence:'retain'});
    expect((db.pragma('table_info(lesson_completions)') as any[]).find(c=>c.name==='completed_at').notnull).toBe(1);
  });
  it('refuses a caller without a transaction before changing any schema',()=>{
    const db=fixture(); const before=db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all();
    expect(()=>ensureLessonCompletionSchema(db)).toThrow(/unsupported lesson completion schema/);
    expect(db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all()).toEqual(before);
  });

  it('refuses AUTOINCREMENT reconstruction without lowering allocation history',()=>{
    const db=new Database(':memory:'); handles.push(db); db.pragma('foreign_keys=OFF');
    db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE courses(id TEXT PRIMARY KEY);
      INSERT INTO users VALUES('learner'); INSERT INTO courses VALUES('course');
      CREATE TABLE lesson_completions(id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id),course_id TEXT NOT NULL REFERENCES courses(id),
        item_id TEXT NOT NULL,section_id TEXT NOT NULL,completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        marked_by TEXT REFERENCES users(id),UNIQUE(user_id,course_id,item_id));
      INSERT INTO lesson_completions(id,user_id,course_id,item_id,section_id) VALUES(100,'learner','course','deleted','section');
      DELETE FROM lesson_completions;
      INSERT INTO lesson_completions(id,user_id,course_id,item_id,section_id) VALUES(1,'learner','course','keep','section');`);
    const schemaBefore=db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all();
    const rowsBefore=db.prepare('SELECT * FROM lesson_completions').all();
    expect(()=>migrate(db)).toThrow(/unsupported lesson completion schema/);
    expect(db.prepare("SELECT seq FROM sqlite_sequence WHERE name='lesson_completions'").get()).toEqual({seq:100});
    expect(db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all()).toEqual(schemaBefore);
    expect(db.prepare('SELECT * FROM lesson_completions').all()).toEqual(rowsBefore);
  });

  it('refuses an actual WITHOUT ROWID reconstruction without changing the table',()=>{
    const db=fixture();
    const ddl=(db.prepare("SELECT sql FROM sqlite_master WHERE name='lesson_completions'").get() as {sql:string}).sql;
    db.exec('DROP TABLE lesson_completions'); db.exec(ddl+' WITHOUT ROWID');
    db.exec("INSERT INTO lesson_completions(id,user_id,course_id,item_id,section_id) VALUES('keep','learner','course','item','section')");
    const before=db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all();
    expect(()=>migrate(db)).toThrow(/unsupported lesson completion schema/);
    expect(db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all()).toEqual(before);
    expect(db.prepare('SELECT id FROM lesson_completions').all()).toEqual([{id:'keep'}]);
  });

  it('preserves harmless layout keywords inside default strings and comments',()=>{
    const db=fixture(undefined,",note TEXT DEFAULT 'WITHOUT ROWID AUTOINCREMENT' /* WITHOUT ROWID AUTOINCREMENT */");
    migrate(db); pending(db);
    expect(db.prepare('SELECT note FROM lesson_completions').all())
      .toEqual([{note:'WITHOUT ROWID AUTOINCREMENT'},{note:'WITHOUT ROWID AUTOINCREMENT'}]);
  });

  it('does not treat quoted type identifiers as constraint keywords',()=>{
    const db=fixture("\"constraint\" \"label\" NOT NULL DEFAULT (datetime('now'))");
    const before=(db.pragma('table_info(lesson_completions)') as any[]).find(c=>c.name==='completed_at').type;
    migrate(db); pending(db);
    expect((db.pragma('table_info(lesson_completions)') as any[]).find(c=>c.name==='completed_at').type).toBe(before);
  });

  it('rejects unexpected replacement metadata before copy/drop and rolls back',()=>{
    const db=fixture(undefined,",note TEXT DEFAULT 'retain'");
    const before=db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all();
    const rows=db.prepare('SELECT * FROM lesson_completions').all();
    const exec=db.exec.bind(db);
    db.exec=(sql:string)=>exec(sql.includes('CREATE TABLE "_lesson_completions_nullable"')?sql.replace('note TEXT','note INTEGER'):sql);
    try { expect(()=>migrate(db)).toThrow(/unsupported lesson completion schema/); }
    finally { db.exec=exec; }
    expect(db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all()).toEqual(before);
    expect(db.prepare('SELECT * FROM lesson_completions').all()).toEqual(rows);
  });
});
