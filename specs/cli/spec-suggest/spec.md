# cli:spec-suggest

## Purpose

Developers and AI agents need a dedicated CLI surface to discover candidate specifications in brownfield projects and audit specification coverage in existing projects. `specd specs suggest` (with alias `specd spec suggest`) is the CLI command group in `@specd/cli` that parses user inputs, delegates execution to `SuggestSpecs` in `@specd/sdk`, renders interactive progress spinners with `@clack/prompts`, and formats output reports inside `clack.note` boxes in text, JSON, or toon format.

## Requirements

### Requirement: Command Surface & Options

`@specd/cli` SHALL register the `suggest` action under the `spec` and `specs` command groups with the following options:

- `--ignore-current-specs`: Ignore existing specs on disk and execute full brownfield capability discovery across all source files.
- `-w, --workspace <name>`: Restrict specification suggestion and gap analysis to specific workspace(s) (repeatable or comma-separated).
- `-m, --min-confidence <0.0-1.0>`: Filter candidate specifications by minimum confidence threshold.
- `-l, --limit <n>`: Limit the number of displayed candidate specifications.
- `--rebuild-cache`: Bypass and overwrite existing suggestion cache entries.
- `--config <path>`: Path to `specd.yaml`.
- `-j, --json`: Output machine-readable JSON representation of `SuggestSpecsResult`.
- `--format <text|toon|json>`: Standard SpecD CLI output formatting support.

### Requirement: Delegation to SDK

1. The CLI command handler SHALL resolve configuration via `resolveCliContext` and initialize `openSuggestSpecs(config)`.
2. The handler SHALL delegate analysis execution directly to `SuggestSpecs.execute()`, passing single string or array of workspace filters.
3. The CLI handler SHALL NOT contain internal clustering, graph traversal, or confidence scoring logic.

### Requirement: Interactive Progress & Output Rendering

1. **Interactive Progress & Note Box Formatting**:
   - In interactive TTY text mode, the CLI SHALL dynamically adapt titles, spinners, and note headers based on whether existing specifications exist:
     - When auditing projects with existing specifications, the CLI SHALL display intro `SpecD — Audit specification gaps`, spinner `Auditing codebase capabilities and specification coverage...`, and note header `Specification gaps`.
     - In pure brownfield mode (or with `--ignore-current-specs`), the CLI SHALL display intro `SpecD — Suggest specifications`, spinner `Analyzing codebase capabilities and discovering specifications...`, and note header `Suggested specifications`.
   - The CLI SHALL format candidate specification cards inside a `clack.note` box using `wrapForClack`, and conclude with `clack.outro` reporting the scoped workspace name(s) or total workspaces analyzed.
2. **Code Graph Staleness Diagnostics**:
   - In text mode (TTY and non-interactive), if `result.codeGraphStale` is `true`, the CLI SHALL emit an advisory warning indicating that the code graph is stale and recommending running `specd graph index`.
3. **Text Report Mode**:
   - In standard text mode, the CLI SHALL render `specification gaps:` (in gap analysis mode) or `suggested specifications:` (in brownfield mode), followed by coverage percentage, analyzed files/symbols count, workspace count, average confidence, and structured candidate specification cards.
   - For each displayed candidate specification, the CLI SHALL render spec ID, title, workspace, category, priority, confidence score, rationale summary, key anchor symbols, primary implementation files, and suggested dependencies.
4. **JSON Mode**:
   - When `-j` / `--json` or `--format json` is specified, the CLI SHALL emit the exact serialized `SuggestSpecsResult` payload to stdout, including the top-level `codeGraphStale: boolean` field.

### Requirement: Concurrency & Error Handling

1. When suggestion caches are locked by another active process, the CLI SHALL catch `CACHE_LOCKED` errors, stop any active spinner gracefully (`s.stop('Suggestion cache is busy')`), inform the user via `clack.log.info`, and exit cleanly via `clack.outro('Command ended.')` without throwing uncaught stack traces.
2. The CLI SHALL handle and format all other typed errors gracefully via `handleError`.

## Constraints

1. **Thin Adapter**: CLI command SHALL perform zero business logic or AST parsing directly.
2. **Format Adherence**: Output formatting SHALL comply with SpecD CLI conventions and standard Clack UI components.

## Spec Dependencies

- [`sdk:suggest-specs`](../../sdk/suggest-specs/spec.md) — SDK use case providing the underlying analysis orchestration.
