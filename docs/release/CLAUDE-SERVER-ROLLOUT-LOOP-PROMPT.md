# Claude rollout continuation: scoped /loop prompt

Use only after the [assessment prompt](CLAUDE-SERVER-ROLLOUT-ASSESSMENT-PROMPT.md) has created the authoritative plan, ledger and decision records. This file documents a command for the future Claude server session; it does not start a loop on this laptop.

Claude's /loop runs in an open session and inherits that session's permissions. Verify the installed version and actual scheduling behaviour first. Do not substitute an OS cron job or install a daemon. Record the resulting schedule/job ID and actual cadence; cancel it when its work is complete.

## Paste into Claude Code

```text
/loop 5m Continue only the authorized ASSESS_AND_PREPARE work described in docs/release/CLAUDE-SERVER-ROLLOUT-ASSESSMENT-PROMPT.md. Locate and read this session's release index, task ledger, specs, plan, blockers and evidence. Reconcile current git SHAs, the complete branch-to-PR inventory and its discovery limits, PR state and exact-head CI before choosing work. If another foreground or loop worker owns the next task or a test/build is running, do not duplicate it; monitor its recorded job. Otherwise claim one unblocked isolated preparation task and follow its design, TDD/debugging, review and verification gates, then checkpoint and release ownership. Use the required Superpowers skills, Ponytail, Caveman and Ripwire where available. Record missing capabilities truthfully. Never change live services/configuration/data, merge a protected branch, trigger a real provider transaction, change production approval records or repeat a completed release operation from this loop. Never infer approval from elapsed time. Preserve session authority and stop conditions. Update durable todo/evidence records; notify only on meaningful changed status, risk or a decision needing the owner. If preparation is complete, cancel this loop and present the concrete release gate once. If an indispensable external blocker remains and no independent task can progress, checkpoint, cancel this loop and report that blocker once.
```

This schedule is optional. The foreground design → test → review → evidence cycle remains the primary execution mechanism; completing one tick is not completion of a task.

## Required state and duplicate prevention

Before scheduling, the controller must record:

- The single release index, session ID, repository roots and candidate SHAs.
- Authorized phase and approved scope; production approval remains owner-controlled.
- Stable task IDs, dependencies and current status, with review and evidence references.
- The installed scheduler's job ID and exact command/prompt.
- One task-owner/lock mechanism that works across foreground, scheduler and subagents.
- Active process/CI run IDs and start times, avoiding accidental repeated work.
- Completion and cancellation conditions.

Do not assume a missing response means a process failed. Inspect the recorded process/run and durable state. Recover a stale task claim only after proving its owner is inactive and recording the decision. Keep completed task IDs and non-idempotent operation receipts across resumption.

## Notification and stop rules

Continue routine authorized preparation without asking “shall I continue?”. Do not repeat unchanged CI or blocker messages.

Stop and cancel the schedule when preparation is complete, the owner stops it, its authorization expires/changes, or no independent task can proceed without an external decision. Surface a concise actionable blocker with evidence and the smallest required decision. A pending release approval is a hold, not a failed check or permission to deploy.

Cancel or suspend this preparation loop before executing an approved production batch. Production execution must have one controller, pinned inputs, explicit receipts, verified recovery and no concurrent scheduler mutations.

## Capability reference

See [Claude's session scheduling documentation](https://code.claude.com/docs/en/scheduled-tasks). Version-specific interval rounding, session persistence, expiry and available scheduling tools must be discovered rather than assumed.
