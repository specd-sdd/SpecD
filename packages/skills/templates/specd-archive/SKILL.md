# specd-archive — finalize and archive

Read @shared.md before doing anything.

## What this does

Reviews deltas and archives the change. Archiving merges deltas into project specs
and is irreversible. The change MUST already be in `archivable` state — the signoff
gate is handled by `/specd-verify`, not by this skill.

## Steps

### 1. Load change state

```bash
specd changes status <name> --format text
```

Identify any high-visibility blockers from the **blockers:** section (e.g. `ARTIFACT_DRIFT`,
`OVERLAP_CONFLICT`, `REVIEW_REQUIRED`) and inform the user. Follow the **next action:**
command recommendation.

Extract the `path:` field from the "lifecycle:" section.

If the status output shows `review: required: yes`, tell the user:

> Artifacts need review before archiving. Run `/specd-design <name>` to update them.

**Stop — do not continue.**

If state is not `archivable`, this is the wrong skill.
Redirect based on the **next action:** `target` recommendation.

**Stop — do not continue.**

### 2. Load context

```bash
specd changes context <name> archiving --follow-deps --depth 1 --format text [--fingerprint <stored-value>]
```

Pass `--fingerprint <stored-value>` if you have a `contextFingerprint` from a previous `change context` call in this conversation (see `shared.md` — "Fingerprint mechanism"). If output says `unchanged`, use the context already in memory.

**MUST follow** — project context entries are binding directives. If lazy mode returns
summary specs, evaluate and load any that are relevant (see `shared.md` — "Processing
`change context` output").

### 3. Ask before archiving

> **Ready to archive `<name>`.** This will merge all deltas into your project specs
> and move the change to the archive. This cannot be undone.
>
> Say **"archive"** to proceed, or request changes first.

**Do NOT proceed until the user explicitly says "archive" or equivalent.**

### 4. Pre-archive hooks

```bash
specd changes run-hooks <name> archiving --phase pre
specd changes hook-instruction <name> archiving --phase pre --format text
```

Follow guidance — review deltas to ensure specs match what was built.

### 5. Archive

```bash
specd changes archive <name> --skip-hooks all --format toon
```

If the command fails with a `SpecOverlapError` (spec overlap detected), other active
changes target the same specs as this change. When this happens:

1. Show the user the overlapping specs and the other changes involved.
2. Explain the risk.
3. Ask the user whether to proceed or abort.

If the user confirms, re-run the command with `--allow-overlap`:

```bash
specd changes archive <name> --skip-hooks all --allow-overlap --format toon
```

### 6. Post-archive hooks

```bash
specd changes run-hooks <name> archiving --phase post
specd changes hook-instruction <name> archiving --phase post --format text
```

Follow guidance.

### 7. Regenerate metadata

```bash
specd specs generate-metadata --all --write --status stale,missing
```

### 8. Check LLM optimization

```bash
specd project status --format toon
```

If `approvals.llmOptimized` is `true`, suggest running `/specd-spec-metadata` for each
spec in the change.

### 9. Done

> Change `<name>` archived. Deltas merged into specs.

**Stop.**

## Session tasks

1. `Load state & context`
2. `Pre-archive review`
3. `Archive change`
4. `Post-archive & metadata`

## Handling failed transitions

When `change transition` fails, it renders a **Repair Guide** in text mode.
Follow the recommended repair command based on the target recommendation.

**Stop — do not continue after redirecting.**

## Returning to design

If during the pre-archive review you discover that the artifacts need revision, stop and explain.
If the user agrees:

```bash
specd changes transition <name> designing --skip-hooks all
```

> Specs need revision before archiving. Run `/specd-design <name>` to update them.

**Stop — do not archive.**

## Guardrails

- **Always ask before archiving** — it's irreversible
- Review deltas before confirming — specs should match what was built
- Any time a fresh `change status` shows `review: required: yes`, stop
  archiving and redirect to `/specd-design <name>`
