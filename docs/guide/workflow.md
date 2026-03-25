# Change Lifecycle Guide

Every piece of work in specd is a **change**. A change tracks everything related to modifying one or more specs — the proposal, the spec files, the design, the implementation tasks, and the final archive record. This guide explains how changes move through their lifecycle, what each state means, and how approval gates, task completion checks, and hooks affect that progression.

## The lifecycle at a glance

```
                        ┌──────────────────────────────────────────────────────┐
                        │    redesign — transition back to designing            │
                        │    available from any active state except archiving   │
                        └──────────────────────────────────────────────────────┘
                                              ↑
drafting → designing ⇄ ready ─────────────────────────────────── → implementing ⇄ verifying → done ──────────────────────── → archivable → archiving
                        ↓                                                                       ↓
               pending-spec-approval                                                    pending-signoff
                        ↓                                                                       ↓
                  spec-approved ─────────────────────────────────→ implementing           signed-off
```

When neither approval gate is enabled, the main path is:

```
drafting → designing → ready → implementing → verifying → done → archivable → archiving
```

## States explained

### `drafting`

The initial state. A newly created change starts here before any work has been done.

- **What it means:** The change exists but has not entered the design phase.
- **What you do:** Nothing yet. Transition to `designing` when you are ready to start.
- **Transition out:** `specd change transition <name> designing`
- **What can block it:** Nothing — this transition is always allowed.

---

### `designing`

The active design and specification phase. This is where the bulk of artifact work happens.

- **What it means:** You are writing the proposal, specs, verify files, design, and tasks.
- **What you do:** Create and refine the five standard artifacts (proposal, specs, verify, design, tasks). Run `specd change status <name>` to check artifact progress.
- **Transition out:** `specd change transition <name> ready` once all required artifacts are complete and validated.
- **What can block it:** The `ready` step requires all artifacts listed in the schema's `requires` field (by default: proposal, specs, verify, design, tasks) to have `complete` status. The CLI reports which artifacts are still missing or in progress.

The `designing → designing` self-transition is valid — it records a checkpoint without changing state. This happens automatically when redesign invalidates an already-`designing` change.

---

### `ready`

All design artifacts are complete. The change is ready to hand off to implementation.

- **What it means:** Every required artifact has been written and validated. The change has been reviewed and is cleared for implementation.
- **What you do:** If the `approvals.spec` gate is enabled in `specd.yaml`, transition to `pending-spec-approval` to request approval. Otherwise, transition directly to `implementing`.
- **Transition out:** `implementing` (no gate), or `pending-spec-approval` (with gate), or back to `designing` (redesign).
- **What can block it:** The spec approval gate (if enabled) must be passed before proceeding to `implementing`.

---

### `pending-spec-approval`

The spec approval gate is active and a human reviewer has not yet approved the specs.

- **What it means:** specd has been asked to require human sign-off on the spec artifacts before implementation begins. The change is waiting for that approval.
- **What you do:** A reviewer runs `specd change approve-spec <name> --reason "..."` after inspecting the spec artifacts.
- **Transition out:** `spec-approved` after approval, or back to `designing` (redesign).
- **What can block it:** Approval must be recorded by a human. The gate cannot be bypassed.

