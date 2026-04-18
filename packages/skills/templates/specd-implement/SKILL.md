# specd-implement — write code

Read `shared.md` before doing anything.

## What this does

Implements the code described by the change's design and tasks artifacts.
Works through tasks one by one and marks them done.

## Steps

### 1. Load change state

```bash
specd change status <name> --format json
```

Store `lifecycle.changePath`, `specIds`, and `review` from the response.

If `review.required` is `true`, this change has artifacts that require review
before implementation can continue. Summarize `review.reason` and
`review.affectedArtifacts`, then tell the user:

> Artifacts need review before implementation can continue. Run `/specd-design <name>`.

**Stop — do not continue.**

If not in `ready` or `implementing` or `spec-approved`, this is the wrong skill. Suggest based on state:

- `drafting` / `designing` → `/specd-design <name>`
- `ready` → Review artifacts, then approve or continue designing with `/specd-design <name>`
- `verifying` → `/specd-verify <name>`
- `done` / `signed-off` → `/specd-verify <name>` (handles done→archivable transition)
- `pending-signoff` → "Signoff pending. Run: `specd change approve signoff <name> --reason ...`"
- `archivable` → `/specd-archive <name>`
- `pending-spec-approval` → "Approval pending. Run: `specd change approve spec <name> --reason ...`"

**Stop — do not continue.**

If in `ready` or `spec-approved`, run pre-hooks and transition:

```bash
specd change run-hooks <name> implementing --phase pre
specd change hook-instruction <name> implementing --phase pre --format text
```

Follow guidance — it tells you which change artifacts to read.

```bash
specd change transition <name> implementing --skip-hooks all
```

If already in `implementing` (resuming), run pre-hooks but skip the transition:

```bash
specd change run-hooks <name> implementing --phase pre
specd change hook-instruction <name> implementing --phase pre --format text
```

### 2. Check workspace ownership

```bash
specd config show --format json
```

From the JSON output, build a map of each workspace's `codeRoot` and `ownership`.
For each `specId` in the change, determine which workspace it belongs to.

**If any spec targets a `readOnly` workspace:**

> **Blocked.** The following specs belong to readOnly workspaces and cannot be modified:
>
> | Spec | Workspace | codeRoot |
> | ---- | --------- | -------- |
> | ...  | ...       | ...      |
>
> Remove them from the change or update the workspace ownership in `specd.yaml`.

**Stop — do not continue.**

**Continuous guard — applies throughout the entire implementation session:**

ReadOnly workspaces are off-limits. You must NOT write or edit any file under
the `codeRoot` of a readOnly workspace. Before every file write or edit, verify
the target path does not fall within a readOnly `codeRoot`.

If a task requires modifying code in a readOnly workspace, **stop immediately** —
do not implement it, do not work around it, do not assume it's okay. Surface it
to the user. The design may need revision, or the workspace ownership must change
in `specd.yaml` before you can proceed.

### 3. Load schema and find task file

```bash
specd schema show --format json
```

Find artifacts with `hasTaskCompletionCheck: true` — those have trackable checkboxes.

### 4. Load context

```bash
specd change context <name> implementing --follow-deps --depth 1 --rules --constraints --format json [--fingerprint <stored-value>]
```

Pass `--fingerprint <stored-value>` if you have a `contextFingerprint` from a previous `change context` call in this conversation (see `shared.md` — "Fingerprint mechanism"). Extract and store the `contextFingerprint` from the response. If you passed a fingerprint and the response is `status: "unchanged"`, use the context already in memory. If `status: "changed"`, update your stored context and fingerprint with the new response.

**MUST follow** — project context entries are binding directives. If lazy mode returns
summary specs, evaluate each one and load any that are relevant to the code you're
about to write (see `shared.md` — "Processing `change context` output").

### 4b. Assess impact with code graph

Before reading artifacts, use the code graph to understand the blast radius of the
files and symbols you'll be modifying:

```bash
specd graph hotspots --min-risk MEDIUM --format json
```

If the tasks (from the design artifact) mention specific symbols or files, check their
downstream dependents:

```bash
specd graph impact --symbol "<name>" --direction downstream --format json
specd graph impact --file "<workspace:path>" --direction downstream --format json
```

Surface HIGH or CRITICAL risk findings to the user before starting implementation.
This helps prioritize which tasks need extra care and testing.

### 5. Read change artifacts

Use the schema's `artifacts` array (from step 2) to know which artifacts exist and
their `output` paths. Read ALL change artifacts from `<changePath>/`:

- **Change-scoped** artifacts — directly in `<changePath>/`
- **Spec-scoped deltas** — in `<changePath>/deltas/` (existing specs modified by this change)
- **Spec-scoped new specs** — in `<changePath>/specs/` (new specs created by this change)

Do not hardcode filenames — the schema defines what exists.

### 6. Work through tasks

#### 6a. Analyze task dependencies

Before implementing anything, plan the execution order:

