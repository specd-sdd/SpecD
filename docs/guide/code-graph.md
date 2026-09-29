---
title: Code Graph & Codebase Intelligence
description: AST-based symbol indexing, multi-modal search, blast radius impact analysis, and hotspot detection.
sidebar_position: 10
---

# Code Graph & Codebase Intelligence

The **SpecD Code Graph** is a high-performance codebase intelligence engine powered by abstract syntax tree (AST) parsing and graph relational modeling. It indexes symbols, imports, call graphs, exports, specifications, and markdown documentation across every workspace in your repository.

Unlike generic lexical search tools (`grep`, `ripgrep`, or naive text matching), the Code Graph understands language semantics, module boundaries, re-exports, and spec traceability. It forms the foundational intelligence layer of SpecD, giving human developers and AI coding agents deterministic knowledge of the codebase without context-wasting trial-and-error.

---

## 1. Why Codebase Intelligence Matters

In modern monorepos and growing codebases, code modifications frequently introduce unintended side effects in distant, seemingly unrelated modules. Traditional development approaches suffer from three critical failure modes:

1. **The Grep Trap:** Lexical text search matches comments, variable names, substrings, and dead code indiscriminately, forcing developers and AI agents to waste thousands of context tokens parsing irrelevant files.
2. **Hidden Downstream Blast Radius:** Changing an exported function signature or interface type can silently break downstream callers across package boundaries, resulting in runtime errors or broken builds that are discovered late in CI.
3. **Spec-to-Code Disconnect:** In conventional projects, requirements live in Jira, Notion, or obsolete wikis, entirely disconnected from the source code that implements them.

The SpecD Code Graph eliminates these issues by maintaining a live relational graph connecting:

- **Symbols:** Classes, functions, methods, interfaces, types, variables, and their public export routes.
- **Dependencies:** Bi-directional import and call relations across files and workspaces.
- **Specifications:** Canonical requirements linked directly to the code symbols and files that realize them.
- **Documentation:** Markdown guides, architectural decision records (ADRs), and package references indexed for instant discovery.

```text
┌─────────────────────────────────────────────────────────────┐
│                     SpecD Code Graph                        │
├─────────────────┬───────────────────┬───────────────────────┤
│  Specifications │  Source Symbols   │  Project Documents    │
│  (specs, deltas)│  (AST, bindings)  │  (guides, ADRs, docs) │
└────────┬────────┴─────────┬─────────┴───────────┬───────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Relational Graph: calls, imports, links, dependencies       │
├─────────────────────────────────────────────────────────────┤
│ • Bi-directional Impact Analysis (Blast Radius & Risk)      │
│ • Architectural Hotspots (Coupling & Refactoring Priority)  │
│ • Multi-Modal Search (Symbols, Files, Specs, Documents)     │
│ • Implementation Coverage Diagnostics (Broken link audit)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Indexing and Graph Health

### Building the Graph Index (`specd graph index`)

Indexing runs in an isolated worker so the CLI stays responsive while it parses source and markdown:

```bash
specd graph index --format toon
```

The indexer walks every workspace declared in `specd.yaml`, extracts AST symbols and call sites, indexes markdown documents, and stores the graph in `.specd/config/graph/`.

#### Incremental vs. Full Rebuilds

- **Incremental Indexing (Default):** Compares file content hashes and git commit fingerprints to re-index only files that have changed since the last indexing session.
- **Forced Rebuild (`--force`):** Purges the existing graph database and rebuilds the entire graph from scratch:
  ```bash
  specd graph index --force --format toon
  ```
- **Excluding Paths (`--exclude-path <glob>`):** Omits specific global directories or generated code from the index:
  ```bash
  specd graph index --exclude-path "**/dist/**" --exclude-path "**/fixtures/**"
  ```

### Inspecting Graph Statistics & Freshness (`specd graph stats`)

To inspect graph health, node counts, supported languages, and staleness:

```bash
specd graph stats --format text
```

Text output reports counts, relation totals, and health in this shape:

```text
Files:     <fileCount>
Documents: <documentCount>
Symbols:   <symbolCount>
Specs:     <specCount>
Languages: typescript, javascript
Relations:
  IMPORTS: <n>
  DEFINES: <n>
  CALLS: <n>
