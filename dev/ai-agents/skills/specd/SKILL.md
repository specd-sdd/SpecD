---
name: specd
description: Drive a specd change through its full lifecycle — from creation through designing, approval gates, implementation, verification, and archiving. Callable at any point; it detects where the change is and continues from there.
allowed-tools: Bash(node *), Bash(pnpm *), Read, Write, Edit, Grep, Glob, Agent, TaskCreate, TaskUpdate, TaskList, TaskGet
argument-hint: '[change-name] or leave empty to list/create'
---

# Agent: specd Lifecycle

Drives a change through the full specd lifecycle. Can be invoked at any point — it
inspects the current state and picks up where things left off.

```
drafting → designing → ready → [approval] → implementing ⇄ verifying → done → [signoff] → archivable → archived
```

---

## Instructions

IMPORTANT: Use `node packages/cli/dist/index.js` for all CLI commands (never bare `specd`).

### Step 0 — Set up task tracking

Before doing anything else, create a task list to track progress through the lifecycle.
This allows resuming across conversations and gives the user visibility into where
things stand.

Use `TaskCreate` to create one task per lifecycle phase, with dependencies:

1. **"Create change"** — status: pending
2. **"Design artifacts"** — status: pending, blockedBy: [1]
3. **"Spec approval"** — status: pending, blockedBy: [2]
4. **"Implement"** — status: pending, blockedBy: [3]
5. **"Verify"** — status: pending, blockedBy: [4]
6. **"Signoff"** — status: pending, blockedBy: [5]
7. **"Archive"** — status: pending, blockedBy: [6]

If tasks already exist (skill was re-invoked), use `TaskList` to find them and resume
from the first non-completed task. Update task status with `TaskUpdate` as you progress:

- `in_progress` when entering a phase
- `completed` when the phase transition succeeds

Artifact sub-tasks are created dynamically in Phase A after loading the schema — do not
create them upfront (the artifact list depends on the active schema).

### Step 1 — Resolve the target change and detect state

**If the user provided a change name** (as argument or in conversation):

```bash
node packages/cli/dist/index.js change status <name> --format json
```

If the command fails, the change doesn't exist — go to Step 2 (creation).

If it succeeds, read `state` from the JSON and jump to the matching phase:

| `state`                 | Go to                                       |
| ----------------------- | ------------------------------------------- |
| `drafting`              | Phase A — Designing (transition first)      |
| `designing`             | Phase A — Designing (resume artifact loop)  |
| `ready`                 | Phase B — Review stop + approval gate       |
| `pending-spec-approval` | Phase B — Approval gate (waiting for human) |
| `spec-approved`         | Phase C — Implementing                      |
| `implementing`          | Phase C — Implementing                      |
| `verifying`             | Phase D — Verifying                         |
| `done`                  | Phase E — Signoff gate                      |
| `pending-signoff`       | Phase E — Signoff gate (waiting for human)  |
| `signed-off`            | Phase F — Archiving                         |
| `archivable`            | Phase F — Archiving                         |

When resuming, mark all earlier tasks as `completed` and the current phase task as
`in_progress`.

**If no name was provided:**

```bash
node packages/cli/dist/index.js change list --format json
node packages/cli/dist/index.js drafts list --format json
```

- If there are active changes or drafts: present them with their states and ask the user
  which one to continue, or whether to create a new one.
- If a draft is selected, restore it first:
  ```bash
  node packages/cli/dist/index.js drafts restore <name>
  ```
- If there are none: ask the user for a name and proceed to creation.

### Step 2 — Create the change (if needed)

Ask the user for:

- **name** — kebab-case slug (e.g. `add-auth-flow`)
- **description** — one-liner explaining why
- **specIds** — which specs will be created or modified. If the user isn't sure yet,
  start with an empty list — specs can be added later via `change edit`.

```bash
node packages/cli/dist/index.js change create <name> --spec <id1> --spec <id2> --description "<desc>"
```

The change starts in `drafting`. Mark "Create change" task as `completed`. Continue to
Phase A.

---

## Phase A — Designing

Goal: understand the user's intent, author every artifact in the schema's DAG, and
transition to `ready`.

Mark the "Design artifacts" task as `in_progress`.

### A.1 Transition to designing (if in drafting)

```bash
node packages/cli/dist/index.js change transition <name> designing
```

### A.1b Discovery conversation

**CRITICAL: Do not start writing artifacts until you understand what the user wants.**

If the user has already explained their intent in detail (in this conversation or via
the change description), summarize your understanding and confirm it before proceeding.

