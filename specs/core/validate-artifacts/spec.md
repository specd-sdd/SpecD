# ValidateArtifacts

## Overview

`ValidateArtifacts` is the application use case that checks a change's artifact files against the active schema and marks them complete. It is the only path through which an artifact may reach `complete` status. It enforces required artifacts, validates structural rules, detects delta conflicts, and invalidates any outstanding approval when artifact content has changed since the approval was recorded.

## Requirements

### Requirement: Ports and constructor

`ValidateArtifacts` receives at construction time: `ChangeRepository`, a map of `SpecRepository` instances (one per configured workspace), `SchemaRegistry`, and `GitAdapter` to resolve the actor for any invalidation events.

```typescript
class ValidateArtifacts {
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemas: SchemaRegistry,
    git: GitAdapter,
  )
}
```

`specs` is keyed by workspace name. When loading a base spec for delta merge preview, `ValidateArtifacts` looks up the `SpecRepository` for the spec path's workspace. The bootstrap layer constructs and passes all workspace repositories.

### Requirement: Input

`ValidateArtifacts.execute` receives:

- `name` — the change name to validate
- `specPath` — the spec path to validate (one spec per execution); must be one of the paths in `change.specIds`
- `schemaRef` — the schema reference string from `specd.yaml`
- `workspaceSchemasPaths` — resolved workspace-to-schemas-path map, passed through to `SchemaRegistry.resolve()`

Validating all specs in a change requires calling `execute` once per spec path. Use cases that need to validate all specs call `execute` in a loop.

### Requirement: Required artifacts check

Before validating structure, `ValidateArtifacts` must verify that all non-optional artifact IDs are present in the change (status not `missing`). Optional artifacts with status `skipped` (`validatedHash === "__skipped__"`) are considered resolved and do not cause a failure. If any non-optional artifact is absent, `ValidateArtifacts` must return a failure result listing the missing artifact IDs. It must not throw — missing required artifacts are a validation failure, not an error.

### Requirement: Dependency order check

Before validating an artifact, `ValidateArtifacts` must check that all artifact IDs in its `requires` list are either `complete` or `skipped` (via `change.effectiveStatus(type)`). If a required dependency is neither `complete` nor `skipped`, validation of the dependent artifact is skipped and reported as a dependency-blocked failure. A `skipped` optional artifact satisfies the dependency — it is treated as resolved. `skipped` artifacts are not validated — there is no file to check.

### Requirement: Approval invalidation on content change

If the change has an active spec approval (`change.activeSpecApproval` is defined) and any artifact file's current content hash (after `preHashCleanup`) differs from the hash recorded in that approval's `artifactHashes`, `ValidateArtifacts` must call `change.invalidate('artifact-change', actor)` before proceeding with validation. This rolls the change back to `designing` and records the invalidation in history.

The same check applies to active signoff (`change.activeSignoff`): if any artifact's current hash differs from what was recorded in `activeSignoff.artifactHashes`, `change.invalidate('artifact-change', actor)` must be called.

A single invalidation call is made per `execute` invocation even if multiple artifacts have changed — the first hash mismatch triggers invalidation and the remaining artifacts are checked against the now-cleared approval state.

### Requirement: Delta validation

If the schema artifact declares `deltaValidations[]`, `ValidateArtifacts` must validate the delta file (the artifact file in the change directory) against those rules before attempting any merge. Each rule is evaluated against the delta file content:

- If `scope` is set, the check is restricted to the named delta section within the file.
- If `eachBlock` is set, the check runs once per block matching that pattern within the scope.
- `required: true` (default) means absence is a validation failure.
- `required: false` means absence is a warning.

If any delta validation rule with `required: true` fails, the artifact is not merged or marked complete. The failure is reported in the result.

If `eachBlock` references a section that has no entry in the artifact's `deltas[]`, `ValidateArtifacts` must report a configuration error — block boundaries cannot be determined.

