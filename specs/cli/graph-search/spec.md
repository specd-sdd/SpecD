# Graph Search

## Purpose

The code graph contains symbols with names and comments, and specs with titles, descriptions, and full content. Users and agents need to find relevant symbols and specs by concept or keyword without knowing exact names. The `specd graph search` command provides full-text search across both, ranked by relevance using BM25 scoring.

## Requirements

### Requirement: Command signature

```text
specd graph search <query> [--symbols] [--specs] [--kind <kind>] [--file <path>] [--workspace <name>] [--exclude-path <pattern>] [--exclude-workspace <name>] [--limit <n>] [--spec-content] [--format text|json|toon]
```

- `<query>` — required; the search terms (supports multiple words, stemming via porter stemmer)
- `--symbols` — optional; search only symbols
- `--specs` — optional; search only specs
- `--kind <kind>` — optional; filter symbols by kind (`function|class|method|variable|type|interface|enum`)
- `--file <path>` — optional; filter symbols by file path (supports `*` wildcards, case-insensitive)
- `--workspace <name>` — optional; filter both symbols and specs to a single workspace
- `--exclude-path <pattern>` — optional, repeatable; exclude symbols/specs whose file path matches glob pattern (supports `*` wildcards, case-insensitive)
- `--exclude-workspace <name>` — optional, repeatable; exclude results from the given workspace
- `--limit <n>` — optional; maximum results per category, defaults to `10`
- `--spec-content` — optional; include full spec content in output. Only valid with `--format json` or `--format toon` — exits with code 1 if used with text format
- `--format text|json|toon` — optional; output format, defaults to `text`

When neither `--symbols` nor `--specs` is provided, both categories are searched.

All filters (`--kind`, `--file`, `--workspace`, `--exclude-path`, `--exclude-workspace`) are applied at the store level before LIMIT — not as post-query filters. The CLI passes them via `SearchOptions` to `CodeGraphProvider.searchSymbols` / `CodeGraphProvider.searchSpecs`.

### Requirement: Search behaviour

The command uses `resolveCliContext()` to load config and creates a `CodeGraphProvider` via `withProvider`. It delegates to:

- `provider.searchSymbols(options)` — full-text search on `Symbol.name` and `Symbol.comment`, with filters applied at the store level
- `provider.searchSpecs(options)` — full-text search on `Spec.title`, `Spec.description`, and `Spec.content`, with filters applied at the store level

Both use LadybugDB's FTS extension with BM25 scoring. Results are returned ordered by score descending — highest relevance first.

### Requirement: Output format

In `text` mode, results are grouped by category:

```text
Symbols (5):
   8.0  [core] method execute  src/use-cases/run-hooks.ts:108 — /** Executes run hooks... */
   5.5  [core] type OnHookProgress  src/use-cases/run-hooks.ts:21 — /** Callback for hook... */

Specs (5):
  75.1  [core] core:core/hook-execution-model — Workflow steps declare hooks via...
  57.6  [core] core:core/run-step-hooks — Agent-driven workflow steps declare...
```

Each line shows:

- **Workspace** — in brackets (e.g. `[core]`, `[cli]`)
- **Score** — BM25 relevance score, right-aligned
- **Symbols**: kind, name, workspace-relative filePath:line, and comment preview (first 50 chars)
- **Specs**: specId and description preview (first 60 chars)

When no results are found, outputs `No results found.`

In `json` or `toon` mode, outputs `{ symbols: [...], specs: [...] }`. Each entry includes a `workspace` field and a `score` field. Spec entries include `specId`, `path`, `title`, and `description`. Full spec `content` is omitted by default — pass `--spec-content` to include it.

### Requirement: Error cases

If the provider cannot be opened, the command exits with code 3 (same as other graph commands). The `process.exit(0)` pattern applies — LadybugDB native threads require explicit exit.

## Constraints

- The CLI does not contain search logic — it delegates to `CodeGraphProvider.searchSymbols` and `CodeGraphProvider.searchSpecs`
- FTS indexes must be built during indexing — search on an empty graph returns no results
- The `process.exit(0)` pattern is required after closing the provider

## Examples

```
$ specd graph search "hook execution"
Symbols (10):
    8.0  [core] method execute  src/use-cases/run-step-hooks.ts:108 — /** Executes run hooks... */
    ...

Specs (10):
   75.1  [core] core:core/hook-execution-model — Workflow steps declare hooks via...
   57.6  [cli] cli:cli/change-run-hooks — Agent-driven workflow steps declare...
    ...

$ specd graph search "createKernel" --symbols --limit 3
Symbols (3):
    5.6  [core] interface KernelOptions  src/composition/kernel.ts:134 — /** Options for createKernel */
    1.4  [cli] function createCliKernel  src/kernel.ts:32 — /** Creates a fully-wired kernel... */
    1.2  [core] interface Kernel  src/composition/kernel.ts:49

$ specd graph search "workspace import" --specs
Specs (10):
   24.4  [code-graph] code-graph:code-graph/workspace-integration — @specd/code-graph must integrate...
   23.1  [core] core:core/workspace — Projects often span multiple code...
    ...

$ specd graph search "nonexistent term"
No results found.

$ specd graph search "hook" --specs --limit 1 --format json
{"symbols":[],"specs":[{"workspace":"core","specId":"core:core/hook-execution-model","path":"core/hook-execution-model","title":"Hook Execution Model","description":"Workflow steps declare...","score":61.0}]}

$ specd graph search "transition" --kind method --limit 3
Symbols (3):
    5.7  [core] method transition  src/domain/entities/change.ts:361 — /** Attempts a lifecycle state...
    3.7  [core] method state  src/domain/entities/change.ts:224 — /** The current lifecycle state...
    2.6  [core] method execute  src/application/use-cases/transition-change.ts:170

$ specd graph search "kernel" --workspace core --limit 3
Symbols (3):
    5.6  [core] interface Kernel  src/composition/kernel.ts:49
    2.5  [core] function createKernel  src/composition/kernel.ts:156
    1.5  [core] interface KernelInternals  src/composition/kernel-internals.ts:38

Specs (3):
   30.7  [core] core:core/kernel — Consumers of @specd/core need a single...
    ...

$ specd graph search "create" --file "*/composition/*" --symbols --limit 3
Symbols (1):
    1.8  [code-graph] interface CodeGraphOptions  src/composition/create-code-graph-provider.ts:13

$ specd graph search "hook" --specs --limit 1 --format json --spec-content
{"symbols":[],"specs":[{"workspace":"core","specId":"core:core/hook-execution-model",...,"content":"# Hook Execution Model\n\n## Purpose\n...","score":61.0}]}

$ specd graph search "handle" --exclude-path "test/*" --symbols --limit 5
Symbols (5):
    5.7  [core] function handleError  src/handle-error.ts:10 — /** Handles CLI errors...
    ...

$ specd graph search "config" --exclude-workspace cli --exclude-workspace mcp
Symbols (10):
    ...
Specs (10):
    ...

$ specd graph search "create" --exclude-path "*.spec.ts" --exclude-path "test/*" --symbols
Symbols (10):
    ...
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/code-graph/composition/spec.md`](../../code-graph/composition/spec.md) — CodeGraphProvider facade
- [`specs/code-graph/database-schema/spec.md`](../../code-graph/database-schema/spec.md) — FTS indexes
