{{{frontmatter}}}

# specd-archive — finalize and archive

## What this does

Reviews deltas and archives the change. Archiving merges deltas into project specs
and is irreversible. The change MUST already be in `archivable` state — the signoff
gate is handled by `/specd-verify`, not by this skill.

## Steps

### 0. Bootstrap and load shared context

You MUST read @{{sharedFolder}}/shared.md before doing anything, if you can't find it using Glob or Read tools, use Bash tools like `ls` and `cat` to find and read it. If you can't find it at all, tell the user: "Shared context not found. Please ensure shared.md is available." and stop.

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

Pass `--fingerprint <stored-value>` if you have a `contextFingerprint` from a previous `changes context` call in this conversation (see `shared.md` — "Fingerprint mechanism"). If output says `unchanged`, use the context already in memory.

**MUST follow** — project context entries are binding directives. If lazy mode returns
summary specs, evaluate and load any that are relevant (see `shared.md` — "Processing
`changes context` output").

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

When reviewing spec-scoped deltas, inspect merged output with
`specd changes spec-preview <name> <specId> --format text` if overlap, drift, or
stale-base risk exists, or if you have only read raw delta files. Raw deltas are not
enough to confirm the archived spec will preserve important existing content.
If only one merged spec-scoped artifact is needed for review, use
`specd changes spec-preview <name> <specId> --artifact <artifactId> --format text`.

If implementation tracking is part of the change, review it before archiving:

```bash
specd changes implementation review <name>
```

This is the last checkpoint before implementation links become permanent. Downstream
tooling (code graph, impact analysis, compliance) depends on these links being
accurate and complete.

**Verify that every spec in the change has links to its implementing code:**

- For each spec, confirm that confirmed links exist for the files and symbols that
  realize its requirements
- Prefer symbol-level links (with `--symbol`) — they are precise and survive refactors
  better than file-level links
- File-level links (without `--symbol`) are acceptable only for config, templates,
  barrel exports, or documentation files where no stable symbol exists
- Stale symbols (flagged by `review`) indicate a link points to code that no longer
  exists — fix or remove before archiving

**If links are missing or incorrect, fix them before archiving:**

```bash
specd changes implementation add <name> --spec <specId> --file <path> --symbol "<SymbolName>"
specd changes implementation add <name> --spec <specId> --file <path>
specd changes implementation resolve <name> --file <path>
```

- `add` creates or enriches a link. Re-adding the same `(specId, file)` with new
  symbols merges them into the existing link.
- Use `--symbol` for named code constructs (functions, classes, types, methods).
  Omit `--symbol` only for file-level links (config, templates, docs).
- `resolve` marks one or more tracked files as fully reviewed. It supports a
  comma-separated list of paths for efficient bulk resolution.
  `specd changes implementation resolve <name> --file <path1>,<path2>,...`
- `ignore` is for files that do **not** belong to the change's implementation surface.
  It also supports comma-separated lists. Files with active confirmed links **cannot**
  be ignored.
  ```bash
  specd changes implementation ignore <name> --file <path1>,<path2>
  ```

You know which files belong to the implementation surface based on your understanding of
the change's requirements and design. If you're unsure about a file, review its content
and dependencies to determine whether it contributes to realizing the change's specs.
When in doubt, it's safer to track a file with links than to ignore it.

**Security & Integrity Guard:** All implementation management commands validate that
the target files exist on disk. Archiving is blocked until all tracked files are
resolved or ignored.

**Blocking conditions:**

- Tracked files in `open` state block archive — resolve or ignore them first
- Links targeting files outside the spec's workspace `codeRoot` block archive
- Links targeting specs outside the change scope block archive unless explicitly
  overridden with `--allow-out-of-scope`

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

If the command fails because implementation sidecar maintenance would update specs outside the change scope, stop and surface the affected specs to the user. Only retry after explicit confirmation with:

```bash
specd changes archive <name> --skip-hooks all --allow-out-of-scope --format toon
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

Reuse a fresh `project status` result from this archive execution if it already
contains `approvals.llmOptimized`; otherwise run the command.

If `approvals.llmOptimized` is `true`, suggest running `/specd-spec-metadata` for each
spec in the change.

### 9. Done

> Change `<name>` archived. Deltas merged into specs.

**Stop.**
Do not invoke any follow-up skill automatically; wait for explicit user confirmation.

## Session tasks

1. `Load state & context`
2. `Pre-archive review`
3. `Archive change`
4. `Post-archive & metadata`

## Handling failed transitions

When `changes transition` fails, it renders a **Repair Guide** in text mode.
Follow the recommended repair command based on the target recommendation.

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
- Any time a fresh `changes status` shows `review: required: yes`, stop
  archiving and redirect to `/specd-design <name>`
