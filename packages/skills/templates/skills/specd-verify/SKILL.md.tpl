{{{frontmatter}}}

# specd-verify — check implementation against specs

## What this does

Runs through verification scenarios for each spec in the change. If all pass,
transitions to `done`. If any fail, loops back to implementing.

## Steps

### 0. Bootstrap and load shared context

You MUST read @{{sharedFolder}}/shared.md before doing anything, if you can't find it using Glob or Read tools, use Bash tools like `ls` and `cat` to find and read it. If you can't find it at all, tell the user: "Shared context not found. Please ensure shared.md is available." and stop.

### 1. Load change state

```bash
specd changes status <name> --format text
```

Identify any high-visibility blockers from the **blockers:** section (e.g. `ARTIFACT_DRIFT`,
`REVIEW_REQUIRED`) and inform the user.

`OVERLAP_CONFLICT` is archive-only. Invalidation overlap is `review.reason:
spec-overlap-conflict` → `/specd-design`, not `--allow-overlap`.

If the only (or remaining) blocker is `IMPLEMENTATION_STATE` / open tracked files,
**stay in this skill** — drain tracking (see `shared.md` — "Implementation tracking")
then continue. Do **not** redirect to `/specd-implement` solely for open files.

For other blockers, follow the **next action:** command recommendation.

Extract the `path:` field from the "lifecycle:" section.

Trust the reconciled status. Do not calculate fingerprints or roll the lifecycle
back yourself. See `shared.md` — "Canonical validity reconciliation".

If required spec consent is stale or revoked, status returns the change to
`designing`. Stop verification and route to `/specd-design` through
`designing` → `ready` → human `approve spec`.

If the status output shows `review: required: yes`:

- `workflow: redesign` with unresolved non-task drift routes to `/specd-design`.
  **Stop.**
- `workflow: preserve` without mandatory spec recovery stays in the current
  phase. Review drifted artifacts in place when that review is in this skill's
  scope, then `specd changes validate`. Do not force `/specd-design` for every
  drift. Structural validation is not semantic review or verification renewal.
- `artifacts: none` waives reopening, not freshness.

Verification evidence is state-independent. Record it from any active lifecycle
state. Entering `verifying` does **not** capture a baseline and is not required
merely to produce evidence. Lifecycle advancement
(`implementing` → `verifying` → `done` → `archivable`) remains a separate
authorized action and still follows the hop rules below.

Verification staleness never moves lifecycle state. Before `verifying` it is
contextual. At `verifying` or later it blocks until this skill renews evidence
in place. A stale sign-off after `done` returns to `done`; it does not move an
earlier state forward.

### 2. Enter verification (or resume)

**If in `implementing`** (normal entry from `/specd-implement`):

Run pre-hooks and transition:

```bash
specd changes run-hooks <name> verifying --phase pre
specd changes hook-instruction <name> verifying --phase pre --format text
```

Follow guidance.

```bash
specd changes transition <name> verifying --skip-hooks all
```

If it fails with `IMPLEMENTATION_STATE` / open tracked files: drain tracking using
`shared.md` — "Implementation tracking" (`list` → `resolve` in-scope files, `ignore`
incidental files, `add` links when a file actually implements a spec). Retry the
transition. Do **not** stop and send the user to `/specd-implement` for this blocker
alone.

If it fails for any other reason, follow the **Repair Guide** output.

**If in `verifying`** (resuming): run pre-hooks but skip the transition:

```bash
specd changes run-hooks <name> verifying --phase pre
specd changes hook-instruction <name> verifying --phase pre --format text
```

**If in `done`**: skip the `verifying` entry transition. Continue with attempt
ownership below when evidence must be renewed; otherwise continue at step 6b
for the signoff gate. Entering `done` does not complete verification.

`verifying` → `verifying` is not a protocol hop. There is no restart-verification flag. Continue to step 2b whenever this invocation will check scenarios.

### 2b. Select verification mode

Ask the user:

> "What verification mode do you want?"
>
> - **Simple** — verify scenarios against implementation.
> - **Full** — simple verification + compliance audit.

Wait for the user's choice. Store it as `verificationMode` (simple or full).

Continue to step 3.

### 3. Load verification context

Use a single-pass context policy: choose one profile before calling `changes context`
and avoid running both profiles in the same verification cycle unless a hard blocker
forces a retry.

Choose one profile:

- `light` (lower token cost): use when verification can run primarily from merged
  scenarios and already-loaded artifacts.
- `full` (higher coverage): use when you already know rules/constraints/dependency
  context will be needed.

`light` profile:

```bash
specd changes context <name> verifying --include-change-specs --scenarios --format text [--fingerprint <stored-value>]
```

