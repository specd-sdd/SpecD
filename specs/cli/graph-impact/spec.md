# Graph Impact

## Purpose

Before modifying code, developers and agents need to understand the blast radius — which other files and symbols depend on the change. The `specd graph impact` command runs impact analysis on a file, symbol, or set of changed files, reporting risk level, dependency counts, and affected files.

## Requirements

### Requirement: Command signature

```text
specd graph impact [--file <paths...>] [--symbol <name>] [--spec <id>] [--direction dependents|dependencies|upstream|downstream|both] [--depth <n>] [--config <path> | --path <path>] [--format text|json|toon]
```

Exactly one of `--file`, `--symbol`, or `--spec` must be provided.

- `--file` — analyze impact of one or more files. Each path MAY be workspace-prefixed, config-relative, or absolute.
- `--symbol` — analyze impact of a symbol by name. If multiple symbols match, all are analyzed and results listed
- `--spec` — analyze impact of one spec by fully-qualified spec id
- `--direction` — optional; analysis direction, defaults to `upstream`. Values:
  - `dependents` — find symbols, files, and specs that depend on the target; alias of `upstream`
  - `dependencies` — find symbols, files, and specs that the target depends on; alias of `downstream`
  - `upstream` — compatibility value for `dependents`
  - `downstream` — compatibility value for `dependencies`
  - `both` — combined dependents and dependencies analysis
- `--depth` — optional; maximum traversal depth, defaults to `3`. Must be a positive integer. Passed through to `analyzeImpact`, `analyzeFileImpact`, or `analyzeSpecImpact` as `maxDepth`
- `--config <path>` — optional; explicit path to `specd.yaml`, matching the standard CLI meaning
- `--path <path>` — optional; repo-root bootstrap mode
- `--format text|json|toon` — optional; output format, defaults to `text`

The CLI SHALL normalize `dependents` to `upstream` and `dependencies` to `downstream` before calling graph impact analysis. Invalid direction values SHALL fail with a CLI usage error before opening the graph provider.

User-facing documentation for this command MUST prefer the concrete aliases `dependents` and `dependencies` before the compatibility graph-theory terms `upstream` and `downstream`. Documentation MAY mention the compatibility values, but it MUST NOT describe `downstream` as dependents.

`--config` and `--path` are mutually exclusive.

`--path` and no-config fallback are bootstrap mechanisms for setup and early repository exploration, not the intended steady-state mode for configured projects.

### Requirement: File impact analysis

When `--file` is provided:

1. Resolves graph context using explicit config, autodetected config, or bootstrap mode according to the graph CLI precedence rules
2. Creates a `CodeGraphProvider` from the resolved graph context
3. Opens the provider
4. Resolves each requested file path to canonical graph files through the provider's selector normalization service. It MUST support absolute paths, project-relative paths, and workspace-prefixed paths.
5. For a single resolved file, calls `analyzeFileImpact(file, direction)` and outputs the `FileImpactResult`
6. For multiple resolved files, computes per-file file impact with the same semantics as single-file analysis, then aggregates changed symbols, affected symbols, affected files, and overall risk across the requested files
7. Outputs the aggregated result including changed-symbol detail and per-file impact breakdown
8. Closes the provider and exits

### Requirement: Symbol impact analysis

When `--symbol` is provided:

1. Resolves graph context using explicit config, autodetected config, or bootstrap mode according to the graph CLI precedence rules
2. Searches for symbols matching the name via `findSymbols({ name })`
3. If no symbol is found, outputs `No symbol found matching "<name>".`
4. If one symbol is found, calls `analyzeImpact(symbolId, direction)` and outputs the result
5. If multiple symbols match, analyzes each one and outputs all results

### Requirement: Spec impact analysis

When `--spec` is provided:

1. Resolves graph context using explicit config, autodetected config, or bootstrap mode according to the graph CLI precedence rules
2. Creates a `CodeGraphProvider` from the resolved graph context
3. Opens the provider
4. Calls `analyzeSpecImpact(specId, direction)`
5. Outputs the resulting `ImpactResult`
6. Closes the provider and exits

Spec impact MUST reflect requirement-aware graph relations, not just code-structure traversal. At minimum it includes:

- `DEPENDS_ON` between specs
- `COVERS_FILE` between specs and files
- `COVERS_SYMBOL` between specs and symbols

### Requirement: Concurrent indexing guard

Before attempting to open the provider or execute graph-backed analysis, `graph impact` SHALL check the shared graph indexing lock used by `graph index`.

If indexing is currently in progress, the command SHALL fail fast with a short user-facing retry-later message indicating that the graph is being indexed and should be queried again in a few seconds.

This guard exists so the command does not surface backend lock failures opportunistically while another CLI process is rebuilding the graph.

### Requirement: Output format

All file paths rendered in the impact analysis output (both text and JSON) SHALL be formatted relative to the project root for consistency across multi-workspace projects.

**File impact** in `text` mode:

