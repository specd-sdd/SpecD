---
title: specd graph
description: CLI reference for code graph indexing, symbol search, blast-radius impact analysis, and hotspots
sidebar_position: 7
---

# graph

The `specd graph` command family indexes and queries the codebase knowledge graph. It provides symbol resolution, dependency and blast radius impact analysis, architectural hotspots detection, and BM25 symbol/spec search.

## Commands

```bash
specd graph index [options]
specd graph search <query> [options]
specd graph impact [options]
specd graph hotspots [options]
specd graph stats [options]
specd graph why <path> [options]
```

---

## graph index

Indexes workspace source files and specifications into the SQLite code graph store using process-isolated indexing workers.

```bash
specd graph index [options]
```

### Options

| Option                        | Description                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `--force`                     | Force a full rebuild of the code graph, reprocessing every input.                             |
| `--exclude-path <glob...>`    | Gitignore-syntax patterns, relative to the project root, added to the global exclusion layer. |
| `--config <path>`             | Path to configuration file. Mutually exclusive with `--path`.                                 |
| `--path <path>`               | Repository root bootstrap path (ignores discovered config).                                   |
| `--format <text\|json\|toon>` | Output format (`text`, `json`, `toon`).                                                       |

### Output & Behavior

- **Project-relative paths:** Every path and pattern in the `graph` section of `specd.yaml` (project and workspace level) is interpreted relative to the **project root**, never to a workspace `codeRoot`. A pattern such as `/app/vendors/*` therefore means the same file in global and workspace discovery. Global `excludePaths` are evaluated first and a workspace `!` negation cannot re-include something the global layer excluded; `.gitignore` files keep absolute priority. Run `specd graph why <path>` to see which rule decides a path.
- **Workspace overlap warning:** When one physical file is kept by more than one workspace in the same run, the file is still indexed under every owning workspace identity, and the run reports it. In `text` format an overlap section prints the count, up to ten `projectRelativePath — workspaces` lines, a `... and N more` line, and a hint to review `excludePaths`/`allowedPaths` and run `specd graph why <path>`. In `json` and `toon` formats the result carries `workspaceOverlaps` (`Array<{ projectRelativePath, workspaces }>`, at most 25 entries sorted by path) and `workspaceOverlapCount` (exact total). Nothing is printed when there are no overlaps.
- **File Size Gating & Summary:** Files larger than the effective `maxFileBytes` (default: 256 KiB) are skipped during indexing with coverage reason `file-too-large`.
  - In `text` format, a size-skip section lists the largest skipped files with their sizes (capped at 10 items, followed by `... and N more`), a ready-to-paste `graph.largeFilePaths` snippet (root-level files are anchored with a leading `/` so that they match only that file), and the option to raise `graph.maxFileBytes` (`0` disables the limit).
  - In `json` and `toon` formats, result objects include:
    - `filesSkippedForSize` (`number`): Count of files skipped due to size limits.
    - `largestSkippedForSize` (`Array<{ filePath, projectRelativePath, sizeBytes, limitBytes }>`): The largest skipped files, in descending size order (at most 25 entries).
    - `sizeExemptAnalysed` (`Array<{ filePath, projectRelativePath, sizeBytes }>`): Oversized files that are indexed because they are exempt through `graph.largeFilePaths`.
- **Errors vs diagnostics:** `errors` lists files or specs that failed to produce their indexed content; each one is also `parse-failed` in coverage and is retried by the next normal run, even when its content did not change. `diagnostics` lists problems found while resolving packages or linking re-exports (for example a package identity declared by several workspaces). A diagnostic is not a failure: in `text` format it is printed as a `warning:` line under `finished with N diagnostic(s)`, the exit code is unchanged, and the structured formats expose `diagnostics` next to `errors`. Neither keeps the graph stale: a run that commits clears the stale latches, and a file that failed has no observation, so it shows as unknown (`OBSERVATION_MISSING`) until it indexes successfully.
- **Worker Silence Watchdog:** If the isolated indexing worker produces no activity for 10 seconds, a warning is printed to `stderr` in text mode:
  ```text
  warning: no progress for 10s while processing core:src/parser.ts. If that file is not needed, add it to graph.excludePaths or lower graph.maxFileBytes.
  ```
  The warning repeats at most every 10 seconds while the worker remains silent, but never terminates the worker.
