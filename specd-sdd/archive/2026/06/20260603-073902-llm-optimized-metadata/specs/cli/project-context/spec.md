# cli:project-context

## Purpose

Agents need a way to retrieve the baseline project context -- instructions and specs that apply regardless of which change they are working on. The `specd project context` command compiles and prints the full project-level context: the `context:` entries from `specd.yaml` followed by all specs matched by the project-level `contextIncludeSpecs`/`contextExcludeSpecs` patterns.

## Requirements

### Requirement: Command signature

The command SHALL support output formats (`text`, `json`, `toon`).

### Requirement: Optimization warning signal

When `llmOptimizedContext: true` is active, if the project-level optimized context is missing or stale according to `UpdateProjectMetadata` invalidation rules, the command SHALL surface a warning.

For `--format text`, the warning SHALL be displayed at the **top** and MUST include an instruction to run the optimization skill.

For structured formats, the warning SHALL be included in the response.

## Spec Dependencies

- [`core:get-project-context`](../../../packages/core/specs/core/get-project-context/spec.md) — provides the project context compilation logic