If the intent is vague or minimal, have a discovery conversation. Ask about:

- **What problem are we solving?** What's broken, missing, or could be better?
- **What's the proposed approach?** High-level, not implementation details.
- **What's the scope?** Which areas of the codebase are affected? Which specs exist
  that might need changes? Use the CLI to explore:
  ```bash
  node packages/cli/dist/index.js spec list --format text --summary
  node packages/cli/dist/index.js graph search "<relevant terms>" --specs --limit 10
  ```
- **What code is affected?** Search for symbols and analyze impact on the codebase:
  ```bash
  node packages/cli/dist/index.js graph search "<relevant terms>" --symbols --limit 10
  node packages/cli/dist/index.js graph impact --symbol "<key symbol>" --direction downstream
  ```
  If specific files are already known to change:
  ```bash
  node packages/cli/dist/index.js graph impact --changes <file1> <file2> --format text
  ```
  Use the impact results to surface files, symbols, and risk levels that the user
  might not have considered. This prevents scope surprises during implementation.
- **Are there open questions?** Anything unresolved that might change the direction?

Keep this conversational — don't dump a questionnaire. Ask what you need to understand
the change, then summarize:

> Here's what I understand:
>
> - **Problem:** ...
> - **Approach:** ...
> - **Specs to create/modify:** ...
> - **Affected code:** ... (key files/symbols and risk level from impact analysis)
> - **Open questions:** ...
>
> Does this look right? Anything to add or change before I start writing?

Only proceed to A.2 after the user confirms.

If specIds need updating based on the discovery:

```bash
node packages/cli/dist/index.js change edit <name> --add-spec <id>
```

### A.2 Load schema, context, and hook instructions

First, load the active schema to understand the artifact DAG:

```bash
node packages/cli/dist/index.js schema show --format json
```

This returns:

- `artifacts` — array with `id`, `scope`, `optional`, `requires[]`, `delta`, `format`,
  `description`, `output`, `hasTaskCompletionCheck`
- `workflow` — array with `step`, `requires[]`

The `artifacts` array defines the DAG. Each artifact's `requires` lists which other
artifacts must be `complete` or `skipped` before it can be worked on. The order in the
array is the declaration order — the auto-resolver walks it in this order.

**Create artifact sub-tasks** from the schema. For each artifact in the array, create a
task:

- Subject: `"Write <id>"` (append `" (optional)"` if `optional: true`)
- blockedBy: tasks for each artifact in its `requires` list

Then load context. During designing, load only rules (requirements) — verification
scenarios are not needed yet:

```bash
node packages/cli/dist/index.js change context <name> designing --follow-deps --depth 1 --rules --constraints --format text
node packages/cli/dist/index.js change hook-instruction <name> designing --phase pre --format text
```

Read the context carefully — it contains project-level instructions and included specs.
Follow the pre-hook guidance.

**Note:** If dependencies are added during the artifact loop (via `change deps --add`),
reload the context to pick up the new dependency specs:

```bash
node packages/cli/dist/index.js change context <name> designing --follow-deps --depth 1 --rules --constraints --format text
```

### A.2b Choose review mode

Before entering the artifact loop, ask the user how they want to review artifacts:

> How would you like to review artifacts as they're written?
>
> 1. **Review each** — pause after every artifact for your feedback before continuing
> 2. **Review key ones** — pause only after artifacts with no `requires` and artifacts
>    with `scope: spec` (these shape everything downstream), auto-continue on the rest
> 3. **Auto-pilot** — write and validate all artifacts without stopping, review at the end

Store the choice for the duration of Phase A. Default to option 1 if the user doesn't
have a preference.

### A.3 Artifact authoring loop

Repeat until all artifacts are `complete` or `skipped`:

#### A.3a Check status

```bash
node packages/cli/dist/index.js change status <name> --format json
```

Parse the `artifacts` array. If every artifact has `effectiveStatus` of `complete` or
`skipped`, go to A.4. You can also check `lifecycle.nextArtifact` — if it is `null`,
all artifacts are done.

#### A.3b Get the next artifact's instructions

Use `lifecycle.nextArtifact` from the status response to know which artifact is next.
Then fetch its full instructions:

```bash
node packages/cli/dist/index.js change artifact-instruction <name> --format json
```

Auto-resolves the next artifact in the DAG whose `requires` are satisfied. Returns:

- `artifactId` — which artifact to work on
- `rulesPre` — composition rules to apply before writing
- `instruction` — what to write
- `template` — the resolved template content (scaffolding for new artifacts); `null` if
  the artifact has no template. Use for new artifacts; ignore for deltas (use `outlines`).
