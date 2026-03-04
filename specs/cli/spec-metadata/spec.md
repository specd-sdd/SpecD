# Spec Metadata

## Overview

Defines the `specd spec metadata <workspace:capability-path>` command, which displays the parsed contents of a spec's `.specd-metadata.yaml` in a structured form, including freshness status for each recorded content hash. Optionally, when metadata is stale or absent, the command can infer sections from the spec's raw artifact files.

## Requirements

### Requirement: Command signature

```
specd spec metadata <workspace:capability-path> [--infer] [--format text|json|toon]
```

- `<workspace:capability-path>` — required positional; the fully-qualified spec path (e.g. `default:auth/login`)
- `--infer` — optional; when metadata is stale or absent, extract rules, constraints, and scenarios from the spec's raw artifact files using the active schema's `contextSections` definitions instead of showing the stale recorded values. Only affects the semantic sections (rules, constraints, scenarios) — all other fields (title, description, dependsOn, contentHashes) always come from the recorded metadata
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Behaviour

The command reads `.specd-metadata.yaml` for the given spec and renders its contents in a structured form. For each file listed in `contentHashes`, it computes the current SHA-256 hash of the file on disk and compares it against the recorded hash, reporting whether the metadata is fresh or stale per file.

If `.specd-metadata.yaml` does not exist and `--infer` is not passed, the command exits with code 1.

### Requirement: Infer mode

When `--infer` is passed and the metadata is stale or absent, the command resolves the active schema from `specd.yaml` and uses its `contextSections` selectors to extract **only the semantic sections** — rules, constraints, and scenarios — from the spec's raw artifact files. The extracted data replaces the stale recorded values for those three sections in the output.

All other metadata fields — description, dependsOn, contentHashes — always come from the recorded `.specd-metadata.yaml`. They cannot be inferred mechanically and are omitted when metadata is absent.

The only exception is `title`: when metadata is absent, the capability path (without workspace prefix) is used as a fallback title (e.g. `auth/login`).

The output clearly indicates the data source for the semantic sections:

- **`source: recorded`** — rules, constraints, and scenarios come from `.specd-metadata.yaml` (fresh metadata)
- **`source: inferred`** — rules, constraints, and scenarios were extracted from raw artifact files because metadata was stale or absent

When `--infer` is passed and the metadata is fresh, the command behaves identically to the default mode (source is `recorded`).

When `--infer` is not passed, stale metadata is shown as-is with `STALE` hash indicators — no extraction is attempted.

### Requirement: Output format

In `text` mode (default):

```
spec: <workspace>:<capability-path>
source: <recorded|inferred>

title:       <title>
description: <description>

content hashes:
  <filename>  <fresh|STALE>

dependsOn:
  <specId>
  ...

rules:      <N>
constraints: <N>
scenarios:  <N>
```

Sections with no content are omitted. `rules`, `constraints`, and `scenarios` show counts only in text mode. The `source:` line is only shown when `--infer` is passed. When not in infer mode, `content hashes:` and counts reflect the recorded metadata as-is.

In `json` or `toon` mode, the full parsed metadata is output including all rules, constraints, and scenarios (encoded in the respective format):

```json
{
  "spec": "workspace:cap/path",
  "fresh": true,
  "source": "recorded",
  "title": "...",
  "description": "...",
  "contentHashes": [
    {"filename": "...", "recorded": "sha256:...", "current": "sha256:...", "fresh": true}
  ],
  "dependsOn": [...],
  "rules": [...],
  "constraints": [...],
  "scenarios": [...]
}
```

`fresh` at the top level is `true` only when all `contentHashes` entries are fresh. The `source` field is only present when `--infer` is passed.

### Requirement: Error cases

- If the workspace is not configured, exits with code 1.
- If `.specd-metadata.yaml` does not exist and `--infer` is not passed, exits with code 1 and prints an `error:` message to stderr.
- If `--infer` is passed but no artifact files exist for the spec, exits with code 1.

## Constraints

- This command is read-only — it never writes or updates metadata
- Metadata regeneration is handled by a skill, not by this command
- `--infer` does not write or modify `.specd-metadata.yaml` — it only affects the output for the current invocation
- The inference logic uses the same `contextSections` selectors and artifact parsers as `CompileContext`

## Examples

```
# Standard metadata display (shows recorded values, marks stale hashes)
$ specd spec metadata default:auth/login
spec: default:auth/login

title:       Login
description: Handles user authentication via login form

content hashes:
  spec.md    fresh
  verify.md  STALE

dependsOn:
  default:auth/shared-errors

rules:       3
constraints: 2
scenarios:   5

# Infer mode — extracts semantic sections from artifacts when stale
# title, description, dependsOn, contentHashes still come from recorded metadata
$ specd spec metadata default:auth/login --infer
spec: default:auth/login
source: inferred

title:       Login
description: Handles user authentication via login form

content hashes:
  spec.md    fresh
  verify.md  STALE

dependsOn:
  default:auth/shared-errors

rules:       4
constraints: 2
scenarios:   6

# Infer mode when metadata is absent — title falls back to capability path
# (no description, dependsOn, or contentHashes without recorded metadata)
$ specd spec metadata default:new-feature --infer
spec: default:new-feature
source: inferred

title:       new-feature

rules:       2
constraints: 1
scenarios:   3
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/compile-context/spec.md`](../../core/compile-context/spec.md) — `contextSections` selectors and artifact parser infrastructure