`full` profile:

```bash
specd changes context <name> verifying --include-change-specs --follow-deps --depth 1 --rules --constraints --scenarios --format text [--fingerprint <stored-value>]
```

Pass `--fingerprint <stored-value>` if you have a `contextFingerprint` from a previous `changes context` call in this conversation (see `shared.md` — "Fingerprint mechanism"). If output says `unchanged`, use the context already in memory.

**MUST follow** — project context entries are binding directives. If lazy mode returns
summary specs, evaluate each one and load any that are relevant to the scenarios you're
about to verify (see `shared.md` — "Processing `changes context` output").

### 3b. Get merged specs with deltas applied

Use merged spec-scoped artifact content for verification. If the context read(s)
already returned the full merged content needed for the spec-scoped requirement and
scenario artifacts, use that output. If context is still incomplete (summaries/metadata
only or missing required merged details), if raw deltas are the only artifact content
you have, or if overlap/drift/stale-base risk exists, use `spec-preview` to get the
final merged spec-scoped artifacts with deltas applied.

Do not treat the inline diff from `specd changes validate` as a replacement for this
step when verification needs the full merged artifact content; that inline diff is only
the immediate review surface for the narrow successful single-artifact validate flow.

For merged artifact retrieval, run:

```bash
specd changes spec-preview <name> <specId> --format toon
```

If you only need one merged spec-scoped artifact, prefer:

```bash
specd changes spec-preview <name> <specId> --artifact <artifactId> --format toon
```

This merged view is what you should verify against. Raw delta inspection alone is not
equivalent to merged preview review.

### 3c. Start the verification attempt

This skill owns the attempt, including full mode. Before any scenario check,
compliance audit, verification report, or completion, run:

```bash
specd changes verification start <name> --format text
```

Store the returned attempt id. The command is explicit and works from any active
state. It refreshes tracking and runs the registered implementation readiness
checks before storing a baseline; entering `verifying` applies the same guards but
never creates an attempt. Transitions and status never complete an unfinished attempt.

If fingerprinted inputs changed, this start replaces the baseline. Repeat every
scenario check and, in full mode, the delegated audit against that new baseline.
Earlier results cannot complete the new attempt.

```bash
specd changes verification invalidate <name> --reason "<text>"
```

`verification invalidate` is a separate command. It only withdraws completed
verification evidence. It does not start or restart an attempt. Do not use it
instead of `verification start`. If evidence was already stale, trust the persisted
reason returned by the command; a new request reason does not replace audit history.

### 4. Verify each scenario

For each spec in the change, read the merged spec content from step 3b. Then verify
each scenario against:

1. The **merged spec-scoped content** (from `changes context` when it returned the
   needed full merged content, otherwise from `spec-preview`)
2. The **verification scenarios** in the merged scenario-bearing artifact

For each scenario:

- Inspect the implementation code
- Run relevant tests if applicable
- Confirm GIVEN/WHEN/THEN conditions are satisfied using the merged spec content

### 5. Run exit hooks — immediately after last scenario verified

The moment all scenarios have been evaluated, run the post-verifying hooks:

```bash
specd changes run-hooks <name> verifying --phase post
specd changes hook-instruction <name> verifying --phase post --format text
```

Follow guidance. If hooks fail, fix and re-run.

### 5b. Compliance audit (full mode only)

**Only if `verificationMode` is `full`:** run the compliance audit now, before
completion or any lifecycle transition.

Pass the attempt id from step 3c and a delegated marker. Delegated compliance
participates in this attempt and must not run `verification start` or
`verification complete`:

`/specd-compliance --change <name> --delegated --attempt <attemptId>`

An existing active attempt alone does not imply delegation. This skill already
started the outer attempt. Obtain the audit results and store them. They are
presented with the verification findings in step 6. Full mode completes only
after scenario checks and this audit both succeed.

**If `verificationMode` is `simple`:** skip compliance. This skill still owns
start, scenario checks, and complete.

Continue to step 6.

### 6. Report results and transition

Present verification findings to the user.

**If in `full` mode:** also present the audit results from step 5b alongside the
verification findings. If the audit identified issues, ALWAYS ask the user what to do
next. Provide these options:

- 1. **"Update Specs"** — if audit identified spec-level issues or drift: `/specd-design <name>`
- 2. **"Fix Implementation"** — if audit identified code or test gaps: `/specd-implement <name>`
- 3. **"Both"** — run `/specd-design <name>` FIRST, then `/specd-implement <name>`
- 4. **"Proceed"** — audit is clean or issues dismissed, continue with the standard workflow

