# Phase F — Archiving

Mark "Archive" task as `in_progress`.

---

## F.1 Pre-archive review

Before archiving, review the delta files to ensure specs accurately reflect what was
built. Load the archiving hook instructions:

```bash
node packages/cli/dist/index.js change hook-instruction <name> archiving --phase pre --format text
```

Follow the guidance found there.

## F.2 Mandatory stop — ask before archiving

**ALWAYS stop here and ask the user for explicit confirmation before archiving.**
Archiving is destructive and irreversible — it merges deltas into project specs and
moves the change to `archive/`. The user must make this decision.

> **Ready to archive `<name>`.** This will merge all deltas into your project specs
> and move the change to the archive. This cannot be undone.
>
> Say **"archive"** to proceed, or request changes first.

**Do NOT proceed until the user explicitly confirms.**

## F.3 Archive

```bash
node packages/cli/dist/index.js change archive <name> --format json
```

This atomically:

1. Runs pre-archive hooks
2. Merges deltas into project specs
3. Moves the change to `archive/`
4. Runs post-archive hooks
5. Generates `.specd-metadata.yaml` for modified specs

## F.4 Post-archive

Read the archive result. If `postHookFailures` is non-empty, report them to the user.

Run post-phase hooks:

```bash
node packages/cli/dist/index.js change run-hooks <name> archiving --phase post
```

If hooks fail, fix the issue and re-run.

Load post-archive instructions:

```bash
node packages/cli/dist/index.js change hook-instruction <name> archiving --phase post --format text
```

Follow the guidance there.

## F.5 LLM-optimized metadata (if enabled)

Check whether the project uses LLM-optimized context:

```bash
node packages/cli/dist/index.js config show --format json
```

If `llmOptimizedContext` is `true`, the deterministic metadata generated during
archiving (Step F.3) needs LLM optimization for the specs modified by this change.

Invoke the `specd-spec-metadata` skill for each spec in the change's `specIds`:

```
/specd-spec-metadata <specId>
```

This adds keywords, cleans rules/constraints/scenarios, and sets `generatedBy: agent`.
Run one spec at a time — the skill handles the full generate + optimize cycle.

If `llmOptimizedContext` is `false` or absent, skip this step — the deterministic
metadata from the archive command is sufficient.

## F.6 Complete

Mark "Archive" task as `completed`.

Report the final result to the user. The lifecycle is complete.
