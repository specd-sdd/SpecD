---
name: specd-design
description: Write the next artifact for a specd change (or all artifacts in fast-forward mode).
allowed-tools: Bash(node *), Bash(pnpm *), Read, Write, Edit, Grep, Glob, Agent
argument-hint: '<change-name> [--ff]'
---

# specd-design — write artifacts

Read `.claude/skills/specd-v3/shared.md` before doing anything.

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
node packages/cli/dist/index.js change transition <name> designing
```

If state is not `drafting` or `designing`, this is the wrong skill — suggest the right one.

Store `lifecycle.changePath` — artifacts are written there.
Store `specIds` from the response — you need them for validation.
Check `artifacts` array — if some are already `complete`, you're resuming mid-design.

### 2. Run entry hooks

```bash
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

Read carefully — contains project-level coding conventions and spec content.

### 5. Choose mode — MANDATORY

**You MUST ask the user this question. Do NOT skip it. Do NOT assume a mode.**

If the user already said "all at once", "fast-forward", or `--ff` in
their invocation → use fast-forward mode. Otherwise, ask:

> How would you like to review artifacts?
>
> 1. **One at a time** — I write one, you review, then we continue
> 2. **All at once** — I write everything, you review at the end

**STOP and wait for the answer.** Do not proceed until the user responds.
Default to option 1 only if the user explicitly says they have no preference.

### 6. Get next artifact

```bash
node packages/cli/dist/index.js change artifact-instruction <name> --format json
```

Returns `artifactId`, `instruction`, `template`, `delta`, `rulesPre`, `rulesPost`.

If `lifecycle.nextArtifact` is `null` → all artifacts done, go to step 9.

### 7. Write the artifact

Follow the instruction. Key rules:

- **Optional artifact** (`optional: true`): ask the user if needed. If not, skip:

  ```bash
  node packages/cli/dist/index.js change skip-artifact <name> <artifactId>
  ```

- **Delta** (`delta` is not null and `delta.outlines` has entries): the spec already
  exists — write a delta file, NOT a new file. Use `delta.formatInstructions` for
  the YAML format and `delta.outlines` to see existing structure.

- **New artifact** (`delta` is null or outlines empty): write from scratch using
  `template` as scaffolding if provided.

- **Order**: rulesPre → instruction + template/delta → rulesPost

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

### 9. All artifacts done — transition to ready

Run exit hooks:

```bash
node packages/cli/dist/index.js change run-hooks <name> designing --phase post
node packages/cli/dist/index.js change hook-instruction <name> designing --phase post --format text
```

Transition:

```bash
node packages/cli/dist/index.js change transition <name> ready
```

Run ready hooks:

```bash
node packages/cli/dist/index.js change hook-instruction <name> ready --phase pre --format text
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
node packages/cli/dist/index.js change transition <name> implementing
```

Suggest: `/specd-implement <name>`

**If `true`:** transition reroutes to `pending-spec-approval`. Tell user:

> Approval required. Run: `specd change approve spec <name> --reason "..."`
> Then: `/specd-implement <name>`

**Stop.**

## Guardrails

- Always validate after writing — validation marks artifacts as `complete`
- Delta, not rewrite — when outlines exist, always write a delta
- One spec at a time for `scope: spec` artifacts
- Never guess spec IDs — look them up from `spec list --format text --summary`
- If context is unclear, ask the user — don't guess