Last indexed: <ISO timestamp>
Content fresh:    true|false
Graph state:      current|...
Known stale:      true|false
Coverage complete: true|false
Coverage: indexed=<n>, excluded=<n>, unsupported=<n>, parse-failed=<n>, partial=<n>
Schema compatible: true|false
Generation current: true|false
Health reasons:
  CONTENT_KNOWN_STALE
```

`specd project status --graph` surfaces the same freshness signal. When `stale` is true, or health reasons include `CONTENT_KNOWN_STALE`, run `specd graph index` before trusting search or impact results. Symbol absence is not proof that a symbol does not exist while coverage or freshness is incomplete.

---

## 3. Multi-Modal Codebase Search (`specd graph search`)

`specd graph search "<query>"` searches four categories. With no category flag it searches all of them. Pass one or more of `--symbols`, `--files`, `--specs`, and `--documents` to narrow the search. `--limit` defaults to `10` results per category. `--snippet` adds preview text in `text`, `json`, and `toon`. `--spec-content` includes full spec bodies and requires `--format json` or `--format toon`.

### 1. Symbol Search (`--symbols`)

Searches for definitions of classes, functions, methods, interfaces, types, and variables:

```bash
# Search for symbol by name
specd graph search "ArchiveRepository" --symbols --format toon

# Filter by symbol kind (function, class, method, variable, type, interface, enum)
specd graph search "validate" --symbols --kind function,method --format text

# Filter by workspace
specd graph search "ConfigLoader" --symbols --workspace core --format toon
```

Symbol search follows **public bindings and re-exports**. A declaration in an internal module that is re-exported from a barrel (for example `packages/core/src/public.ts`) is one logical symbol. Text output lists the declaration and any matched public export as `matched export: <surface>::<exportedName>`.

### 2. Source File Content Search (`--files`)

Tokenized full-text search over indexed source files. Each hit reports the file, match kind, source range, and matched text. `--snippet` adds a preview block labeled `snippet @ L<start>-L<end>`:

```bash
specd graph search "expandForShell" --files --snippet --format text
```

### 3. Specification Search (`--specs`)

Discovers normative requirements and capabilities defined across your workspace specs:

```bash
# Find specs covering a concept
specd graph search "lifecycle hooks" --specs --format text

# Include full specification requirement markdown
specd graph search "archive pattern" --specs --spec-content --format toon
```

### 4. Document Search (`--documents`)

Searches markdown documentation, guides, architecture notes, and ADRs across workspaces:

```bash
# Search repository documentation
specd graph search "cascade resolution" --documents --snippet --format text

# Scope document search to a specific workspace
specd graph search "plugins" --documents --workspace cli --format text
```

### Advanced Scoping and Exclusion Filters

Refine search results in large monorepos with path and workspace exclusions:

```bash
# Exclude test files
specd graph search "createChange" --symbols --exclude-path "*:test/*" --exclude-path "*.spec.ts"

# Exclude specific workspaces
specd graph search "storage" --symbols --exclude-workspace public-web --exclude-workspace mcp
```

---

## 4. Blast Radius & Impact Analysis (`specd graph impact`)

Before modifying a file or refactoring a symbol, developers and AI agents must assess the **blast radius**—the transitive set of files, symbols, specifications, and processes that could break as a result of the change.

```bash
specd graph impact [options]
```

### Target Types

`specd graph impact` supports four types of targets:

#### 1. Symbol Impact (`--symbol <name>`)

Traces all callers, importers, and consumers of a specific symbol:

```bash
specd graph impact --symbol "resolveCliContext" --direction dependents --format toon
```

#### 2. File Impact (`--file <path>`)

Analyzes the impact of changes to a file. Supports workspace-canonical paths (`core:src/model.ts`), config-relative paths (`packages/core/src/model.ts`), and absolute paths:

```bash
specd graph impact --file "packages/core/src/application/specd-config.ts" --direction dependents --format toon
```

#### 3. Aggregated Multi-File Impact

Pass multiple `--file` arguments to analyze the cumulative blast radius of an entire multi-file changeset:

```bash
specd graph impact \
  --file "packages/core/src/domain/entities/change.ts" \
  --file "packages/core/src/application/use-cases/edit-change.ts" \
  --direction dependents --format toon