- `delta` — if non-null, the artifact supports deltas:
  - `formatInstructions` — how to write a delta for this format
  - `domainInstructions` — domain-specific delta guidance
  - `outlines` — structural outline of existing artifacts (for delta targeting)
- `rulesPost` — composition rules to apply after writing

Mark the corresponding artifact sub-task as `in_progress`.

#### A.3c Author the artifact

Follow the `instruction` from the previous step. Key decision points:

- **Optional artifact** (`optional: true` in schema): **you MUST ask the user** whether
  this artifact is needed for this change. Explain briefly what the artifact is for
  (from the instruction) and let the user decide. Never skip silently.
  If they agree to skip:

  ```bash
  node packages/cli/dist/index.js change skip-artifact <name> <artifactId>
  ```

- **Delta-capable artifact** (`delta: true` in schema) when `delta.outlines` has entries:
  the spec artifact already exists — write a delta file instead of a new file. Use the
  `formatInstructions` and `outlines` to target existing nodes.

- **New artifact**: write from scratch using the `instruction`. If `template` is
  non-null, use it as the scaffolding structure for the artifact content.

**Order:** rulesPre → instruction + template (+ delta guidance if applicable) → rulesPost.

#### A.3d Reconcile scope and dependencies

After writing each artifact, check if the content implies scope or dependency changes.
Each artifact can reveal that the change is bigger than expected.

**1. Discover affected code and specs.** Read the artifact you just wrote and extract
every reference to a system, module, adapter, configuration area, or domain concept.

First, use the code graph to find code that may be affected beyond what the artifact
explicitly mentions:

```bash
node packages/cli/dist/index.js graph search "<key concepts from artifact>" --symbols --limit 10
node packages/cli/dist/index.js graph impact --symbol "<modified symbol>" --direction downstream
```

If the artifact names specific files that will change, run a multi-file impact analysis:

```bash
node packages/cli/dist/index.js graph impact --changes <file1> <file2> --format text
```

Review the impact results — symbols and files flagged as affected may need their own
spec coverage or dependency registration. Surface any HIGH/CRITICAL risk findings to
the user.

Then cross-reference against existing specs:

```bash
node packages/cli/dist/index.js spec list --format text --summary
```

For each area mentioned in the artifact or surfaced by impact analysis, check whether
an existing spec covers it.
If so, determine whether the change **modifies** that spec (needs a delta or specId
addition) or merely **depends on** it (needs a `deps --add`). Present findings to
the user:

> The artifact mentions changes to `<area>`. There is an existing spec
> `<workspace>:<path>` covering this area.
>
> - Should I add it as a **modified spec** (adds specId, requires delta)?
> - Or register it as a **dependency** (for context only)?
> - Or neither?

**2. Check specIds alignment.** If the artifact references specs (new or modified) that
are not in the change's `specIds`, surface them to the user. If yes:

```bash
node packages/cli/dist/index.js change edit <name> --add-spec <workspace>:<path>
```

If the artifact dropped specs that were originally in scope, confirm removal:

```bash
node packages/cli/dist/index.js change edit <name> --remove-spec <workspace>:<path>
```

Always confirm with the user before executing — changing specIds invalidates approvals.

**3. Register declared dependencies.** For every spec that the change depends on (but
does not modify), register it so `CompileContext` can follow it for transitive context:

```bash
node packages/cli/dist/index.js change deps <name> <specId> --add <dep-spec-id>
```

If a dependency points to a spec that doesn't exist and isn't in the change, flag it to
the user — they may need to expand scope or defer to a separate change.

**4. If `change edit` reports `invalidated: true`**, the change was reset to `designing`
and approvals were cleared. Continue the artifact loop normally.

#### A.3e Validate

After writing each artifact and reconciling scope, validate the artifact just written:

```bash
node packages/cli/dist/index.js change validate <name> <specId> --artifact <artifactId>
```

Use `--artifact` to validate only the artifact you just wrote — this avoids noise from
unwritten artifacts and gives faster feedback. Run it for each spec in
`change.specIds` if the artifact has `scope: spec`.

If validation fails: read errors, fix the artifact, re-validate. Do not proceed until
the artifact validates.

Mark the artifact sub-task as `completed` when validation passes.

#### A.3f Review checkpoint

After validation passes, apply the review mode chosen in A.2b:

- **Review each:** Present the artifact to the user with a summary of what was written.
  Ask:

  > `<artifactId>` is ready. Want to review it, request changes, or continue?
  > Wait for the user's response. If they request changes, apply them and re-validate
  > before moving on.