```text
Impact analysis for src/auth.ts (depth=5)
  Risk level:       HIGH
  Direct deps:      6
  Indirect deps:    3
  Transitive deps:  1
  Affected files:   8

Changed symbols:
  validate:10
  AuthService:20

Affected files:
  packages/core/src/login.ts: handleLogin:12 (d=1), validateSession:45 (d=1)
  packages/core/src/session.ts: createSession:8 (d=2)

Per-symbol breakdown:
  src/auth.ts:function:validate:10:0  risk=HIGH direct=4
  src/auth.ts:class:AuthService:20:0  risk=MEDIUM direct=2
```

For multiple files, text output SHALL show one aggregated summary plus a `Changed symbols:` block grouped by input file, an `Affected files:` block, and a `Per-file breakdown:` or equivalent structure that lets a human see which input files contributed to the overall result.

When affected symbols are available, each file line shows the symbols grouped after a colon with depth indicators: `path: name:line (d=N), name:line (d=N)`. All paths are rendered relative to the project root. Files reached only via IMPORTS (file-level) are listed without symbols. The depth value `d=N` indicates the distance from the analysis target (1 = direct, 2 = indirect, 3+ = transitive).

When `--direction` is omitted or set to `dependents` / `upstream`, human-facing documentation and help text SHOULD explain these counts as dependent counts. When `--direction dependencies` / `downstream` is used, documentation SHOULD explain that the same fields represent dependencies reached from the target.

When `--depth` is not the default (3), the header line includes `(depth=N)` to show the configured depth.

**Symbol impact** in `text` mode:

```text
Impact analysis for function createKernel (packages/core/src/composition/kernel.ts:147) (depth=5)
  Risk level:       CRITICAL
  Direct deps:      1
  Indirect deps:    1
  Transitive deps:  38
  Affected files:   40

Affected files:
  packages/cli/src/kernel.ts: wireKernel:5 (d=1)
  ...
```

**Spec impact** in `text` mode:

```text
Impact analysis for spec core:change (depth=3)
  Risk level:       HIGH
  Direct deps:      2
  Indirect deps:    1
  Transitive deps:  0
  Affected files:   4
```

Spec impact output MUST surface files reached through `COVERS_FILE` and symbols reached through `COVERS_SYMBOL` in the same result structure used by other impact targets.

When multiple symbols match, each analysis is listed sequentially.

In `json` or `toon` mode, the full result object is object as-is. The `AffectedSymbol` entries in JSON include the `depth` field.

The JSON output MUST include aggregate impact fields to support automated risk assessment:

- `riskLevel`
- `directDepsCount`
- `indirectDepsCount`
- `transitiveDepsCount`
- `affectedFilesCount`

### Requirement: Error cases

Exactly one of `--file`, `--symbol`, or `--spec` must be provided. If none or more than one is given, the command exits with code 1 and prints `error: provide exactly one of --file, --symbol, or --spec`.

If both `--config` and `--path` are passed, the command SHALL fail with a CLI error before attempting graph access.

If a `--file` input without a workspace prefix does not resolve by config-relative path, the command SHALL fail with a not-found error that includes the normalized config-relative path it searched.

If a `--file` input without a workspace prefix resolves to more than one canonical graph file, the command SHALL fail with an ambiguity error listing the matching workspace-prefixed paths rather than guessing a workspace.

If `--spec` references no indexed spec node, the command SHALL fail with a not-found error that includes the requested spec id.

If the shared graph indexing lock is present, the command SHALL exit with code 3 after printing a user-facing retry-later message.

If the provider cannot be opened, the command exits with code 3.

## Constraints

- The CLI does not contain impact analysis logic — it delegates entirely to `@specd/code-graph`
- `process.exit(0)` is called explicitly after closing the provider
- Canonical graph file identities are workspace-prefixed, but user-facing `--file` inputs MAY be workspace-prefixed, config-relative, or absolute
- `--direction` applies to `--file`, `--symbol`, and `--spec`
- `--depth` applies to all selectors
- `--depth` must be a positive integer; invalid values exit with code 1
- Context resolution SHALL use the shared graph CLI model rather than command-local path semantics
- The command checks the shared graph indexing lock before opening the provider and fails fast while indexing is in progress

## Examples

```
$ specd graph impact --file src/auth.ts
Impact analysis for src/auth.ts
  Risk level:       HIGH
  ...

$ specd graph impact --symbol createKernel
Impact analysis for function createKernel (packages/core/src/composition/kernel.ts:147)
  Risk level:       CRITICAL
  Direct deps:      1
  ...

$ specd graph impact --spec core:change
Impact analysis for spec core:change
  Risk level:       HIGH
  ...

$ specd graph impact --file src/auth.ts src/user.ts
Impact analysis for 2 files
  Risk level:       MEDIUM
  ...

$ specd graph impact --symbol handleError --direction both
Impact analysis for function handleError (packages/cli/src/handle-error.ts:66)
  ...

$ specd graph impact --file /repo/packages/core/src/auth.ts --format json
{"target":"core:src/auth.ts","riskLevel":"HIGH",...}
```

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:config`](../../core/config/spec.md) — configured operation, explicit config path handling, and bootstrap-mode relationship
- [`code-graph:composition`](../../code-graph/composition/spec.md) — CodeGraphProvider facade
- [`code-graph:traversal`](../../code-graph/traversal/spec.md) — impact analysis semantics
- [`code-graph:workspace-integration`](../../code-graph/workspace-integration/spec.md) — canonical workspace paths and config-relative file lookup semantics
