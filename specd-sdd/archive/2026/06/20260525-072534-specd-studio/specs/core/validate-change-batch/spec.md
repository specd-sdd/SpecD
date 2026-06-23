# ValidateChangeBatch

## Purpose

Single orchestration for **change validate --all**: walk the active schema artifact DAG once, delegate each step to `ValidateArtifacts` with exactly one `artifactId`, and aggregate per-step results. CLI, API, and Studio MUST NOT reimplement this loop.

## Requirements

### Requirement: constructor and dependencies

`ValidateChangeBatch` MUST receive `ChangeRepository`, `SchemaProvider`, and `ValidateArtifacts` at construction time (wired on `kernel.changes.validateBatch`).

### Requirement: input

`ValidateChangeBatchInput` MUST include:

- `name` — change name (required)
- `artifactId` — optional; when set, only DAG steps for that artifact id run

### Requirement: empty scope

When the change has no `specIds`, `execute` MUST return `{ passed: true, total: 0, results: [] }` without calling `ValidateArtifacts`.

### Requirement: DAG walk

`execute` MUST load the change, resolve the active schema, and iterate `schema.artifactDag().topologicalOrder()`.

For each artifact type in order:

- **`scope: change`** — call `ValidateArtifacts.execute({ name, artifactId })` **without** `specPath` exactly once.
- **`scope: spec`** — call `ValidateArtifacts.execute({ name, specPath, artifactId })` once per entry in `change.specIds`.

When `artifactId` is provided, skip artifact ids that do not match.

### Requirement: aggregated result

`ValidateChangeBatchResult` MUST expose:

- `passed` — `true` only if every step passed
- `total` — number of scheduled steps
- `results[]` — each with `spec` (`null` for change-scoped), `artifact`, `passed`, `failures`, `warnings`, `files` (same shapes as `ValidateArtifactsResult`)

The use case MUST run all scheduled steps even after a failure (no early abort).

### Requirement: not a substitute for ValidateSpecs

`ValidateChangeBatch` validates **change artifacts** only. Canonical workspace spec validation remains `ValidateSpecs`.

## Spec Dependencies

- [`core:validate-artifacts`](../../../../specs/core/validate-artifacts/spec.md) — per-step delegate
- [`core:change`](../../core/change/spec.md) — change scope and artifact DAG

CLI `--all` delegation lives in [`cli:change-validate`](../../../../specs/cli/change-validate/spec.md) (delta in this change), which depends on this use case — not the reverse.