- **Failure Classification & Diagnostics:** When indexing fails, the command exits with code `3` and reports classified diagnostics:
  - **Failure Causes:** `start-failed`, `task-contract`, `task-error`, `protocol`, `cancelled`, `native-crash`, `resource-limit` (out-of-memory), or `exited`.
  - **Diagnostics:** Reported in structured formats and rendered to `stderr` in text format, including the failure cause, the last activity item being processed, elapsed time since last activity, and the trailing 16 KiB of worker `stdoutTail` and `stderrTail`.

### Example: Exempting Large Files

To index specific oversized files that exceed `maxFileBytes`:

```yaml
graph:
  largeFilePaths:
    - 'packages/core/src/generated/schema.ts'
    - 'specs/**/*.md'
```

---

## graph search

Perform full-text search across symbols, files, and specifications in the code graph.

```bash
specd graph search <query> [options]
```

### Options

| Option                        | Description                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `--symbols`                   | Search only symbol identifiers and declarations.                                                |
| `--specs`                     | Search only specification requirements.                                                         |
| `--files`                     | Search only indexed source files.                                                               |
| `--workspace <name>`          | Limit search to a specific workspace.                                                           |
| `--include-tests`             | Include test category files and symbols.                                                        |
| `--include-ignored`           | Include ignored category files and symbols.                                                     |
| `--all`                       | Include all categories (`source`, `test`, `ignored`).                                           |
| `--category <categories>`     | Filter strictly by category (accepts single value or comma-separated list, e.g. `source,test`). |
| `--limit <n>`                 | Maximum number of results to return (default: `20`).                                            |
| `--format <text\|json\|toon>` | Output format.                                                                                  |

### Output Schema

In JSON and TOON formats, all file paths are exposed as `projectRelativePath` (relative to the repository project root containing `specd.yaml`). Legacy properties (`configRelativePath`) have been removed:

- **Symbols:** `declaration.location.projectRelativePath`, `symbol.projectRelativePath`, `logicalTarget.projectRelativePath`, `publicBindings[].projectRelativePath`.
- **Files:** `file.projectRelativePath`.
- **Documents:** `document.projectRelativePath`.

---

## graph impact

Analyze upstream dependencies or downstream blast radius for a symbol, file, or specification.

```bash
specd graph impact [options]
```

### Options

| Option                                   | Description                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `--symbol <name>`                        | Target symbol name or qualified identifier.                                                                                           |
| `--file <path>`                          | Target file path. Repeatable flag.                                                                                                    |
| `--spec <id>`                            | Target specification identifier.                                                                                                      |
| `--direction <dependents\|dependencies>` | Traversal direction (`dependents` for blast radius, `dependencies` for upstream requirements).                                        |
| `--depth <n>`                            | Maximum traversal depth.                                                                                                              |
| `--type <symbols\|files\|specs>`         | Filter impacted result types.                                                                                                         |
| `--include-tests`                        | Admit `test` category files and symbols alongside `source`.                                                                           |
| `--include-ignored`                      | Admit `ignored` category files and symbols.                                                                                           |
| `--all`                                  | Admit all categories (`source`, `test`, `ignored`).                                                                                   |
| `--category <categories>`                | Restrict traversal admission strictly to designated categories (accepts single category or comma-separated list, e.g. `source,test`). |
| `--format <text\|json\|toon>`            | Output format.                                                                                                                        |

### Output Schema

Symbol impact identifies whether the selector resolved to a logical target, an exact
declaration, or a public binding. Logical impact lists every contributing declaration,
reports unique semantic target counts separately from physical declaration evidence,
and includes covering specs resolved through logical IDs. Exact declaration impact
uses one physical seed and does not widen to sibling overload declarations.

JSON and TOON preserve `targetKind`, `resolvedTarget`, `declarations`,
`semanticAffectedTargets`, `physicalEvidence`, `semanticCounts`, and
`coveringSpecs`. Text output labels the target kind and summarizes declaration
locations. Ambiguous selectors list deterministic candidates and perform no traversal.
A bare or file-qualified name that matches several declarations of one overload set is a
single logical target, not an ambiguity. For an ambiguous public export, text output
lists each candidate route with its project-relative declaration locations, and JSON and
TOON expose the same `candidates` with projected paths.

JSON and TOON symbol output always carries `kind: "symbol"` and a `status`:

