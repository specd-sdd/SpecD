| status   | date       | decision-makers  | consulted | informed |
| -------- | ---------- | ---------------- | --------- | -------- |
| accepted | 2026-02-22 | specd maintainer | -         | -        |

# ADR-0012: Configuration File Strategy — specd.yaml + specd.local.yaml

## Context and Problem Statement

specd needs project configuration (schema reference, storage paths, workspace overrides, workflow hooks). There are three plausible locations for this configuration, and the tension is between what must be shared (storage paths, schema, workflow) and what must not be (local path overrides, personal environment differences).

## Decision Drivers

- Project configuration must be version-controlled so contributors can reproduce the exact setup by cloning.
- Local overrides must be per-project, not per-machine-global — a developer can have different local configs for different projects.
- No merge logic should be required in the implementation.

## Considered Options

- **Single committed file only** — `specd.yaml` shared across all contributors, version-controlled alongside the project.
- **Global user file** — `~/.specd/config.yaml`, machine-level, never committed, applies to every specd project on that machine.
- **Committed file + gitignored local override** — `specd.yaml` committed as the shared source of truth, `specd.local.yaml` gitignored for per-developer overrides.

## Decision Outcome

Chosen option: "Committed file + gitignored local override", because it satisfies both sharing and local override needs at the correct granularity without requiring merge logic.

Use two project-level files:

- **`specd.yaml`** — committed, the project's source of truth. All contributors share it. Schema, storage, workspaces, hooks, plugins, and artifact rules live here.
- **`specd.local.yaml`** — gitignored, project-scoped local override. When present, it replaces `specd.yaml` entirely (no merging). A developer who needs local path overrides, a different codeRoot, or a local schema copies `specd.yaml` and modifies it. `specd init` adds `specd.local.yaml` to `.gitignore` automatically.

A global user config (`~/.specd/`) is intentionally not part of v1. A global file would solve the "never committed" problem but at the wrong granularity: it would apply the same overrides to every project on the machine, making per-project local adjustments impossible without project-specific logic in a global file. A developer working on two coordinator repos with different external workspace paths would need to encode both in the same global file and somehow select the right one — defeating the purpose. If user-level preferences emerge (e.g. default model, preferred plugin, UI settings) they belong in a future `~/.specd/preferences.yaml` that is clearly distinct from project config. Mixing project concerns and user preferences in the same file creates ambiguity about what is shared and what is personal.

### Consequences

- Good, because project configuration is always in version control — contributors can reproduce the exact setup by cloning.
- Good, because local overrides are per-project, not per-machine-global — a developer can have different local configs for different projects.
- Good, because no merge logic is needed — `specd.local.yaml` is authoritative when present; the implementation reads one file.
- Good, because `specd --config path/to/specd.yaml` bypasses local override entirely — useful for CI and for testing the shared config without local interference.
- Bad, because the `.gitignore` entry for `specd.local.yaml` must be maintained by `specd init` and `specd update`; if it is missing, the local file could accidentally be committed.
- Bad, because user-level preferences are deferred to a future ADR.

### Confirmation

`specd` validates `specd.yaml` (or `specd.local.yaml` when present) before executing any command. `specd init` adds `specd.local.yaml` to `.gitignore` automatically.

## More Information

### Spec

- [`specs/_global/config/spec.md`](../../specs/_global/config/spec.md)
