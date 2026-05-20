---
status: accepted
date: 2026-02-22
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0012: Configuration File Strategy — Layered Config Cascade

## Context and Problem Statement

SpecD needs project configuration (schema reference, storage paths, workspace overrides, workflow hooks). There is tension between what must be shared (storage paths, schema, workflow) and what must not be (local path overrides, personal environment differences), and between simplicity (one file) and flexibility (per-environment variants without forking the base config).

## Decision Drivers

- Project configuration must be version-controlled so contributors can reproduce the exact setup by cloning.
- Local overrides must be per-project, not per-machine-global.
- Named shared variants (CI, staging) should be composable without duplicating the entire base config.
- Removals should allow stripping entries from inherited layers.

## Considered Options

- **Single committed file only** — `specd.yaml` shared across all contributors.
- **Committed file + exclusive local override** — `specd.local.yaml` replaces `specd.yaml` entirely when present, no merge.
- **Layered cascade** — ordered candidate files with `extends` and `remove` declarations, deep-merged into one validated config.

## Decision Outcome

Chosen option: "Layered cascade", because it supports both shared and per-developer variants with explicit inheritance, avoids config duplication, and still keeps the base `specd.yaml` as the committed source of truth.

File naming and discovery order within the config directory:

1. `specd.yaml` — committed project root (always first active layer)
2. `specd.*.yaml` — named shared variants, sorted lexicographically
3. `specd.local.yaml` — personal local override
4. `specd.local.*.yaml` — named local variants, sorted lexicographically

Each file may declare `extends: true` (inherit from previous active layer), `extends: <path>` (inherit from a named base that is already active), or omit `extends` to become a standalone root that discards all prior layers. The active chain is built by walking candidates in discovery order and attaching or skipping based on extends resolution. Layers in the active chain are deep-merged (scalars replaced, objects merged recursively, arrays appended). A `remove` block on a layer strips entries from the accumulated merge before the next layer is applied.

Forced mode (`--config path/to/file.yaml`) loads a closed chain starting from the specified file, following explicit extends links only within its directory.

`specd project init` adds both `specd.local.yaml` and `specd.local.*.yaml` to `.gitignore` automatically.

A global user config (`~/.specd/`) is intentionally not part of v1 for the reasons described in the original ADR. User-level preferences belong in a future `~/.specd/preferences.yaml`.

### Consequences

- Good, because project configuration is always in version control.
- Good, because named shared variants (CI, staging) compose on top of the base without duplication.
- Good, because local overrides are per-project with explicit inheritance.
- Good, because `--config` bypasses discovery entirely for CI and testing.
- Bad, because the cascade model adds implementation complexity compared to a single-file approach.
- Bad, because the `.gitignore` entries for `specd.local.yaml` and `specd.local.*.yaml` must be maintained.

### Confirmation

`specd` discovers, resolves, merges, and validates the cascade before executing any command. `specd project init` adds both gitignore entries automatically.

## More Information

### Spec

- [`core:config`](../../specs/core/config/spec.md)
