---
name: specd-verify
description: Verify a specd change's implementation against spec scenarios.
allowed-tools: Bash(node *), Bash(pnpm *), Read, Grep, Glob, TaskCreate, TaskUpdate
argument-hint: '<change-name>'
---

# specd-verify — check implementation against specs

Read `.specd/skills/shared.md` before doing anything.

## What this does

Runs through verification scenarios for each spec in the change. If all pass,
transitions to `done`. If any fail, loops back to implementing.

## Steps

### 1. Load change state

```bash
specd change status <name> --format json
```

Store `lifecycle.changePath`, `specIds`, and `review` from the response.

If `review.required` is `true`, this change has artifacts that require review
before verification can continue. Summarize `review.reason` and
`review.affectedArtifacts`, then tell the user:

> Artifacts need review before verification can continue. Run `/specd-design <name>`.

**Stop — do not continue.**

If not in `implementing`, `verifying`, or `done`, this is the wrong skill. Suggest based on state:

- `drafting` / `designing` → `/specd-design <name>`
- `ready` → Review artifacts, then approve or continue designing with `/specd-design <name>`
- `spec-approved` → `/specd-implement <name>`
- `signed-off` → Check signoff gate and transition to archivable
- `pending-signoff` → "Signoff pending. Run: `specd change approve signoff <name> --reason ...`"
- `archivable` → `/specd-archive <name>`
- `pending-spec-approval` → "Approval pending. Run: `specd change approve spec <name> --reason ...`"

**Stop — do not continue.**

### 2. Enter verification (or resume)

**If in `implementing`** (normal entry from `/specd-implement`):

Run pre-hooks and transition:

```bash
specd change run-hooks <name> verifying --phase pre
specd change hook-instruction <name> verifying --phase pre --format text
```

Follow guidance.

```bash
specd change transition <name> verifying --skip-hooks all
```

If it fails (incomplete tasks), show which items are still `- [ ]` and **stop**, tell the user:

> Cannot transition to verifying — incomplete tasks.
> Run `/specd-implement <name>` to finish them.

**Stop — do not continue until tasks are done.**

**If in `verifying`** (resuming): run pre-hooks but skip the transition:

```bash
specd change run-hooks <name> verifying --phase pre
specd change hook-instruction <name> verifying --phase pre --format text
```

**If in `done`**: skip directly to step 6a (transition to archivable path).

Continue to step 3.

### 3. Load verification context

```bash
specd change context <name> verifying --follow-deps --depth 1 --scenarios --format json
```

Extract and store the `contextFingerprint` from the response. If the response is `status: "changed"`, use the full context. If `status: "unchanged"`, you already have the context from a previous call.

**MUST follow** — project context entries are binding directives. If lazy mode returns
summary specs, evaluate each one and load any that are relevant to the scenarios you're
about to verify (see `shared.md` — "Processing `change context` output").

### 3b. Get merged specs with deltas applied

For each spec in the change, use `spec-preview` to get the final merged spec content
with deltas applied. This shows the spec exactly as it will be after archiving:

```bash
specd change spec-preview <name> <specId> --format json
```

For each spec in `specIds`, run this command and store the result. The merged content
includes:

- All requirements from the original spec
- Modifications from the change's deltas
- New requirements added by the change

This merged view is what you should verify against — not the raw spec files, since
the deltas change what the final spec will contain.

### 4. Verify each scenario

For each spec in the change, read the merged spec content from step 3b. Then verify
each scenario against:

1. The **merged spec** (from `spec-preview`) — this shows the final requirements after deltas
2. The **verification scenarios** in the merged `verify.md` — these define the pass/fail conditions

For each scenario:

- Inspect the implementation code
- Run relevant tests if applicable
- Confirm GIVEN/WHEN/THEN conditions are satisfied using the merged spec content

### 4b. Check blast radius with code graph

After verifying scenarios, use the code graph to check whether the implementation
touched high-risk areas that might need extra scrutiny:

```bash
specd graph impact --changes <file1> <file2> ... --format json
```

Pass the files that were modified during implementation (from `git diff` or the task
list). If `riskLevel` is HIGH or CRITICAL, surface it to the user:

> **Impact analysis:** the implementation touches symbols with `<riskLevel>` risk.
> `<N>` files affected downstream. Consider additional testing.

If risk is HIGH or CRITICAL, confirm with the user before transitioning.

### 5. Run exit hooks — immediately after last scenario verified

The moment all scenarios have been evaluated, run the post-verifying hooks before
presenting anything to the user or transitioning:

```bash
specd change run-hooks <name> verifying --phase post
specd change hook-instruction <name> verifying --phase post --format text
```

Follow guidance. If hooks fail, fix and re-run.

