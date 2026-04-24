# Graph Impact

## Purpose

Before modifying code, developers and agents need to understand the blast radius — which other files and symbols depend on the change. The `specd graph impact` command runs impact analysis on a file, symbol, or set of changed files, reporting risk level, dependency counts, and affected files.

## Requirements

### Requirement: Command signature

```text
specd graph impact [--file <path>] [--symbol <name>] [--changes <files...>] [--direction dependents|dependencies|upstream|downstream|both] [--depth <n>] [--config <path> | --path <path>] [--format text|json|toon]
```

Exactly one of `--file`, `--symbol`, or `--changes` must be provided.

- `--file` — analyze impact of a single file
- `--symbol` — analyze impact of a symbol by name. If multiple symbols match, all are analyzed and results listed
- `--changes` — detect impact of changes to multiple files (variadic; accepts multiple space-separated paths)
- `--direction` — optional; analysis direction, defaults to `upstream`. Values:
  - `dependents` — find symbols and files that depend on the target; alias of `upstream`
  - `dependencies` — find symbols and files that the target depends on; alias of `downstream`
  - `upstream` — compatibility value for `dependents`
  - `downstream` — compatibility value for `dependencies`
  - `both` — combined dependents and dependencies analysis
- `--depth` — optional; maximum traversal depth, defaults to `3`. Must be a positive integer. Passed through to `analyzeImpact`/`analyzeFileImpact` as `maxDepth`
- `--config <path>` — optional; explicit path to `specd.yaml`, matching the standard CLI meaning
- `--path <path>` — optional; repo-root bootstrap mode
- `--format text|json|toon` — optional; output format, defaults to `text`

The CLI SHALL normalize `dependents` to `upstream` and `dependencies` to `downstream` before calling `analyzeImpact()` or `analyzeFileImpact()`. Invalid direction values SHALL fail with a CLI usage error before opening the graph provider.

User-facing documentation for this command MUST prefer the concrete aliases `dependents` and `dependencies` before the compatibility graph-theory terms `upstream` and `downstream`. Documentation MAY mention the compatibility values, but it MUST NOT describe `downstream` as dependents.

`--config` and `--path` are mutually exclusive.

`--path` and no-config fallback are bootstrap mechanisms for setup and early repository exploration, not the intended steady-state mode for configured projects.

### Requirement: File impact analysis

When `--file` is provided:

1. Resolves graph context using explicit config, autodetected config, or bootstrap mode according to the graph CLI precedence rules
2. Creates a `CodeGraphProvider` from the resolved graph context
3. Opens the provider
4. Calls `analyzeFileImpact(file, direction)` to compute the impact
5. Outputs the `FileImpactResult` including per-symbol breakdown
6. Closes the provider and exits

In bootstrap mode, the command SHALL behave as if there were a single `default` workspace whose `codeRoot` is the resolved VCS root.

### Requirement: Symbol impact analysis

When `--symbol` is provided:

1. Resolves graph context using explicit config, autodetected config, or bootstrap mode according to the graph CLI precedence rules
2. Searches for symbols matching the name via `findSymbols({ name })`
3. If no symbol is found, outputs `No symbol found matching "<name>".`
4. If one symbol is found, calls `analyzeImpact(symbolId, direction)` and outputs the result
5. If multiple symbols match, analyzes each one and outputs all results

### Requirement: Change detection

When `--changes` is provided:

1. Resolves graph context using explicit config, autodetected config, or bootstrap mode according to the graph CLI precedence rules
2. Calls `detectChanges(files)` with the list of file paths
3. Outputs the summary and affected files

### Requirement: Concurrent indexing guard

Before attempting to open the provider or execute graph-backed analysis, `graph impact` SHALL check the shared graph indexing lock used by `graph index`.

If indexing is currently in progress, the command SHALL fail fast with a short user-facing retry-later message indicating that the graph is being indexed and should be queried again in a few seconds.

This guard exists so the command does not surface backend lock failures opportunistically while another CLI process is rebuilding the graph.

### Requirement: Output format

**File impact** in `text` mode:

```text
Impact analysis for src/auth.ts (depth=5)
  Risk level:       HIGH
  Direct deps:      6
  Indirect deps:    3
  Transitive deps:  1
  Affected files:   8

Affected files:
  src/login.ts: handleLogin:12 (d=1), validateSession:45 (d=1)
  src/session.ts: createSession:8 (d=2)

Per-symbol breakdown:
  src/auth.ts:function:validate:10:0  risk=HIGH direct=4
  src/auth.ts:class:AuthService:20:0  risk=MEDIUM direct=2
```

When affected symbols are available, each file line shows the symbols grouped after a colon with depth indicators: `path: name:line (d=N), name:line (d=N)`. Files reached only via IMPORTS (file-level) are listed without symbols. The depth value `d=N` indicates the distance from the analysis target (1 = direct, 2 = indirect, 3+ = transitive).

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

When multiple symbols match, each analysis is listed sequentially.

**Change detection** in `text` mode outputs the summary string from `ChangeDetectionResult.summary` followed by the affected files list.

In `json` or `toon` mode, the full result object is output as-is. The `AffectedSymbol` entries in JSON include the `depth` field.

### Requirement: Error cases

Exactly one of `--file`, `--symbol`, or `--changes` must be provided. If none or more than one is given, the command exits with code 1 and prints `error: provide exactly one of --file, --symbol, or --changes`.

If both `--config` and `--path` are passed, the command SHALL fail with a CLI error before attempting graph access.

If the shared graph indexing lock is present, the command SHALL exit with code 3 after printing a user-facing retry-later message.

If the provider cannot be opened, the command exits with code 3.

## Constraints

- The CLI does not contain impact analysis logic — it delegates entirely to `@specd/code-graph`
- `process.exit(0)` is called explicitly after closing the provider
- All file paths are workspace-relative, not absolute
- `--direction` only applies to `--file` and `--symbol`, not to `--changes`
- `--depth` applies to all selectors (`--file`, `--symbol`, `--changes`)
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

$ specd graph impact --changes src/auth.ts src/user.ts
2 symbol(s) changed across 2 file(s). 5 symbol(s) in 3 file(s) may be affected. Risk: MEDIUM.

Affected files:
  src/login.ts
  src/session.ts
  src/middleware.ts

$ specd graph impact --symbol handleError --direction both
Impact analysis for function handleError (packages/cli/src/handle-error.ts:66)
  ...

$ specd graph impact --file src/auth.ts --format json
{"target":"src/auth.ts","riskLevel":"HIGH",...}
```

## Spec Dependencies

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:core/config`](../../core/config/spec.md) — configured operation, explicit config path handling, and bootstrap-mode relationship
- [`code-graph:code-graph/composition`](../../code-graph/composition/spec.md) — CodeGraphProvider facade
- [`code-graph:code-graph/traversal`](../../code-graph/traversal/spec.md) — impact analysis semantics
