# cli:project-optimized-context

## Purpose

Project-level LLM optimization is a single cached string (`optimized.context`), not a generic metadata document. Agents and operators need a dedicated CLI surface that names that field, supports get/set/clear, and accepts content through a consistent `--input <path|->` / `--text` contract — without implying multi-field `optimizations` semantics used by specs.

## Requirements

### Requirement: Command signature

The CLI SHALL expose a `project optimized-context` command group with exactly these subcommands:

```
project optimized-context get
project optimized-context set [--input <path|-> | --text <string>]
project optimized-context clear
```

Every subcommand MUST accept `--format text|json|toon` (default `text`) and `--config <path>` per `cli:entrypoint`. Every leaf subcommand MUST call `.allowExcessArguments(false)`.

The CLI MUST NOT register `project update-metadata`, or any alias of it.

### Requirement: Get subcommand

`project optimized-context get` MUST call `Kernel.project.getMetadata` (or the Kernel projection of `GetProjectMetadata`) and print the persisted `optimized.context` value when present.

When `project-metadata.json` is absent, the command MUST report that no optimized context is persisted rather than failing as a hard error.

Text output MAY include freshness summary derived from the persisted metadata. JSON/TOON output MUST include the optimized context string when present and MUST NOT invent fields beyond what Core returns plus thin presentation wrappers.

### Requirement: Set subcommand

`project optimized-context set` MUST accept exactly one input form:

- `--text <string>` — the optimized context string passed directly to Core
- `--input <path>` — read the file contents as the optimized context string; `--input -` MUST read stdin until EOF

`--text` and `--input` MUST NOT be combined. Supplying neither form MUST fail at the CLI boundary before any Kernel call. Implicit stdin (running with no `--input` / `--text`) MUST NOT be supported.

The command MUST NOT require a JSON/YAML object envelope. The raw string from `--text` or `--input` is the optimized context.

On success, the command MUST call `Kernel.project.updateMetadata` exactly once with `{ optimizedContext: <string> }` and report the persisted path.

### Requirement: Clear subcommand

`project optimized-context clear` MUST call the Core clear-project-metadata use case exactly once and MUST be idempotent when no `project-metadata.json` exists.

On success, the command MUST report that the optimized context cache was cleared (or was already absent).

### Requirement: No CLI-owned hashing or persistence

Handlers MUST NOT compute freshness hashes, write `project-metadata.json` directly, or invent versioning fields. Every mutation and read MUST flow through Kernel project use cases.

## Constraints

- Project has a single optimized field; this group MUST NOT expose multi-field `--field` selection APIs modelled on `specs optimizations`
- Generated agent instruction files under `.claude/agents/` (or equivalent) are out of scope for this command group; callers update source templates only
- Schema/graph `--file` path selectors are unrelated and MUST remain unchanged

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output formats
- [`core:update-project-metadata`](../../core/update-project-metadata/spec.md) — set / persist optimized context with freshness
- [`core:project-metadata`](../../core/project-metadata/spec.md) — persisted file schema and location
- [`core:clear-project-metadata`](../../core/clear-project-metadata/spec.md) — clear / delete project optimization cache
