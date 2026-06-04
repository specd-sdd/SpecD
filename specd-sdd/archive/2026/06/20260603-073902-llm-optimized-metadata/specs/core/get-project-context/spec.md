# core:get-project-context

## Purpose

Tooling sometimes needs the project's compiled spec context without an active change — for example, when generating agent instructions or answering project-wide queries. `GetProjectContext` provides this by compiling the project-level context block (steps 1-4 of the compilation pipeline: `context:` entries, project-level include/exclude patterns) with all configured workspaces treated as active. It is the change-independent counterpart to `CompileContext`.

## Requirements

### Requirement: Accepts GetProjectContextInput as input

`execute(input)` MUST accept a `GetProjectContextInput` object with the following fields:

- `config` (`CompileContextConfig`, required) — the resolved project configuration containing `context` entries, `contextIncludeSpecs`, `contextExcludeSpecs`, and `contextMode`
- `followDeps` (boolean, optional) — when `true`, follows `dependsOn` links transitively.
- `depth` (number, optional) — limits `dependsOn` traversal depth.
- `sections` (`ReadonlyArray<SpecSection>`, optional) — restricts which metadata sections are rendered per full-mode spec.

### Requirement: Returns GetProjectContextResult on success

`execute` MUST return a `GetProjectContextResult` containing:

- `contextEntries` (string[]) — rendered project-level context entries.
- `specs` (ContextSpecEntry[]) — specs matched by include/exclude patterns.
- `warnings` (ContextWarning[]) — advisory warnings for missing files, stale metadata, etc.

### Requirement: Project context optimization and invalidation

If `llmOptimizedContext: true` is active in the project configuration, the use case SHALL attempt to load project-level metadata from `project-metadata.json`.

It SHALL verify the freshness of the cached context by comparing the stored hashes in `freshness` against the current state of:

- `specd.yaml`
- Referenced `contextFiles`
- Metadata of included specs

If all hashes match and `optimized.context` exists and is not empty, the use case SHALL use the optimized context. Otherwise, it SHALL fall back to raw compilation and emit a signal for the caller to show a warning.

## Spec Dependencies

- [`core:project-metadata`](../project-metadata/spec.md) — for optimization storage and hashing rules