```

#### 4. Specification Impact (`--spec <id>`)

Determines what implementation code realizes a spec, what other specs depend on it, and what processes are affected:

```bash
specd graph impact --spec "core:core/transition-change" --direction dependents --format toon
```

The spec id is `workspace:capability-path` (the same id used by `specd specs show`).

#### 5. Public Export Route Impact (`--export <name> --from <surface>`)

Analyzes one exported name on a public file surface. `--export` and `--from` are required together, and they cannot be combined with `--file`, `--symbol`, or `--spec`.

`<surface>` is a file, not a package name. Use a workspace-canonical path (`core:src/public.ts`) or a config-relative path (`packages/core/src/public.ts`):

```bash
specd graph impact --export "SpecdConfig" --from "core:src/public.ts" --direction dependents --format toon
```

---

Pass exactly one selector: `--file` (repeatable), `--symbol`, `--spec`, or `--export` with `--from`.

### Traversal Directions

- **`dependents` (default, alias `upstream`):** Who depends on the target — callers and other consumers. This is the blast radius ("who breaks if I change this?").
- **`dependencies` (alias `downstream`):** What the target depends on — callees and used types ("what does this code need?").
- **`both`:** Both directions.

```bash
# Check upstream dependencies of a command
specd graph impact --file "packages/cli/src/commands/project/update.ts" --direction dependencies --format text
```

### Traversal Depth & Filtering

- **Depth (`--depth <n>`):** Controls how many levels of transitive dependencies to traverse (default: `3`).
- **Category Filter (`--type files,symbols,specs`):** Restricts impact results to specific entity types.
- **Kind Filter (`--kind <kinds>`):** Restricts impacted symbols to specific kinds (e.g. `--kind function,method`).

---

### Risk Classification Model

`riskLevel` is computed from dependent counts, not from package names:

| Risk           | Condition                                                     |
| :------------- | :------------------------------------------------------------ |
| **`CRITICAL`** | 20 or more total dependents, or 3 or more execution processes |
| **`HIGH`**     | 6 or more direct dependents, or 10 or more total dependents   |
| **`MEDIUM`**   | 3 or more direct dependents, or any indirect dependents       |
| **`LOW`**      | Anything smaller                                              |

Direct dependents are depth 1. Total dependents include later depths. Record `HIGH` and `CRITICAL` findings in `design.md` before changing the target. Hotspot ranking uses the same levels with a separate score (see below).

---

## 5. Architectural Hotspots (`specd graph hotspots`)

Hotspot analysis ranks symbols by structural coupling. The default view keeps kinds `class`, `method`, and `function`, score of at least 1, risk of at least `MEDIUM`, and the top 20 results. Symbols with no direct callers are omitted unless you pass `--include-importer-only`.

```bash
specd graph hotspots --min-risk HIGH --exclude-path "*:test/*" --format text
```

Each entry reports `score`, `directCallers` (same workspace), `crossWorkspaceCallers`, `fileImporters`, and `riskLevel`.

The score is:

```text
(same-workspace callers × 2)
+ (cross-workspace callers × 4)
+ importer contribution
+ hierarchy weight
```

Hierarchy weight is `(extenders × 3) + (implementors × 4) + (overriders × 2)`. Importer contribution is the file's importer count only for importer-only symbols; otherwise it is capped by the caller count.

### Hotspot Options

- `--min-risk <level>`: `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`. Default: `MEDIUM`.
- `--min-score <n>`: Minimum score. Default: `1`.
- `--limit <n>`: Maximum results. Default: `20`.
- `--kind <kinds>`: Replaces the default kind set. It does not merge with it. Example: `--kind interface,type`.
- `--include-importer-only`: Include symbols whose score comes only from file importers.
- `--workspace <name>`, `--exclude-workspace <name>`, `--file <path>`, `--exclude-path <pattern>`: Scope the ranking. Repeat `--exclude-path` and `--exclude-workspace`.

---

## 6. Implementation Coverage & Diagnostics

Indexing checks persisted spec-to-code links (`COVERS_FILE`, `COVERS_SYMBOL`) and prints `coverage diagnostics` on `specd graph index` when a link cannot be resolved:

```text
coverage diagnostics:
  core:core/storage: packages/core/src/domain/entities/change.ts#Change (SYMBOL_NOT_FOUND)
