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

### Requirement: Warn-not-block policy

Commands that read from the graph (e.g. `graph stats`, `graph search`, `graph impact`, `graph hotspots`) SHALL **warn** when the graph is stale but SHALL NOT block execution. The command SHALL always return results based on the current (possibly stale) graph data.

This is a deliberate design choice: stale results are better than no results, and the user can decide whether to re-index.

### Requirement: GraphStatistics extension

`GraphStatistics` SHALL include a `lastIndexedRef: string | null` field alongside the existing `lastIndexedAt`. This field is populated from the graph store's metadata. When the store has no ref stored, the value SHALL be `null`.

### Requirement: Staleness in graph stats output

The `graph stats` command SHALL resolve the current VCS ref and compare it against `lastIndexedRef`:

- **Text output**: If stale, append a warning line after `Last indexed`:

  ```
  ⚠ Graph is stale (indexed at <short-ref>, current: <short-ref>)
  ```

  Where `<short-ref>` is the first 7 characters of the ref. If `lastIndexedRef` is `null`, no staleness line is shown.

- **JSON/TOON output**: Add two fields to the output object:
  - `stale: boolean | null` — `true` if stale, `false` if fresh, `null` if unknown
  - `currentRef: string | null` — the current VCS ref, or `null` if unavailable

## Constraints

- Staleness detection is VCS-agnostic — it uses `VcsAdapter` from `@specd/core`, not git-specific APIs
- The VCS ref is stored as an opaque string — no parsing, validation, or truncation at storage time
- No auto-refresh: detecting staleness never triggers re-indexing
- The current VCS ref is resolved by the CLI layer (not by `@specd/code-graph`) and passed as a parameter

## Spec Dependencies

- [`specs/code-graph/graph-store/spec.md`](../graph-store/spec.md) — `GraphStore` meta storage, `GraphStatistics`
- [`specs/code-graph/indexer/spec.md`](../indexer/spec.md) — `IndexOptions`, `IndexCodeGraph`
- [`specs/cli/graph-stats/spec.md`](../../cli/graph-stats/spec.md) — `graph stats` command output
