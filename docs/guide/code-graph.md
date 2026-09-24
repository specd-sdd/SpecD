---
title: Code Graph & Blast Radius Analysis
description: Leveraging AST-based dependency graphs, impact analysis, and symbol indexing.
sidebar_position: 10
---

# Code Graph & Blast Radius Analysis

The SpecD Code Graph is an AST-powered codebase intelligence system. It maps symbols, imports, calls, spec requirements, and implementation links across your repository.

Unlike generic lexical search tools (`grep` or text matching), the Code Graph understands syntactic language constructs and structural dependencies. This enables AI agents and developers to perform graph-first research, assess blast radius, and detect high-risk hotspots before making modifications.

---

## Why Graph-First Research Matters

In large codebases, modifying a function or changing an interface often triggers unexpected breaking changes in distant modules. AI agents relying on blind grep frequently miss indirect call sites or waste thousands of context tokens reading irrelevant files.

The Code Graph solves this with:

- **Symbol indexing**: Instant $O(1)$ symbol definition lookups across files and workspaces.
- **Bi-directional impact analysis**: Tracing who depends on a symbol (`dependents`) and what a symbol relies on (`dependencies`).
- **High-risk hotspot identification**: Pinpointing files with high coupling and cyclomatic complexity.
- **Traceable spec links**: Connecting normative requirements directly to the code that realizes them.

---

## Core CLI Commands

### 1. Indexing the Code Graph (`specd graph index`)

Before querying the graph, ensure the index is fresh:

```bash
specd graph index --format toon
```

The command scans repository workspaces, parses TypeScript/JavaScript ASTs, and caches the dependency graph under `.specd/config/graph/`.

### 2. Finding Symbols & Definitions (`specd graph search`)

Search for symbols, function definitions, types, or interfaces:

```bash
# Search for symbol definitions
specd graph search "ConfigCascade" --symbols --format toon

# Search for specs mentioning a capability
specd graph search "lifecycle" --specs --format toon
```

### 3. Blast Radius Analysis (`specd graph impact`)

Calculate the exact blast radius of changing a file or symbol before writing code:

```bash
# Analyze downstream dependents (who breaks if this symbol changes?)
specd graph impact --symbol "resolveActiveChain" --direction dependents --format toon

# Analyze downstream dependents of a specific file
specd graph impact --file "packages/core/src/infrastructure/fs/config-cascade.ts" --direction dependents --format toon

# Analyze upstream dependencies (what does this file rely on?)
specd graph impact --file "packages/cli/src/commands/guide/index.ts" --direction dependencies --format toon
```

Output highlights the calculated risk level (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) and enumerates all affected files.

### 4. Detecting Hotspots (`specd graph hotspots`)

Identify complex, tightly-coupled files that require extra caution and testing:

```bash
specd graph hotspots --min-risk HIGH --format toon
```

---

## Agent Protocol: The Graph-First Rule

All AI agents operating in a SpecD repository follow the **Graph-First Protocol**:

1. **Never guess paths or symbol usages with ad-hoc grep first.**
2. When orienting or planning design changes:
   - Check index freshness: `specd project status --graph`
   - Re-index if stale: `specd graph index`
   - Discover symbol locations: `specd graph search "<symbol>" --symbols`
   - Calculate blast radius: `specd graph impact --symbol "<symbol>" --direction dependents`
3. Include impact findings directly in `design.md` so reviewers and developers understand downstream implications before implementation starts.
