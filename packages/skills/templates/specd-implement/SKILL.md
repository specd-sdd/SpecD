# specd-implement — write code

Read @shared.md before doing anything.

## What this does

Implements the code described by the change's design and tasks artifacts.
Works through tasks one by one and marks them done.

## Steps

### 1. Load change state

```bash
specd change status <name> --format text
```

Identify any high-visibility blockers from the **blockers:** section (e.g. `ARTIFACT_DRIFT`,
`OVERLAP_CONFLICT`, `REVIEW_REQUIRED`) and inform the user. Follow the **next action:**
command recommendation.

Extract the `path:` field from the "lifecycle:" section.

If the status output shows `review: required: yes`, this change has artifacts that
require review before implementation can continue. Tell the user:

> Artifacts need review before implementation can continue. Run `/specd-design <name>`.

**Stop — do not continue.**

If not in `ready` or `implementing` or `spec-approved`, this is the wrong skill.
Redirect based on the **next action:** `target` recommendation.

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
specd project status --format toon
```

From the response, build a map of each workspace's `codeRoot` and `ownership` from the `workspaces` array.
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
specd schema show --format toon
```

Find artifacts with `hasTaskCompletionCheck: true` — those have trackable checkboxes.

### 4. Load context

```bash
specd change context <name> implementing --follow-deps --depth 1 --rules --constraints --format text [--fingerprint <stored-value>]
```

Pass `--fingerprint <stored-value>` if you have a `contextFingerprint` from a previous `change context` call in this conversation (see `shared.md` — "Fingerprint mechanism"). If output says `unchanged`, use the context already in memory.

**MUST follow** — project context entries are binding directives. If lazy mode returns
summary specs, evaluate each one and load any that are relevant to the code you're
about to write (see `shared.md` — "Processing `change context` output").

### 4b. Assess impact with code graph

Before reading artifacts, use the code graph to understand the blast radius of the
files and symbols you'll be modifying:

```bash
specd graph hotspots --format toon
```

If the tasks (from the design artifact) mention specific symbols or files, check their
dependents:

```bash
specd graph impact --symbol "<name>" --direction dependents --format toon
specd graph impact --file "<workspace:path>" --direction dependents --format toon
```

Surface HIGH or CRITICAL risk findings to the user before starting implementation.

### 5. Read change artifacts

Read ALL change artifacts from `<changePath>/`:

- **Change-scoped** artifacts — directly in `<changePath>/`
- **Spec-scoped deltas** — in `<changePath>/deltas/` (existing specs modified by this change)
- **Spec-scoped new specs** — in `<changePath>/specs/` (new specs created by this change)

Do not hardcode filenames — use the schema's artifact definitions.

### 6. Work through tasks

#### 6a. Analyze task dependencies

Before implementing anything, plan the execution order:

1. **Read all tasks** from the task-bearing artifact(s)
2. **Read all other change artifacts** (loaded in step 5) for context on dependencies
3. **Map dependencies** — for each task, determine which other tasks must complete first
4. **Group into waves** — tasks with no unresolved dependencies form wave 1
5. **Conflict resolution** — if two tasks in the same wave need to edit the same file,
   move one to the next wave instead.

Present the wave plan to the user before starting.

#### 6b. Implement — parallel mode

**Use this mode when the `Agent` tool is available AND at least one wave has 2+ tasks.**

For each wave, launch one agent per task using the `Agent` tool. Each agent runs in
a worktree (`isolation: "worktree"`) so file edits don't conflict.

Each agent prompt must include:

1. **The task** — the full checkbox line with its indented context
2. **The design excerpt** — relevant design context
3. **The spec requirements** — relevant requirements and constraints
4. **File paths** — exact files to create or modify
5. **Instruction to mark done** — "After implementing, mark the checkbox done in
   `<changePath>/<taskFile>`"
6. **Project conventions** — follow project context directives

Launch all tasks in a wave in a **single message**. Wait for all agents to complete,
then verify their work before starting the next wave.

#### 6c. Implement — sequential mode

**Use this mode when the `Agent` tool is NOT available, or when no parallelism is possible.**

For each task in order:

1. Implement the code
2. **Immediately** mark it done (`- [ ]` → `- [x]`) in the task-bearing artifact
3. Check if the code touches areas outside the change's specs — if so, surface to the user

#### 6d. Common rules (both modes)

- If a task is ambiguous, consult the other change artifacts first.
- Mark tasks done in real time — don't batch checkbox updates.
- If you touch code outside the change's spec scope, surface it to the user.

### 7. Run exit hooks — immediately after last checkbox

**Trigger:** the moment the last `- [ ]` across ALL task-bearing artifacts is marked
`- [x]`, run the post-implementing hooks.

```bash
specd change run-hooks <name> implementing --phase post
specd change hook-instruction <name> implementing --phase post --format text
```

Follow guidance. If hooks fail (tests, lint), fix and re-run until they pass.

> Implementation complete. Run `/specd-verify <name>` to verify against scenarios.

**Stop.**

## Session tasks

1. `Load state & hooks`
2. `Load context & artifacts`
3. For each task in `tasks.md`: `Implement: <task summary>`
4. `Run exit hooks`

## Handling failed transitions

When `change transition` fails, it renders a **Repair Guide** in text mode.
Follow the recommended repair command based on the target recommendation.

**Stop — do not continue after redirecting.**

## Returning to design

If during implementation you discover that the artifacts need changes, stop and explain
the issue. If the user agrees:

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
- Any time a fresh `change status` shows `review: required: yes`, stop
  implementation and redirect to `/specd-design <name>`
