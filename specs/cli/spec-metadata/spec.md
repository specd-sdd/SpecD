# Spec Metadata

## Overview

Defines the `specd spec metadata <workspace:capability-path>` command, which displays the parsed contents of a spec's `.specd-metadata.yaml` in a structured form, including freshness status for each recorded content hash.

## Requirements

### Requirement: Command signature

```
specd spec metadata <workspace:capability-path> [--format text|json|toon]
```

- `<workspace:capability-path>` — required positional; the fully-qualified spec ID (e.g. `default:auth/login`)
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Behaviour

The command reads `.specd-metadata.yaml` for the given spec and renders its contents in a structured form. For each file listed in `contentHashes`, it computes the current SHA-256 hash of the file on disk and compares it against the recorded hash, reporting whether the metadata is fresh or stale per file.

If `.specd-metadata.yaml` does not exist, the command exits with code 1.

### Requirement: Output format

In `text` mode (default):

```
spec: <workspace>:<capability-path>

title:       <title>
description: <description>
generatedBy: <core|agent>

content hashes:
  <filename>  <fresh|STALE>

dependsOn:
  <specId>
  ...

rules:      <N>
constraints: <N>
scenarios:  <N>
```

Sections with no content are omitted. `rules`, `constraints`, and `scenarios` show counts only in text mode. `generatedBy` shows which mechanism produced the metadata (`core` for deterministic extraction, `agent` for LLM-generated).

In `json` or `toon` mode, the full parsed metadata is output including all rules, constraints, and scenarios (encoded in the respective format):

```json
{
  "spec": "workspace:cap/path",
  "fresh": true,
  "title": "...",
  "description": "...",
  "generatedBy": "core",
  "contentHashes": [
    {"filename": "...", "recorded": "sha256:...", "current": "sha256:...", "fresh": true}
  ],
  "dependsOn": [...],
  "rules": [...],
  "constraints": [...],
  "scenarios": [...]
}
```

`fresh` at the top level is `true` only when all `contentHashes` entries are fresh.

### Requirement: Error cases

- If the workspace is not configured, exits with code 1.
- If `.specd-metadata.yaml` does not exist, exits with code 1 and prints an `error:` message to stderr.

## Constraints

- This command is read-only — it never writes or updates metadata
- Metadata regeneration is handled by `specd spec generate-metadata` or by a skill

## Examples

```
# Standard metadata display (shows recorded values, marks stale hashes)
$ specd spec metadata default:auth/login
spec: default:auth/login

title:       Login
description: Handles user authentication via login form
generatedBy: core

content hashes:
  spec.md    fresh
  verify.md  STALE

dependsOn:
  default:auth/shared-errors

rules:       3
constraints: 2
scenarios:   5
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/spec-metadata/spec.md`](../../core/spec-metadata/spec.md) — `.specd-metadata.yaml` format and fields
- [`specs/core/spec-id-format/spec.md`](../../core/spec-id-format/spec.md) — canonical `workspace:capabilityPath` format
