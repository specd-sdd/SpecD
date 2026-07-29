# skills:agents

## Purpose

Defines specialized agents for LLM context optimization. These agents are responsible for transforming raw spec metadata and project context into ultra-terse, high-density representations that minimize token usage while preserving all semantic requirements and constraints.

## Requirements

### Requirement: Optimizer agents

The system SHALL provide two specialized optimizer agents:

1. `specd-project-context-optimizer` — specializes in project-level context (instructions and global constraints).
2. `specd-spec-context-optimizer` — specializes in spec-level metadata (rules, constraints, and scenarios).

The skills bundle SHALL NOT publish a standard `specd-metadata` skill. Metadata optimization SHALL be performed through these specialized agents.

### Requirement: Agent prompt policy

Optimizer agents SHALL use a "smart caveman" style for their generated content:

- Drop articles (a/an/the) and filler words.
- Use fragments and terse prose.
- Preserve all technical exactness (symbols, APIs, values, constants).
- Maintain structural Markdown headings (`## Rules`, `## Constraints`).

### Requirement: Output density

Generated optimized context SHALL aim for a 50-70% reduction in tokens compared to the full rendered spec or raw metadata sections, without loss of normative information.

### Requirement: Agent template purity

Agent template files (e.g. `SPECD-AGENT.md.tpl`) MUST contain **ONLY** the raw system prompt and instructions. They MUST NOT contain YAML frontmatter or any other metadata. All metadata (name, description, tools) MUST be defined in the associated `specd-agent.meta.json` file.

### Requirement: Fallback behavior

When the target coding agent or plugin does not support specialized subagents (i.e. missing `agents` capability), the agent template SHALL be copied to the same directory as the shared context file (`shared.md`) for manual inspection or inline execution by the orchestrator agent.

### Requirement: Effective llmOptimizedContext gate

Optimizer agents MUST inspect the effective project configuration before doing any optimization work by running `specd project status --format toon` and reading its top-level `llmOptimizedContext` field.

Optimizer agents MUST NOT use `specd specs metadata` to determine whether optimization is enabled because that command exposes a spec's materialized metadata projection, not effective project configuration.

When top-level `llmOptimizedContext` is not exactly `true`, missing or stale optimization data is not a request to optimize: the agent MUST NOT generate, persist, or otherwise write any optimized field, metadata document, or lock state, and MUST exit without performing optimization. Optimization work MUST proceed only when that field is `true`.

### Requirement: Persisted optimization writes replace metadata editors

The `specd-spec-context-optimizer` MUST persist generated spec-level content through `specd specs optimizations set <spec-id> --optimized-description <text> --optimized-context <text>` (see `cli:spec-optimizations`), which writes directly to lock-owned per-field optimization state.

The spec optimizer MAY set only one field by omitting the other direct option. The direct options MAY be combined, but its instructions MUST NOT combine either direct option with `--input`.

The `specd-project-context-optimizer` MUST persist generated project-level context through `specd project update-metadata --optimized-context <text>`. It MUST NOT route project-level context through the spec-scoped optimizations command because project context has no target spec identity.

The spec optimizer MUST NOT use a metadata-editing command (`update-metadata`, `write-metadata`, or any equivalent) to store spec-level optimized content. After persisting a spec optimization, it MUST NOT invoke spec metadata generation (`specd specs generate-metadata`) — normal consumers self-heal their own metadata projection on the next read and do not depend on a manual regeneration step.

## Spec Dependencies

- [`skills:skill`](../skill/spec.md) — defines the base skill/agent domain model.
- [`skills:workflow-automation`](../workflow-automation/spec.md) — defines policies for agent interaction and context usage.
- [`cli:spec-optimizations`](../../cli/spec-optimizations/spec.md) — the command optimizer agents use to persist optimized fields.
