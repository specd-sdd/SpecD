# Project Context

## Purpose

Agents need a way to retrieve the baseline project context -- instructions and specs that apply regardless of which change they are working on. The `specd project context` command compiles and prints the full project-level context: the `context:` entries from `specd.yaml` followed by all specs matched by the project-level `contextIncludeSpecs`/`contextExcludeSpecs` patterns.

## Requirements

### Requirement: Command signature

The command MUST support:

```bash
specd project context [options]
```

- `--mode <mode>` — optional; `list|summary|full|hybrid`
- `--rules` — when present, includes only the rules sections of spec content in the output
- `--constraints` — when present, includes only the constraints sections of spec content in the output
- `--scenarios` — when present, includes only the scenarios sections of spec content in the output
- `--follow-deps` — when present, follows `dependsOn` links from `.specd-metadata.yaml` transitively to discover additional specs beyond those matched by include/exclude patterns. By default (without this flag) `dependsOn` traversal is not performed.
- `--depth <n>` — optional; only valid with `--follow-deps`; limits dependency traversal to N levels (1 = direct deps only); defaults to unlimited when `--follow-deps` is passed without `--depth`
- `--optimized` — optional; force prefer optimized context
- `--no-optimized` — optional; suppress preference for optimized context
- `--format text|json|toon` — optional; output format, defaults to `text`

When none of `--rules`, `--constraints`, or `--scenarios` are passed, all available sections are included. When one or more are passed, only those sections appear in each spec's content block.

### Requirement: Optimization warning signal

When `llmOptimizedContext: true` is active, if the project-level optimized context is missing or stale according to `UpdateProjectMetadata` invalidation rules, the command SHALL surface a warning.

The warning MUST include an instruction to run the optimization skill.

For structured formats, the warning SHALL be included in the response.

### Requirement: Behaviour

The command compiles the project-level context: the `context:` entries and the specs matched by the **project-level** `contextIncludeSpecs`/`contextExcludeSpecs` patterns only. Workspace-level patterns are not applied — those are conditional on a specific change having that workspace active.

The CLI MUST NOT construct a `CompileContextConfig` object inline from `SpecdConfig`. Yaml-derived context configuration is baked into the kernel-wired `GetProjectContext` instance at composition time.

The CLI MUST pass only runtime overrides to `GetProjectContext.execute`:

- `contextMode` from `--mode` or the CLI's effective-mode derivation (section flags may force `full` when yaml default is not `full`/`hybrid`)
- `llmOptimizedContext` only when `--optimized` or `--no-optimized` resolves a value that differs from the yaml default
- `followDeps`, `depth`, and `sections` from the corresponding CLI flags

Concretely, the use case:

1. Renders project `context:` entries from the baked default configuration (instruction text verbatim, file entries read from disk)
2. Applies project-level `contextIncludeSpecs` patterns across all workspaces (defaults to `['default:*']` when not declared in yaml)
3. Applies project-level `contextExcludeSpecs` patterns to remove specs from the set
4. Applies optional `dependsOn` traversal only when `--follow-deps` is present
5. Renders the collected specs according to the effective `contextMode`

When `llmOptimizedContext` is enabled in the baked default, `GetProjectContext` prefers optimized project-level content when fresh.

Optimization bypass for partial section requests is enforced by `GetProjectContext` from the forwarded `sections` input. The CLI MUST NOT recompute `llmOptimizedContext` based on section flags except via explicit `--optimized` / `--no-optimized`.

The command MUST suppress `stale-optimization` warnings when optimization is effectively bypassed (for example via `--no-optimized` or partial section requests handled in the use case).

### Requirement: Output

The CLI MUST obtain the structured `GetProjectContextResult` from the use case and MUST NOT assemble agent-facing markdown inline.

**In `text` mode** (default):

The CLI MUST call `projectContextToMarkdown(context)` from `@specd/sdk` (passing the `GetProjectContextResult` as `context`) and print the returned string to stdout. The helper owns project-entry formatting, full-spec content, and the catalogue for entries whose `mode` is not `full`.

Catalogue sections MUST include prose instructing agents to run `specd specs context <specId>` to load full optimized context. The output MUST NEVER mention `changes spec-preview` or any change-scoped preview command.

When the helper returns `no project context configured`, the CLI MUST print that string and exit with code 0.

Section flags apply only to full entries. In `list` and `summary` modes, the output remains list/summary shaped even when `--rules`, `--constraints`, or `--scenarios` are passed.

**In `json` or `toon` mode**, the output includes `contextEntries`, `specs`, and `warnings`. Spec entry fields vary by mode using the shared context entry shape: list entries omit title/description/content, summary entries omit content, and full entries include content. Structured formats MUST NOT invoke the markdown helper.

### Requirement: Warnings

Any advisory conditions (missing `file:` entries, stale metadata, unknown workspace patterns, spec not found) are emitted as `warning:` lines to stderr in all formats. They are also included in the `warnings` array in `json`/`toon` output. The command exits with code 0 regardless.

### Requirement: Error cases

- If the config cannot be loaded (discovery failure or parse error), exits per the entrypoint exit code rules.
- If the schema cannot be resolved, exits with code 3.

### Requirement: Full mode defaults and section overrides

In `full` mode (default when no section flags are passed), the output includes Description, Rules, and Constraints for each spec.

When one or more section flags (`--rules`, `--constraints`, `--scenarios`) are passed, only those sections appear (header fields persist).

## Constraints

- This command is read-only
- Text-mode rendering MUST come from `projectContextToMarkdown`; the CLI MUST NOT hardcode catalogue hints or markdown tables
- Project context text output MUST NEVER suggest `changes spec-preview`
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

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`sdk:context-markdown`](../../sdk/context-markdown/spec.md) — `projectContextToMarkdown` text presentation
- [`core:get-project-context`](../../core/get-project-context/spec.md) — use case and result shape for project context entries
- [`core:compile-context`](../../core/compile-context/spec.md) — shared context entry and warning types
- [`core:config`](../../core/config/spec.md) — project context configuration