| `status`     | Meaning                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------- |
| `resolved`   | One logical target, declaration or public binding was impacted.                               |
| `ambiguous`  | Several distinct logical targets match; `candidates` lists one entry per logical target.      |
| `unresolved` | The graph cannot decide (stale or partial evidence); `reasonCode` explains why. No traversal. |
| `not_found`  | A healthy graph proves no such symbol exists.                                                 |

Ambiguity is counted in logical targets, so the overloads of one logical symbol are a
single candidate and `totalCandidates` equals the number of logical targets.
`directDepsCount`, `indirectDepsCount` and `transitiveDepsCount` count distinct dependents
per depth (logical targets for `--symbol`, files for `--file`); `affectedFilesCount`
counts files; `semanticCounts.physicalDeclarationOccurrences` counts physical
declarations and can exceed the logical-target counts. A `--from` value that starts with
a Windows drive letter (`C:\repo\src\index.ts`) is resolved as a file selector, not as a
workspace-qualified path.

For `--export`, text output appends the canonical target's covering specs and JSON/TOON
include them as `coveringSpecs`.

Covering specs include the symbol's own coverage at depth 0, not only the specs that
cover the symbols it affects. File evidence in `coveringSpecs[].evidence` carries
`projectRelativePath`.

Structured output passes SDK path projection through unchanged. In particular,
`resolvedTarget.declarations[].location.projectRelativePath`, semantic-target declaration
locations, and nested `physicalEvidence[].sourceLocation.projectRelativePath` and
`targetLocation.projectRelativePath` are present whenever those locations exist. The CLI
performs no graph read or canonical-path reconstruction for these fields.

In JSON and TOON formats, all targets and affected file paths are exposed as `projectRelativePath` (or `projectRelativeTargets` for multi-file impact). Legacy properties (`displayPath` and `displayTargets`) have been removed:

- **Single-file impact:** `canonicalPath`, `projectRelativePath`, `affectedFiles` (array of `projectRelativePath`), `affectedSymbols[].filePath` (`projectRelativePath`).
- **Multi-file impact:** `targets` (canonical), `projectRelativeTargets` (repository-relative), `perFile[].projectRelativePath`.
- **Symbol impact:** `canonicalPath`, `projectRelativePath`, `impact.affectedFiles` (array of `projectRelativePath`), plus every nested declaration and physical-evidence location described above.
- **Spec impact:** `spec`, `impact.affectedFiles` (array of `projectRelativePath`).

### Examples

```bash
# Blast radius of a symbol across all dependents
specd graph impact --symbol "SpecRepository" --direction dependents --format toon

# Logical impact for every declaration in an overload group
specd graph impact --symbol "Change.execute" --direction dependents --format json

# Find all specs covering a modified file
specd graph impact --file "packages/core/src/change.ts" --direction dependents --type specs
```

---

## graph hotspots

List the most coupled and frequently changed symbols ranked by coupling risk.

```bash
specd graph hotspots [options]
```

### Options

