---
name: specd-implement
description: Implement code for a specd change — work through tasks, run hooks, transition to verifying.
allowed-tools: Bash(node *), Bash(pnpm *), Read, Write, Edit, Grep, Glob, Agent, TaskCreate, TaskUpdate, TaskList, TaskGet
argument-hint: '<change-name>'
---

# specd-implement — write code

Read `.specd/skills/shared.md` before doing anything.

## What this does

Implements the code described by the change's design and tasks artifacts.
Works through tasks one by one, marks them done, and transitions to verifying.

## Steps

### 1. Load change state

```bash
node packages/cli/dist/index.js change status <name> --format json
```

If not in `implementing` or `spec-approved`, this is the wrong skill. Suggest based on state:

- `drafting` / `designing` → `/specd-design <name>`
- `ready` → Review artifacts, then approve or continue designing with `/specd-design <name>`
- `verifying` → `/specd-verify <name>`
- `done` / `pending-signoff` / `signed-off` / `archivable` → `/specd-archive <name>`
- `pending-spec-approval` → "Approval pending. Run: `specd change approve spec <name> --reason ...`"

**Stop — do not continue.**

If in `spec-approved`, transition:

```bash
node packages/cli/dist/index.js change transition <name> implementing
```

Store `lifecycle.changePath` and `specIds` from the response.

### 2. Load schema and find task file

```bash
node packages/cli/dist/index.js schema show --format json
```

Find artifacts with `hasTaskCompletionCheck: true` — those have trackable checkboxes.

### 3. Run entry hooks

```bash
node packages/cli/dist/index.js change hook-instruction <name> implementing --phase pre --format text
```

Follow guidance — it tells you which change artifacts to read.

### 4. Load context

```bash
node packages/cli/dist/index.js change context <name> implementing --follow-deps --depth 1 --rules --constraints --format text
```

### 5. Read change artifacts

Read ALL artifacts from `<changePath>/`:

- `proposal.md` — why
- `design.md` — how (primary technical reference)
- `tasks.md` — what to do
- Spec deltas — what the system should do

### 6. Work through tasks

For each task in `tasks.md`:

1. Implement the code
2. **Immediately** mark it done (`- [ ]` → `- [x]`) in `tasks.md`
3. Check if the code touches areas outside the change's specs — if so, surface to the user

If a task is ambiguous, consult `design.md` first. If still unclear, ask the user.

### 7. Run exit hooks

```bash
node packages/cli/dist/index.js change run-hooks <name> implementing --phase post
node packages/cli/dist/index.js change hook-instruction <name> implementing --phase post --format text
```

Follow guidance. If hooks fail (tests, lint), fix and re-run.

### 8. Transition to verifying

```bash
node packages/cli/dist/index.js change transition <name> verifying
```

If it fails (incomplete tasks), show which items are still `- [ ]` and continue working.

When it succeeds, suggest:

> Implementation complete. Run `/specd-verify <name>` to verify against scenarios.

**Stop.**

## Session tasks

Create tasks at the start for session visibility. Update them as you go.

1. `Load state & hooks` — mark done after step 3
2. `Load context & artifacts` — mark done after step 5
3. For each task in `tasks.md`: `Implement: <task summary>` — mark done as you complete each
4. `Run exit hooks` — mark done after step 7
5. `Transition to verifying` — mark done after step 8

Create the per-task items (step 3) after reading `tasks.md` in step 5.

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
| `implementing` / `spec-approved`                         | You're already in the right skill — re-read status and retry                     |
| `verifying`                                              | `/specd-verify <name>`                                                           |
| `done` / `pending-signoff` / `signed-off` / `archivable` | `/specd-archive <name>`                                                          |
| `pending-spec-approval`                                  | "Approval pending. Run: `specd change approve spec <name> --reason ...`"         |

**Stop — do not continue after redirecting.**

## Guardrails

- Mark tasks done in real time — don't batch checkbox updates
- `design.md` is the source of truth for implementation approach
- If you touch code outside the change's spec scope, surface it to the user
- Never skip the pre-hook — it tells you what to read
