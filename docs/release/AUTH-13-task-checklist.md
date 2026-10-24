# AUTH-13 task checklist

Owner: implementation agent, with independent review agents for read-only review and server owner for operational acceptance. States: TODO / IN PROGRESS / BLOCKED / PASS / FAIL / DEFERRED. PASS requires executed evidence and does not imply deployment.

| ID | Task | Depends on | Owner | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| A13-00 | Assessment prompt, baseline and skill/tool inventory | none | implementation agent | PASS | assessment prompt; main fetch; available skill inventory |
| A13-01 | Reconcile AUTH history, issues, PRs and existing fixes | A13-00 | implementation agent | PASS | assessment findings; #67/#68 and 14 open PRs reconciled |
| A13-02 | Failing real-process bootstrap/data-preservation regressions | A13-01 | implementation agent | PASS | 11 original bootstrap failures reproduced; partial-index regression red; 19 focused tests pass |
| A13-03 | Canonical bootstrap and compiled startup | A13-02 | implementation agent | PASS | API build and source-free compiled init/restart pass; complete schema/key contract |
| A13-04 | Database independent review and draft PR | A13-03 | independent reviewer / implementation agent | PASS | draft PR #78 a594056; final independent database review clean |
| A13-05 | Failing authorization boundary regressions | A13-04 | implementation agent | PASS | 11 authorization failures reproduced in real route/middleware tests |
| A13-06 | Explicit admin policy and role-trigger audit | A13-05 | implementation agent | PASS | 23 new policy checks; 95 sponsor/payment, 107 revocation/Wallet/context and 57 tenant/course/submission regressions pass |
| A13-07 | Authorization independent review and draft PR | A13-06 | independent reviewer / implementation agent | PASS | clean final independent review; 42 integrated bootstrap/policy checks and compiled smoke pass; draft PR preparation |
| A13-08 | Payment CI and monitoring evidence regressions | A13-07 | implementation agent | PASS | eight webhook integrity failures and actual Bash defects reproduced; fixture coverage added |
| A13-09 | Test-only webhook CI and evidence-based monitoring verifier | A13-08 | implementation agent | PASS | synthetic HMAC/transport guard; 46 payment, 73 E2E, 25 monitoring/exporter checks; final independent review clean |
| A13-10 | Isolated backup/restore drill and retention assessment | A13-09 | implementation agent | PASS | synthetic WAL restore drill passed; real retention/restore remains owner evidence |
| A13-11 | Full regression, review, diagrams/specification and final readiness | A13-10 | implementation agent / independent reviewer | PASS | draft #80 e48f5e6 + 8f3f07a; API1790/web515/mobile153/E2E73/offline25/smoke12/deploy-syntax10 pass; all four implementation CI jobs passed run39948571919 |
| A13-12 | Production configuration, observation, real backup/email and installed-device evidence | review/merge/deployment authorization | server owner | DEFERRED | no production actions authorized |
| A13-13 | Verify/enforce required main-branch merge checks | repository administrator rights | maintainer | DEFERRED | applicable rules returned []; protection endpoint 404; enforcement not independently verified |
| A13-14 | Infrastructure/dependency/mobile roadmap work | separate releases | maintainers | DEFERRED | AUTH-14 and existing dependency/mobile PRs |

Each implementation area gets its own draft PR. The database branch starts at PR #77; subsequent branches may be stacked to validate the integrated result. No merge or deployment is part of this task.

Database validation: initial full suite returned 1,744 passing tests, one obsolete source-text assertion failure and one removed-file collection failure during the run. Both obsolete tests were replaced/removed. Final stable-snapshot API regression passed 1,790 tests across 177 files. Focused final database suite: 19/19; API build and compiled smoke passed.