If there was no issues, ask only if they want to proceed to transition or review the results again. Provide these options:

- 1. **"Proceed"** — continue with the standard workflow
- 2. **"Review Results"** — review the verification findings again

You MUST NOT proceed automatically; the user must explicitly choose.

**If any scenarios fail:**

First classify the failure:

- **Implementation-only failure** —artifacts still correct
- **Artifact review required** — desired behavior changed or artifacts wrong

Before choosing a transition, reload status:

```bash
specd changes status <name> --format text
```

If fresh status shows required spec recovery, or `workflow: redesign` with
unresolved non-task drift, do NOT route back to `implementing`. Tell the user
to run `/specd-design <name>` and **stop**. Under `workflow: preserve`, stay in
phase for in-place review instead of forcing design.

If this is an implementation-only failure:

```bash
specd changes transition <name> implementing --skip-hooks all
```

Tell the user to run `/specd-implement <name>` to fix the implementation. **Stop.**

If this is artifact review required:

```bash
specd changes transition <name> designing --skip-hooks all
```

Tell the user to run `/specd-design <name>` to update them. **Stop.**

Do not run `verification complete` after a failed scenario, an interrupted
session, or a failed delegated audit. Leave the active attempt. There is no restart-verification flag.

**If all scenario checks pass, applicable hooks pass, and (full mode) the
delegated audit succeeds:** complete the attempt this skill started. Do this
before any lifecycle transition. CLI completion records the declaration; it does
not run the tests.

```bash
specd changes verification complete <name> --format text
```

If complete reports a fingerprint mismatch, do not complete with the previous
results. Inspect the differences, run `specd changes verification start <name>`
again, repeat all required verification work against the new baseline, then
complete.

Lifecycle advancement is separate. When the user authorizes it and current
evidence exists, transition through `done` and the signoff gate to reach
`archivable`.

#### 6a. Transition to done

Run done pre-hooks, then transition:

```bash
specd changes run-hooks <name> done --phase pre
specd changes hook-instruction <name> done --phase pre --format text
```

Follow guidance.

```bash
specd changes transition <name> done --skip-hooks all
```

Run done post-hooks:

```bash
specd changes run-hooks <name> done --phase post
specd changes hook-instruction <name> done --phase post --format text
```

#### 6b. Handle signoff gate

Run `changes status <name> --format text` and check `approvals:` line.

**If signoff=off:** no signoff needed — run archivable hooks and transition:

```bash
specd changes run-hooks <name> archivable --phase pre
specd changes hook-instruction <name> archivable --phase pre --format text
```

Follow guidance.

```bash
specd changes transition <name> archivable --skip-hooks all
```

```bash
specd changes run-hooks <name> archivable --phase post
specd changes hook-instruction <name> archivable --phase post --format text
```

**If signoff=on:** stay in `done`. Tell user:

> Signoff required. Run: `specd changes approve signoff <name> --reason "..."`
> Then continue this skill for `done → archivable`.

**Stop.**
Do not invoke `/specd-archive` automatically; wait for explicit user confirmation.

## Session tasks

1. `Load state & hooks`
2. `Select verification mode (simple/full)`
3. `Load verification context`
4. For each spec: `Verify: <specId>`
5. `Run exit hooks`
   5b. `Compliance audit` (full mode only)
6. `Report results & transition`

## Handling failed transitions

When `changes transition` fails, it renders a **Repair Guide** in text mode.

If the blocker is `IMPLEMENTATION_STATE` / `impl.filesResolved`, drain tracking
(`shared.md` — "Implementation tracking") and **retry** — do not redirect to
`/specd-implement` solely for open files.

For any other blocker, follow the recommended repair command based on the target
recommendation.

**Stop — do not continue after redirecting** (except the open-files drain-and-retry
path above).

## Returning to design

If during verification you discover that the artifacts need revision, stop and explain.
If the user agrees:

```bash
specd changes transition <name> designing --skip-hooks all
```

> Artifacts need revision. Run `/specd-design <name>` to update them.

**Stop — do not continue verifying.**

## Guardrails

- Verify against scenarios from the compiled context
- Run actual tests where applicable
- On `review: required: yes`, follow canonical recovery: spec consent or
  `workflow: redesign` goes to `/specd-design`; `workflow: preserve` stays in
  phase for in-place review. Do not treat structural validation as approval
- ALWAYS ask the user for the next action when full-mode audit finds issues
- Own `verification start` and `verification complete` for both simple and full
  mode. Pass `--delegated --attempt <attemptId>` in full mode. Do not let
  compliance complete the outer attempt
- Do not complete after a failed check, a failed delegated audit, or a
  fingerprint mismatch until the repeated work succeeds
