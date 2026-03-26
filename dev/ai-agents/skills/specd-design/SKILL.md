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

If state is `drafting`, transition to `designing`:

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

### 2. Run entry hooks

```bash
node packages/cli/dist/index.js change run-hooks <name> designing --phase pre
node packages/cli/dist/index.js change hook-instruction <name> designing --phase pre --format text
```

Follow guidance.

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

### 5. Choose mode — MANDATORY

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

### 6. Get next artifact

```bash
node packages/cli/dist/index.js change artifact-instruction <name> --format json
```

Returns `artifactId`, `instruction`, `template`, `delta`, `rulesPre`, `rulesPost`.

If `lifecycle.nextArtifact` is `null` → all artifacts done, go to step 9.

### 7. Write the artifact

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

### 8. Validate

```bash
node packages/cli/dist/index.js change validate <name> <specId> --artifact <artifactId>
```

Run for each specId if the artifact has `scope: spec`.

If validation fails: fix and re-validate. Do not proceed until it passes.

**One-at-a-time mode:** show what was written, ask:

> `<artifactId>` done. Review it, request changes, or continue?

Wait for user response. Then go to step 6.

**Fast-forward mode:** show a one-line summary and go to step 6.

### 9. All artifacts done — run exit hooks immediately

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

### 10. Mandatory review stop

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

### 11. Handle approval gate

```bash
node packages/cli/dist/index.js change status <name> --format json
```

Check `lifecycle.approvals.spec`:

**If `false`:** transition to implementing:

```bash
node packages/cli/dist/index.js change transition <name> implementing --skip-hooks all
```

Suggest: `/specd-implement <name>`

**If `true`:** transition reroutes to `pending-spec-approval`. Tell user:

> Approval required. Run: `specd change approve spec <name> --reason "..."`
> Then: `/specd-implement <name>`

**Stop.**

## Session tasks

Create tasks at the start for session visibility. Update them as you go.

1. `Load state & hooks` — mark done after step 2
2. `Load schema & context` — mark done after step 4
3. `Choose review mode` — mark done ONLY after the user responds (not when you ask)
4. For each artifact: `Write <artifactId>` — mark done after validation passes
5. `Transition to ready` — mark done after step 9
6. `Review & approval gate` — mark done after step 11

Create task 3 before asking the question in step 5. Its status must stay `in_progress`
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

## Guardrails

- Always validate after writing — validation marks artifacts as `complete`
- Delta, not rewrite — when outlines exist, always write a delta
- One spec at a time for `scope: spec` artifacts
- Never guess spec IDs — look them up from `spec list --format text --summary`
- If context is unclear, ask the user — don't guess
