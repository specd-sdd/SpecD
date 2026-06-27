# GetChangeSpecCoverage

## Purpose

Change review surfaces (Studio, future API) need per-spec implementation coverage for every spec in a change's scope. Callers should not manually load a change, iterate `specIds`, and invoke coverage queries. `GetChangeSpecCoverage` loads the change via `ChangeRepository` and aggregates `GetSpecCoverage` results.

## Requirements

### Requirement: Returns change-level coverage

`GetChangeSpecCoverage.execute(input)` MUST return `GetChangeSpecCoverageResult` with:

- `changeName: string`
- `specs: GetSpecCoverageResult[]` — one entry per `specId` on the change, in manifest declaration order

### Requirement: Resolves change by name

`GetChangeSpecCoverage` MUST load the change via `input.changes.get(input.changeName)`. When the change does not exist, it MUST throw `ChangeNotFoundError` from `@specd/core`.

### Requirement: Delegates per-spec coverage

For each `specId` on the loaded change, `GetChangeSpecCoverage` MUST delegate to `GetSpecCoverage.execute({ provider, specId })`.

### Requirement: Accepts repository and provider

`GetChangeSpecCoverageInput` MUST include:

- `provider: CodeGraphProvider` (already opened)
- `changes: ChangeRepository`
- `changeName: string`

The use case MUST NOT open or close the provider or mutate the change.

### Requirement: Factory wires dependencies

`createGetChangeSpecCoverage(getSpecCoverage: GetSpecCoverage)` in composition MUST inject `GetSpecCoverage` as a constructor dependency.

## Constraints

- MUST NOT load change artifact content beyond what `ChangeRepository.get` returns for `specIds`.
- MUST NOT modify graph data.

## Spec Dependencies

- [`code-graph:get-spec-coverage`](../get-spec-coverage/spec.md) — per-spec coverage delegation
- [`code-graph:composition`](../composition/spec.md) — `CodeGraphProvider`
- [`core:change-repository-port`](../../../core/change-repository-port/spec.md) — change lookup port
