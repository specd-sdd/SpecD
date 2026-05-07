# Staleness Detection

## Purpose

The code graph powers impact analysis, search, and hotspot detection — but there is no way to know whether it reflects the current state of the codebase. Users and agents can operate on stale data without realising it, leading to incorrect impact results, missed dependencies, and false confidence. This spec defines how staleness is detected by comparing VCS refs and the policy for handling stale data.

## Requirements

### Requirement: VCS ref storage at index time

The indexer SHALL accept an optional `vcsRef: string` field in `IndexOptions`. When provided, the indexer SHALL persist the ref in the graph store's metadata (via the `lastIndexedRef` meta key) after successful indexing completes. The ref value is opaque — it may be a git commit hash, an hg changeset ID, or any string returned by `VcsAdapter.ref()`.

When `vcsRef` is not provided (e.g. the project has no VCS), the `lastIndexedRef` meta key SHALL remain `null`. This is a valid state — staleness detection is simply unavailable.

### Requirement: Staleness comparison

A graph is **stale** when:

1. `lastIndexedRef` is not `null`, AND
2. The current VCS ref (obtained from `VcsAdapter.ref()` at query time) differs from `lastIndexedRef`

A graph is **fresh** when:

1. `lastIndexedRef` is not `null`, AND
2. The current VCS ref equals `lastIndexedRef`

When `lastIndexedRef` is `null`, the staleness state is **unknown** — no comparison is possible. The system SHALL NOT treat unknown as stale.

### Requirement: Graph derivation freshness

Graph freshness SHALL distinguish VCS freshness from graph-derivation freshness.

A graph has a **derivation mismatch** when the persisted graph fingerprint differs from the fingerprint computed for the current run configuration. For this iteration, the fingerprint SHALL be derived from:

- the effective `@specd/code-graph` package version loaded by the running CLI process
- a canonical hash of the resolved workspace objects derived from the active `specd.yaml`

A derivation mismatch means the graph was built under a different code-graph version or workspace layout, even if the current VCS ref is unchanged. This state is distinct from ordinary stale-by-VCS results and SHALL be surfaced explicitly in diagnostics.

### Requirement: Warn-not-block policy

Commands that read from the graph (e.g. `graph stats`, `graph search`, `graph impact`, `graph hotspots`) SHALL **warn** when the graph is stale but SHALL NOT block execution. The command SHALL always return results based on the current (possibly stale) graph data.

This is a deliberate design choice: stale results are better than no results, and the user can decide whether to re-index.

### Requirement: Derivation mismatch policy

Commands that read from the graph (e.g. `graph stats`, `graph search`, `graph impact`, `graph hotspots`) SHALL surface derivation-mismatch metadata when it is known, but they SHALL NOT silently reinterpret a mismatched graph as fresh.

`graph index` is the repair path for derivation mismatch. When indexing detects that the persisted graph fingerprint differs from the current fingerprint, it SHALL either:

- recreate the active graph and perform a full rebuild while printing a visible reason, or
- fail with a clear message that a force re-index is required because the stored graph was built with a different code-graph version or workspace configuration

This policy is independent of VCS freshness. A graph MAY be VCS-fresh and still require rebuild because its derivation fingerprint no longer matches.

### Requirement: GraphStatistics extension

`GraphStatistics` SHALL include a `lastIndexedRef: string | null` field alongside the existing `lastIndexedAt`. This field is populated from the graph store's metadata. When the store has no ref stored, the value SHALL be `null`.

### Requirement: Staleness in graph stats output

**Text output**:

- After `Last indexed`, when stale, append: `⚠ Graph is stale (indexed at <7-char-ref>, current: <7-char-ref>)`
- When `lastIndexedRef` is `null`, no staleness line SHALL be shown
- When a derivation fingerprint mismatch is detected, append: `⚠ Derivation fingerprint mismatch — graph built with different code-graph version or workspace configuration`

**JSON/TOON output**:

- `stale` (`boolean | null`) — `true` if stale, `false` if fresh, `null` if unknown
- `currentRef` (`string | null`) — the current VCS ref, or `null` if unavailable
- `fingerprintMismatch` (`boolean | null`) — `true` if derivation fingerprint differs, `false` if it matches, `null` if no stored fingerprint exists

## Constraints

- Staleness detection is VCS-agnostic — it uses `VcsAdapter` from `@specd/core`, not git-specific APIs
- The VCS ref is stored as an opaque string — no parsing, validation, or truncation at storage time
- No auto-refresh: detecting staleness never triggers re-indexing
- The current VCS ref is resolved by the CLI layer (not by `@specd/code-graph`) and passed as a parameter

## Spec Dependencies

- [`code-graph:graph-store`](../graph-store/spec.md) — `GraphStore` meta storage, `GraphStatistics`
- [`code-graph:indexer`](../indexer/spec.md) — `IndexOptions`, `IndexCodeGraph`
- [`cli:graph-stats`](../../cli/graph-stats/spec.md) — `graph stats` command output
