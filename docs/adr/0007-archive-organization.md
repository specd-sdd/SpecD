---
status: accepted
date: 2026-02-19
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0007: Archive Organization — Configurable Pattern, Index with Glob Fallback

## Context and Problem Statement

A naive archive implementation stores all archived changes in a single flat directory. A project active for several years with multiple developers can accumulate hundreds or thousands of entries in that directory, making it difficult to navigate and slow to list. The archive needs an organization strategy that is flexible, collision-safe, and performant at scale.

## Decision Drivers

- Teams have different conventions for organizing archived changes; a single fixed structure forces all teams into one pattern
- SpecPath uses `/` as its segment separator, which is also the filesystem path separator — any slug transformation produces ambiguous results
- Developers can create changes concurrently on the same branch, ruling out coordination-dependent schemes
- Archive lookup must be fast at scale without sacrificing resilience to index corruption or drift

## Considered Options

- **Fixed subdirectory structure** (e.g. always by year/month) — inflexible, forces all teams into one convention
- **Scope-based subdirectories** — `auth/oauth` nesting in the archive; discarded because SpecPath segments use `/` as separator, creating ambiguous slugs on all platforms and potential collisions between scopes with different structures (e.g. `auth/oauth-login` and `auth-oauth/login` both slug to `auth-oauth-login`)
- **Sequential numeric prefix** — visually ordered, but developers working on the same branch can create changes concurrently and collide on the same number
- **Configurable pattern with date variables** — flexible, collision-safe, human-readable
- **Recursive glob only** for lookup — simple, no extra state, but O(n) on every lookup
- **Flat index only** for lookup — O(1) lookups, but fragile if the index goes out of sync
- **Index with glob fallback and reindex command** — resilient: fast path for the common case, self-healing on inconsistency

## Decision Outcome

Chosen option: "Configurable pattern with index-first lookup, glob fallback, and reindex command", because it gives teams layout flexibility while keeping lookups fast and recoverable without requiring external coordination.

The archive `fs` adapter exposes a `pattern` configuration field in `specd.yaml` under `storage.archive`. The pattern controls how archived change directories are organized within the archive root. Supported variables: `{{year}}`, `{{month}}`, `{{day}}`, `{{change.name}}`, `{{change.archivedName}}`. The default is `{{change.archivedName}}` (flat layout).

`{{change.scope}}` is explicitly excluded as a pattern variable. SpecPath uses `/` as its segment separator, which is also the filesystem path separator. Any slug transformation (e.g. replacing `/` with `-`) produces ambiguous results — two different scope paths can produce the same slug. Teams that want domain grouping should encode the domain in the change name itself.

`FsArchiveRepository` maintains an `index.jsonl` at the archive root. Each line is a JSON object `{"name","path"}`. The file is kept in chronological order (oldest first, newest last) so that `archive()` only ever appends a line at the end — the git diff of `index.jsonl` over time shows only lines added at the bottom or lines removed, never reorderings. `get(name)` scans from the end of the file so the most recent entry is found first without loading the full file into memory. On a scan miss, a recursive glob fallback is attempted and the recovered entry is appended.

`reindex()` is declared on the `ArchiveRepository` port, not on the `fs` adapter. The CLI calls the port; it has no knowledge of the underlying storage mechanism. The `fs` adapter implements `reindex()` by globbing all `manifest.json` files under the archive root, sorting by `archivedAt`, and writing a clean `index.jsonl` in chronological order. Future adapters implement it according to their own storage — a database adapter rebuilds query indexes, a remote adapter may be a no-op.

### Consequences

- Good, because teams can choose flat (default), by-year, by-month, or by-day organization without forking specd
- Good, because the archive remains navigable at any scale
- Good, because the index provides fast lookups; inconsistency is recoverable via `specd storage reindex`
- Bad, because `{{change.scope}}` is not available in patterns — scope-based grouping must be achieved through change naming conventions
- Bad, because `FsArchiveRepository` has slightly more complexity than a naive implementation, but the behavior is fully deterministic and testable

### Confirmation

`FsArchiveRepository` unit tests verify: configurable pattern variables produce the correct directory paths, `get()` uses index-first lookup, a scan miss triggers the glob fallback and appends the recovered entry to the index, and `reindex()` reconstructs `index.jsonl` in chronological order from a glob of manifest files.

## More Information

### Spec

- [`specs/core/storage/spec.md`](../../specs/core/storage/spec.md)
