# Proposal: project-status-command

## Motivation

The current `/specd` entry skill runs 6 CLI commands at startup to gather project state (config show, spec list, change list, drafts list, project context, graph stats). This creates latency on every skill invocation and the output is scattered across multiple commands, making it harder for downstream skills to consume programmatically.

## Current behaviour

The `/specd` entry skill runs multiple CLI commands at startup. Additionally, `project dashboard` provides project summary but doesn't include graph state or context references.

## Proposed solution

Two related CLI improvements:

1. **New `project status` command** — consolidates project state:

- Includes all data from `project dashboard` (workspaces, specs, changes)
- Adds workspace ownership (owned/shared/readOnly to replace `config show`)
- Adds graph state (freshness, indexed files count, last indexed timestamp)
- Adds context references (optional — same data as `project context` but only references, not content)

2. **Enhanced `change status`** — includes schema-derived fields to replace `schema show`:

- Artifact DAG (id, scope, optional, requires, hasTaskCompletionCheck)
- Simplifies design/implement skills — no need to call `schema show` separately

This is NOT a replacement for `project dashboard` — it's a separate command that builds upon it.

The context references (when `--context` flag is used) should include:

- Instruction entries (the directive text, without reading files)
- File entries (which files should be read, without content)
- Spec entries (which specs should be read, without content — same as lazy mode summaries)

The new command output structure:

- Project root, schema ref
- Workspaces (name, prefix, ownership: owned|shared|readOnly)
- Spec counts (total + per workspace)
- Changes (active, drafts, discarded)
- Graph freshness (stale boolean, last indexed timestamp)
- Graph stats (optional --graph: indexed files, symbols, hotspots)
- Context references (optional --context: same structure as `project context` but only references, not content)
- Also reports config flags: llmOptimizedContext enabled, spec approval enabled, signoff approval enabled

Flags:

- `--format <text|json|toon>` — output format (default: "text")
- `--context` — include project context references (default: off)
- `--graph` — include extended graph stats (default: off)

## Specs affected

### New specs

- `cli:cli/project-status`: Documents the new `project status` command interface and behaviour
  - Depends on: none

### Modified specs

- `cli:cli/change-status`: Add schema-derived fields:
  - Artifact DAG (id, scope, optional, requires, hasTaskCompletionCheck)
  - Approval gates (spec approval enabled, signoff approval enabled)
  - Simplifies design/implement skills — no need to call `schema show` separately

## Impact

- **Code**: New command in `packages/cli/src/commands/project/` — extends dashboard with graph/context data
- **Skills**: The specd entry skill can be simplified to call one command instead of six.
  Additionally, `change status` can include schema-derived fields (artifact DAG, task
  completion flags, approval gates) to replace the `schema show` and partial `config show`
  calls. The `--context` flag includes llmOptimizedContext (instruction directives).
  Requires updating all skill templates in `packages/skills/templates/` to use the new commands.
- **API**: New CLI flag surface — minimal, well-documented

## Technical context

The existing `project dashboard` command provides project summary. The new command extends it with graph stats and optional context references. This is a new command, not a replacement.

## Open questions

_none_
