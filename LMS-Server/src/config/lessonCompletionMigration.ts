import type { Database } from 'better-sqlite3';

const table = 'lesson_completions';
const replacement = '_lesson_completions_nullable';
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
type Token = { value:string; start:number; end:number; depth:number; kind:'word'|'identifier'|'literal'|'symbol' };
function refuse(): never {
  throw new Error('Database startup refused: unsupported lesson completion schema. Preserve the database and perform a reviewed migration.');
}

/** Small SQLite lexer: punctuation in literals/comments must not alter DDL boundaries. */
function tokens(sql: string): Token[] {
  const result: Token[] = []; let i = 0; let depth = 0;
  while (i < sql.length) {
    if (/\s/.test(sql[i])) { i++; continue; }
    if (sql.startsWith('--', i)) { const end=sql.indexOf('\n',i+2); i=end<0?sql.length:end+1; continue; }
    if (sql.startsWith('/*', i)) { const end=sql.indexOf('*/',i+2); if(end<0) refuse(); i=end+2; continue; }
    const start=i; let value=''; let kind:Token['kind']='symbol';
    if (`'"\`[`.includes(sql[i])) {
      const opening=sql[i++]; const closing=opening==='['?']':opening; kind=opening==="'"?'literal':'identifier';
      let closed=false;
      while(i<sql.length) {
        if(sql[i]===closing) {
          if(opening!=='[' && sql[i+1]===closing) { value+=closing; i+=2; continue; }
          i++; closed=true; break;
        }
        value+=sql[i++];
      }
      if(!closed) refuse();
    } else if (/[A-Za-z_]/.test(sql[i])) {
      kind='word';
      while(i<sql.length && /[A-Za-z0-9_$]/.test(sql[i])) value+=sql[i++];
    } else value=sql[i++];
    if(value===')' && kind==='symbol') depth--;
    result.push({value:value.toLowerCase(),start,end:i,depth,kind});
    if(value==='(' && kind==='symbol') depth++;
    if(depth<0) refuse();
  }
  if(depth!==0) refuse(); return result;
}

function nullableReplacementSql(sql: string): string {
  const lex=tokens(sql); const tableKeyword=lex.findIndex(token=>token.kind==='word' && token.value==='table' && token.depth===0);
  // Unsupported physical layouts must not be inferred from harmless literals,
  // comments or quoted names. AUTOINCREMENT also owns allocation history.
  if(lex.some(token=>token.kind==='word' && token.depth===1 && token.value==='autoincrement') ||
    lex.some((token,i)=>token.kind==='word' && token.depth===0 && token.value==='without' &&
      lex[i+1]?.kind==='word' && lex[i+1].depth===0 && lex[i+1].value==='rowid')) refuse();
  let name=tableKeyword+1;
  if(lex[name]?.value==='if') name+=3;
  if(tableKeyword<0 || lex[name]?.value!==table || lex[name+1]?.value!=='(') refuse();
  // A bespoke CHECK on this column could still forbid NULL; do not silently
  // accept or remove it. Other CHECKs, extra columns and constraints survive.
  for(let i=0;i<lex.length;i++) if(lex[i].kind==='word' && lex[i].value==='check' && lex[i+1]?.value==='(' && lex[i+1].kind==='symbol') {
    const level=lex[i+1].depth;
    for(let j=i+2;j<lex.length && lex[j].depth>level;j++) {
      if(['word','identifier'].includes(lex[j].kind) && lex[j].value==='completed_at') refuse();
    }
  }
  const column=lex.findIndex((token,i)=>token.depth===1 && ['word','identifier'].includes(token.kind) && token.value==='completed_at'
    && lex[i-1]?.kind==='symbol' && (lex[i-1]?.value==='(' || lex[i-1]?.value===','));
  if(column<0) refuse();
  let end=column+1;
  while(end<lex.length && !(lex[end].depth===1 && lex[end].kind==='symbol' && lex[end].value===',') && lex[end].depth!==0) end++;
  const nonNull=[];
  for(let i=column+1;i<end-1;i++) if(lex[i].depth===1 && lex[i].kind==='word' && lex[i].value==='not' && lex[i+1].kind==='word' && lex[i+1].value==='null') nonNull.push(i);
  if(nonNull.length!==1) refuse();
  let first=nonNull[0]; let last=first+1;
  if(lex[first-2]?.kind==='word' && lex[first-2].value==='constraint') first-=2;
  if(lex[last+1]?.kind==='word' && lex[last+1].value==='on' && lex[last+2]?.kind==='word' && lex[last+2].value==='conflict') last+=3;
  if(last>=end) refuse();
  return sql.slice(0,lex[name].start)+quote(replacement)+sql.slice(lex[name].end,lex[first].start)+sql.slice(lex[last].end);
}

