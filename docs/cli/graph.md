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

| Option                        | Description                                          |
| ----------------------------- | ---------------------------------------------------- |
| `--symbols`                   | Search only symbol identifiers and declarations.     |
| `--specs`                     | Search only specification requirements.              |
| `--files`                     | Search only indexed source files.                    |
| `--workspace <name>`          | Limit search to a specific workspace.                |
| `--limit <n>`                 | Maximum number of results to return (default: `20`). |
| `--format <text\|json\|toon>` | Output format.                                       |

---

## graph impact

Analyze upstream dependencies or downstream blast radius for a symbol, file, or specification.

```bash
specd graph impact [options]
```

### Options

| Option                                   | Description                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `--symbol <name>`                        | Target symbol name or qualified identifier.                                                    |
| `--file <path>`                          | Target file path. Repeatable flag.                                                             |
| `--spec <id>`                            | Target specification identifier.                                                               |
| `--direction <dependents\|dependencies>` | Traversal direction (`dependents` for blast radius, `dependencies` for upstream requirements). |
| `--depth <n>`                            | Maximum traversal depth.                                                                       |
| `--type <symbols\|files\|specs>`         | Filter impacted result types.                                                                  |
| `--format <text\|json\|toon>`            | Output format.                                                                                 |

### Examples

```bash
# Blast radius of a symbol across all dependents
specd graph impact --symbol "SpecRepository" --direction dependents --format toon

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

| Option                        | Description                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `--min-risk <level>`          | Minimum risk threshold (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`). Default: `MEDIUM`. |
| `--limit <n>`                 | Maximum results to return (default: `20`).                                       |
| `--workspace <name>`          | Filter by workspace.                                                             |
| `--kind <list>`               | Filter by comma-separated symbol kinds (e.g. `class,method,function`).           |
| `--format <text\|json\|toon>` | Output format.                                                                   |

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
