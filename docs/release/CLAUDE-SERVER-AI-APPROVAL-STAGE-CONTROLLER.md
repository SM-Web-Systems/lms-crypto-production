# Claude stage controller — AI approvals and bounded work

The owner has delegated approvals to AI and merge execution to Claude. Use this document when continuing the staged rollout under that delegation. It supersedes earlier requirements for human sign-off; it does not remove technical evidence gates or authorize this laptop session to merge/deploy anything.

A stage boundary is a work/credit checkpoint, not a request for manual approval. Do not ask the owner to approve routine plans, reviews, merges or releases that AI can decide from the agreed scope and verified evidence. Claude performs server/GitHub actions; an independent AI reviewer assesses readiness, and the controller records the resulting decision.

## Continuing S1 — paste into Claude on the server

```text
The owner delegates all rollout approvals to AI. Claude handles merges and execution. Replace earlier human/operator approval requirements with recorded AI review decisions. Preserve every technical prerequisite, test, compatibility and recovery gate.

Complete the remaining S1 work only. Do not start S2 in this run.

Read the staged index/tasks/evidence, PR #103 planning documents, the S1 return record and applicable handovers. The reported plan head is 7167df3; verify its full current SHA and any later changes. Record this delegation in the authoritative decision/approval ledger so older human-sign-off text cannot stall execution.

AI approval process:
- The controller assembles evidence.
- An independent AI reviewer checks requirements, diff, dependencies, current CI and risks.
- The controller records APPROVED, CHANGES_REQUIRED or BLOCKED with exact SHAs and evidence.
- Claude executes only approved in-scope actions.
- Do not self-approve by ignoring a review finding or equate green CI with zero risk.

Revalidate the S1 merge packet against live GitHub state:
1. LMS PR #86, reported head 4cfe93aa.
2. LMS PR #90, reported head e35a3fb8.

Treat those abbreviated heads and earlier “None” risk labels as historical claims, not immutable approval or proof of no risk. Resolve full head/base SHAs, reviews, checks, dependency/diff scope and actual mergeability. If already merged, record the resulting merge SHA and do not repeat the operation.

If current evidence supports readiness, obtain AI approval and merge #86 first. Verify the recorded result. Reassess #90 against resulting main, obtain its AI approval, then merge it. Respect branch protection and required checks; do not bypass them or force-push shared branches. If an input materially changed, investigate/review the actual delta rather than reusing stale approval. Never merge unrelated PRs in this work unit.

Resolve D7 conservatively through an AI retention decision: assess and retain the unmerged/development/recovery branches, record their dispositions, and perform no branch deletion in S1. Do not claim deletion occurred. Follow the plan's evidence/status rules and update any superseded requirement truthfully.

D1 (snapshot) and D4 (device/client evidence) remain evidence prerequisites for their dependent stages, not reasons to pause unrelated S1 work. D5 approval is AI-owned, but later deployment still needs its exact candidate, backup, maintenance constraints and recovery proof. Do not invent a snapshot, device result, maintenance window, credentials or acceptable data-loss policy. If an indispensable external fact is unavailable, record the precise evidence gap and continue independent work.

No database migration, deployment, live configuration change, real payment/funding/mint or branch disposal is in this S1 work unit.

Credit and recovery discipline:
- One bounded work unit at a time; this unit is the remaining S1 packet.
- Use the existing required Superpowers skills, Ponytail, Caveman and Ripwire. Reuse the approved specs and exact-head evidence where still valid.
- Use one independent review pass for the bounded merge packet and re-review actual changes/findings; do not fan out agents or rerun unchanged full suites without a reason.
- Run required fresh checks when the candidate/base changes; never trade verification for token savings.
- Checkpoint before and after each merge and before a long build/test. Record branch/head/base, approval, CI run IDs, command results, merge receipts and next action.
- If an operation's response is lost, inspect GitHub/process state before retrying.
- Use an actual remaining-budget signal if available; do not invent a credit balance or promise uninterrupted work.
- If budget/context becomes tight, stop launching new work, preserve a clean resume point and report CHECKPOINTED. Existing durable state must survive an unexpected interruption.
- Cancel any broader /loop; no schedule may move into S2 or keep spending after S1 ends.

Update STAGED-ROLLOUT-INDEX.md, STAGED-ROLLOUT-TASKS.md and STAGED-ROLLOUT-EVIDENCE.md. Commit/push the stage record to its review branch without silently merging the planning PR.

Finish with a compact handoff:
- Status: STAGE_COMPLETE, STAGE_BLOCKED or CHECKPOINTED.
- Actual #86/#90 outcomes and exact merge/head SHAs.
- AI approval and verification evidence.
- Retained branch disposition and remaining evidence gaps.
- Exact resume action.
- Recommended next bounded unit: S2/W01 only.

STOP after S1. No further permission question is needed. When the owner later says “continue”, resume the next recorded unit under the same AI-approval delegation rather than asking for approval again.
```

## Later stages: one unit per run

For S2, split W01, W02, W03 and W04 into separately tracked units using the approved specs and their real dependencies. Start with W01; do not begin all four in one run. If a unit is still too large, split it at independently verifiable boundaries and preserve the spec's complete exit criteria. An unfinished security fix is not merge-ready.

For each later unit, explicitly record the selected unit and scope, prerequisite SHAs/evidence, allowed operations, AI review/approval gate, covering tests, recovery criteria and stop point. Use the [staged execution prompt](CLAUDE-SERVER-STAGED-EXECUTION-PROMPTS.md) with this AI-approval delegation overriding its former human-sign-off wording.

Continue authorized tasks inside the selected unit autonomously. Stop at its boundary with a complete or checkpointed handoff. “Continue” means resume from that durable handoff, not restart the audit, repeat completed tasks or approve unverified operations.

Before starting a production mutation, its unit must have the exact AI-approved release manifest, real required evidence and a verified recovery/abort procedure. Do not launch it near a known budget limit without enough capacity and a reliable operation receipt/recovery mechanism. If capacity cannot be established, prepare and checkpoint first; never abandon writers stopped or a partially changed service without recording and applying the verified recovery procedure.

AI approval cannot manufacture hardware, credentials, a consistent backup, an external maintenance constraint or an unknown business policy. These are evidence/context gaps, not approval requests. Ask for only an indispensable missing fact or access when no safe independent work remains.

## Scope of this document

This is a prompt and governance handover. It starts no loop or process and performs no approvals, merges, migrations or deployments itself. Current PR readiness must be established in Claude's server session.
