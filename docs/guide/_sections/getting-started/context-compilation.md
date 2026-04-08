## Context compilation

When an agent works on a change, it needs to know which specs are relevant. Rather than leaving this to the agent to figure out, specd compiles a structured context block at each lifecycle step.

The compilation process:

1. **Project-level include patterns** — specs that always apply to every change (for example, `_global/architecture`).
2. **Project-level exclude patterns** — specs explicitly excluded from every change.
3. **Workspace-level patterns** — per-workspace include/exclude rules.
4. **Dependency traversal** — starting from the specs a change touches, specd follows `dependsOn` links transitively, pulling in related specs automatically.
5. **Assembly** — specs are sorted by tier and assembled into a single instruction block.

### Tiers

Not all resolved specs are treated equally:

- **Tier 1 (full content)** — specs directly relevant to the change. The agent receives the full spec and verify content.
- **Tier 2 (summary only)** — specs pulled in via dependency traversal that are not directly touched. The agent receives a compact metadata summary instead of the full file.

This keeps the context window focused: the agent gets full detail on the specs it is directly working with, and lighter summaries for the broader context.

The output is a single ordered instruction block: project context, schema instructions for the active artifact, spec content, and lifecycle hooks — ready to inject directly into the agent.