- **Review key ones:** Pause if the artifact has no `requires` (it's a root artifact
  that shapes everything downstream) or has `scope: spec` (it persists beyond the
  change). For others, show a one-line summary and continue automatically.

- **Auto-pilot:** Show a one-line summary (artifact name + status) and continue
  immediately.

#### A.3g Propagate changes to related artifacts

When an artifact is modified after initial validation — whether from user feedback in
the review checkpoint, scope changes in A.3d, or any other reason — check whether the
change affects other artifacts that have already been written:

- **Downstream artifacts** (artifacts whose `requires` include the modified artifact):
  their content may be derived from or depend on the modified artifact. Review each
  downstream artifact that is already `complete` and determine if it needs updating.
  For example, if `proposal` is modified, check `specs`, `design`, and `tasks`.

- **Upstream artifacts** (artifacts that the modified artifact `requires`): the
  modification may reveal that an upstream artifact was incomplete or incorrect.
  For example, if writing `design` reveals that the `proposal` missed an affected
  area, update the proposal.

For each artifact that needs updating:

1. Make the edits
2. Re-validate with `change validate <name> <specId> --artifact <artifactId>`
3. If the update triggers further cascading changes, repeat this check

Do not silently skip this step. If in doubt about whether a change propagates, ask
the user.

#### A.3h Loop back to A.3a

### A.4 Pre-ready review with scenarios

Before transitioning, reload context with both rules and scenarios to verify that
the artifacts written during designing are consistent with the full spec context:

```bash
node packages/cli/dist/index.js change context <name> designing --follow-deps --depth 1 --rules --constraints --scenarios --format text
```

Review the artifacts against this context. If any inconsistency is found, fix the
artifact and re-validate before transitioning.

### A.4b Post-designing hooks

Run the post-designing hooks and follow any guidance:

```bash
node packages/cli/dist/index.js change run-hooks <name> designing --phase post
```

If hooks fail, fix the issue and re-run.

Then:

```bash
node packages/cli/dist/index.js change hook-instruction <name> designing --phase post --format text
```

Follow the guidance there.

### A.5 Transition to ready

```bash
node packages/cli/dist/index.js change hook-instruction <name> ready --phase pre --format text
```

Follow the guidance there.

```bash
node packages/cli/dist/index.js change transition <name> ready --skip-hooks source.post
node packages/cli/dist/index.js change status <name> --format json
```

Mark "Design artifacts" task as `completed`. Continue to Phase B.

---

## Phase B — Review and spec approval gate

Mark "Spec approval" task as `in_progress`.

### B.0 Load ready hook instructions

```bash
node packages/cli/dist/index.js change hook-instruction <name> ready --phase pre --format text
```

Follow the guidance there.

### B.1 Mandatory review stop

**ALWAYS stop here for user review, regardless of approval gate configuration.**

Present a summary of everything designed:

```bash
node packages/cli/dist/index.js change status <name> --format json
```

The response now includes a `lifecycle` object with `availableTransitions`, `blockers`,
`approvals`, `nextArtifact`, and `changePath`. Use these fields throughout the remaining
phases instead of making separate calls.

Show the user:

- All artifacts and their statuses
- The specIds in the change
- Any registered dependencies
- Available transitions and blockers (from `lifecycle`)

Then ask:

> **Design phase complete.** Here's what was produced:
>
> | Artifact | Status |
> | -------- | ------ |
> | ...      | ...    |
>
> Specs: `<specId1>`, `<specId2>`, ...
>
> Want to review any artifact before proceeding to implementation?
> You can also request changes — I'll re-enter the design loop.
> When you're satisfied, say **"continue"** to move to implementation.

**Do NOT proceed until the user explicitly confirms.** If the user requests changes,
return to Phase A (the artifact loop) to make edits and re-validate. When editing an
artifact, apply the propagation check from A.3g — changes may cascade to upstream
and downstream artifacts.

### B.1b Run ready post hooks

After the user confirms the review:

```bash
node packages/cli/dist/index.js change run-hooks <name> ready --phase post
```

If hooks fail, fix the issue and re-run.

```bash
node packages/cli/dist/index.js change hook-instruction <name> ready --phase post --format text
```

Follow the guidance there.

### B.2 Spec approval gate

After the user confirms, check if the approval gate is active using `lifecycle.approvals`
from the status response obtained in B.1. No separate `config show` call is needed.

**If `lifecycle.approvals.spec` is `false`:** the gate is inactive — transition directly:

