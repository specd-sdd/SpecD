# GetSpecCoverage

## Purpose

Studio and future API surfaces need implementation coverage for a single spec — which files and symbols the graph links to that spec — without callers orchestrating multiple `CodeGraphProvider` query methods. `GetSpecCoverage` returns a structured coverage snapshot for one `specId`.

## Requirements

### Requirement: Returns spec coverage snapshot

`GetSpecCoverage.execute(input)` MUST return `GetSpecCoverageResult` with:

- `specId: string` — echoed from input
- `found: boolean` — `true` when `provider.getSpec(specId)` returns a node
- `coveredFiles: Relation[]` — from `provider.getCoveredFiles(specId)`
- `coveredSymbols: Relation[]` — from `provider.getCoveredSymbols(specId)`
- `fileCount: number` — count of unique file targets in `coveredFiles`
- `symbolCount: number` — count of unique symbol targets in `coveredSymbols`

When the spec is not indexed (`found: false`), coverage arrays MUST be empty and counts MUST be zero.

### Requirement: Accepts open provider

`GetSpecCoverageInput` MUST include:

- `provider: CodeGraphProvider` (already opened)
- `specId: string`

The use case MUST NOT open or close the provider.

### Requirement: Factory wires dependencies

`createGetSpecCoverage()` in composition MUST return a stateless `GetSpecCoverage` instance.

## Constraints

- MUST NOT throw when the spec is absent from the graph — return `found: false` instead.
- MUST NOT load spec artifact content from `SpecRepository`.

## Spec Dependencies

- [`code-graph:composition`](../composition/spec.md) — provider query delegation
- [`code-graph:symbol-model`](../symbol-model/spec.md) — `Relation` vocabulary
