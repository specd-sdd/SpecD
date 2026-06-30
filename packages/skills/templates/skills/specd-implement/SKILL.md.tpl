{{{frontmatter}}}

# specd-implement — write code

## What this does

Implements the code described by the change's design and tasks artifacts.
Works through tasks one by one and marks them done.

## Steps

### 0. Bootstrap and load shared context

You MUST read @{{sharedFolder}}/shared.md before doing anything, if you can't find it using Glob or Read tools, use Bash tools like `ls` and `cat` to find and read it. If you can't find it at all, tell the user: "Shared context not found. Please ensure shared.md is available." and stop.

### 1. Load change state

```bash
specd changes status <name> --format text
```

Identify any high-visibility blockers from the **blockers:** section (e.g. `ARTIFACT_DRIFT`,
`OVERLAP_CONFLICT`, `REVIEW_REQUIRED`) and inform the user. Follow the **next action:**
command recommendation.

Extract the `path:` field from the "lifecycle:" section.
From the `artifacts (DAG):` section, note which artifact IDs are marked with
`[hasTasks]`; those are the task-bearing artifacts to read and update later.

If the status output shows `review: required: yes`, this change has artifacts that
require review before implementation can continue. Tell the user:

> Artifacts need review before implementation can continue. Run `/specd-design <name>`.

**Stop — do not continue.**

If not in `ready` or `implementing` or `spec-approved`, this is the wrong skill.
Redirect based on the **next action:** `target` recommendation.

**Stop — do not continue.**

If in `ready` or `spec-approved`, run pre-hooks and transition:

```bash
specd changes run-hooks <name> implementing --phase pre
specd changes hook-instruction <name> implementing --phase pre --format text
```

Follow guidance — it tells you which change artifacts to read.

```bash
specd changes transition <name> implementing --skip-hooks all
```

If already in `implementing` (resuming), run pre-hooks but skip the transition:

