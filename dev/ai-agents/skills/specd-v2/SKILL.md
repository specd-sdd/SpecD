---
name: specd-v2
description: Drive a specd change through its full lifecycle — from creation through designing, approval gates, implementation, verification, and archiving. Callable at any point; it detects where the change is and continues from there. (Split-phase version)
allowed-tools: Bash(node *), Bash(pnpm *), Read, Write, Edit, Grep, Glob, Agent, TaskCreate, TaskUpdate, TaskList, TaskGet
argument-hint: '[change-name] or leave empty to list/create'
---

# Agent: specd Lifecycle (v2 — split phases)

Drives a change through the full specd lifecycle. Can be invoked at any point — it
inspects the current state and picks up where things left off.

```
drafting → designing → ready → [approval] → implementing ⇄ verifying → done → [signoff] → archivable → archived
```

## How this skill works

This skill is an **orchestrator**. Each lifecycle phase is defined in its own file
inside this skill's directory. When entering a phase, you MUST read the corresponding
file before executing it. Never rely on memory of a phase file you read earlier.

| Phase            | File to read            |
| ---------------- | ----------------------- |
| A — Designing    | `phase-designing.md`    |
| B — Approval     | `phase-approval.md`     |
| C — Implementing | `phase-implementing.md` |
| D — Verifying    | `phase-verifying.md`    |
| E — Signoff      | `phase-signoff.md`      |
| F — Archiving    | `phase-archiving.md`    |

Cross-cutting concerns (scope detection, propagation) are in `cross-cutting.md`.
Read it at the start — it applies throughout the entire lifecycle.

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

**CRITICAL: Before entering any phase, read the corresponding phase file.** Use the
`Read` tool on the file listed in the table above (e.g., `phase-designing.md`).

**If no name was provided:**

```bash
node packages/cli/dist/index.js change list --format json
node packages/cli/dist/index.js drafts list --format json
```

- If there are active changes or drafts: present them with their states and ask the user
  which one to continue, or whether to start something new.
- If a draft is selected, restore it first:
  ```bash
  node packages/cli/dist/index.js drafts restore <name>
  ```
- If the user wants something new (or there are no existing changes): proceed to Step 2.

### Step 2 — Understand what the user wants (discovery before creation)

**Do NOT immediately ask for a change name, description, or specIds.** First, understand
what the user wants to accomplish. This may require a conversation:

- If the user already explained their intent clearly (in the invocation arguments or
  prior messages), summarize your understanding and confirm before creating the change.
- If the intent is vague or you need more context, **explore first**:
  - Ask what problem they're solving and why
  - Investigate the codebase if relevant (`spec list`, code search, etc.)
  - Discuss the approach at a high level
  - Surface relevant existing specs that might be affected

Let the conversation develop naturally. Don't follow a questionnaire — ask what you
need to understand the change.

**When the picture is clear enough**, propose the change:

> Based on our discussion, here's what I'd suggest:
>
> - **Name:** `<kebab-case-slug>`
> - **Description:** `<one-liner>`
> - **Initial specs:** `<workspace:path>, ...` (or none yet — we can add them during designing)
>
> Want me to create this change?

Wait for the user to confirm or adjust before creating.

**CRITICAL: Spec IDs must always use the `workspace:capability-path` format** (e.g.
`core:core/config`, `cli:cli/spec-metadata`, `default:_global/architecture`). Never use
bare paths like `core/config` — they will be rejected. To find the correct ID, run
`spec list --format text --summary` and use the IDs from the PATH column. For new specs that don't
exist yet, **ask the user** which workspace they belong to.

It's fine to create a change with no specs — they can be added later via `change edit`
during the designing phase as the scope becomes clearer.

```bash
node packages/cli/dist/index.js change create <name> --spec <workspace:path> --description "<desc>" --format json
```

The JSON response includes `changePath` — the absolute path to the change directory.
Store it — all artifacts (proposal.md, design.md, tasks.md, deltas/) are written there.

```json
{ "result": "ok", "name": "<name>", "state": "drafting", "changePath": "/abs/path/..." }
```

Mark "Create change" task as `completed`.

**Read `cross-cutting.md` now**, then read `phase-designing.md` and continue to Phase A.

---

## Phase transitions — what to do between phases

Every time you finish a phase and are about to enter the next one:

1. **Read the next phase file** — use the `Read` tool on the corresponding file from the
   table above. Do NOT proceed from memory.
2. **Update task status** — mark the completed phase's task as `completed` and the new
   phase's task as `in_progress`.
3. **Follow the phase file's instructions** from the beginning — each phase file starts
   with context loading and hook instructions that MUST be executed.

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

## Notes

- **Always use the CLI to discover and read specs.** Never guess filesystem paths to
  spec files. Use `spec list --format text --summary` to discover specs,
  `spec show <specId> --format json` to read spec content, and
  `spec metadata <specId> --format json` to read metadata. The CLI resolves workspace
  paths, prefixes, and storage locations — reading from disk directly will fail if you
  guess the wrong path.
- **Spec IDs are always `workspace:capability-path`.** Every `--spec`, `--add-spec`,
  `--remove-spec`, and positional `<specPath>` argument MUST use the fully-qualified
  format: `workspace:capability-path` (e.g. `core:core/config`, `cli:cli/spec-metadata`,
  `default:_global/architecture`). Never use bare paths like `core/config` or
  `_global/architecture`. When unsure of the correct workspace, run
  `node packages/cli/dist/index.js spec list --format text --summary` and use the IDs from the
  PATH column. For new specs that don't exist yet, **ask the user** which workspace they
  belong to — never guess. Each workspace has a `prefix` that appears at the start of
  its spec paths (e.g. workspace `core` has prefix `core`, so specs are `core:core/<name>`).
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
