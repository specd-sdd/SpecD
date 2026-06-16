# skills:agents

## Purpose

Defines specialized agents for LLM context optimization. These agents are responsible for transforming raw spec metadata and project context into ultra-terse, high-density representations that minimize token usage while preserving all semantic requirements and constraints.

## Requirements

### Requirement: Optimizer agents

The system SHALL provide two specialized optimizer agents:

1. `specd-project-context-optimizer` — specializes in project-level context (instructions and global constraints).
2. `specd-spec-context-optimizer` — specializes in spec-level metadata (rules, constraints, and scenarios).

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

## Spec Dependencies

- [`skills:skill`](../skill/spec.md) — defines the base skill/agent domain model.
- [`skills:workflow-automation`](../workflow-automation/spec.md) — defines policies for agent interaction and context usage.
