# AUTH-14 rowid snapshot safety

An explicitly reviewed FK baseline fingerprints SQLite violation tuples, not complete orphan contents. SQLite's `rowid` name can be shadowed by a declared column: a lookup can return the wrong existing row even though it succeeds. JavaScript numbers can also round distinct 64-bit SQLite integers to the same value.

For source-schema migration, the write transaction refuses a null FK rowid and any violating table with a declared `rowid` column, case-insensitively, including hidden/generated columns. This deliberately also refuses an `INTEGER PRIMARY KEY` named `rowid`; no claim is made that every refused layout is unsafe. A missing physical-row lookup refuses. Snapshots use raw SQLite values, exact 64-bit integers and BLOB bytes with storage-type tags.

Receipt triggers can modify unrelated rows even when orphan snapshots and FK evidence match. The migration therefore refuses any `system_config` trigger inside the immediate write transaction before writing receipts. Other connections cannot add a trigger after that check and before commit. Unsupported layouts or triggers require investigation, not deletion of historical data or disabling the check.

The regression suite uses synthetic SQLite only. Before deployment, independently review the change and inspect a fresh protected production snapshot for FK-table layouts and `system_config` triggers. Rehearse against exact candidate and rollback images; verify full protected records, backups, a reviewed FK baseline and recovery. This change does not authorize live migration, deployment or data repair.
