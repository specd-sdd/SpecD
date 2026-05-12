# Proposal: graph-cli-context-and-kind-filters

## Motivation

The `graph` CLI commands do not currently follow a single, explicit model for context resolution. Some still document `--path`, some already rely on config discovery, and none cleanly define bootstrap behavior when no `specd.yaml` exists. At the same time, `--kind` filtering in graph search is too limited for real use because repeated flags collapse to the last value instead of expressing a list.

## Current behaviour

Today the graph commands are inconsistent:

- `graph index` already derives workspaces from `resolveCliContext()` and no longer behaves like a path-based command, but its verify coverage is still inconsistent.
- `graph stats` and `graph impact` still specify `--path` as the way to locate the graph workspace.
- Graph commands do not expose the same explicit `--config <path>` contract used elsewhere in the CLI.
- There is no agreed bootstrap mode for running graph commands against a repo root when no `specd.yaml` is present.
- `graph search` and `graph hotspots` only model `--kind` as a single value. Repeating `--kind` is accepted by the parser but effectively becomes last-write-wins, which is not useful when the caller wants `class,method,...`.

## Proposed solution

Define one consistent context-resolution model for graph commands:

- `--config` and `--path` are mutually exclusive.
- `--config <path>` keeps the same meaning it already has elsewhere in the CLI: use that config file explicitly.
- When `--path` is absent, graph commands first try explicit config, then autodetected config, and only fall back to repo-root mode when no config exists.
- `--path <root>` means bootstrap mode: treat the target repository root as a synthetic single-workspace project and ignore config.
- When no config exists and graph commands fall back automatically, that fallback is also bootstrap mode, not a normal production operating mode.
- In bootstrap mode, graph commands behave as if there were a `default` workspace whose `codeRoot` is the resolved VCS root.
- Documentation must make this boundary explicit: configured operation is the normal mode; `--path` and no-config fallback exist to support bootstrap and early repository setup.

Also define one consistent kind-filter model for graph symbol queries:

- `--kind` accepts a single comma-separated list such as `class,method,symbol`.
- Every token is validated against the allowed `SymbolKind` values.
- Any invalid token is a command error.
- The validated kind list is passed through to the graph query layer instead of collapsing to one value.

## Specs affected

### New specs

- `cli:cli/graph-hotspots`: define command contract, filtering semantics, and output requirements for `specd graph hotspots`, including multi-kind filtering.
  - Depends on: `cli:cli/entrypoint`, `core:core/config`, `code-graph:code-graph/composition`

### Modified specs

- `cli:cli/graph-index`: define `--config` / `--path` resolution semantics for indexing, including repo-root bootstrap mode and the precedence rules for config discovery.
  - Depends on (added): `core:core/config`
- `cli:cli/graph-search`: replace single-kind filtering with validated comma-separated kind lists and align command context resolution with the graph CLI model.
  - Depends on (added): `core:core/config`
- `cli:cli/graph-stats`: replace path-only workspace resolution with the graph CLI context model, including bootstrap behavior.
  - Depends on (added): `core:core/config`
- `cli:cli/graph-impact`: replace path-only workspace resolution with the graph CLI context model.
  - Depends on (added): `core:core/config`
- `core:core/config`: clarify how the existing config-discovery contract relates to CLI commands that intentionally support repo-root bootstrap mode when no config exists.
  - Depends on (added): none

## Impact

Affected code areas are concentrated in:

- `packages/cli/src/commands/graph/*`
- `packages/cli/src/helpers/cli-context.ts`
- `packages/cli/src/load-config.ts` and related config-resolution helpers
- `packages/code-graph/src/domain/value-objects/*` and query/filter plumbing for multi-kind filtering

This change also affects CLI docs for the `graph` command group and test coverage around command parsing, config discovery, bootstrap mode, and invalid kind values.

## Technical context

The current CLI already standardizes `--config <path>` across many non-graph commands, so graph should align with that established contract rather than inventing a new meaning. The graph code also shows that `resolveCliContext()` is a real hotspot in the CLI, so the context-resolution behavior needs to be deliberate and shared rather than patched per command.

For kind filtering, the CLI already has a reusable helper in `packages/cli/src/helpers/parse-comma-values.ts`, while `@specd/code-graph` still exposes only single-kind filters through `SearchOptions.kind` and `HotspotOptions.kind`. The change therefore needs spec coverage on both the CLI contract and the downstream query behavior.

An important scope boundary was agreed explicitly: this work must stay separate from the archived PHP/code-graph change. It is a graph CLI/product semantics change, not a continuation of the previous language-adapter work.

The user also wants the docs updated under `docs/` so the CLI reference makes the intended usage clear. In particular, bootstrap mode must be documented as a setup and exploration aid rather than the recommended steady-state mode for configured projects.

## Open questions

None at proposal time. The product-level semantics for `--config`, `--path`, bootstrap fallback, and comma-separated `--kind` validation were already settled during discovery.
