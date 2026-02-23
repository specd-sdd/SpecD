# Agent: Spec Metadata Generator

> Temporary working document. Final location TBD.

## Execution notes

- This agent **requires Write tool permission** to create or update `.specd-metadata.yaml`.
- When launched as a background subagent via the Task tool, Write access is not granted by default and the agent will stop at Step 5 without writing anything.
- **Preferred invocation**: run in foreground (no `run_in_background`) so the permission prompt is shown to the user, or run directly in the main conversation using the agent instructions manually.

## Purpose

Generate or update the `.specd-metadata.yaml` file for a spec directory. This file records human-readable metadata (`title`, `description`, `keywords`) and machine-readable dependency information (`dependsOn`, `contentHashes`) for a spec.

## When to run

- After creating a new spec
- After substantially revising an existing spec's content
- When `.specd-metadata.yaml` is stale or missing

## Inputs

- The spec directory path (e.g. `specs/core/change/`)
- The list of all available specs in the project (for resolving valid `dependsOn` paths)

## Instructions

### Step 1 — Check if update is needed

1. List all files in the spec directory, excluding `.specd-metadata.yaml` itself.
2. Read the existing `.specd-metadata.yaml` if it exists.
3. Compute the SHA-256 hash of each file found in step 1.
4. Compare each hash against the corresponding entry in `contentHashes`.

**If all hashes match → stop. No update needed.**

If any hash differs, a file has no entry in `contentHashes`, or `.specd-metadata.yaml` does not exist → proceed to Step 2.

### Step 2 — Read spec content

Read all files in the spec directory (excluding `.specd-metadata.yaml`).

### Step 3 — Evaluate each field

For each field, compare the current value in `.specd-metadata.yaml` against what the spec content now warrants. **Only update a field if it needs to change.**

#### `title`

Derive the appropriate title from the top-level `# Heading` of `spec.md`. If it matches the existing `title` — leave it unchanged.

#### `description`

Derive a one or two sentence summary of what the spec defines. If the existing `description` still accurately reflects the spec content — leave it unchanged.

#### `keywords`

Review whether the existing keywords still cover the domain concepts, patterns, and cross-cutting concerns in the spec. Add missing keywords; do not remove existing ones unless they are clearly no longer relevant. If nothing needs to change — leave `keywords` unchanged.

Guidelines for keywords:

- Lowercase, hyphen-separated
- Capture domain concepts (`lifecycle`, `approval`, `auth`, `storage`)
- Capture patterns where relevant (`event-sourcing`, `state-machine`, `port-adapter`)
- **Include related concepts** — if the spec references a concept, also add the broader domain it belongs to (e.g. if the spec mentions `commit` or `branch`, add `git`; if it mentions `hash` or `sha256`, add `integrity`; if it mentions `webhook` or `http`, add `api`)
- Avoid generic terms (`spec`, `domain`, `core`)
- 3 to 8 tags total

#### `dependsOn`

Review whether the existing `dependsOn` list still matches the spec's declared dependencies (primarily the `## Spec Dependencies` section). Add paths for new dependencies; do not remove existing ones unless a dependency has been explicitly removed from the spec. If nothing needs to change — leave `dependsOn` unchanged.

Guidelines:

- Include only direct dependencies — specs the agent must understand to work on this one
- Do not include the spec itself
- Do not include specs merely mentioned in passing
- Paths relative to the workspace root; use workspace qualifier only for cross-workspace deps (e.g. `billing:payments/invoices`)

### Step 4 — Update contentHashes

Always update `contentHashes` with the freshly computed hashes from Step 1, regardless of whether any other field changed. Keys are bare filenames (e.g. `spec.md`, `verify.md`).

### Step 5 — Write

Write the updated `.specd-metadata.yaml`. Only fields that were evaluated as needing a change (Steps 3–4) are modified; all other fields retain their previous values exactly.

## Output format

```yaml
title: <short name>
description: >
  <one or two sentence summary>
keywords:
  - <keyword>
  - <keyword>
dependsOn:
  - <spec-path>
  - <spec-path>
contentHashes:
  spec.md: 'sha256:<hex>'
  verify.md: 'sha256:<hex>'
```

## Notes

- If `.specd-metadata.yaml` does not exist, create it with all fields derived from scratch
- `contentHashes` is always rewritten in Step 4 — never copy values from the previous version
- When in doubt about a dependency, include it rather than omit it
- When in doubt about a keyword, include it rather than omit it