This state only appears when `approvals.spec` is enabled in `specd.yaml`. See [Approval gates](#approval-gates).

---

### `spec-approved`

A human has reviewed and approved the spec artifacts.

- **What it means:** The specs have been signed off. Implementation may now proceed.
- **What you do:** Transition to `implementing`.
- **Transition out:** `implementing`, or back to `designing` (redesign).
- **What can block it:** If specs were modified after approval, the change is automatically invalidated and returns to `designing` — the approval is cleared.

---

### `implementing`

Active development is in progress.

- **What it means:** The implementation tasks are being worked through.
- **What you do:** Work through the task list in `tasks.md`, checking off items as you go (`- [x]`). Run `specd change status <name>` to see task progress.
- **Transition out:** `verifying` once all tasks are complete, or back to `designing` (redesign). The transition to `verifying` is blocked if any tasks remain incomplete.
- **What can block it:** The `taskCompletionCheck` defined in the schema. By default, any unchecked `- [ ]` line in `tasks.md` prevents advancing to `verifying`. The CLI reports "N/M tasks complete" when this gate is active.

---

### `verifying`

Implementation is complete. Verification scenarios are being run.

- **What it means:** All tasks are done. You are now confirming the implementation satisfies every scenario in `verify.md`.
- **What you do:** Run through every scenario in `verify.md`. Confirm each one passes by inspecting the code and running the relevant tests.
- **Transition out:** `done` when all scenarios pass, back to `implementing` if a scenario fails (the schema may clear artifact validations on this backward transition), or back to `designing` (redesign).
- **What can block it:** Nothing prevents the transition — it is up to you to judge readiness.

---

### `done`

Implementation and verification are complete.

- **What it means:** The change is finished from a development perspective. It can now be archived.
- **What you do:** If the `approvals.signoff` gate is enabled, transition to `pending-signoff`. Otherwise, transition to `archivable`.
- **Transition out:** `archivable` (no gate), `pending-signoff` (with gate), or back to `designing` (redesign).
- **What can block it:** The signoff gate (if enabled) must be passed before proceeding to `archivable`.

---

### `pending-signoff`

The signoff gate is active and a human reviewer has not yet signed off.

- **What it means:** The change requires final human sign-off before it can be archived. This gate is typically used for compliance or stakeholder review.
- **What you do:** A reviewer runs `specd change signoff <name> --reason "..."` after inspecting the completed work.
- **Transition out:** `signed-off` after sign-off, or back to `designing` (redesign).
- **What can block it:** Sign-off must be recorded by a human.

This state only appears when `approvals.signoff` is enabled in `specd.yaml`. See [Approval gates](#approval-gates).

---

### `signed-off`

A human has reviewed and signed off the completed change.

- **What it means:** The change has received its final human approval and may proceed to archiving.
- **What you do:** Transition to `archivable`.
- **Transition out:** `archivable`, or back to `designing` (redesign).
- **What can block it:** Nothing.

---

### `archivable`

The change is ready to be archived.

- **What it means:** All gates have been passed. The change is queued for the archive operation.
- **What you do:** Run `specd change archive <name>` to perform the archive.
- **Transition out:** `archiving` (via the archive command), or back to `designing` (redesign — last chance before permanent record).
- **What can block it:** Nothing prevents the transition to `archiving` at this point.

---

### `archiving`

The archive operation is in progress or has completed. This is the terminal state.

- **What it means:** Spec artifacts have been synced to the spec repository, metadata has been generated, and the change directory has been moved to the archive. The change is now a permanent historical record.
- **What you do:** Nothing — this is the end of the lifecycle. The archived change becomes an `ArchivedChange` record and is not modified further.
- **Transition out:** None. `archiving` is terminal. No transitions out are valid.

---

## Full transition table

| From                    | To                                                   |
| ----------------------- | ---------------------------------------------------- |
| `drafting`              | `designing`                                          |
| `designing`             | `ready`, `designing`                                 |
| `ready`                 | `implementing`, `pending-spec-approval`, `designing` |
| `pending-spec-approval` | `spec-approved`, `designing`                         |
| `spec-approved`         | `implementing`, `designing`                          |
| `implementing`          | `verifying`, `designing`                             |
| `verifying`             | `implementing`, `done`, `designing`                  |
| `done`                  | `archivable`, `pending-signoff`, `designing`         |
| `pending-signoff`       | `signed-off`, `designing`                            |
| `signed-off`            | `archivable`, `designing`                            |
| `archivable`            | `archiving`, `designing`                             |
| `archiving`             | _(terminal — no valid transitions)_                  |

---

## Redesign: going back to designing

Almost every state can transition back to `designing`. This is the **redesign path** — it is how you handle requirement changes, new information, or mistakes discovered mid-lifecycle.

To redesign from any active state:

```bash
specd change transition <name> designing
```

When a redesign transition occurs:

1. An `invalidated` event is appended to the change history with `cause: 'redesign'`.
2. A `transitioned` event rolling back to `designing` is appended.
3. Any active spec approval (`activeSpecApproval`) and signoff (`activeSignoff`) are cleared — they are no longer valid after specs have been reworked.
4. Artifact validation hashes are reset, requiring re-validation before the change can advance to `ready` again.

Redesign also happens automatically when spec IDs are updated (`cause: 'spec-change'`) or when artifact content changes after an approval was recorded (`cause: 'artifact-change'`).

The only state from which redesign is not possible is `archiving` — once archiving has begun, the change is a permanent record.

---

## Approval gates

specd supports two optional human-approval gates. Both are disabled by default.

### Spec approval gate

Blocks the transition from `ready` to `implementing` until a human approves the spec artifacts.

**Path when enabled:**

```
ready → pending-spec-approval → spec-approved → implementing
```

**Enabling in `specd.yaml`:**

```yaml
approvals:
  spec: true
```

**Performing the approval:**

```bash
specd change approve-spec add-auth --reason "Specs reviewed and approved — all requirements are clear"
```

The approver reviews the spec and verify artifacts in the change directory. The approval records a hash of those artifacts at the moment of approval. If any of those artifacts are subsequently modified, an `invalidated` event is appended automatically and the change returns to `designing`, clearing the approval.

### Signoff gate

Blocks the transition from `done` to `archivable` until a human signs off the completed work.

**Path when enabled:**

```
done → pending-signoff → signed-off → archivable
```

**Enabling in `specd.yaml`:**

```yaml
approvals:
  signoff: true
```

**Performing the signoff:**

```bash
specd change signoff add-auth --reason "Implementation reviewed — all scenarios verified"
```

Both gates can be enabled simultaneously:

```yaml
approvals:
  spec: true
  signoff: true
```

---

## Task completion gating

The transition from `implementing` to `verifying` is gated on task completion. This is enforced by the `taskCompletionCheck` defined in the schema.

The default schema (`@specd/schema-std`) checks for unchecked checkbox lines in `tasks.md`:

- **Incomplete pattern:** `^\s*-\s+\[ \]` — any `- [ ]` line blocks the transition.
- **Complete pattern:** `^\s*-\s+\[x\]` — `- [x]` lines count toward completion.

When you run `specd change transition <name> verifying` and tasks remain incomplete, the CLI reports the current progress:

```
3/5 tasks complete — transition to verifying is blocked
```

Mark tasks complete by changing `- [ ]` to `- [x]` in `tasks.md`. Once all tasks are checked, the transition is allowed.

One subtlety: `tasks.md` is also validated by artifact hashing. The schema normalises checkboxes before hashing — `- [x]` lines are converted back to `- [ ]` during hash computation so that checking off tasks does not trigger an approval invalidation. Checking off tasks is not a spec change; it is progress tracking.

---

## Hooks

Hooks let you attach automated actions or AI guidance to lifecycle transitions. They are defined in the schema's `workflow` section and optionally extended in `specd.yaml` via `schemaOverrides`.

### Pre and post hooks

- **Pre hooks** run before the change enters a step. If a pre hook fails, the transition is blocked.
- **Post hooks** run after the change enters a step. If a post hook fails, the transition is not rolled back.

### Hook types

| Type           | Description                                                                              |
| -------------- | ---------------------------------------------------------------------------------------- |
| `run:`         | A shell command executed in the project root. Non-zero exit code blocks a pre hook.      |
| `instruction:` | An AI context block injected into the agent context for the step. Not directly runnable. |

An `instruction:` hook provides guidance to an AI agent about what to do in that step. It is informational — it does not execute code. A `run:` hook executes a shell command and its exit code determines success or failure.

```yaml
workflow:
  - step: implementing
    hooks:
      pre:
        - id: run-lint
          run: pnpm lint
      post:
        - id: notify
          run: echo "Implementation started for {{change.name}}"
```

### Template variables

Hook `run:` commands support template variable substitution:

| Variable               | Value                                                        |
| ---------------------- | ------------------------------------------------------------ |
| `{{change.name}}`      | The change's slug name (e.g. `add-auth`)                     |
| `{{change.workspace}}` | The primary workspace of the change                          |
| `{{change.path}}`      | Absolute path to the change directory                        |
| `{{project.root}}`     | Absolute path to the project root (where `specd.yaml` lives) |

### Hook execution order

When a step is entered, schema-level hooks fire first, then any project-level hooks added via `schemaOverrides` in `specd.yaml`. Within each source, hooks run in the order they are declared.

---

## Drafting and discarding

Drafting and discarding are sidebars to the main lifecycle — they do not affect the change's lifecycle state.

### Drafting

Drafting shelves a change temporarily without abandoning it.

```bash
specd drafts move add-auth         # move to drafts/
specd drafts restore add-auth      # move back to changes/
```

A drafted change retains its current lifecycle state. When restored, it continues from where it left off. Drafting is useful when you need to context-switch to another change and want to keep the current work safely out of the way.

### Discarding

Discarding permanently abandons a change. A reason is required.

```bash
specd discard add-auth --reason "Approach superseded by add-oauth-flow"
```

A discarded change is moved to the discarded directory and is never archived. This is permanent — there is no restore from discard. You can optionally name the change or changes that supersede it:

```bash
specd discard add-auth --reason "Superseded" --superseded-by add-oauth-flow
```

---

## Archiving

Archiving is the final operation in the lifecycle. When you run:

```bash
specd change archive <name>
```

specd performs the following steps:

1. **Spec sync:** For every new spec file in the change's `specs/` directory, the file is copied to the spec repository. For every delta file in `deltas/`, the delta operations are applied to the existing spec in the repository.
2. **Metadata generation:** Spec metadata (`metadata.yaml`) is generated from the spec content — extracting titles, descriptions, requirements, and scenarios defined by the schema's `metadataExtraction` configuration.
3. **Archive record:** The change directory is moved to the archive. An `ArchivedChange` record is created with the change name, the archiving timestamp, and the spec IDs that were part of the change.
4. **History preserved:** The complete change history — all events including transitions, approvals, and artifact hashes — is preserved in the archive as a permanent audit trail.

After archiving, the specs in the spec repository reflect the new requirements introduced or modified by the change. Downstream consumers, other changes, and AI agents reading the spec repository will see the updated content.

The `archiving` state is terminal. Once a change reaches `archiving`, it cannot be transitioned to any other state. If you realise you need to rework something after archiving, you create a new change.

---

## Practical example: a full lifecycle with `/specd`

Here is a complete lifecycle walkthrough for a change that adds an authentication feature, showing what the agent does at each step. In practice, you drive this through your coding assistant using the `/specd` skill — the agent handles transitions, artifact creation, and validation automatically.

### 1. Starting — `/specd`

You open your coding assistant and type `/specd`. The skill shows the project status:

```
# specd

**Schema:** @specd/schema-std
**Workspaces:** default (8 specs)
**Active changes:** none
**Drafts:** none

No active changes. What would you like to work on?
```

You describe what you want: "I want to add login and logout authentication flows."

The skill suggests creating a change and invokes `/specd-new`.

### 2. Creation — `/specd-new`

The agent explores the existing specs, identifies the relevant capability paths, and creates the change:

```bash
specd change create add-auth --spec default:auth/login --spec default:auth/logout
```

State: `drafting` → the agent transitions to `designing` and invokes `/specd-design`.

### 3. Designing — `/specd-design`

This is the longest phase. The agent works through each artifact in dependency order:

**Step 3a: Proposal** — The agent writes `proposal.md`:

- Explains the motivation (why the project needs authentication)
- Describes the current behaviour (no auth exists)
- Outlines the proposed solution at a high level
- Lists the specs that will be created: `default:auth/login` and `default:auth/logout`
- Notes the impact on existing code (new middleware, new routes)

Once written, the agent validates the proposal and marks it complete.

**Step 3b: Specs** — The agent writes `spec.md` for each spec:

- `specs/default/auth/login/spec.md` — Requirements for login: valid credentials return a session token, invalid credentials return a generic error, sessions expire after 24 hours, rate limiting on the endpoint
- `specs/default/auth/logout/spec.md` — Requirements for logout: session is invalidated, subsequent requests are rejected

Each spec uses SHALL/MUST language and groups requirements under `### Requirement:` headings.

**Step 3c: Verify** — The agent writes `verify.md` for each spec:

- `specs/default/auth/login/verify.md` — WHEN/THEN scenarios for each login requirement: valid credentials, invalid credentials, expired sessions, rate limit exceeded
- `specs/default/auth/logout/verify.md` — WHEN/THEN scenarios for logout: successful invalidation, already-expired session

Each scenario mirrors a requirement from `spec.md`.

**Step 3d: Design** — The agent writes `design.md`:

- Reads the proposal, specs, and verify files
- Analyses the existing codebase to identify affected areas
- Lists new constructs: `AuthService`, `SessionStore`, login/logout route handlers, auth middleware
- Documents the approach, key decisions, and trade-offs
- Maps every requirement and scenario to a concrete implementation path

**Step 3e: Tasks** — The agent writes `tasks.md`:

- Derives discrete tasks from `design.md`
- Each task is a checkbox with indented context: which file, which symbol, what to change
- Groups tasks logically (e.g., "1. Session infrastructure", "2. Login flow", "3. Logout flow", "4. Tests")

Once all five artifacts are complete and validated, the agent transitions to `ready`, then to `implementing`.

### 4. Implementing — `/specd-implement`

The agent reads the compiled context for the `implementing` step — which includes the specs, design, and task list — and works through tasks one by one:

```
## 1. Session infrastructure
- [x] 1.1 Create SessionStore interface
      `src/auth/session-store.ts`: New interface — get, set, delete session
      Approach: In-memory store with TTL from design.md
      (Req: Sessions expire after 24 hours)

- [x] 1.2 Implement InMemorySessionStore
      `src/auth/in-memory-session-store.ts`: Implement SessionStore
      Approach: Map<string, Session> with setTimeout cleanup

## 2. Login flow
- [x] 2.1 Create login handler
      `src/auth/login.ts`: POST /login route handler
      ...
- [ ] 2.2 Add rate limiting middleware
      `src/auth/rate-limit.ts`: ...
```

The agent checks off each task as it completes the work. Pre/post hooks run at the step boundaries — for example, `pnpm test` runs after implementation.

Once all checkboxes are `[x]`, the agent transitions to `verifying`.

### 5. Verifying — `/specd-verify`

The agent reads each scenario from `verify.md` and confirms the implementation satisfies it:

```
### Requirement: Valid credentials
#### Scenario: Successful login
- WHEN a user submits valid credentials
- THEN they receive an authenticated session token
→ ✓ Verified: login handler returns JWT on valid credentials

#### Scenario: Invalid credentials
- WHEN a user submits invalid credentials
- THEN they receive a generic error with no field-specific information
→ ✓ Verified: handler returns 401 with generic message
```

If a scenario fails, the agent can transition back to `implementing` to fix the issue, then return to `verifying`.

Once all scenarios pass, the agent transitions to `done`.

### 6. Archiving — `/specd-archive`

The agent runs `specd change archive add-auth`. specd:

1. Syncs `spec.md` and `verify.md` into `specs/default/auth/login/` and `specs/default/auth/logout/`
2. Applies any delta files to existing specs
3. Generates metadata for each spec
4. Moves the change directory to `.specd/archive/`

The specs are now permanent. The change is a historical record.

### Redesign mid-lifecycle

If you discover during implementation that a requirement is wrong:

```
> The rate limiting should be per-IP, not global. Let's go back and fix the spec.
```

The agent transitions back to `designing`. This:

- Records an `invalidated` event with `cause: 'redesign'`
- Clears any active approvals
- Resets artifact validation hashes

The agent updates the spec, verify, design, and tasks, then works forward through the lifecycle again.

---

## Where to go next

- [Schema format reference](../schemas/schema-format.md) — define custom workflow steps, artifacts, hooks, and task completion checks for your project.
- [Configuration reference](../config/config-reference.md) — enable approval gates, configure workspaces, and add schema overrides.
- [CLI reference](../cli/cli-reference.md) — all `specd change`, `specd drafts`, `specd discard`, and `specd archive` commands.
- [Domain model](../core/domain-model.md) — the `Change`, `ChangeState`, `ChangeEvent`, and `ChangeArtifact` types returned by `@specd/core` use cases.