### 6. Report results and transition

Present findings to the user:

> **Verification results for `<name>`:**
>
> | Spec | Scenario | Result    |
> | ---- | -------- | --------- |
> | ...  | ...      | PASS/FAIL |
>
> N/M scenarios pass.

**If any fail:**

First classify the failure:

- **Implementation-only failure** — the artifacts still describe the desired
  behavior correctly, and fixing the issue does not require new or changed
  tasks or design artifacts
- **Artifact review required** — the desired behavior changed, the artifacts are
  wrong or incomplete, or fixing the issue requires new or changed tasks,
  specs, verify scenarios, design, or proposal content

Before choosing a transition, reload status:

```bash
specd change status <name> --format json
```

If the fresh status shows `review.required = true`, do NOT route back to
`implementing`. Summarize `review.reason` and `review.affectedArtifacts`, then
direct the user to `/specd-design <name>` and **stop**.

If this is an implementation-only failure:

```bash
specd change transition <name> implementing --skip-hooks all
```

Tell the user which scenarios failed and suggest:

> Some scenarios failed, but the artifacts remain correct. Run `/specd-implement <name>` to fix the implementation.

**Stop.**

If this is artifact review required:

```bash
specd change transition <name> designing --skip-hooks all
```

Tell the user which scenarios revealed the issue and suggest:

> Verification showed the artifacts need revision. Run `/specd-design <name>` to review and update them.

**Stop.**

**If all pass:** transition through `done` and the signoff gate to reach `archivable`.

#### 6a. Transition to done

Run done pre-hooks, then transition:

```bash
specd change run-hooks <name> done --phase pre
specd change hook-instruction <name> done --phase pre --format text
```

Follow guidance.

```bash
specd change transition <name> done --skip-hooks all
```

Run done post-hooks:

```bash
specd change run-hooks <name> done --phase post
specd change hook-instruction <name> done --phase post --format text
```

#### 6b. Handle signoff gate

```bash
specd change status <name> --format json
```

Check `lifecycle.approvals.signoff`:

**If `false`:** no signoff needed — run archivable hooks and transition:

```bash
specd change run-hooks <name> archivable --phase pre
specd change hook-instruction <name> archivable --phase pre --format text
```

Follow guidance.

```bash
specd change transition <name> archivable --skip-hooks all
```

```bash
specd change run-hooks <name> archivable --phase post
specd change hook-instruction <name> archivable --phase post --format text
```

Follow guidance.

**If `true`:** the transition will route to `pending-signoff`. Tell user:

> Signoff required. Run: `specd change approve signoff <name> --reason "..."`
> Then: `/specd-archive <name>`

**Stop.**

> All scenarios pass. Change is ready to archive. Run `/specd-archive <name>`.

**Stop.**

## Session tasks

Create tasks at the start for session visibility. Update them as you go.

1. `Load state & hooks` — mark done after step 2
2. `Load verification context` — mark done after step 3
3. For each spec: `Verify: <specId>` — mark done after all its scenarios are checked
4. `Report results & transition` — mark done after step 6

Create the per-spec items (step 3) after loading context in step 3.

## Handling failed transitions

Any `change transition` command may fail with:

```
Cannot transition from '<current>' to '<target>'
```

If this happens, the change is in a different state than expected. Extract `<current>`
from the error message and redirect using this table:

| Current state                    | Suggest                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `drafting` / `designing`         | `/specd-design <name>`                                                           |
| `ready`                          | Review artifacts, then approve or continue designing with `/specd-design <name>` |
| `implementing` / `spec-approved` | `/specd-implement <name>`                                                        |
| `verifying`                      | You're already in the right skill — re-read status and retry                     |
| `done` / `signed-off`            | Check signoff gate and transition to archivable                                  |
| `pending-signoff`                | "Signoff pending. Run: `specd change approve signoff <name> --reason ...`"       |
| `archivable`                     | `/specd-archive <name>`                                                          |
| `pending-spec-approval`          | "Approval pending. Run: `specd change approve spec <name> --reason ...`"         |

**Stop — do not continue after redirecting.**

## Returning to design

If during verification you discover that the specs or design are wrong (not just the
implementation), do not just fail scenarios — surface the root cause to the user. If
the artifacts themselves need revision and the user agrees:

```bash
specd change transition <name> designing --skip-hooks all
```

> Artifacts need revision. Run `/specd-design <name>` to update them.

**Stop — do not continue verifying.**

## Guardrails

- Verify against scenarios from the compiled context, not from memory
- Run actual tests where applicable — don't just inspect code
- Report each failing scenario with specifics so the user can fix it
- Any time a fresh `change status` shows `review.required = true`, stop
  verification and redirect to `/specd-design <name>`
