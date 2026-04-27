# project status command

## Purpose

The specd entry skill and other downstream tools need a consolidated way to get project state. Currently they must call multiple CLI commands (config show, spec list, change list, drafts list, project context, graph stats), creating latency and scattered output. This spec defines a new `project status` command that consolidates this information.

## Requirements

### Requirement: project status command exists

The CLI MUST provide a `project status` command under the `project` subcommand that outputs consolidated project state.

### Requirement: includes workspace information

The command output MUST include:

- Project root path
- Schema reference
- Workspaces: for each, name, prefix, ownership (owned|shared|readOnly), isExternal (boolean), and codeRoot (absolute path)

### Requirement: includes spec counts

The command output MUST include:

- Total spec count across all workspaces
- Spec count per workspace

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

When `--context` flag is provided, the output MUST include project context references:

- Instruction entries (the directive text without reading files)
- File entries (which files should be read without content)
- Spec entries (which specs should be read without content)

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

_none_