```bash
node packages/cli/dist/index.js change hook-instruction <name> implementing --phase pre --format text
```

Follow the guidance there.

```bash
node packages/cli/dist/index.js change transition <name> implementing --skip-hooks source.post
```

Mark "Spec approval" task as `completed`. Continue to Phase C.

**If `approvals.spec: true`:** `TransitionChange` automatically reroutes to
`pending-spec-approval`. Run hooks for the new state:

```bash
node packages/cli/dist/index.js change hook-instruction <name> pending-spec-approval --phase pre --format text
```

Follow the guidance there. The agent **cannot** approve — approval is an external
action that must happen outside this skill. Inform the user:

> This change requires spec approval before implementation can begin.
> Run externally: `specd change approve spec <name> --reason "<rationale>"`
>
> Re-invoke `/specd-design` after approving to continue.

Run post hooks before stopping:

```bash
node packages/cli/dist/index.js change run-hooks <name> pending-spec-approval --phase post
node packages/cli/dist/index.js change hook-instruction <name> pending-spec-approval --phase post --format text
```

Follow the guidance there. Leave "Spec approval" task as `in_progress` and **stop**.

**If the change is already in `pending-spec-approval`:** run pre hooks, remind the user
that approval is pending and must be done externally, run post hooks. **Stop.**

**If the change is in `spec-approved`:** run hooks for the `spec-approved` state:

```bash
node packages/cli/dist/index.js change hook-instruction <name> spec-approved --phase pre --format text
```

Follow the guidance there. Run post hooks, then transition to implementing:

```bash
node packages/cli/dist/index.js change run-hooks <name> spec-approved --phase post
node packages/cli/dist/index.js change hook-instruction <name> spec-approved --phase post --format text
```

Follow the guidance there.

```bash
node packages/cli/dist/index.js change hook-instruction <name> implementing --phase pre --format text
```

Follow the guidance there.

```bash
node packages/cli/dist/index.js change transition <name> implementing --skip-hooks source.post
```

Mark "Spec approval" task as `completed`. Continue to Phase C.

---

## Phase C — Implementing

Mark "Implement" task as `in_progress`.

### C.1 Load schema, context, and hook instructions

First, identify the task-tracking artifact(s) from the schema:

```bash
node packages/cli/dist/index.js schema show --format json
```

Find every artifact where `hasTaskCompletionCheck` is `true` — those are the files with
trackable checkboxes. Note their `output` field to know the filename(s).

Then load context and hook instructions:

```bash
node packages/cli/dist/index.js change context <name> implementing --follow-deps --depth 1 --rules --constraints --format text
node packages/cli/dist/index.js change hook-instruction <name> implementing --phase pre --format text
```

**Follow the pre-hook instructions carefully** — they tell you which change artifacts to
read and what role each one plays. Read all of them from the change directory before
starting work.

### C.2 Work through the implementation

Work through tasks one by one. **After completing each task, you MUST immediately mark it as
done (`- [ ]` → `- [x]`) in the task-tracking artifact(s) identified in C.1 before
starting the next task.** Do not batch checkbox updates — the file must reflect progress
in real time so the user (and the transition gate) can see what has been done.

Use the change artifacts as your references (as directed by the hook instructions).
The compiled context contains the spec content — use it alongside the change artifacts.

If any task is ambiguous, consult the design artifact first — it is the source of truth
for implementation approach. If still unclear, ask the user before proceeding.

### C.2b Scope reconciliation during implementation

While implementing, you may discover that the actual code changes touch areas not
covered by the change's specs, or that specs originally in scope are not actually
affected. This is normal — designing is speculative, implementation is concrete.

**After completing each task** (and updating the checkbox), briefly assess whether the
code you just wrote touches modules, adapters, or domain concepts outside the change's
current specIds or dependencies. If it does:

1. Cross-reference against existing specs:

   ```bash
   node packages/cli/dist/index.js spec list --format text --summary
   ```

2. Surface findings to the user:

   > While implementing `<task>`, I touched `<module/area>`. This is covered by spec
   > `<workspace>:<path>` which is not in this change's scope.
   >
   > - Should I **add it as a modified spec**? (requires going back to designing for a delta)
   > - Or register it as a **dependency**? (context only)
   > - Or is this incidental and can be ignored?

3. If the user wants to add a modified spec, this requires returning to designing:

   ```bash
   node packages/cli/dist/index.js change edit <name> --add-spec <workspace>:<path>
   ```

   Note: `change edit` may reset the state to `designing` and invalidate approvals.
   The artifact loop must run again for the new spec's artifacts. Inform the user of
   this cost before proceeding.