1. **Read all tasks** from the task-bearing artifact(s) identified in step 2
2. **Read all other change artifacts** (loaded in step 5) for context on dependencies
   between tasks — shared files, types consumed/produced, API contracts, ordering constraints
3. **Map dependencies** — for each task, determine which other tasks must complete first
4. **Group into waves** — tasks with no unresolved dependencies form wave 1. Tasks that
   depend only on wave-1 tasks form wave 2, and so on.
5. **Conflict resolution** — if two tasks in the same wave need to edit the same file,
   move one to the next wave instead.

Present the wave plan to the user before starting:

> **Execution plan:**
>
> Wave 1 (parallel): 1.1, 1.2, 2.1
> Wave 2 (parallel): 2.2, 3.1 — depends on 1.1, 2.1
> Wave 3 (sequential): 4.1 — depends on all above

#### 6b. Implement — parallel mode

**Use this mode when the `Agent` tool is available AND at least one wave has 2+ tasks.**

For each wave, launch one agent per task using the `Agent` tool. Each agent runs in
a worktree (`isolation: "worktree"`) so file edits don't conflict.

Each agent prompt must include:

1. **The task** — the full checkbox line with its indented context
2. **The design excerpt** — the relevant section from `design.md` that covers this task
3. **The spec requirements** — requirements and constraints from the compiled context
   that apply to this task
4. **File paths** — exact files to create or modify (from the task's indented context)
5. **Instruction to mark done** — "After implementing, mark the checkbox done in
   `<changePath>/<taskFile>`"
6. **Project conventions** — remind the agent to follow the project context directives
   (coding conventions, linting rules, etc.)

Example agent launch:

```text
Agent tool call:
  description: "Implement task 1.1"
  prompt: |
    You are implementing one task from a specd change.

    ## Task
    - [ ] 1.1 Add optional `artifactId` field to input interface
          `packages/core/src/application/use-cases/validate-artifacts.ts`:
          `ValidateArtifactsInput` — add `artifactId?: string` property
          Approach: add as optional field; when present, `execute()` filters
          the schema artifacts array to only the matching ID before validation

    ## Design context
    [relevant excerpt from design.md]

    ## Spec requirements
    [relevant requirements and constraints]

    ## Conventions
    [project context directives — ESM, strict TS, no any, etc.]

    Implement this task. When done, mark the checkbox as `- [x]` in
    `<changePath>/tasks.md`.
  isolation: "worktree"
```

Launch all tasks in a wave as parallel Agent calls in a **single message** — this is
how the Agent tool parallelizes. Wait for all agents in the wave to complete, then
verify their work before starting the next wave.

Between waves:

- Check that all checkboxes from the wave are marked `[x]`
- Review the code briefly for consistency across agents
- If an agent's work conflicts with another's, resolve before the next wave

#### 6c. Implement — sequential mode

**Use this mode when the `Agent` tool is NOT available, or when all tasks form a single
dependency chain (no parallelism possible).**

For each task in order:

1. Implement the code
2. **Immediately** mark it done (`- [ ]` → `- [x]`) in the task-bearing artifact
3. Check if the code touches areas outside the change's specs — if so, surface to the user

#### 6d. Common rules (both modes)

- If a task is ambiguous, consult the other change artifacts first. If still unclear,
  ask the user.
- Mark tasks done in real time — don't batch checkbox updates.
- If you touch code outside the change's spec scope, surface it to the user.

### 7. Run exit hooks — immediately after last checkbox

**Trigger:** the moment the last `- [ ]` across ALL task-bearing artifacts is marked
`- [x]`, run the post-implementing hooks. Do NOT wait, do NOT ask the user anything
first — the hooks fire on completion of the implementation work, before any conversation.

```bash
specd change run-hooks <name> implementing --phase post
specd change hook-instruction <name> implementing --phase post --format text
```

Follow guidance. If hooks fail (tests, lint), fix and re-run until they pass.

> Implementation complete. Run `/specd-verify <name>` to verify against scenarios.

**Stop.**

## Session tasks

Create tasks at the start for session visibility. Update them as you go.

1. `Load state & hooks` — mark done after step 1
2. `Load context & artifacts` — mark done after step 5
3. For each task in `tasks.md`: `Implement: <task summary>` — mark done as you complete each
4. `Run exit hooks` — mark done after step 7

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

## Returning to design

If during implementation you discover that the specs, design, or tasks need changes
(wrong approach, missing requirement, incorrect assumption), do not try to work around
it. Stop, explain the issue to the user, and if they agree:

```bash
specd change transition <name> designing --skip-hooks all
```

> Artifacts need revision. Run `/specd-design <name>` to update them.

**Stop — do not continue implementing.**

## Guardrails

- Mark tasks done in real time — don't batch checkbox updates
- The change artifacts are the source of truth for implementation approach
- If you touch code outside the change's spec scope, surface it to the user
- Never skip the pre-hook — it tells you what to read
- Any time a fresh `change status` shows `review.required = true`, stop
  implementation and redirect to `/specd-design <name>`
