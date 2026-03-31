# Graph Hotspots

## Purpose

Users and agents need a fast way to identify the most structurally coupled symbols in the code graph before changing code, writing specs, or exploring an unfamiliar area. The `specd graph hotspots` command provides that ranking, including filtering and output options that make the result usable both for day-to-day inspection and for bootstrap work against repositories that do not yet have a full `specd.yaml`.

## Requirements

### Requirement: Command signature

```text
specd graph hotspots [--workspace <name>] [--kind <kinds>] [--file <path>] [--exclude-path <pattern>] [--exclude-workspace <name>] [--limit <n>] [--min-score <n>] [--min-risk LOW|MEDIUM|HIGH|CRITICAL] [--config <path> | --path <path>] [--format text|json|toon]
```

- `--workspace <name>` — optional; filter results to a single workspace
- `--kind <kinds>` — optional; comma-separated symbol kinds filter such as `class,method,enum`
- `--file <path>` — optional; filter to a single file path
- `--exclude-path <pattern>` — optional, repeatable; exclude symbols whose file path matches the glob pattern
- `--exclude-workspace <name>` — optional, repeatable; exclude results from the named workspace
- `--limit <n>` — optional; maximum number of entries returned
- `--min-score <n>` — optional; minimum hotspot score
- `--min-risk <level>` — optional; minimum risk level
- `--config <path>` — optional; explicit path to `specd.yaml`, matching the standard CLI meaning
- `--path <path>` — optional; repo-root bootstrap mode
- `--format text|json|toon` — optional; output format, defaults to `text`

`--config` and `--path` are mutually exclusive.

When no explicit filter flags are passed, the command SHALL apply its default filters: `minScore > 0`, `minRisk >= MEDIUM`, and `limit = 20`. Any explicit filter flag SHALL remove those implicit defaults, so only the explicitly requested constraints apply.

### Requirement: Context resolution

The command SHALL use the shared graph CLI context model:

- If `--config <path>` is passed, that config file SHALL be used directly.
- If `--path <path>` is passed, the command SHALL enter bootstrap mode, ignore config discovery, and treat the resolved repository root as a synthetic single-workspace project.
- If neither flag is passed, the command SHALL first try config autodiscovery.
- If autodiscovery succeeds, the discovered config SHALL be used.
- If autodiscovery does not find config, the command SHALL fall back to bootstrap mode using the resolved repository root.

Bootstrap mode exists for setup and exploration, not as the intended steady-state mode for configured projects.

In bootstrap mode, the command SHALL behave as if there were a `default` workspace whose `codeRoot` is the resolved VCS root.

### Requirement: Kind filter semantics

The `--kind` option SHALL accept exactly one comma-separated list value. Each token SHALL be trimmed and validated against the allowed `SymbolKind` values.

If any token is invalid, the command SHALL fail with a CLI error and SHALL NOT execute the query.

The validated kind list SHALL be passed through to the hotspot query layer as a multi-kind filter rather than being collapsed to a single last value.

### Requirement: Hotspot retrieval

The command SHALL resolve graph context, create a `CodeGraphProvider`, and delegate hotspot computation to `provider.getHotspots(...)`.

The command SHALL pass all requested filters through to the provider, including workspace, kind list, file path, exclusion filters, limit, score threshold, and minimum risk.

### Requirement: Output format

In `text` mode, the command SHALL print a ranked table with:

- total returned entries and total symbol count
- per-entry score
- per-entry risk level
- per-entry cross-workspace caller count
- per-entry kind
- per-entry symbol name
- workspace-qualified file location

If no entries match, the command SHALL output `No hotspots found.`

In `json` or `toon` mode, the command SHALL output an object containing `totalSymbols` and `entries`. Each entry SHALL include the symbol payload, `score`, `directCallers`, `crossWorkspaceCallers`, `fileImporters`, `riskLevel`, and the derived `workspace` field.

### Requirement: Error cases

If both `--config` and `--path` are passed, the command SHALL fail with a CLI error before attempting any graph access.

If the provider cannot be opened or hotspot retrieval fails due to an infrastructure error, the command SHALL exit with code 3.

### Requirement: CLI reference documentation

The CLI reference in `docs/cli/cli-reference.md` SHALL document `graph hotspots`, including:

- command signature
- `--kind` as a comma-separated list
- `--config` and `--path` behavior
- the fact that `--path` and no-config fallback are bootstrap-only modes, not the normal configured mode

## Constraints

- The CLI SHALL delegate hotspot computation to `@specd/code-graph`
- `--kind` validation SHALL use the same allowed kind set as the code graph symbol model
- Bootstrap mode SHALL not reinterpret `--config`; it is selected only by `--path` or by missing config

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — shared CLI error handling, output conventions, and explicit config flag semantics
- [`specs/core/config/spec.md`](../../core/config/spec.md) — config discovery contract and bootstrap-mode relationship to configured operation
- [`specs/code-graph/composition/spec.md`](../../code-graph/composition/spec.md) — CodeGraphProvider facade used by the command
