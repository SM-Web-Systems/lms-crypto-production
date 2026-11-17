#!/usr/bin/env node
// Dependency audit gate with narrow, expiring exceptions.
//
// Same as `npm audit --audit-level=<level>` (fails on any advisory at or above the level), except that an advisory listed with
// --allow GHSA-xxxx-xxxx-xxxx=YYYY-MM-DD is tolerated until that date (inclusive). After the date it fails again. Nothing else
// changes: any other advisory still fails, and the exception list is printed on every run so it stays visible.
//
// Usage (from the package folder): node ../scripts/audit-gate.mjs --level low [--omit-dev] [--allow GHSA-...=2026-12-01 ...]
import { spawnSync } from 'node:child_process';

const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const args = process.argv.slice(2);
let level = 'low', omitDev = false;
const allow = new Map();
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--level') level = args[++i];
  else if (args[i] === '--omit-dev') omitDev = true;
  else if (args[i] === '--allow') {
    const [id, until] = String(args[++i]).split('=');
    if (!/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(id ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(until ?? '')) {
      console.error(`Bad --allow value "${args[i]}": expected GHSA-xxxx-xxxx-xxxx=YYYY-MM-DD`); process.exit(2);
    }
    allow.set(id, until);
  } else { console.error(`Unknown argument ${args[i]}`); process.exit(2); }
}
if (!(level in RANK)) { console.error(`Unknown level ${level}`); process.exit(2); }

const run = spawnSync('npm', ['audit', '--json', ...(omitDev ? ['--omit=dev'] : [])], { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
let report;
try { report = JSON.parse(run.stdout); } catch { console.error('npm audit did not return JSON:', (run.stderr || run.stdout || '').slice(0, 500)); process.exit(2); }
if (report.error) { console.error('npm audit failed:', JSON.stringify(report.error)); process.exit(2); }

const today = new Date().toISOString().slice(0, 10);
const advisories = new Map(); // id -> { severity, title, packages:Set }
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of v.via ?? []) {
    if (typeof via !== 'object') continue; // a dependency on another vulnerable package, covered by its own advisory
    const id = String(via.url ?? '').split('/').pop() || `source-${via.source}`;
    const entry = advisories.get(id) ?? { severity: via.severity, title: via.title, packages: new Set() };
    entry.packages.add(name);
    advisories.set(id, entry);
  }
}

let failed = false;
for (const [id, a] of advisories) {
  if ((RANK[a.severity] ?? 4) < RANK[level]) continue;
  const until = allow.get(id);
  if (until && today <= until) {
    console.log(`ALLOWED until ${until}: ${id} (${a.severity}) ${a.title} [${[...a.packages].join(', ')}]`);
  } else {
    failed = true;
    console.error(`FAIL: ${id} (${a.severity}) ${a.title} [${[...a.packages].join(', ')}]${until ? ` (exception expired ${until})` : ''}`);
  }
}
for (const [id, until] of allow) if (today > until) console.error(`Exception for ${id} expired on ${until}; remove it from the workflow.`);
if (failed) { console.error('Audit gate failed.'); process.exit(1); }
console.log(`Audit gate passed at level ${level}${omitDev ? ' (production dependencies only)' : ''}: ${advisories.size} advisor${advisories.size === 1 ? 'y' : 'ies'} seen, ${[...advisories.keys()].filter(id => allow.has(id)).length} allowed.`);
