---
name: specd-design
description: Write the next artifact for a specd change (or all artifacts in fast-forward mode).
allowed-tools: Bash(node *), Bash(pnpm *), Read, Write, Edit, Grep, Glob, Agent, TaskCreate, TaskUpdate
argument-hint: '<change-name> [--ff]'
---

# specd-design — write artifacts

Read `.specd/skills/shared.md` before doing anything.

## What this does

Writes ONE artifact for the change, validates it, and stops. If the user says
"all at once", or passes `--ff`, writes ALL remaining artifacts
without stopping (fast-forward mode).

## Steps

### 1. Load change state

```bash
node packages/cli/dist/index.js change status <name> --format json
```

If state is `drafting` or `designing`, transition to `designing`:

```bash
node packages/cli/dist/index.js change run-hooks <name> designing --phase pre
node packages/cli/dist/index.js change hook-instruction <name> designing --phase pre --format text
```

Follow guidance.

```bash
node packages/cli/dist/index.js change transition <name> designing --skip-hooks all
```

If state is not `drafting` or `designing`, this is the wrong skill. Suggest based on state:

- `implementing` / `spec-approved` → `/specd-implement <name>`
- `verifying` → `/specd-verify <name>`
- `done` / `signed-off` → `/specd-verify <name>` (handles done→archivable transition)
- `pending-signoff` → "Signoff pending. Run: `specd change approve signoff <name> --reason ...`"
- `archivable` → `/specd-archive <name>`
- `pending-spec-approval` → "Approval pending. Run: `specd change approve spec <name> --reason ...`"
- `ready` → Review artifacts, then `/specd-implement <name>` if approved

**Stop — do not continue.**

Store `lifecycle.changePath` — artifacts are written there.
Store `specIds` from the response — you need them for validation.
Check `artifacts` array — if some are already `complete`, you're resuming mid-design.

### 2. Check workspace ownership

