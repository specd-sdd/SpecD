# GetGraphHealth

## Purpose

Hosts (`graph stats`, `project status --graph`, SDK snapshot builders) need graph statistics plus VCS staleness and derivation-fingerprint diagnostics without reimplementing orchestration in each adapter. `GetGraphHealth` centralizes lock assertion, statistics retrieval, VCS ref resolution, and fingerprint comparison into one application use case that operates on an already-open `CodeGraphProvider`.

## Requirements

### Requirement: Returns enriched graph health

`GetGraphHealth.execute(input)` MUST return `GetGraphHealthResult` containing all `GraphStatistics` fields plus:

- `stale: boolean | null` — VCS staleness per `code-graph:staleness-detection`
- `currentRef: string | null` — current VCS ref from `createVcsAdapter(config.projectRoot)`, or `null` when unavailable
- `fingerprintMismatch: boolean | null` — derivation mismatch when workspaces and `codeGraphVersion` allow comparison, else `null`

### Requirement: Provider-owned availability and error propagation

`GetGraphHealth` MUST rely on `provider.getStatistics()` for graph availability checks.

The use case MUST NOT call externally exposed lock helpers or accept a caller-controlled lock-assertion escape hatch.

If the provider reports that the graph is busy or stale, the use case MUST let that provider error propagate unchanged to the caller.

### Requirement: Computes VCS staleness

`GetGraphHealth` MUST resolve the current VCS ref via `createVcsAdapter` and apply `isGraphStale(lastIndexedRef, currentRef)` from staleness detection. Unknown staleness (`lastIndexedRef` is `null`) MUST yield `stale: null`, not `true`.

### Requirement: Computes derivation fingerprint mismatch

When `input.workspaces` is provided and `stats.graphFingerprint` is not `null`, `GetGraphHealth` MUST parse the stored fingerprint map, build the effective graph config from `input.config`, and call `detectFingerprintMismatch` with `input.codeGraphVersion`, `config.projectRoot`, workspaces, and graph config. When comparison cannot run, `fingerprintMismatch` MUST be `null`.

### Requirement: Accepts open provider and project inputs

`GetGraphHealthInput` MUST include:

- `config: SpecdConfig`
- `provider: CodeGraphProvider` (already opened)
- `codeGraphVersion: string`
- optional workspaces for fingerprint comparison

The use case MUST NOT open or close the provider.

### Requirement: Factory wires dependencies

`createGetGraphHealth()` in composition MUST return a stateless `GetGraphHealth` instance with no config capture — all inputs arrive per `execute()` call.

## Constraints

- MUST NOT mutate the graph store or trigger indexing.
- MUST NOT load change entities or compile project context.
- Delegates statistics to `provider.getStatistics()` only.

## Spec Dependencies

- [`code-graph:composition`](../composition/spec.md) — `CodeGraphProvider`, `GraphStatistics`
- [`code-graph:staleness-detection`](../staleness-detection/spec.md) — `isGraphStale`, fingerprint helpers
- [`core:config`](../../../core/config/spec.md) — `SpecdConfig`, VCS adapter factory
- [`core:list-workspaces`](../../../core/list-workspaces/spec.md) — workspace shape for fingerprint input