4. If it's just a dependency:

   ```bash
   node packages/cli/dist/index.js change deps <name> <specId> --add <dep-spec-id>
   ```

5. If the implementation reveals that a spec in the change is **not actually being
   modified** (the design was wrong about scope), flag it:
   > Spec `<specId>` is in this change but I haven't needed to modify anything it
   > covers. Should I remove it from scope?

Do not block implementation for minor scope questions — batch them if several arise
in quick succession and present them together. But do surface them before transitioning
to verifying, as verification checks against the declared scope.

### C.3 Run hooks

```bash
node packages/cli/dist/index.js change run-hooks <name> implementing --phase post
```

If hooks fail, fix the issue and re-run.

Then:

```bash
node packages/cli/dist/index.js change hook-instruction <name> implementing --phase post --format text
```

Follow the guidance there.

### C.4 Transition to verifying

The transition enforces task completion — if any artifact with `taskCompletionCheck`
has incomplete items, it will fail:

```bash
node packages/cli/dist/index.js change hook-instruction <name> verifying --phase pre --format text
```

Follow the guidance there.

```bash
node packages/cli/dist/index.js change transition <name> verifying --skip-hooks source.post
```

If it fails with `InvalidStateTransitionError`, show which items are still incomplete
and continue working.

Mark "Implement" task as `completed`. Continue to Phase D.

---

## Phase D — Verifying

Mark "Verify" task as `in_progress`.

### D.1 Load context and hook instructions

```bash
node packages/cli/dist/index.js change context <name> verifying --follow-deps --depth 1 --scenarios --format text
node packages/cli/dist/index.js change hook-instruction <name> verifying --phase pre --format text
```

### D.2 Verify against scenarios

Read the verification artifacts for each spec in the change. For each scenario:

- Inspect the implementation
- Run relevant tests
- Confirm GIVEN/WHEN/THEN conditions are satisfied

### D.3 Verification result

**If all scenarios pass:**

Run the post-verifying hooks and follow any guidance:

```bash
node packages/cli/dist/index.js change run-hooks <name> verifying --phase post
```

If hooks fail, fix the issue and re-run.

Then:

```bash
node packages/cli/dist/index.js change hook-instruction <name> verifying --phase post --format text
```

Follow the guidance there.

Transition to done:

```bash
node packages/cli/dist/index.js change hook-instruction <name> done --phase pre --format text
```

Follow the guidance there.

```bash
node packages/cli/dist/index.js change transition <name> done --skip-hooks source.post
```

Mark "Verify" task as `completed`. Continue to Phase E.

**If any scenario fails:** loop back to implementing — the transition clears artifact
validation state for implementing's requires:

```bash
node packages/cli/dist/index.js change transition <name> implementing
```

Mark "Verify" task back to `in_progress`. Re-mark "Implement" task as `in_progress`.
Inform the user which scenarios failed and what needs fixing. Return to Phase C.

---

## Phase E — Signoff gate

Mark "Signoff" task as `in_progress`.

### E.1 Done state hooks

Run hooks for the `done` state:

```bash
node packages/cli/dist/index.js change hook-instruction <name> done --phase pre --format text
```

Follow the guidance there.

Check if the gate is active. Run `change status <name> --format json` and read
`lifecycle.approvals.signoff` from the response. No separate `config show` call is needed.

**If `lifecycle.approvals.signoff` is `false`:**

Run done post hooks:

```bash
node packages/cli/dist/index.js change run-hooks <name> done --phase post
node packages/cli/dist/index.js change hook-instruction <name> done --phase post --format text
```

Follow the guidance there. Then transition directly:

```bash
node packages/cli/dist/index.js change transition <name> archivable --skip-hooks source.post
```

Run hooks for the `archivable` state:

```bash
node packages/cli/dist/index.js change hook-instruction <name> archivable --phase pre --format text
```

Follow the guidance there.

```bash
node packages/cli/dist/index.js change run-hooks <name> archivable --phase post
node packages/cli/dist/index.js change hook-instruction <name> archivable --phase post --format text
```

Follow the guidance there. Mark "Signoff" task as `completed`. Continue to Phase F.

**If `approvals.signoff: true`:** `TransitionChange` reroutes to `pending-signoff`.

Run done post hooks, then hooks for the new state:

```bash
node packages/cli/dist/index.js change run-hooks <name> done --phase post
node packages/cli/dist/index.js change hook-instruction <name> done --phase post --format text
node packages/cli/dist/index.js change hook-instruction <name> pending-signoff --phase pre --format text
```

