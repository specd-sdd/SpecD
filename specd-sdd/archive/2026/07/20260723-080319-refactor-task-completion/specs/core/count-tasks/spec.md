# CountTasks

## Purpose

Task-completion parsing is needed by both status reporting and lifecycle gating, and duplicating it risks inconsistent results. `CountTasks` provides one application-layer query that reads a change's task-capable artifacts, applies their declared task patterns safely, and returns both per-artifact and change-wide counts.

## Requirements

### Requirement: Counts qualifying task artifacts

`CountTasks.execute()` MUST accept a `Change` and obtain the resolved schema through `SchemaProvider`.

For each artifact attached to the change, the use case MUST consider it task-capable only when its schema artifact type declares both `hasTasks: true` and `taskCompletionCheck`. It MUST read the artifact files through `ChangeRepository.artifact()` and aggregate matches across all existing, non-empty files for that artifact.

For every schema artifact type with `hasTasks: true`, the resolved schema MUST materialize `taskCompletionCheck` before `CountTasks.execute()` inspects it. `CountTasks` MUST consume the resolved `incompletePattern` and `completePattern` and MUST NOT define or substitute fallback patterns. The schema defaults are `^\s*-\s+\[ \]` for incomplete items and `^\s*-\s+\[[xX]\]` for complete items. The use case MUST compile the resolved patterns with `safeRegex` using the `gm` flags. A pattern that cannot be safely compiled MUST produce no matches and MUST NOT throw; a qualifying artifact with non-empty content MUST still receive a zero-valued entry.

### Requirement: Returns per-artifact and aggregate completion status

`CountTasks.execute()` MUST return `CountTasksResult` with:

- `byArtifact` — a readonly map keyed by artifact type ID, containing one `TaskCompletionStatus` only for each qualifying artifact with at least one existing, non-empty file.
- `total` — a `TaskCompletionStatus` that sums `complete`, `incomplete`, and `total` from every entry in `byArtifact`.

Each `TaskCompletionStatus` MUST contain `complete`, `incomplete`, and `total`. `total` MUST equal `complete + incomplete`, including when either pattern is defaulted.

When no qualifying artifact has content, `byArtifact` MUST be empty and `total` MUST contain zeroes.

### Requirement: Does not infer task capability from counts

An absent `byArtifact` entry MUST mean only that `CountTasks` found no qualifying content for that artifact. Consumers that need to reject an artifact without task capability MUST inspect its schema artifact definition and preserve their own missing-capability behavior.

### Requirement: Supports composition and kernel wiring

`CountTasks` MUST accept `ChangeRepository` and `SchemaProvider` as constructor dependencies. `createCountTasks(deps)` and `createCountTasks(config, options?)` MUST follow the shared normalized factory-argument contract and construct the config form through `resolveCountTasksDeps(resolver)`.

As an exported application use case, `CountTasks` MUST be exposed as `kernel.changes.countTasks` and use the same resolver-backed dependencies as its standalone factory.

## Constraints

- The use case is read-only and MUST NOT mutate the change or artifact files.
- It MUST NOT decide whether a lifecycle transition is permitted.
- It MUST preserve the existing empty or missing artifact behavior by omitting those artifacts from `byArtifact`.

## Spec Dependencies

- [`core:change`](../change/spec.md) — supplies the change and its attached artifacts.
- [`core:schema-format`](../schema-format/spec.md) — defines task-capability and completion-check configuration.
- [`core:composition-resolver`](../composition-resolver/spec.md) — supplies resolver-backed factory dependencies.
