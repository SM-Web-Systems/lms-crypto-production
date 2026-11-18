// Read-only: map client IPs to LMS accounts for 5xx alerts.
// Run as: docker exec -i lms-api node - <ip>... < lms-5xx-user-lookup.js
// Opens the SQLite file read-only and prints one JSON object: { "<ip>": [ {user_id, name, role, seen, source} ] }.
// Never prints emails, tokens or session ids.
'use strict';
const Database = require('better-sqlite3');
const net = require('net');
const ips = process.argv.slice(2).filter((ip) => net.isIP(ip)).slice(0, 10);
const db = new Database(process.env.DATABASE_PATH || './data/student_ms.db', { readonly: true, fileMustExist: true });
const sessions = db.prepare(
  "SELECT s.user_id, u.name, u.role, max(s.last_active) AS seen FROM active_sessions s JOIN users u ON u.id = s.user_id " +
  "WHERE s.ip_address = ? GROUP BY s.user_id ORDER BY seen DESC LIMIT 3");
const logins = db.prepare(
  "SELECT h.user_id, u.name, u.role, max(h.login_at) AS seen FROM login_history h JOIN users u ON u.id = h.user_id " +
  "WHERE h.ip_address = ? GROUP BY h.user_id ORDER BY seen DESC LIMIT 3");
const out = {};
for (const ip of ips) {
  const found = new Map();
  for (const [source, stmt] of [['session', sessions], ['login', logins]]) {
    for (const row of stmt.all(ip)) {
      if (!found.has(row.user_id)) found.set(row.user_id, { user_id: row.user_id, name: String(row.name || '').slice(0, 80), role: row.role, seen: row.seen, source });
    }
  }
  out[ip] = [...found.values()].slice(0, 3);
}
db.close();
process.stdout.write(JSON.stringify(out));
