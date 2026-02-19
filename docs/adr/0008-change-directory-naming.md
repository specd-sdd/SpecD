# ADR-0008: Change Directory Naming — Timestamp Prefix

## Status
Accepted

## Context
Change directories need a naming scheme that satisfies two requirements: directories should sort chronologically in any file browser or `ls` output, and the scheme must be collision-safe when multiple developers create changes concurrently on the same branch.

Approaches considered:
- **Sequential integers** (e.g. `0001-add-oauth-login`) — visually ordered, but two developers working on the same branch can pick the same number concurrently. Requires a coordination mechanism (central counter, lock file) that adds complexity and fails in offline or distributed workflows.
- **Plain name only** (e.g. `add-oauth-login`) — no ordering information; filesystem sort is alphabetical, not chronological.
- **Date prefix** (`YYYYMMDD-add-oauth-login`) — sortable by day; multiple changes on the same day have undefined intra-day order.
- **Datetime prefix** (`YYYYMMDD-HHmmss-add-oauth-login`) — sortable to the second; two developers creating a change at the exact same second on the same branch is an edge case unlikely in practice; the manifest's `createdAt` (millisecond precision) disambiguates programmatically if needed.

## Decision

Change directories use the format `YYYYMMDD-HHmmss-<name>` where the timestamp is the moment the change directory is created. Example: `20260219-143022-add-oauth-login`.

The timestamp prefix is a **filesystem convention only**. It is never stored in the manifest, never exposed by the domain model, and never required in CLI arguments. The change name used throughout the system is always the unprefixed form: `add-oauth-login`.

`FsChangeRepository` handles the prefix transparently:
- `get("add-oauth-login")` globs `*-add-oauth-login` to resolve the directory
- `list()` returns entries sorted by directory name, which produces chronological order
- `save(change)` generates the prefixed directory name from `change.createdAt` on first write

## Consequences
- Change directories are visually ordered chronologically in any file browser, `ls`, or git status output
- No coordination mechanism required — the timestamp is local and per-second precision is sufficient
- The domain model and CLI remain clean — no prefix leaks through the abstraction boundary
- `FsChangeRepository.get()` requires a glob rather than a direct path lookup, which is a negligible cost

## Spec

- [`specs/_global/storage/spec.md`](../../specs/_global/storage/spec.md)