### Requirement: Merge preview and conflict detection

For artifacts that declare `deltas[]`, `ValidateArtifacts` must:

1. Load the base spec from `SpecRepository` using the spec path.
2. Load the artifact (delta) file from `ChangeRepository`.
3. Call `mergeSpecs(base, delta, deltaConfigs, deltaOperations)` where `deltaConfigs` comes from the schema artifact's `deltas[]` and `deltaOperations` from the schema's `deltaOperations` field (or defaults).
4. If `mergeSpecs` throws `DeltaConflictError`, report it as a validation failure and do not proceed to `validations[]` or `markComplete`.

The merged result is used for `validations[]` checks. The base spec in `SpecRepository` is **not modified** — archive (not validate) is the step that writes the merged content to the spec repo.

For artifacts without `deltas[]` (new files with no merge step), `ValidateArtifacts` validates the artifact content directly against `validations[]`.

### Requirement: Structural validation

After a successful merge preview (or for non-delta artifacts), `ValidateArtifacts` runs all rules in the artifact's `validations[]` against the merged (or direct) content:

- If `scope` is set, the check is restricted to the named section.
- If `eachBlock` is set, the check runs once per block matching that pattern within the scope.
- `required: true` (default) means absence is a validation failure.
- `required: false` means absence is a warning.

`ValidateArtifacts` collects all failures and warnings for the artifact before moving on — it does not stop at the first failure.

### Requirement: Hash computation and markComplete

If all delta validations, conflict detection, and structural validations pass for an artifact, `ValidateArtifacts` must:

1. Compute the cleaned hash: apply each `preHashCleanup` substitution in declaration order to the artifact file content, then compute SHA-256 of the result.
2. Call `change.getArtifact(type).markComplete(cleanedHash)` on the corresponding `ChangeArtifact`.

If any validation step fails, `markComplete` must not be called for that artifact.

### Requirement: Result shape

`ValidateArtifacts.execute` must return a result object — it must not throw for validation failures. The result must include:

- `passed: boolean` — `true` only if all required artifacts are present and all validations pass with no errors
- `failures: ValidationFailure[]` — one entry per failed rule or missing artifact
- `warnings: ValidationWarning[]` — one entry per `required: false` rule that was absent

Each `ValidationFailure` must include the artifact ID, the rule pattern or description, and enough context for the CLI to produce a useful error message.

### Requirement: Save after validation

After all artifacts have been evaluated, `ValidateArtifacts` must call `changeRepository.save(change)` to persist any `markComplete` calls (updated `validatedHash` values) and any invalidation events appended to history. The save must happen even if some artifacts failed — partial progress must be persisted.

## Constraints

- `ValidateArtifacts` is the **only** code path that may call `Artifact.markComplete(hash)` — this is a cross-cutting constraint enforced by convention and test coverage
- The merged spec is never written to `SpecRepository` during validate — only during `ArchiveChange`
- `change.invalidate('artifact-change', actor)` is called at most once per `execute` invocation, even if multiple artifacts have changed
- Delta validations run on the delta file (change artifact); structural validations run on the merged (or direct) content
- A missing `deltaValidations[]` entry is not an error; the step is simply skipped
- A missing `validations[]` entry is not an error; the step is simply skipped
- `preHashCleanup` substitutions are applied only for hash computation, never to the actual file content on disk

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md) — Change entity, artifact model, approval invalidation, `effectiveStatus`
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — artifact definition, `validations[]`, `deltaValidations[]`, `requiredSpecArtifacts`, `preHashCleanup`, pattern matching rules
- [`specs/core/delta-merger/spec.md`](../delta-merger/spec.md) — `mergeSpecs` contract used during validation preview
- [`specs/core/storage/spec.md`](../storage/spec.md) — `ValidateArtifacts` is the sole path to `complete`; artifact status derivation
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — port-per-workspace pattern; manual DI at entry points
