# Proposal: host-controlled-list-limits

## Motivation

Repository list ports currently default `limit` to 100. That blocks structural consumers (agents, Studio workspace trees) that need the full catalog in one call. Pagination defaults belong on the host (CLI), not on the repository contract.

## Current behaviour

- Every listable repository port applies `limit = 100` when omitted (`paginateList`).
- Core list use cases inherit that default (or re-apply it when aggregating).
- Internal callers that need a full catalog pass `limit: Number.MAX_SAFE_INTEGER`.
- CLI list commands all share the same default-100 helper, including `spec list`.

## Proposed solution

- Repository ports and core list use cases: **no default limit**. When `limit` is omitted, return the full filtered set. When `limit` is set, paginate as today. `page` without `limit` is an error; `after` without `limit` remains valid (all remaining items after the cursor). Unpaginated responses set `meta.limit === meta.total`.
- CLI change lists (`changes`, `drafts`, `archive`, `discarded`): host default `--limit 100`, with `--limit all` to opt out and request the full listing.
- CLI `spec list`: **no** default limit so agents always receive the complete listing unless they pass an explicit numeric `--limit`.
- Update CLI and use-case documentation to match.

## Specs affected

### New specs

- none

### Modified specs

- `core:repository-port`: Remove default limit 100 from shared list pagination types; define unpaginated `meta.limit`, `page`-requires-`limit`, and `after`-without-`limit` semantics.
  - Depends on (added): none
  - Depends on (removed): none

- `core:list-specs`: Forward pagination options without applying a default limit; return what each workspace repo returns.
  - Depends on (added): none
  - Depends on (removed): none

- `core:spec-repository-port`: Align list contract with host-controlled limits (no implicit default 100).
  - Depends on (added): none
  - Depends on (removed): none

- `core:change-repository-port`: Align list contract with host-controlled limits (no implicit default 100).
  - Depends on (added): none
  - Depends on (removed): none

- `core:archive-repository-port`: Align list contract with host-controlled limits (no implicit default 100).
  - Depends on (added): none
  - Depends on (removed): none

- `cli:spec-list`: No CLI default limit; truncation hint only when an explicit numeric `--limit` truncates results.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:change-list`: CLI default `--limit 100`; support `--limit all`; document host-owned default.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:drafts-list`: Same host default and `--limit all` behaviour as change list.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:archive-list`: Same host default and `--limit all` behaviour as change list.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:discarded-list`: Same host default and `--limit all` behaviour as change list.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- Core: `ListOptions` / `paginateList`, listable FS repositories, list use cases, and callers that currently use `Number.MAX_SAFE_INTEGER`.
- CLI: shared list-pagination helper and change/spec list commands; docs under `docs/cli` and `docs/core`.
- Downstream hosts (API/Studio) benefit without a magic unlimited limit once ports return full catalogs by default.

## Technical context

- Decided: invert the port default rather than add `all: true` on `ListOptions`.
- Decided: use cases are pure forwarders of host-provided options; defaults live only in the CLI host for change buckets.
- Decided: special CLI value is `--limit all` (not `none`).
- Decided: `meta.limit === meta.total` when unpaginated; `page` without `limit` errors; `after` without `limit` returns the remainder after the cursor.
- Truncation hints only when a numeric limit is in effect and `count < total`.
- Docs update is in scope for this change.

## Open questions

- none — decisions above were closed before design.
