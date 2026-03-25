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
node packages/cli/dist/index.js change status <name> --format json
```

If not in `verifying`, this is the wrong skill. Suggest based on state:

- `drafting` / `designing` → `/specd-design <name>`
- `ready` → Review artifacts, then approve or continue designing with `/specd-design <name>`
- `implementing` / `spec-approved` → `/specd-implement <name>`
- `done` / `pending-signoff` / `signed-off` / `archivable` → `/specd-archive <name>`
- `pending-spec-approval` → "Approval pending. Run: `specd change approve spec <name> --reason ...`"

**Stop — do not continue.**

Store `lifecycle.changePath` and `specIds` from the response.

### 2. Run entry hooks

```bash
node packages/cli/dist/index.js change hook-instruction <name> verifying --phase pre --format text
```

Follow guidance.

### 3. Load verification context

```bash
node packages/cli/dist/index.js change context <name> verifying --follow-deps --depth 1 --scenarios --format text
```

**MUST follow** — project context entries are binding directives. If lazy mode returns
summary specs, evaluate each one and load any that are relevant to the scenarios you're
about to verify (see `shared.md` — "Processing `change context` output").

### 4. Verify each scenario

For each spec in the change, read its verification scenarios. For each scenario:

- Inspect the implementation code
- Run relevant tests if applicable
- Confirm GIVEN/WHEN/THEN conditions are satisfied

### 5. Run exit hooks — immediately after last scenario verified

The moment all scenarios have been evaluated, run the post-verifying hooks before
presenting anything to the user or transitioning:

```bash
node packages/cli/dist/index.js change run-hooks <name> verifying --phase post
node packages/cli/dist/index.js change hook-instruction <name> verifying --phase post --format text
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

**If all pass:**

```bash
node packages/cli/dist/index.js change transition <name> done
```

Suggest: `/specd-archive <name>`

**If any fail:**

```bash
node packages/cli/dist/index.js change transition <name> implementing
```

Tell the user which scenarios failed and suggest:

> Some scenarios failed. Run `/specd-implement <name>` to fix.

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

| Current state                                            | Suggest                                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `drafting` / `designing`                                 | `/specd-design <name>`                                                           |
| `ready`                                                  | Review artifacts, then approve or continue designing with `/specd-design <name>` |
| `implementing` / `spec-approved`                         | `/specd-implement <name>`                                                        |
| `verifying`                                              | You're already in the right skill — re-read status and retry                     |
| `done` / `pending-signoff` / `signed-off` / `archivable` | `/specd-archive <name>`                                                          |
| `pending-spec-approval`                                  | "Approval pending. Run: `specd change approve spec <name> --reason ...`"         |

**Stop — do not continue after redirecting.**

## Guardrails

- Verify against scenarios from the compiled context, not from memory
- Run actual tests where applicable — don't just inspect code
- Report each failing scenario with specifics so the user can fix it
