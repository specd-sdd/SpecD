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
```

---

## graph index

Indexes workspace source files and specifications into the SQLite code graph store using process-isolated indexing workers.

```bash
specd graph index [options]
```

### Options

| Option                        | Description                                                       |
| ----------------------------- | ----------------------------------------------------------------- |
| `--force`                     | Force a full rebuild of the code graph, reprocessing every input. |
| `--config <path>`             | Path to configuration file. Mutually exclusive with `--path`.     |
| `--path <path>`               | Repository root bootstrap path (ignores discovered config).       |
| `--format <text\|json\|toon>` | Output format (`text`, `json`, `toon`).                           |

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
