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
- `done` / `signed-off` → `/specd-verify <name>` (handles done→archivable transition)
- `pending-signoff` → "Signoff pending. Run: `specd change approve signoff <name> --reason ...`"
- `archivable` → `/specd-archive <name>`
- `pending-spec-approval` → "Approval pending. Run: `specd change approve spec <name> --reason ...`"

**Stop — do not continue.**

If in `spec-approved`, transition:

```bash
node packages/cli/dist/index.js change transition <name> implementing --skip-hooks all
```

Store `lifecycle.changePath` and `specIds` from the response.

### 2. Load schema and find task file

```bash
node packages/cli/dist/index.js schema show --format json
```

Find artifacts with `hasTaskCompletionCheck: true` — those have trackable checkboxes.

### 3. Run entry hooks

```bash
node packages/cli/dist/index.js change run-hooks <name> implementing --phase pre
node packages/cli/dist/index.js change hook-instruction <name> implementing --phase pre --format text
```

Follow guidance — it tells you which change artifacts to read.

### 4. Load context

```bash
node packages/cli/dist/index.js change context <name> implementing --follow-deps --depth 1 --rules --constraints --format text
```

**MUST follow** — project context entries are binding directives. If lazy mode returns
summary specs, evaluate each one and load any that are relevant to the code you're
about to write (see `shared.md` — "Processing `change context` output").

### 5. Read change artifacts

Use the schema's `artifacts` array (from step 2) to know which artifacts exist and
their `output` paths. Read ALL change artifacts from `<changePath>/`:

- **Change-scoped** artifacts — directly in `<changePath>/`
- **Spec-scoped deltas** — in `<changePath>/deltas/` (existing specs modified by this change)
- **Spec-scoped new specs** — in `<changePath>/specs/` (new specs created by this change)

Do not hardcode filenames — the schema defines what exists.

### 6. Work through tasks

#### 6a. Analyze task dependencies (multi-agent support)

If your environment supports launching parallel agents (e.g. the `Agent` tool), analyze
the tasks before starting:

1. **Read all tasks** from the task-bearing artifact(s) identified in step 2
2. **Read all other change artifacts** (loaded in step 5) for context on dependencies
   between tasks — shared files, types consumed/produced, API contracts, ordering constraints
3. **Map dependencies** — for each task, determine which other tasks must complete first
4. **Group into waves** — tasks with no unresolved dependencies form wave 1. Tasks that
   depend only on wave-1 tasks form wave 2, and so on.
5. **Parallelize each wave** — launch one agent per task within a wave. Each agent
   implements its task and marks its checkbox done. Wait for the full wave to complete
   before starting the next.
6. **Conflict resolution** — if two tasks in the same wave need to edit the same file,
   move one to the next wave instead.

If multi-agent is not available or all tasks are sequential (single dependency chain),
fall back to implementing tasks one by one in their listed order.

#### 6b. Implement

For each task (whether parallel or sequential):

1. Implement the code
2. **Immediately** mark it done (`- [ ]` → `- [x]`) in the task-bearing artifact
3. Check if the code touches areas outside the change's specs — if so, surface to the user

If a task is ambiguous, consult the other change artifacts first. If still unclear, ask the user.

### 7. Run exit hooks — immediately after last checkbox

**Trigger:** the moment the last `- [ ]` across ALL task-bearing artifacts is marked
`- [x]`, run the post-implementing hooks. Do NOT wait, do NOT ask the user anything
first — the hooks fire on completion of the implementation work, before any conversation.

```bash
node packages/cli/dist/index.js change run-hooks <name> implementing --phase post
node packages/cli/dist/index.js change hook-instruction <name> implementing --phase post --format text
```

Follow guidance. If hooks fail (tests, lint), fix and re-run until they pass.

### 8. Transition to verifying

```bash
node packages/cli/dist/index.js change transition <name> verifying --skip-hooks all
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

| Current state                    | Suggest                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `drafting` / `designing`         | `/specd-design <name>`                                                           |
| `ready`                          | Review artifacts, then approve or continue designing with `/specd-design <name>` |
| `implementing` / `spec-approved` | You're already in the right skill — re-read status and retry                     |
| `verifying`                      | `/specd-verify <name>`                                                           |
| `done` / `signed-off`            | `/specd-verify <name>` (handles done→archivable transition)                      |
| `pending-signoff`                | "Signoff pending. Run: `specd change approve signoff <name> --reason ...`"       |
| `archivable`                     | `/specd-archive <name>`                                                          |
| `pending-spec-approval`          | "Approval pending. Run: `specd change approve spec <name> --reason ...`"         |

**Stop — do not continue after redirecting.**

## Guardrails

- Mark tasks done in real time — don't batch checkbox updates
- The change artifacts are the source of truth for implementation approach
- If you touch code outside the change's spec scope, surface it to the user
- Never skip the pre-hook — it tells you what to read