/** Called inside the startup transaction with FK enforcement temporarily OFF.
 * Uses SQLite's create-copy-drop-rename procedure; never renames the old table.
 */
export function ensureLessonCompletionSchema(db: Database): void {
  if(!db.inTransaction || db.pragma('foreign_keys',{simple:true})!==0) refuse();
  db.exec(`CREATE TABLE IF NOT EXISTS lesson_completions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL, section_id TEXT NOT NULL,
    completed_at TEXT DEFAULT (datetime('now')),
    marked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    progress_pct INTEGER, last_position_s INTEGER, UNIQUE(user_id,course_id,item_id)
  );
  CREATE INDEX IF NOT EXISTS idx_lesson_completions_user_course ON lesson_completions(user_id,course_id);`);
  let columns=db.pragma(`table_info(${quote(table)})`) as Array<{name:string;notnull:number}>;
  for(const name of ['progress_pct','last_position_s']) if(!columns.some(c=>c.name===name)) {
    db.exec(`ALTER TABLE ${quote(table)} ADD COLUMN ${quote(name)} INTEGER`);
  }
  columns=db.pragma(`table_info(${quote(table)})`) as typeof columns;
  if(!columns.find(c=>c.name==='completed_at')?.notnull) return;
  if(db.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(replacement)) refuse();
  const ddl=(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as {sql:string}).sql;
  const create=nullableReplacementSql(ddl);
  const allColumns=db.pragma(`table_xinfo(${quote(table)})`) as Array<{
    cid:number;name:string;type:string;notnull:number;dflt_value:string|null;pk:number;hidden:number;
  }>;
  if(allColumns.some(c=>['rowid','_rowid_','oid'].includes(c.name.toLowerCase()))) refuse();
  const foreignKeys=db.pragma(`foreign_key_list(${quote(table)})`);
  const copied=allColumns.filter(c=>!c.hidden).map(c=>quote(c.name)).join(',');
  const dependencies=db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL ORDER BY type,name")
    .all(table) as Array<{sql:string}>;
  const legacy=db.pragma('legacy_alter_table',{simple:true}) as number;
  try {
    db.pragma('legacy_alter_table=ON');
    db.exec(create);
    const expectedColumns=allColumns.map(column=>column.name==='completed_at'?{...column,notnull:0}:column);
    if(JSON.stringify(db.pragma(`table_xinfo(${quote(replacement)})`))!==JSON.stringify(expectedColumns) ||
      JSON.stringify(db.pragma(`foreign_key_list(${quote(replacement)})`))!==JSON.stringify(foreignKeys)) refuse();
    db.exec(`INSERT INTO ${quote(replacement)}(rowid,${copied}) SELECT rowid,${copied} FROM ${quote(table)}`);
    db.exec(`DROP TABLE ${quote(table)}; ALTER TABLE ${quote(replacement)} RENAME TO ${quote(table)}`);
    for(const dependency of dependencies) db.exec(dependency.sql);
  } finally { db.pragma(`legacy_alter_table=${legacy?1:0}`); }
}
