# Project Context

## Overview

Defines the `specd project context` command, which compiles and prints the full project-level context: the `context:` entries from `specd.yaml` followed by the content of all specs matched by the project-level `contextIncludeSpecs`/`contextExcludeSpecs` patterns. This is the context block an agent would receive regardless of any specific change or lifecycle step.

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

The command compiles the project-level context: the `context:` entries and the specs matched by the **project-level** `contextIncludeSpecs`/`contextExcludeSpecs` patterns only. Workspace-level patterns are not applied — those are conditional on a specific change having that workspace active. No `dependsOn` traversal is performed — that requires a change.

Concretely:

1. Project `context:` entries from `specd.yaml` are rendered (instruction text verbatim, file entries read from disk)
2. Project-level `contextIncludeSpecs` patterns are applied across all workspaces (defaults to `['default:*']` when not declared)
3. Project-level `contextExcludeSpecs` patterns are applied to remove specs from the set
4. The metadata or fallback content of each included spec is rendered, using the same fresh-metadata / metadataExtraction-fallback logic as `CompileContext`

### Requirement: Output

In `text` mode (default), the compiled context block is printed to stdout verbatim — the same text `CompileContext` would produce for the project entries and spec content sections, with no additional framing added by the CLI. If nothing is configured (no `context:` entries and no specs matched), the command prints `no project context configured` and exits with code 0.

In `json` or `toon` mode, the output is (encoded in the respective format):

```json
{
  "contextEntries": ["...", "..."],
  "specs": [{ "workspace": "...", "path": "...", "content": "..." }],
  "warnings": []
}
```

where `contextEntries` are the rendered project `context:` entries, `specs` are the matched specs with their rendered metadata content, and `warnings` lists any advisory conditions (missing files, stale metadata, unknown workspaces, etc.).

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
- Section flags (`--rules`, `--constraints`, `--scenarios`) only filter spec content; project `context:` entries are always rendered in full regardless of section flags

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

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/cli/change-context/spec.md`](../change-context/spec.md) — CompileContext behaviour this command partially reuses
