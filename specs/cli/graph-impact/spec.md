# Graph Impact

## Purpose

Before modifying code, developers and agents need to understand the blast radius — which other files and symbols depend on the change. The `specd graph impact` command runs impact analysis on a file, symbol, or set of changed files, reporting risk level, dependency counts, and affected files.

## Requirements

### Requirement: Command signature

```text
specd graph impact [--file <path>] [--symbol <name>] [--changes <files...>] [--direction upstream|downstream|both] [--path <path>] [--format text|json|toon]
```

Exactly one of `--file`, `--symbol`, or `--changes` must be provided.

- `--file` — analyze impact of a single file
- `--symbol` — analyze impact of a symbol by name. If multiple symbols match, all are analyzed and results listed
- `--changes` — detect impact of changes to multiple files (variadic; accepts multiple space-separated paths)
- `--direction` — optional; analysis direction, defaults to `upstream`. Values:
  - `upstream` — find symbols and files that depend on the target
  - `downstream` — find symbols and files that the target depends on
  - `both` — combined upstream and downstream analysis
- `--path` — optional; workspace root, defaults to the current working directory
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: File impact analysis

When `--file` is provided:

1. Creates a `CodeGraphProvider` with the resolved path
2. Opens the provider
3. Calls `analyzeFileImpact(file, direction)` to compute the impact
4. Outputs the `FileImpactResult` including per-symbol breakdown
5. Closes the provider and exits

### Requirement: Symbol impact analysis

When `--symbol` is provided:

1. Searches for symbols matching the name via `findSymbols({ name })`
2. If no symbol is found, outputs `No symbol found matching "<name>".`
3. If one symbol is found, calls `analyzeImpact(symbolId, direction)` and outputs the result
4. If multiple symbols match, analyzes each one and outputs all results

### Requirement: Change detection

When `--changes` is provided:

1. Calls `detectChanges(files)` with the list of file paths
2. Outputs the summary and affected files

### Requirement: Output format

**File impact** in `text` mode:

```text
Impact analysis for src/auth.ts
  Risk level:       HIGH
  Direct deps:      6
  Indirect deps:    3
  Transitive deps:  1
  Affected files:   8

Affected files:
  src/login.ts
  src/session.ts

Per-symbol breakdown:
  src/auth.ts:function:validate:10  risk=HIGH direct=4
  src/auth.ts:class:AuthService:20  risk=MEDIUM direct=2
```

**Symbol impact** in `text` mode:

```text
Impact analysis for function createKernel (packages/core/src/composition/kernel.ts:147)
  Risk level:       CRITICAL
  Direct deps:      1
  Indirect deps:    1
  Transitive deps:  38
  Affected files:   40

Affected files:
  packages/cli/src/kernel.ts
  ...
```

When multiple symbols match, each analysis is listed sequentially.

**Change detection** in `text` mode outputs the summary string from `ChangeDetectionResult.summary` followed by the affected files list.

In `json` or `toon` mode, the full result object is output as-is.

### Requirement: Error cases

If none of `--file`, `--symbol`, or `--changes` is provided, the command exits with code 1 and prints `error: provide --file, --symbol, or --changes`.

If the provider cannot be opened, the command exits with code 3.

## Constraints

- The CLI does not contain impact analysis logic — it delegates entirely to `@specd/code-graph`
- `process.exit(0)` is called explicitly after closing the provider
- All file paths are workspace-relative, not absolute
- `--direction` only applies to `--file` and `--symbol`, not to `--changes`

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

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/code-graph/composition/spec.md`](../../code-graph/composition/spec.md) — CodeGraphProvider, ImpactResult, FileImpactResult, ChangeDetectionResult
