# Proposal: cli-specs-list-count

## Motivation

CLI users and automated agents need a fast, lightweight way to query spec volume metrics (total spec count globally and broken down per workspace) without printing every individual spec entry and title.

## Current behaviour

Currently, `specd specs list` (and `specd spec list`) only supports listing spec catalog rows across workspaces with optional pagination (`--limit`, `--page`, `--after-key`) and summary descriptions (`--summary`). Users who want to discover only counts must retrieve and parse the entire list.

## Proposed solution

Introduce a `--count` flag on `specd specs list` / `specd spec list` that returns total and per-workspace spec counts:

- Supports text output (`Total: <total>\n\nWorkspaces:\n  <ws>: <count>`, or `<ws>: <count>` when filtered by a single workspace).
- Supports machine-readable `json` and `toon` output structures: `{ total: number, workspaces: Array<{ name: string, count: number }> }`.
- Integrates with `--workspace <name>` filtering.
- Enforces mutual exclusivity with `--summary` (raising a validation error if both are specified).

## Specs affected

### New specs

- none

### Modified specs

- `cli:spec-list`: Add specification for `--count` flag, output format structures (`text`, `json`, `toon`), `--workspace` filter integration, and mutual exclusivity with `--summary`.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- `@specd/cli`: Command registration and output handling in `packages/cli/src/commands/spec/list.ts`.
- No breaking changes; existing `specs list` behavior remains identical when `--count` is omitted.

## Technical context

- `kernel.specs.list.execute` already calculates per-workspace metadata and total counts from each workspace's `SpecRepository`.
- `CliValidationError` is used across `@specd/cli` for mutual exclusivity errors (such as `--count` with `--summary`) to ensure consistent exit codes and structured JSON/TOON error payloads.

## Open questions

- none