```

Reasons:

- **`FILE_NOT_INDEXED`:** The linked file is missing from the index (excluded, ignored, or not parsed).
- **`SYMBOL_NOT_FOUND`:** The file is indexed, but no symbol has that name.
- **`SYMBOL_AMBIGUOUS`:** More than one logical symbol in the file has that name.

`specd graph stats` reports whether coverage is complete and how many inputs are `indexed`, `excluded`, `unsupported`, `parse-failed`, or `partial`. It does not list per-link diagnostic reasons. Re-run `specd graph index` to see those.

---

## 7. The Graph-First Protocol for Agents & Developers

All AI coding assistants and developers in a SpecD repository follow the **Graph-First Protocol**:

```text
                  ┌───────────────────────────────┐
                  │ 1. Check Freshness            │
                  │    specd project status       │
                  └───────────────┬───────────────┘
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │ 2. Re-index if stale          │
                  │    specd graph index          │
                  └───────────────┬───────────────┘
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │ 3. Discover Symbols & Docs    │
                  │    specd graph search         │
                  └───────────────┬───────────────┘
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │ 4. Pre-calculate Blast Radius │
                  │    specd graph impact         │
                  └───────────────┬───────────────┘
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │ 5. Document in design.md      │
                  │    Record affected areas      │
                  └───────────────────────────────┘
```

1. **Never use blind lexical grep as a first resort.** Text searching across thousands of files pollutes LLM context and misses semantic dependencies.
2. **Check Index Freshness:** Ensure the graph is fresh with `specd project status --graph`. If stale, run `specd graph index`.
3. **Discover Exact Definitions:** Use `specd graph search "<symbol>" --symbols` to locate files and declaration signatures. Use `--documents` to locate relevant design guidelines.
4. **Calculate Blast Radius:** Before proposing changes in `/specd-design`, run `specd graph impact` on the target symbols and files.
5. **Attach Evidence to Design:** Record affected callers, risk levels, and affected workspaces directly into `design.md` under `## Affected areas`.

---

## 8. Practical Playbooks

### Playbook 1: Safe Refactoring of a Shared Function

1. Search for the function definition:
   ```bash
   specd graph search "expandPattern" --symbols --format toon
   ```
2. Determine who calls it across workspaces:
   ```bash
   specd graph impact --symbol "expandPattern" --direction dependents --format toon
   ```
3. If risk is `HIGH` or `CRITICAL`, inspect the callers before changing the parameter types or return value.

### Playbook 2: Spec-Driven Impact Analysis

1. Before modifying an existing capability spec, discover all implementation files linked to it:
   ```bash
   specd graph impact --spec "core:core/change-manifest" --direction dependents --format toon
   ```
2. Review the affected source files and dependent specs to ensure proposed changes do not violate upstream contracts.

### Playbook 3: Discovering Architecture & Design Guidelines

1. Search across all workspace markdown documentation without opening individual folders:
   ```bash
   specd graph search "token budget" --documents --snippet --format text
   ```
2. Read the matching guide section instead of scanning the repository by hand.

### Playbook 4: Cross-workspace dependency audit

1. See what a package consumes outside its own files:
   ```bash
   specd graph impact --file "packages/cli/src/commands/graph/impact.ts" --direction dependencies --format toon
   ```
2. Drop test files when ranking where to add tests or split a module:
   ```bash
   specd graph hotspots --workspace core --min-risk HIGH --exclude-path "*:test/*" --exclude-path "*.spec.ts" --format toon
   ```