Follow the guidance there. Inform the user:

> This change requires signoff before archiving.
> A human must run: `specd change approve signoff <name> --reason "<rationale>"`
>
> Re-invoke this skill after signing off to continue.

```bash
node packages/cli/dist/index.js change run-hooks <name> pending-signoff --phase post
node packages/cli/dist/index.js change hook-instruction <name> pending-signoff --phase post --format text
```

Follow the guidance there. Leave "Signoff" task as `in_progress` and **stop**.

**If in `pending-signoff`:** run pre hooks, remind the user, run post hooks. **Stop.**

**If in `signed-off`:** run hooks for the `signed-off` state:

```bash
node packages/cli/dist/index.js change hook-instruction <name> signed-off --phase pre --format text
```

Follow the guidance there. Run post hooks, then transition:

```bash
node packages/cli/dist/index.js change run-hooks <name> signed-off --phase post
node packages/cli/dist/index.js change hook-instruction <name> signed-off --phase post --format text
```

Follow the guidance there.

```bash
node packages/cli/dist/index.js change transition <name> archivable --skip-hooks source.post
```

```bash
node packages/cli/dist/index.js change hook-instruction <name> archivable --phase pre --format text
```

Follow the guidance there.

```bash
node packages/cli/dist/index.js change run-hooks <name> archivable --phase post
node packages/cli/dist/index.js change hook-instruction <name> archivable --phase post --format text
```

Follow the guidance there. Mark "Signoff" task as `completed`. Continue to Phase F.

---

## Phase F — Archiving

Mark "Archive" task as `in_progress`.

### F.1 Pre-archive review

Before archiving, review the delta files to ensure specs accurately reflect what was
built. Load the archiving hook instructions:

```bash
node packages/cli/dist/index.js change hook-instruction <name> archiving --phase pre --format text
```

Follow the guidance found there.

### F.2 Mandatory stop — ask before archiving

**ALWAYS stop here and ask the user for explicit confirmation before archiving.**
Archiving is destructive and irreversible — it merges deltas into project specs and
moves the change to `archive/`. The user must make this decision.

> **Ready to archive `<name>`.** This will merge all deltas into your project specs
> and move the change to the archive. This cannot be undone.
>
> Say **"archive"** to proceed, or request changes first.

**Do NOT proceed until the user explicitly confirms.**

### F.3 Archive

```bash
node packages/cli/dist/index.js change archive <name> --format json
```

This atomically:

1. Runs pre-archive hooks
2. Merges deltas into project specs
3. Moves the change to `archive/`
4. Runs post-archive hooks
5. Generates `.specd-metadata.yaml` for modified specs

### F.4 Post-archive

Read the archive result. If `postHookFailures` is non-empty, report them to the user.

Run the post-archiving hooks:

```bash
node packages/cli/dist/index.js change run-hooks <name> archiving --phase post
```

If hooks fail, fix the issue and re-run.

Then load post-archive instructions:

```bash
node packages/cli/dist/index.js change hook-instruction <name> archiving --phase post --format text
```

Follow the guidance there.

### F.5 LLM-optimized metadata (if enabled)

Check whether the project uses LLM-optimized context:

```bash
node packages/cli/dist/index.js config show --format json
```

If `llmOptimizedContext` is `true`, the deterministic metadata generated during
archiving (Step F.3) needs LLM optimization for the specs modified by this change.

Invoke the `specd-spec-metadata` skill for each spec in the change's `specIds`:

```
/specd-spec-metadata <specId>
```

This adds keywords, cleans rules/constraints/scenarios, and sets `generatedBy: agent`.
Run one spec at a time — the skill handles the full generate + optimize cycle.

If `llmOptimizedContext` is `false` or absent, skip this step — the deterministic
metadata from the archive command is sufficient.

### F.6 Complete

Mark "Archive" task as `completed`.

Report the final result to the user. The lifecycle is complete.

---

## State detection cheatsheet

When this skill is invoked, always run status first. Here's how to handle every state:

