# ADR-0012: Configuration File Strategy — specd.yaml + specd.local.yaml

## Status

Accepted

## Context

specd needs project configuration (schema reference, storage paths, scope overrides, workflow hooks). There are three plausible locations for this configuration:

1. **A single committed file** (`specd.yaml`) — shared across all contributors, version-controlled alongside the project.
2. **A global user file** (`~/.specd/config.yaml`) — machine-level, never committed, applies to every specd project on that machine.
3. **A project-local gitignored file** (`specd.local.yaml`) — project-scoped, never committed, overrides the shared file for one developer on one machine.

The tension is between what must be shared (storage paths, schema, workflow) and what must not be (local path overrides, personal environment differences).

A global config file solves the "never committed" problem but at the wrong granularity: it would apply the same overrides to every project on the machine, making per-project local adjustments impossible without project-specific logic in a global file. A developer working on two coordinator repos with different external scope paths would need to encode both in the same global file and somehow select the right one — defeating the purpose.

## Decision

Use two project-level files:

- **`specd.yaml`** — committed, the project's source of truth. All contributors share it. Schema, storage, scopes, hooks, plugins, and artifact rules live here.
- **`specd.local.yaml`** — gitignored, project-scoped local override. When present, it replaces `specd.yaml` entirely (no merging). A developer who needs local path overrides, a different codeRoot, or a local schema copies `specd.yaml` and modifies it. `specd init` adds `specd.local.yaml` to `.gitignore` automatically.

A global user config (`~/.specd/`) is intentionally not part of v1. If user-level preferences emerge (e.g. default model, preferred plugin, UI settings) they belong in a future `~/.specd/preferences.yaml` that is clearly distinct from project config. Mixing project concerns and user preferences in the same file creates ambiguity about what is shared and what is personal.

## Consequences

- Project configuration is always in version control — contributors can reproduce the exact setup by cloning.
- Local overrides are per-project, not per-machine-global — a developer can have different local configs for different projects.
- No merge logic is needed — `specd.local.yaml` is authoritative when present; the implementation reads one file.
- `specd --config path/to/specd.yaml` bypasses local override entirely — useful for CI and for testing the shared config without local interference.
- The `.gitignore` entry for `specd.local.yaml` must be maintained by `specd init` and `specd update`; if it is missing, the local file could accidentally be committed.
- User-level preferences are deferred to a future ADR.

## Spec

- [`specs/_global/config/spec.md`](../../specs/_global/config/spec.md)