| Option                        | Description                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `--min-risk <level>`          | Minimum risk threshold (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`). Default: `MEDIUM`.                                                                |
| `--limit <n>`                 | Maximum results to return (default: `20`).                                                                                                      |
| `--workspace <name>`          | Filter by workspace.                                                                                                                            |
| `--kind <list>`               | Filter by comma-separated symbol kinds (e.g. `class,method,function`).                                                                          |
| `--include-tests`             | Include test category files in caller metrics and candidate rankings.                                                                           |
| `--include-ignored`           | Include ignored category files in caller metrics and candidate rankings.                                                                        |
| `--all`                       | Include all categories (`source`, `test`, `ignored`).                                                                                           |
| `--category <categories>`     | Restrict candidates and caller metrics strictly to designated categories (accepts single category or comma-separated list, e.g. `source,test`). |
| `--format <text\|json\|toon>` | Output format.                                                                                                                                  |

### Output Schema

In JSON and TOON formats, each hotspot entry exposes `projectRelativePath` (relative to the repository project root containing `specd.yaml`). Legacy property `displayPath` has been removed:

- **Hotspots entries:** `entries[].projectRelativePath`, `entries[].workspace`, `entries[].symbol.filePath` (canonical).

---

## graph stats

Report summary metrics, health, and freshness of the code graph store.

```bash
specd graph stats [options]
```

Coverage is reported with `coverageCompleteness`: `complete`, `complete-with-warnings` (coverage is
complete but some files were skipped by the `graph.maxFileBytes` limit, so a missing symbol is not
proof of absence for code that may live in them), `incomplete` (parse-failed or partial inputs) or
`unknown`. `coverageWarnings` lists the warnings with their counts (`{ code: 'file-too-large', count }`).
Text output prints `coverage: complete with warnings (N file(s) skipped: file-too-large)` and a hint;
`json` and `toon` carry both fields without hint text.

### Options

| Option                        | Description    |
| ----------------------------- | -------------- |
| `--format <text\|json\|toon>` | Output format. |

### Exit Codes

| Exit Code    | Condition                                                         |
| ------------ | ----------------------------------------------------------------- |
| `0`          | Success.                                                          |
| `1`          | Command execution error, missing index, or invalid query options. |
| `GRAPH_BUSY` | Another indexing process currently holds the writer lock.         |

---

## graph why

Explain why a path is excluded from, classified in, or indexed by the code graph.

```bash
specd graph why <path> [--config <path> | --path <path>] [--format text|json|toon]
```

`<path>` is required and can be a project-relative path (`packages/core/src/index.ts`), an absolute path (converted to project-relative), or a workspace-qualified path `workspace:path` (for example `core:src/index.ts`), which pins the evaluation to that workspace.

The command runs the same evaluation the indexer uses and reports, for every workspace whose code root contains the path, the decisive rule at each step, in indexer order: `binary-extension`, `gitignore`, `global-exclude`, `workspace-exclude`, `allowed-paths`, `size-limit`, `category`, `adapter`. Evaluation stops at the first exclusion; later steps are `not-applicable`. Configured patterns are interpreted relative to the project root. Diagnostics are printed after all candidates in text output. The result also states whether the node is currently in the graph (`inGraph`, which compares with the last index and may be out of date).

### Options

| Option                        | Description                                                   |
| ----------------------------- | ------------------------------------------------------------- |
| `--config <path>`             | Path to configuration file. Mutually exclusive with `--path`. |
| `--path <path>`               | Repository root bootstrap path (ignores discovered config).   |
| `--format <text\|json\|toon>` | Output format (`text`, `json`, `toon`).                       |

### Output fields

| Field                 | Description                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `input`               | The path exactly as given.                                                                                                          |
| `projectRelativePath` | The path relative to the project root.                                                                                              |
| `verdict`             | `indexable`, `not-indexed` (candidates exist but none indexes it) or `not-in-scope` (no workspace and no `includePaths` covers it). |
| `owners`              | Names of the candidates that index the path (`root` for project-global files).                                                      |
| `candidates`          | One evaluation per candidate: `workspace`, `identity`, `verdict`, `category`, `kind`, `steps`, `inGraph`.                           |
| `diagnostics`         | `PATH_NOT_FOUND`, `CODE_ROOT_OUTSIDE_PROJECT`, `PATH_OUTSIDE_PROJECT`, `MULTIPLE_OWNERS`.                                           |

Each step has `stage`, `outcome` (`matched`, `passed`, `not-applicable`) and, when a rule decided it, `rule` (`pattern`, `negated`, `origin` with `layer`, `workspace`, `key` and, for `.gitignore`, `sourceFile` and `line`). When a global exclusion prevented a workspace negation from re-including a path, `global-exclude` carries `detail.workspaceNegationBlocked: true` and text output says so.

### Examples

An excluded path:

```text
$ specd graph why app/vendors/other/x.php
app/vendors/other/x.php
verdict: not-indexed   owners: none

backend:vendors/other/x.php  [excluded]  category: -  kind: -  inGraph: no
  - binary-extension: passed
  - gitignore: passed
  - global-exclude: matched — /app/vendors/* (pattern) from global graph.excludePaths
  - workspace-exclude: not-applicable
  ...
```

An indexable path:

```text
$ specd graph why packages/core/src/index.ts
packages/core/src/index.ts
verdict: indexable   owners: core

core:src/index.ts  [indexable]  category: source  kind: file  inGraph: yes
  - global-exclude: passed
  - size-limit: passed size=2048 limit=262144
  - category: passed category=source
  - adapter: passed kind=file language=typescript
```

### Exit Codes

| Exit Code | Condition                                                                                  |
| --------- | ------------------------------------------------------------------------------------------ |
| `0`       | An explanation was produced, whatever the verdict.                                         |
| `1`       | Missing configuration, `UNKNOWN_WORKSPACE`, `INVALID_GRAPH_WHY_PATH`, or provider failure. |