```bash
specd changes run-hooks <name> implementing --phase pre
specd changes hook-instruction <name> implementing --phase pre --format text
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

### 3. Locate task-bearing artifacts

Use the `[hasTasks]` artifact IDs noted from the initial change status output.

### 4. Load context

```bash
specd changes context <name> implementing --follow-deps --depth 1 --rules --constraints --format text [--fingerprint <stored-value>]
```

Pass `--fingerprint <stored-value>` if you have a `contextFingerprint` from a previous `changes context` call in this conversation (see `shared.md` — "Fingerprint mechanism"). If output says `unchanged`, use the context already in memory.

**MUST follow** — project context entries are binding directives. If lazy mode returns
summary specs, evaluate each one and load any that are relevant to the code you're
about to write (see `shared.md` — "Processing `changes context` output").

### 4b. Check impact coverage

Before coding, confirm the change-scoped design artifact already includes impact analysis for the files or
symbols named by the tasks. Reuse that analysis as the implementation baseline.

Run additional graph impact commands only when implementation discovers a target file
or symbol that was not covered by the design artifact, when the task scope has changed, or when
fresh status/context indicates the design may be stale:

```bash
specd graph impact --symbol "<name>" --direction dependents --format toon
specd graph impact --file "<workspace:path>" --direction dependents --format toon
specd graph impact --spec "<workspace:capability>" --direction dependents --format toon
```

Surface newly discovered HIGH or CRITICAL risk findings to the user before continuing.

### 5. Read change artifacts

Read ALL change artifacts from `<changePath>/`:

- **Change-scoped** artifacts — directly in `<changePath>/`
- **Spec-scoped deltas** — in `<changePath>/deltas/` (existing specs modified by this change)
- **Spec-scoped new specs** — in `<changePath>/specs/` (new specs created by this change)

Do not hardcode filenames — use the schema's artifact definitions.

### 6. Work through tasks

Implementation tracking creates **confirmed links** between each spec and the code
that implements it. Every spec in the change must end up linked to the files and
symbols that realize its requirements. These links feed into downstream tooling
(code graph, impact analysis, compliance checks).

**What to link:**

For each spec in the change, identify every file and symbol you create or modify that
directly implements that spec's requirements. A link answers the question: _"which
code makes this spec real?"_

**Symbol-level vs file-level links:**

- **Symbol-level** (preferred) — link a specific function, class, type, method, or
  constant to the spec. Use when the implementation maps to named code constructs.

  ```bash
  specd changes implementation add <name> --spec <specId> --file <path> --symbol "<SymbolName>"
  ```

  You may pass `--symbol` multiple times to link several symbols in one call. Re-adding
  the same `(specId, file)` with new symbols **merges** them into the existing link.

- **File-level** — link an entire file to the spec without naming specific symbols.
  Use only when no stable symbol exists (config files, templates, barrel exports,
  documentation) or when the file as a whole is the unit of implementation.
  ```bash
  specd changes implementation add <name> --spec <specId> --file <path>
  ```

**When to link:**

After finishing each task, before marking its checkbox done:

1. Identify which spec(s) the task's code fulfills
2. For each file touched, determine the concrete symbols introduced or modified
3. Add implementation links: one `add` call per `(specId, file)` pair with `--symbol`
   for each named construct
4. If a file implements parts of multiple specs, add separate links per spec
5. Mark the task checkbox done (`- [ ]` → `- [x]`) in the task-bearing artifact

**Review and resolve:**

```bash
specd changes implementation list <name>     # current tracking state
specd changes implementation review <name>   # + stale symbol diagnostics from code graph
specd changes implementation resolve <name> --file <path1>,<path2> # mark files fully reviewed
```

- `list` shows all tracked files (grouped by state) and confirmed links.
- `review` adds graph-based diagnostics: symbols that no longer exist in the code
  are flagged as stale.
- `resolve` marks one or more tracked files as fully reviewed. It supports a
  comma-separated list of paths for efficient bulk resolution.
- `ignore` is for files that do **not** belong to the change's implementation surface.
  It also supports comma-separated lists. Files with active confirmed links **cannot**
  be ignored.
  ```bash
  specd changes implementation ignore <name> --file <path1>,<path2>
  ```

**Security & Integrity Guard:** All implementation management commands (`add`, `resolve`,
`ignore`) validate that the target files exist on disk before updating the manifest.

**Out-of-scope guard:**

If links target specs outside the change's scope, the archive will block. Surface
these to the user immediately — do not silently add cross-scope links.

#### 6a. Analyze task dependencies

Before implementing anything, plan the execution order:

1. **Read all tasks** from the task-bearing artifact(s)
2. **Read all other change artifacts** (loaded in step 5) for context on dependencies
3. **Map dependencies** — for each task, determine which other tasks must complete first
4. **Group into waves** — tasks with no unresolved dependencies form wave 1
5. **Conflict resolution** — if two tasks in the same wave need to edit the same file,
   move one to the next wave instead.

Present the wave plan to the user before starting.

{{#if capabilities.agents}}
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
{{/if}}

#### 6c. Implement — sequential mode

**Use this mode when the `Agent` tool is NOT available, or when no parallelism is possible.**

For each task in order:

1. Implement the code
2. Update implementation tracking for the files touched by that task
3. **Immediately** mark it done (`- [ ]` → `- [x]`) in the task-bearing artifact
4. Check if the code touches areas outside the change's specs — if so, surface to the user

#### 6d. Common rules (both modes)

- If a task is ambiguous, consult the other change artifacts first.
- Mark tasks done in real time — don't batch checkbox updates.
- If you touch code outside the change's spec scope, surface it to the user.

### 7. Run exit hooks — immediately after last checkbox

**Trigger:** the moment the last `- [ ]` across ALL task-bearing artifacts is marked
`- [x]`, run the post-implementing hooks.

```bash
specd changes run-hooks <name> implementing --phase post
specd changes hook-instruction <name> implementing --phase post --format text
```

Follow guidance. If hooks fail (tests, lint), fix and re-run until they pass.

> Implementation complete. Run `/specd-verify <name>` to verify against scenarios.

**Stop.**
Do not invoke `/specd-verify` automatically; wait for explicit user confirmation.

## Session tasks

1. `Load state & hooks`
2. `Load context & artifacts`
3. For each task item: `Implement: <task summary>`
4. `Run exit hooks`

## Handling failed transitions

When `changes transition` fails, it renders a **Repair Guide** in text mode.
Follow the recommended repair command based on the target recommendation.

**Stop — do not continue after redirecting.**

## Returning to design

If during implementation you discover that the artifacts need changes, stop and explain
the issue. If the user agrees:

```bash
specd changes transition <name> designing --skip-hooks all
```

> Artifacts need revision. Run `/specd-design <name>` to update them.

**Stop — do not continue implementing.**

## Guardrails

- Mark tasks done in real time — don't batch checkbox updates
- The change artifacts are the source of truth for implementation approach
- If you touch code outside the change's spec scope, surface it to the user
- Never skip the pre-hook — it tells you what to read
- Any time a fresh `changes status` shows `review: required: yes`, stop
  implementation and redirect to `/specd-design <name>`
