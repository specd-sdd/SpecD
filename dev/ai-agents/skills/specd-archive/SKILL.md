---
name: specd-archive
description: Archive a specd change — reviews deltas and merges them into project specs.
allowed-tools: Bash(node *), Read, TaskCreate, TaskUpdate
argument-hint: '<change-name>'
---

# specd-archive — finalize and archive

Read `.specd/skills/shared.md` before doing anything.

## What this does

Reviews deltas and archives the change. Archiving merges deltas into project specs
and is irreversible. The change MUST already be in `archivable` state — the signoff
gate is handled by `/specd-verify`, not by this skill.

## Steps

### 1. Load change state

```bash
node packages/cli/dist/index.js change status <name> --format json
```

Store `lifecycle.changePath` and `specIds` from the response.

If state is not `archivable`, this is the wrong skill. Suggest based on state:

- `drafting` / `designing` → `/specd-design <name>`
- `ready` → Review artifacts, then approve or continue designing with `/specd-design <name>`
- `implementing` / `spec-approved` → `/specd-implement <name>`
- `verifying` → `/specd-verify <name>`
- `done` / `signed-off` → `/specd-verify <name>` (verify handles the done→archivable transition)
- `pending-spec-approval` → "Approval pending. Run: `specd change approve spec <name> --reason ...`"
- `pending-signoff` → "Signoff pending. Run: `specd change approve signoff <name> --reason ...`"

**Stop — do not continue.**

### 2. Load context

```bash
node packages/cli/dist/index.js change context <name> archiving --follow-deps --depth 1 --format text
```

**MUST follow** — project context entries are binding directives. If lazy mode returns
summary specs, evaluate and load any that are relevant to the archiving work
(see `shared.md` — "Processing `change context` output").

### 3. Ask before archiving

> **Ready to archive `<name>`.** This will merge all deltas into your project specs
> and move the change to the archive. This cannot be undone.
>
> Say **"archive"** to proceed, or request changes first.

**Do NOT proceed until the user explicitly says "archive" or equivalent.**

### 4. Pre-archive hooks

```bash
node packages/cli/dist/index.js change run-hooks <name> archiving --phase pre
node packages/cli/dist/index.js change hook-instruction <name> archiving --phase pre --format text
```

Follow guidance — review deltas to ensure specs match what was built.

### 5. Archive

```bash
node packages/cli/dist/index.js change archive <name> --no-hooks --format json
```

If the command fails with a `SpecOverlapError` (spec overlap detected), other active
changes target the same specs as this change. Archiving would modify the canonical
specs those changes are working against. When this happens:

1. Show the user the overlapping specs and the other changes involved
2. Explain the risk: the other changes' deltas were written against the pre-archive
   version of the spec — archiving may cause their deltas to conflict at their own
   archive time
3. Ask the user whether to proceed or abort

If the user confirms, re-run the command with `--allow-overlap`:

```bash
node packages/cli/dist/index.js change archive <name> --no-hooks --allow-overlap --format json
```

### 6. Post-archive hooks

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

## Session tasks

Create tasks at the start for session visibility. Update them as you go.

1. `Load state & context` — mark done after step 2
2. `Pre-archive review` — mark done after step 3
3. `Archive change` — mark done after step 5
4. `Post-archive & metadata` — mark done after step 8

## Handling failed transitions

Any `change transition` command may fail with:

```
Cannot transition from '<current>' to '<target>'
```

If this happens, the change is in a different state than expected. Extract `<current>`
from the error message and redirect using this table:

| Current state                    | Suggest                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `drafting` / `designing`         | `/specd-design <name>`                                                           |
| `ready`                          | Review artifacts, then approve or continue designing with `/specd-design <name>` |
| `implementing` / `spec-approved` | `/specd-implement <name>`                                                        |
| `verifying`                      | `/specd-verify <name>`                                                           |
| `done` / `signed-off`            | `/specd-verify <name>` (verify handles the done→archivable transition)           |
| `pending-signoff`                | "Signoff pending. Run: `specd change approve signoff <name> --reason ...`"       |
| `archivable`                     | You're already in the right skill — re-read status and retry                     |
| `pending-spec-approval`          | "Approval pending. Run: `specd change approve spec <name> --reason ...`"         |

**Stop — do not continue after redirecting.**

## Returning to design

If during the pre-archive review you discover that the specs don't accurately reflect
what was built and the divergence is significant, do not archive incorrect specs.
Surface the issue to the user, and if they agree:

```bash
node packages/cli/dist/index.js change transition <name> designing --skip-hooks all
```

> Specs need revision before archiving. Run `/specd-design <name>` to update them.

**Stop — do not archive.**

## Guardrails

- **Always ask before archiving** — it's irreversible
- Review deltas before confirming — specs should match what was built
- If implementation diverged from specs, update the specs first
