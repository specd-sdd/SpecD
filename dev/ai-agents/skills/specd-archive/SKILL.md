---
name: specd-archive
description: Archive a specd change — handles signoff gate, merges deltas into specs.
allowed-tools: Bash(node *), Read
argument-hint: '<change-name>'
---

# specd-archive — finalize and archive

Read `.claude/skills/specd-v3/shared.md` before doing anything.

## What this does

Handles the signoff gate (if active), reviews deltas, and archives the change.
Archiving merges deltas into project specs and is irreversible.

## Steps

### 1. Load change state

```bash
node packages/cli/dist/index.js change status <name> --format json
```

Store `lifecycle.changePath` and `specIds` from the response.

If state is not `done`, `pending-signoff`, `signed-off`, or `archivable`, this is
the wrong skill — suggest the right one.

### 2. Handle signoff gate

Run `done` hooks:

```bash
node packages/cli/dist/index.js change hook-instruction <name> done --phase pre --format text
```

Check `lifecycle.approvals.signoff`:

**If `false`:** run done post hooks and transition directly:

```bash
node packages/cli/dist/index.js change run-hooks <name> done --phase post
node packages/cli/dist/index.js change hook-instruction <name> done --phase post --format text
node packages/cli/dist/index.js change transition <name> archivable
```

**If `true`:** transition reroutes to `pending-signoff`. Tell user:

> Signoff required. Run: `specd change approve signoff <name> --reason "..."`
> Then re-invoke `/specd-archive <name>`.

Run pending-signoff hooks and **stop.**

**If already `signed-off`:** run signed-off hooks, transition to archivable.

**If already `archivable`:** skip to step 3.

### 3. Pre-archive review

```bash
node packages/cli/dist/index.js change hook-instruction <name> archiving --phase pre --format text
```

Follow guidance — review deltas to ensure specs match what was built.

### 4. Ask before archiving

> **Ready to archive `<name>`.** This will merge all deltas into your project specs
> and move the change to the archive. This cannot be undone.
>
> Say **"archive"** to proceed, or request changes first.

**Do NOT proceed until the user explicitly says "archive" or equivalent.**

### 5. Archive

```bash
node packages/cli/dist/index.js change archive <name> --format json
```

### 6. Post-archive

```bash
node packages/cli/dist/index.js change run-hooks <name> archiving --phase post
node packages/cli/dist/index.js change hook-instruction <name> archiving --phase post --format text
```

Follow guidance (typically: summarize what changed for commit message).

### 7. Regenerate metadata

```bash
node packages/cli/dist/index.js spec generate-metadata --all --write --status stale,missing
```

### 8. Check LLM optimization

```bash
node packages/cli/dist/index.js config show --format json
```

If `llmOptimizedContext` is `true`, suggest running `/specd-spec-metadata` for each
spec in the change.

### 9. Done

> Change `<name>` archived. Deltas merged into specs.

**Stop.**

## Guardrails

- **Always ask before archiving** — it's irreversible
- Review deltas before confirming — specs should match what was built
- If implementation diverged from specs, update the specs first
