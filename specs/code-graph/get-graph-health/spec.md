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

### Requirement: Content freshness and coverage result

`GetGraphHealthResult` SHALL additionally expose working-tree/content freshness, backend schema/generation compatibility, partial-index state, and queryable coverage summaries/reasons for excluded, unsupported, parse-failed, and partially indexed targets.

`excluded` and `unsupported` SHALL be terminal, explicit outcomes: they remain visible in the coverage summary and targeted resolution trust, but SHALL NOT by themselves make aggregate coverage incomplete. `parse-failed` and `partial` SHALL make aggregate coverage incomplete and aggregate health non-current. Coverage reason codes SHALL participate in aggregate health reasons only for incomplete coverage.

Health fields SHALL use stable machine-readable reason codes and distinguish current, stale, and unknown where evidence cannot be computed. A discovery, stat, content-read, or hashing failure SHALL yield unknown evidence for the affected scope; it MUST NOT be converted into a false content mismatch or set a stale latch. The use case SHALL compare indexed content evidence with current project state without triggering indexing. It MAY perform only semantic freshness-cache mutations: refresh equal-content observations and atomically set monotonic workspace/global stale latches.

A consumer SHALL be able to determine from this result whether absence for an addressed target is trustworthy enough to declare stale.

### Requirement: Aggregate and workspace health projection

`GetGraphHealthResult` SHALL expose aggregate `state: current | stale | unknown`, `knownStaleSinceLastIndex`, stable reasons, and an ordered workspace collection containing workspace name, state, workspace latch, `vcs | filesystem | hybrid` assessment mode, and reasons.

Aggregate precedence SHALL be stale, then unknown, then current. A true aggregate latch SHALL return stale without rescanning scopes or resources. A transient assessment failure SHALL return unknown without modifying latches. Project-global derivation or input failures MAY make the aggregate non-current without assigning a false workspace failure.

Structured delivery formats SHALL retain every workspace. Text presentation SHALL show aggregate health and only non-current workspaces. Results MUST NOT expose absolute workspace or VCS roots.

### Requirement: Efficient scope assessment

VCS-backed workspaces SHALL be grouped by detected repository root and share one normalized modified-path evaluation. Code Graph SHALL filter complete adapter paths through effective graph visibility before stat or hashing. Excluded-only changes MUST leave workspace and aggregate latches unchanged.

Non-VCS assessment SHALL compare visible membership and stored observations, hash only when mtime or size differs, refresh equal-content observations, and stop on the first proven mismatch. An inability to inspect a candidate SHALL stop or retain assessment as unknown unless another independent candidate already proves staleness. Health MUST NOT inspect every symbol or invoke targeted resource assessment across the complete graph.

## Constraints

- MUST NOT trigger indexing, destructive recreation, or arbitrary graph mutation.
- MAY mutate only semantic freshness cache state: refresh equal-content input observations and monotonically set workspace/global stale latches.
- MUST NOT load change entities or compile project context.
- Uses the already-open provider and MUST NOT open or close it.

## Spec Dependencies

- [`code-graph:composition`](../composition/spec.md) — `CodeGraphProvider`, `GraphStatistics`
- [`code-graph:staleness-detection`](../staleness-detection/spec.md) — `isGraphStale`, fingerprint helpers
- [`core:config`](../../../core/config/spec.md) — `SpecdConfig`, VCS adapter factory
- [`core:list-workspaces`](../../../core/list-workspaces/spec.md) — workspace shape for fingerprint input
