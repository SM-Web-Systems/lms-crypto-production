# AUTH-13 assessment prompt

Assess application integrity, database safety, authorization, payment CI and monitoring before changing implementation. Work locally only. Never access SSH, production containers, databases, volumes, cron, secrets, live Wallet/payment APIs or mainnet. Never close AUTH-12 from elapsed time or repository documentation alone.

Baseline: main verified by fetch on 2026-10-23 is `bef865366f36293ea152a9f89524ce1bb7337603`. The working baseline is `bbf17a05c82ccdc2f0f0ed31f18d437790a7cc41` from unmerged LMS PR #77; preserve its authorization/session/Wallet fixes. Companion Wallet PR #2 remains a separate release dependency. Create reviewable AUTH-13 branches stacked on #77; record their bases explicitly.

Read AUTH-01 through AUTH-12 release/specification history, incidents/runbooks, current code/tests, GitHub issues #67/#68 and all open PR metadata. Recheck each acceptance criterion against implementation and executed tests. Classify findings as CONFIRMED OPEN, RESOLVED, PARTIALLY RESOLVED, ACCEPTED RISK, STALE DOCUMENTATION or NEEDS VERIFICATION. Record source, original severity, affected components, data/security impact, existing fixes/tests, action, dependencies, acceptance criteria and release allocation. Distinguish branch fixes from merged/deployed/production-verified behavior.

Priority order:
1. Canonical, non-destructive SQLite bootstrap; no demo credentials; explicit empty-database initialization; missing/corrupt/partial database rejection; WAL/SHM and existing-data preservation; compiled-runtime proof before removing startup tsx.
2. One explicit administrator identity/scope policy; remove unrelated permission discriminators and unsafe cached-context assumptions; audit role auto-assignment. Test administrator tiers, sponsors, owners, shared cohorts, billing/receipts/badges/payment mutations and database failures.
3. Test-only Paystack webhook HMAC, positive/negative/idempotency coverage, CI gate evidence, monitoring verdicts/coverage/exit codes/SHA/dead-man semantics, and backup/restore evidence.
4. Independent review, full regression and final specification, Mermaid diagrams, checklist, release-readiness and rollback report. Split unrelated implementation areas into separate draft PRs; never merge or deploy.

Use bounded iterations: failing behavioral test → minimum fix → focused tests → regression → independent review → recorded evidence; at most three repair attempts per defect before reassessing the design. Tests must execute actual code, not merely match source strings. Use disposable SQLite fixtures and isolated local processes/containers only. Missing Docker/production evidence must be reported as unverified, never PASS.

Discover available requested skills first. The available catalog and local skill directories were checked: Superpowers, Ponytail, Caveman, Ripwire and find-skills are not installed. Use ordinary test-driven work and explicit planning/review records; do not invent skill commands or make these optional packages a blocker. The original brief explicitly requests subagent-driven development and independent review; use read-only review agents for that review, without delegating production actions.

Defer Docker capability/read-only frontend/secrets-delivery changes and broad dependency upgrades to AUTH-14 or their existing dependency PRs. Keep physical-device/live-email acceptance separately visible. Do not close issues or message maintainers automatically; prepare evidence for review.
