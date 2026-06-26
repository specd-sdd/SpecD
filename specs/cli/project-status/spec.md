# project status command

## Purpose

The specd entry skill and other downstream tools need a consolidated way to get project state. Currently they must call multiple CLI commands (config show, spec list, change list, drafts list, project context, graph stats), creating latency and scattered output. This spec defines a new `project status` command that consolidates this information.

## Requirements

### Requirement: project status command exists

The CLI MUST provide a `project status` command under the `project` subcommand that outputs consolidated project state.

### Requirement: includes workspace information

The command output MUST include rich workspace information obtained via the `ListWorkspaces` use case:

- Project root path
- Schema reference
- Workspaces: for each, name, prefix, ownership (`owned`|`shared`|`readOnly`), `isExternal` (boolean), and `codeRoot` (absolute path).

### Requirement: includes spec counts

The command output MUST include spec counts obtained efficiently through the `SpecRepository.count()` method for each orchestrated workspace:

- Total spec count across all workspaces
- Spec count per workspace

The command SHALL NOT load full spec metadata or artifacts to perform this count.

### Requirement: includes change counts

The command output MUST include:

- Number of active changes
- Number of drafts
- Number of discarded changes

### Requirement: includes approval gates

The command output MUST include:

- Spec approval enabled (boolean)
- Signoff approval enabled (boolean)

### Requirement: includes graph freshness (always)

The command output MUST always include:

- Whether the code graph is stale (boolean)
- Last indexed timestamp (or null if never indexed)

This is included by default, not behind a flag.

### Requirement: supports --graph flag

When `--graph` flag is provided, the command MUST include extended graph statistics:

- Number of indexed files
- Number of indexed symbols
- Hotspots (if available)

### Requirement: includes config flags (always)

The command output MUST always include:

- llmOptimizedContext enabled (boolean)
- Spec approval enabled (boolean)
- Signoff approval enabled (boolean)

This is included by default, not behind a flag.

### Requirement: supports --context flag

When `--context` flag is provided, the output MUST include project context references.

In `text` mode:

- The command MUST display the **full** project context (not truncated).
- If `llmOptimizedContext` is enabled in config, the command MUST prefer `optimizedContext` from `project-metadata.json` if it is fresh.
- If `llmOptimizedContext` is enabled but optimized context is missing or stale, the command MUST fall back to raw context entries and emit a `stale-optimization` warning.
- The warning MUST include remediation instructions: "Launch specd-project-context-optimizer agent to generate it".

In `json`/`toon` mode, the output MUST include:

- Instruction entries (the directive text without reading files)
- File entries (which files should be read without content)
- Spec entries (which specs should be read without content)
- `optimizedContext` (optional string, included if fresh and enabled)

When assembling context references for `--context`, the command MUST NOT construct a `CompileContextConfig` object inline from `SpecdConfig`. It MUST invoke the kernel-wired `GetProjectContext` use case, which carries yaml-derived defaults from composition time.

The command MUST call `GetProjectContext.execute` with runtime overrides only:

- `execute({})` for the primary context assembly (baked yaml defaults)
- `execute({ llmOptimizedContext: false })` when it needs the raw spec catalogue alongside fresh optimized project context (for example to populate spec reference lists without optimized spec bodies)

Section-filtered optimization bypass behaviour is enforced by `GetProjectContext` / `CompileContext` from forwarded `sections` when applicable; this command does not recompute `llmOptimizedContext` from section flags.

### Requirement: Optimization warning signal

The command MUST emit a `stale-optimization` warning to stderr when `llmOptimizedContext` is enabled but optimized project context is missing or stale.

### Requirement: defaults to text output

Without `--format` flag, output MUST be plain text formatted for readability.

### Requirement: supports json and toon formats

When `--format json` is provided, output MUST be valid JSON.
When `--format toon` is provided, output MUST be TOON-formatted.

## Constraints

- The command MUST NOT auto-index the graph — callers decide whether to index
- The `--context` flag defaults to off when not provided
- The `--graph` flag defaults to off when not provided
- This command does NOT replace `project dashboard` — they are separate commands

## Spec Dependencies

- [`core:list-workspaces`](../../core/list-workspaces/spec.md) — source for orchestrated project structure and repositories
- [`core:list-drafts`](../../core/list-drafts/spec.md) — existing draft counting behavior remains part of project status
- [`core:list-changes`](../../core/list-changes/spec.md) — existing active-change counting behavior remains part of project status
- [`core:get-project-context`](../../core/get-project-context/spec.md) — baked context defaults and runtime override merge for `--context` assembly
