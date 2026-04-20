## Context compilation

When an agent works on a change, it needs to know which specs are relevant. Rather than leaving this to the agent to figure out, specd compiles a structured context block at each lifecycle step.

The compilation process:

1. **Project-level include patterns** — specs that always apply to every change (for example, `_global/architecture`).
2. **Project-level exclude patterns** — specs explicitly excluded from every change.
3. **Workspace-level patterns** — per-workspace include/exclude rules.
4. **Change seeding (change context only)** — by default, `change.specIds` are not force-seeded into context; add `--include-change-specs` to include them explicitly.
5. **Dependency traversal** — starting from selected specs, specd follows `dependsOn` links transitively, pulling in related specs automatically.
6. **Assembly** — specs are rendered according to the configured `contextMode`.

### Display modes

`contextMode` is configured in `specd.yaml` and applies to all context commands (`change context`, `project context`, `spec context`):

- **`list`** — only spec IDs are shown.
- **`summary`** (default) — spec IDs plus summary metadata (`title`, `description`).
- **`full`** — full content for all collected specs.
- **`hybrid`** — tiered rendering for `change context` (direct `specIds` in full, others as summary); for `project context` and `spec context`, it behaves as `full`.

When output includes non-full specs, the CLI marks them explicitly as list/summary entries and points to:

`specd change spec-preview <change-name> <specId>`

Use that command to inspect merged full content for a specific spec in the current change.

Section flags (`--rules`, `--constraints`, `--scenarios`) only affect full-mode output. In `list` and `summary`, those flags are accepted but do not change the rendered shape.

The output is a single ordered instruction block: project context, schema instructions for the active artifact, spec content, and lifecycle hooks — ready to inject directly into the agent.
