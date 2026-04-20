# Project Context

## Purpose

Agents need a way to retrieve the baseline project context -- instructions and specs that apply regardless of which change they are working on. The `specd project context` command compiles and prints the full project-level context: the `context:` entries from `specd.yaml` followed by all specs matched by the project-level `contextIncludeSpecs`/`contextExcludeSpecs` patterns.

## Requirements

### Requirement: Command signature

```
specd project context
  [--rules] [--constraints] [--scenarios]
  [--follow-deps [--depth <n>]]
  [--format text|json|toon]
```

- `--rules` — when present, includes only the rules sections of spec content in the output
- `--constraints` — when present, includes only the constraints sections of spec content in the output
- `--scenarios` — when present, includes only the scenarios sections of spec content in the output
- `--follow-deps` — when present, follows `dependsOn` links from `.specd-metadata.yaml` transitively to discover additional specs beyond those matched by include/exclude patterns. By default (without this flag) `dependsOn` traversal is not performed.
- `--depth <n>` — optional; only valid with `--follow-deps`; limits dependency traversal to N levels (1 = direct deps only); defaults to unlimited when `--follow-deps` is passed without `--depth`
- `--format text|json|toon` — optional; output format, defaults to `text`

When none of `--rules`, `--constraints`, or `--scenarios` are passed, all available sections are included. When one or more are passed, only those sections appear in each spec's content block.

### Requirement: Behaviour

The command compiles the project-level context: the `context:` entries and the specs matched by the **project-level** `contextIncludeSpecs`/`contextExcludeSpecs` patterns only. Workspace-level patterns are not applied — those are conditional on a specific change having that workspace active.

Concretely:

1. Project `context:` entries from `specd.yaml` are rendered (instruction text verbatim, file entries read from disk)
2. Project-level `contextIncludeSpecs` patterns are applied across all workspaces (defaults to `['default:*']` when not declared)
3. Project-level `contextExcludeSpecs` patterns are applied to remove specs from the set
4. Optional `dependsOn` traversal is applied only when `--follow-deps` is present
5. The collected specs are rendered according to the configured `contextMode`

### Requirement: Output

The CLI MUST assemble the final output from the structured `GetProjectContextResult` returned by the use case.

**In `text` mode** (default):

1. Project context entries are rendered first, each preceded by its source label. Entries are separated by `---`.
2. Spec entries follow:
   - Full entries are rendered under `## Spec content` with complete content.
   - Summary entries are rendered under `## Available context specs` with spec ID, title, and description.
   - List entries are rendered under `## Available context specs` with spec ID only plus an explicit list-mode label.
3. If nothing is configured (no `context:` entries and no specs matched), the command prints `no project context configured` and exits with code 0.

Section flags apply only to full entries. In `list` and `summary` modes, the output remains list/summary shaped even when `--rules`, `--constraints`, or `--scenarios` are passed.

**In `json` or `toon` mode**, the output includes `contextEntries`, `specs`, and `warnings`. Spec entry fields vary by mode using the shared context entry shape: list entries omit title/description/content, summary entries omit content, and full entries include content.

### Requirement: Warnings

Any advisory conditions (missing `file:` entries, stale metadata, unknown workspace patterns, spec not found) are emitted as `warning:` lines to stderr in all formats. They are also included in the `warnings` array in `json`/`toon` output. The command exits with code 0 regardless.

### Requirement: Error cases

- If the config cannot be loaded (discovery failure or parse error), exits per the entrypoint exit code rules.
- If the schema cannot be resolved, exits with code 3.

## Constraints

- This command is read-only
- Only project-level `contextIncludeSpecs`/`contextExcludeSpecs` patterns are applied; workspace-level patterns are change-specific and not applied here
- `dependsOn` traversal is opt-in via `--follow-deps`; without the flag, deps are not followed
- `--depth` without `--follow-deps` is a CLI usage error (exit code 1)
- Section flags (`--rules`, `--constraints`, `--scenarios`) only filter full-mode spec content; project `context:` entries are always rendered in full regardless of section flags
- Section flags have no effect in `list` or `summary` modes

## Examples

```
$ specd project context
You are working on the specd project.

## Spec content

### Spec: default:architecture/overview

**Description:** Defines the hexagonal architecture used across all packages.
...

$ specd project context --rules --constraints
You are working on the specd project.

## Spec content

### Spec: default:architecture/overview

### Rules
...
### Constraints
...

$ specd project context --follow-deps --depth 1

$ specd project context --format json
{
  "contextEntries": ["You are working on the specd project."],
  "specs": [{"workspace": "default", "path": "architecture/overview", "content": "..."}],
  "warnings": []
}
```

## Spec Dependencies

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:core/get-project-context`](../../core/get-project-context/spec.md) — `GetProjectContext` use case, `GetProjectContextResult` structured shape
- [`core:core/compile-context`](../../core/compile-context/spec.md) — `ContextSpecEntry` type definition
- [`core:core/config`](../../core/config/spec.md) — `contextMode` field