| State                   | What to do                                                     | Task status                              |
| ----------------------- | -------------------------------------------------------------- | ---------------------------------------- |
| _(doesn't exist)_       | Create (Step 2) → Phase A                                      | Create all tasks                         |
| `drafting`              | Transition to designing → Phase A                              | Create → completed, Design → in_progress |
| `designing`             | Check artifacts — resume loop or transition to ready → Phase A | Design → in_progress                     |
| `ready`                 | **Stop for user review** → check approval → Phase B            | Approval → in_progress                   |
| `pending-spec-approval` | Tell user to approve → **stop**                                | Approval → in_progress                   |
| `spec-approved`         | Transition to implementing → Phase C                           | Approval → completed                     |
| `implementing`          | Continue working → Phase C                                     | Implement → in_progress                  |
| `verifying`             | Run scenarios → Phase D                                        | Verify → in_progress                     |
| `done`                  | Check signoff config → Phase E                                 | Signoff → in_progress                    |
| `pending-signoff`       | Tell user to sign off → **stop**                               | Signoff → in_progress                    |
| `signed-off`            | Transition to archivable → Phase F                             | Signoff → completed                      |
| `archivable`            | Archive → Phase F                                              | Archive → in_progress                    |

For `pending-spec-approval` and `pending-signoff`: these require human action. The agent
cannot proceed — inform the user and stop. When the user re-invokes the skill after
approving, the skill detects the new state and continues.

---

## Cross-cutting: Conversational scope detection

**This applies at all times during the lifecycle, not just within a specific phase.**

Throughout the conversation — whether inside a lifecycle phase or during free discussion
between phases — the user may make statements, decisions, or observations that have
spec implications. Examples:

- "Actually, we should also handle the case where X happens" → may need a new spec or
  a delta to an existing one
- "Let's not touch the auth layer after all" → a spec may need to be removed from scope
- "I realized this also affects how Y works" → a dependency or modified spec may be needed
- "We decided in the team meeting to change the approach to Z" → may invalidate current
  specs or require new ones

**When you detect a statement with spec implications:**

1. **Identify the implication.** What area, module, or domain concept is affected? Is it
   already covered by a spec?

2. **Cross-reference against existing specs:**

   ```bash
   node packages/cli/dist/index.js spec list --format text --summary
   ```

3. **Surface it explicitly to the user.** Do not silently absorb the information — make
   the spec implication visible:

   > What you just described affects `<area>`. I see a few possibilities:
   >
   > - **New spec needed:** There's no existing spec covering `<area>`. Should we create
   >   one? (This would expand the change's scope.)
   > - **Existing spec affected:** `<workspace>:<path>` covers this area. Should I add
   >   it to this change as a modified spec or dependency?
   > - **Scope reduction:** If this means we're no longer touching `<specId>`, should I
   >   remove it from the change?
   > - **Separate change:** If this is big enough, it might warrant its own change
   >   rather than expanding this one.

4. **Act on the user's decision.** Use the appropriate CLI commands (`change edit`,
   `change deps`, `change create`) as needed. If adding a spec requires going back to
   designing, inform the user of the lifecycle cost.

5. **If no active change exists** and the conversation reveals a spec-worthy decision,
   note it to the user:

   > That sounds like it could warrant a spec. Want me to start a new change for it?

**Key principle:** The LLM is the last line of defense against undocumented decisions.
If something the user says would change system behavior, constraints, or architecture,
and there is no spec for it, that is worth surfacing — even if the user didn't ask.

---

## Notes

- **Schema drives everything.** Never assume specific artifact names or DAG structure.
  Always read from `schema show --format json` and `artifact-instruction --format json`.
  Different schemas may have completely different artifacts, dependencies, and workflow
  steps.
- **Never skip validation** in Phase A. The validation step marks artifacts `complete`.
- **Deltas, not rewrites.** When `delta: true` and the artifact already exists, always
  produce a delta file. The `artifact-instruction` response tells you via the `delta`
  field.
- **Ask before skipping** optional artifacts.
- **One spec at a time.** When writing artifacts with `scope: spec` that cover multiple
  spec IDs, write and validate one spec at a time.
- **Open questions.** If an artifact has unresolved questions affecting downstream work,
  surface them to the user before proceeding.
- **validate** supports `--all` to validate every specId in the change at once:
  `change validate <name> --all`. Use this for final validation before transitions.
  During the artifact loop, use `--artifact <artifactId>` to validate only the artifact
  just written: `change validate <name> <specId> --artifact <artifactId>`.
- **Approval gates are human-only.** The agent cannot approve — it must tell the user.
- **The implementing ⇄ verifying loop** can repeat any number of times. Each return to
  implementing clears validation state for the implementing step's required artifacts.
  Update task statuses accordingly.
- **Drafts.** If the user needs to pause, they can draft the change at any time:
  `change draft <name>`. When re-invoked, the skill checks `drafts list` and offers
  to restore. Task state is preserved across conversations.
- **Task tracking is for visibility.** The source of truth is always `change status` —
  tasks are a convenience for the user and for cross-session resumption. If tasks and
  change status disagree, trust `change status`.
