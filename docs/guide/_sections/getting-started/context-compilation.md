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

For pre-change ID-only discovery (no rendering), use `specd project context-specs`. It resolves the same project/workspace include/exclude patterns and prints IDs partitioned as `project:` vs nested `workspaces.<name>:`. Filter workspace-level patterns with repeatable `--workspace <name>` (does not suppress `project` unless `--workspaces-only`).

When output includes non-full specs, the CLI marks them explicitly as list/summary entries and provides source-aware drill-down guidance: `specd changes spec-preview <change-name> <specId>` for change specs (`source: 'specIds'`), and `specd specs context <specId>` for canonical workspace specs (`source: 'specDependsOn'`, `'includePattern'`, or `'dependsOnTraversal'`).

Section flags (`--rules`, `--constraints`, `--scenarios`) only affect full-mode output. In `list` and `summary`, those flags are accepted but do not change the rendered shape.

The output is a single ordered instruction block: project context, schema instructions for the active artifact, and spec content — ready to inject directly into the agent. Lifecycle state and readiness come from `change status`, not from `change context`.
