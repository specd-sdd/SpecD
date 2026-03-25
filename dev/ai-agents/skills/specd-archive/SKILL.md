---
name: specd-archive
description: Archive a specd change — handles signoff gate, merges deltas into specs.
allowed-tools: Bash(node *), Read, TaskCreate, TaskUpdate
argument-hint: '<change-name>'
---

# specd-archive — finalize and archive

Read `.specd/skills/shared.md` before doing anything.

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
the wrong skill. Suggest based on state:

- `drafting` / `designing` → `/specd-design <name>`
- `ready` → Review artifacts, then approve or continue designing with `/specd-design <name>`
- `implementing` / `spec-approved` → `/specd-implement <name>`
- `verifying` → `/specd-verify <name>`
- `pending-spec-approval` → "Approval pending. Run: `specd change approve spec <name> --reason ...`"

**Stop — do not continue.**

### 2. Load context

```bash
node packages/cli/dist/index.js change context <name> archiving --follow-deps --depth 1 --format text
```

**MUST follow** — project context entries are binding directives. If lazy mode returns
summary specs, evaluate and load any that are relevant to the archiving work
(see `shared.md` — "Processing `change context` output").

### 3. Handle signoff gate

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

### 4. Pre-archive review

```bash
node packages/cli/dist/index.js change hook-instruction <name> archiving --phase pre --format text
```

Follow guidance — review deltas to ensure specs match what was built.

### 5. Ask before archiving

> **Ready to archive `<name>`.** This will merge all deltas into your project specs
> and move the change to the archive. This cannot be undone.
>
> Say **"archive"** to proceed, or request changes first.

**Do NOT proceed until the user explicitly says "archive" or equivalent.**

### 6. Archive

```bash
node packages/cli/dist/index.js change archive <name> --format json
```

### 7. Post-archive

```bash
node packages/cli/dist/index.js change run-hooks <name> archiving --phase post
node packages/cli/dist/index.js change hook-instruction <name> archiving --phase post --format text
```

Follow guidance (typically: summarize what changed for commit message).

### 8. Regenerate metadata

```bash
node packages/cli/dist/index.js spec generate-metadata --all --write --status stale,missing
```

### 9. Check LLM optimization

```bash
node packages/cli/dist/index.js config show --format json
```

If `llmOptimizedContext` is `true`, suggest running `/specd-spec-metadata` for each
spec in the change.

### 10. Done

> Change `<name>` archived. Deltas merged into specs.

**Stop.**

## Session tasks

Create tasks at the start for session visibility. Update them as you go.

1. `Load state` — mark done after step 1
2. `Load context` — mark done after step 2
3. `Handle signoff gate` — mark done after step 3
4. `Pre-archive review` — mark done after step 4
5. `Archive change` — mark done after step 6
6. `Post-archive & metadata` — mark done after step 9

## Handling failed transitions

Any `change transition` command may fail with:

```
Cannot transition from '<current>' to '<target>'
```

If this happens, the change is in a different state than expected. Extract `<current>`
from the error message and redirect using this table:

| Current state                                            | Suggest                                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `drafting` / `designing`                                 | `/specd-design <name>`                                                           |
| `ready`                                                  | Review artifacts, then approve or continue designing with `/specd-design <name>` |
| `implementing` / `spec-approved`                         | `/specd-implement <name>`                                                        |
| `verifying`                                              | `/specd-verify <name>`                                                           |
| `done` / `pending-signoff` / `signed-off` / `archivable` | You're already in the right skill — re-read status and retry                     |
| `pending-spec-approval`                                  | "Approval pending. Run: `specd change approve spec <name> --reason ...`"         |

**Stop — do not continue after redirecting.**

## Guardrails

- **Always ask before archiving** — it's irreversible
- Review deltas before confirming — specs should match what was built
- If implementation diverged from specs, update the specs first