```bash
node packages/cli/dist/index.js config show --format json
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

**Continuous guard — applies throughout the entire design session:**

ReadOnly workspaces are off-limits for both specs AND code. You must NOT:

- Write or modify specs belonging to a readOnly workspace
- Design artifacts that prescribe changes to code under a readOnly `codeRoot`
- Include tasks, proposals, or instructions that require modifying files under a readOnly `codeRoot`

If during artifact writing you realize the design needs changes in a readOnly workspace's
code or specs, **stop and surface it to the user** — do not write the artifact assuming
those changes can be made. The user must either change the ownership in `specd.yaml` or
adjust the design to work within owned/shared boundaries.

### 3. Load schema

```bash
node packages/cli/dist/index.js schema show --format json
```

Note the artifact DAG from the `artifacts` array.

### 4. Load context

```bash
node packages/cli/dist/index.js change context <name> designing --follow-deps --depth 1 --rules --constraints --format text
```

**MUST follow** — project context entries are binding directives. If lazy mode returns
summary specs, evaluate each one and load any that are relevant to the artifact you're
about to write (see `shared.md` — "Processing `change context` output").

#### Use code graph to enrich context

When the change targets specific code areas, use the graph to find related symbols and
assess complexity — this is mandatory, not optional:

```bash
node packages/cli/dist/index.js graph search "<keyword from spec>" --specs --format json
node packages/cli/dist/index.js graph hotspots --min-risk MEDIUM --format json
```

Graph search helps you discover specs you might need to load as context. Hotspots help
you identify high-coupling symbols that the design should handle carefully — if a task
will modify a CRITICAL hotspot, the design should note the risk and suggest extra testing.

When writing the **design** or **tasks** artifact, if you know specific files or symbols
that will be modified, check their impact:

```bash
node packages/cli/dist/index.js graph impact --symbol "<name>" --direction downstream --format json
```

Include impact findings in the design artifact so the implementer knows what's at stake.

#### Load exploration context

Check if `<changePath>/.specd-exploration.md` exists. If it does, read it — it contains
the full discovery context from `/specd-new` (problem statement, approach, decisions,
affected areas, codebase observations, etc.). Use it to inform every artifact you write.

**Staleness check — mandatory.** The exploration file is a snapshot from a past
conversation. Code, specs, and project state may have changed since it was written.
Before trusting its content:

- Verify that **file paths and spec IDs** mentioned in the exploration still exist
  (quick glob/grep). If something was renamed or removed, note the discrepancy.
- Cross-check **design decisions and agreements** against current code — if the codebase
  already moved in a different direction, flag it to the user rather than following
  the outdated plan blindly.
- If the exploration references **specific behavior or patterns** in code, spot-check
  them — they may have been refactored.

If you find significant drift, briefly summarize what changed and ask the user whether
the original plan still holds or needs adjustment before writing artifacts.

If the file does not exist, **you almost certainly lack sufficient context to write
artifacts.** The change name and one-line description from `change status` are NOT
enough — they are too vague to make design decisions.

**Do NOT proceed to writing artifacts based only on the change name and description.**
Instead, stop and tell the user you're missing the exploration context. Then have a
natural conversation to fill in the gaps — don't fire off a list of questions like a
questionnaire. Start with one good question based on what you can infer from the change
name, description, and specs. Let the user's answers guide your follow-ups. Keep it
flowing until you understand the problem, the approach, what's affected, and any
decisions or constraints. Once you have enough, write a `<changePath>/.specd-exploration.md` yourself
to capture what you learned, then continue with step 5.

### 5. Show context summary

Before asking the user about review mode, show a brief summary so they know what's
about to happen:

> **Change:** `<name>` — `<description>`
>
> **Specs:** `<specId1>`, `<specId2>`, ...
>
> **What we're building:** <1-2 sentence summary of the change's purpose, drawn from
> exploration context or change description>
>
> **Artifacts to write:** <list artifact IDs from the schema DAG, marking any already
> `complete` as done>
>
> **Next up:** `<nextArtifactId>` — <brief description of what this artifact covers>

This gives the user orientation before they choose a review mode. Keep it concise.

### 6. Choose mode — MANDATORY

**You MUST ask the user this question. Do NOT skip it. Do NOT assume a mode.**

If the user already said "all at once", "fast-forward", or `--ff` in
their invocation → use fast-forward mode and mark the `Choose review mode` task
as done immediately. Otherwise:

1. Create (or update) the `Choose review mode` task to `in_progress`
2. Ask:

> How would you like to review artifacts?
>
> 1. **One at a time** — I write one, you review, then we continue
> 2. **All at once** — I write everything, you review at the end

3. **STOP. End your response here.** Do not write any more text or call any tools.
   The `Choose review mode` task stays `in_progress` — that is your reminder that
   you are waiting. Only mark it done and continue when the user replies.

### 7. Get next artifact

```bash
node packages/cli/dist/index.js change artifact-instruction <name> --format json
```

Returns `artifactId`, `instruction`, `template`, `delta`, `rulesPre`, `rulesPost`.

If `lifecycle.nextArtifact` is `null` → all artifacts done, go to step 10.

### 8. Write the artifact

**`rulesPre`, `instruction`, and `rulesPost` are a single mandatory block.** You MUST
read and follow all three, in this exact order: rulesPre → instruction → rulesPost.
They are not optional or advisory — treat them as binding composition directives.

Key rules:

- **Optional artifact** (`optional: true`): ask the user if needed. If not, skip:

  ```bash
  node packages/cli/dist/index.js change skip-artifact <name> <artifactId>
  ```

- **Delta** (`delta` is not null and `delta.outlines` has entries): the spec already
  exists — write a delta file, NOT a new file. Use `delta.formatInstructions` for
  the YAML format and `delta.outlines` to see existing structure.

- **New artifact** (`delta` is null or outlines empty): write from scratch using
  `template` as scaffolding if provided.

After writing, check if the artifact implies scope changes:

```bash
node packages/cli/dist/index.js spec list --format text --summary
```

If new specs should be added or existing ones removed, surface to the user.

### 9. Validate

Check the artifact's `scope` (from the schema JSON loaded in step 3):

- **`scope: change`** (e.g. proposal, design, tasks): validate ONCE, using any specId
  from the change — the result is the same regardless of which specId you pick because
  the artifact is not spec-specific.

  ```bash
  node packages/cli/dist/index.js change validate <name> <anySpecId> --artifact <artifactId>
  ```

- **`scope: spec`** (e.g. specs, verify): validate ONCE PER specId, because each spec
  has its own artifact file.

  ```bash
  node packages/cli/dist/index.js change validate <name> <specId> --artifact <artifactId>
  ```

If validation fails: fix and re-validate. Do not proceed until it passes.

**One-at-a-time mode:** show what was written, ask:

> `<artifactId>` done. Review it, request changes, or continue?

Wait for user response. Then go to step 7.

**Fast-forward mode:** show a one-line summary and go to step 7.

### 10. All artifacts done — run exit hooks immediately

**Trigger:** the moment the last artifact passes validation, run the post-designing
hooks. Do NOT wait, do NOT ask the user anything first — the hooks fire on completion
of all design artifacts, before any review conversation.

```bash
node packages/cli/dist/index.js change run-hooks <name> designing --phase post
node packages/cli/dist/index.js change hook-instruction <name> designing --phase post --format text
```

Follow guidance. If hooks fail, fix and re-run.

Run ready pre-hooks, then transition:

```bash
node packages/cli/dist/index.js change run-hooks <name> ready --phase pre
node packages/cli/dist/index.js change hook-instruction <name> ready --phase pre --format text
```

Follow guidance.

```bash
node packages/cli/dist/index.js change transition <name> ready --skip-hooks all
```

### 11. Mandatory review stop

Show summary of all artifacts and specs in the change.

> **Design complete.** All artifacts written and validated.
>
> | Artifact | Status |
> | -------- | ------ |
> | ...      | ...    |
>
> Want to review anything, or continue to implementation?

**Do NOT proceed until the user confirms.**

Run ready post hooks:

```bash
node packages/cli/dist/index.js change run-hooks <name> ready --phase post
node packages/cli/dist/index.js change hook-instruction <name> ready --phase post --format text
```

### 12. Handle approval gate

```bash
node packages/cli/dist/index.js change status <name> --format json
```

Check `lifecycle.approvals.spec`:

**If `false`:** no approval needed — the change is ready to implement. Tell user:

Suggest: `/specd-implement <name>`

**If `true`:** transition reroutes to `pending-spec-approval`. Tell user:

> Approval required. Run: `specd change approve spec <name> --reason "..."`
> Then: `/specd-implement <name>`

**Stop.**

## Session tasks

Create tasks at the start for session visibility. Update them as you go.

1. `Load state & hooks` — mark done after step 1
2. `Load schema & context` — mark done after step 4
3. `Choose review mode` — mark done ONLY after the user responds (not when you ask)
4. For each artifact: `Write <artifactId>` — mark done after validation passes
5. `Transition to ready` — mark done after step 10
6. `Review & approval gate` — mark done after step 12

Create task 3 before asking the question in step 6. Its status must stay `in_progress`
until the user answers — this is your signal to STOP and wait. Do not create artifact
tasks (step 4) until the user has chosen a mode.

In fast-forward mode, create all artifact tasks upfront (from the schema's artifact DAG).
In one-at-a-time mode, create each artifact task as you reach it.

## Handling failed transitions

Any `change transition` command may fail with:

```
Cannot transition from '<current>' to '<target>'
```

If this happens, the change is in a different state than expected. Extract `<current>`
from the error message and redirect using this table:

| Current state                    | Suggest                                                                    |
| -------------------------------- | -------------------------------------------------------------------------- |
| `drafting` / `designing`         | You're already in the right skill — re-read status and retry               |
| `implementing` / `spec-approved` | `/specd-implement <name>`                                                  |
| `verifying`                      | `/specd-verify <name>`                                                     |
| `done` / `signed-off`            | `/specd-verify <name>` (handles done→archivable transition)                |
| `pending-signoff`                | "Signoff pending. Run: `specd change approve signoff <name> --reason ...`" |
| `archivable`                     | `/specd-archive <name>`                                                    |
| `pending-spec-approval`          | "Approval pending. Run: `specd change approve spec <name> --reason ...`"   |
| `ready`                          | Review artifacts, then `/specd-implement <name>` if approved               |

**Stop — do not continue after redirecting.**

## Registering spec dependencies

When a schema rule or artifact instruction tells you to register spec dependencies,
use `change deps` (see shared.md — "Spec scope vs spec dependencies" for the distinction
with `change edit --add-spec`):

```bash
node packages/cli/dist/index.js change deps <name> <specId> --add <depId> --add <depId>
```

This typically happens after writing the proposal (the schema's `register-spec-deps`
post-rule) and after writing specs (when `## Spec Dependencies` sections are added).
Dependencies must be registered before downstream artifacts are written — they affect
context compilation.

## Guardrails

- Always validate after writing — validation marks artifacts as `complete`
- Delta, not rewrite — when outlines exist, always write a delta
- One spec at a time for `scope: spec` artifacts
- Never guess spec IDs — look them up from `spec list --format text --summary`
- If context is unclear, ask the user — don't guess
