# Verification: skills:agents

## Requirements

### Requirement: Optimizer agents

#### Scenario: Agent availability

- **WHEN** the skills repository is scanned
- **THEN** it finds `specd-project-context-optimizer` and `specd-spec-context-optimizer`
- **AND** their `kind` is `agent`
- **AND** it does not find a standard `specd-metadata` skill

### Requirement: Agent prompt policy

#### Scenario: Optimized context uses smart caveman style

- **WHEN** an optimizer agent generates content
- **THEN** it uses terse fragments and drops articles
- **AND** it preserves technical exactness (symbols, APIs)

### Requirement: Output density

#### Scenario: Significant token reduction

- **GIVEN** a full spec artifact
- **WHEN** the `specd-spec-context-optimizer` processes its metadata
- **THEN** the resulting `optimizedContext` uses 50-70% fewer tokens than the full rendered spec

### Requirement: Agent template purity

#### Scenario: Templates contain only instructions

- **WHEN** an agent template (e.g., `SPECD-AGENT.md.tpl`) is read
- **THEN** it does NOT contain YAML frontmatter
- **AND** it only contains the raw system prompt

### Requirement: Fallback behavior

#### Scenario: Manual inspection of agent prompts

- **WHEN** the `agents` capability is missing
- **THEN** the agent definitions are still accessible to the orchestrator agent as files or skills

### Requirement: Effective llmOptimizedContext gate

#### Scenario: Optimization skipped when llmOptimizedContext is not true

- **GIVEN** the effective project configuration has `llmOptimizedContext` set to `false` (or unset)
- **WHEN** an optimizer agent runs against a spec with missing or stale optimization data
- **THEN** the agent does not generate, persist, or write any optimized field, metadata document, or lock state
- **AND** it exits without performing optimization

#### Scenario: Optimization proceeds when llmOptimizedContext is true

- **GIVEN** the effective project configuration has `llmOptimizedContext: true`
- **WHEN** an optimizer agent runs against a spec with missing or stale optimization data
- **THEN** the agent proceeds with generating and persisting the optimized content

### Requirement: Persisted optimization writes replace metadata editors

#### Scenario: Optimizer agent persists through specd spec optimizations set

- **WHEN** an optimizer agent finishes generating optimized content for a spec
- **THEN** it persists that content via `specd spec optimizations set`
- **AND** it does not invoke a metadata-editing command such as `update-metadata` or `write-metadata`

#### Scenario: Optimizer agent does not trigger metadata regeneration after persisting

- **WHEN** an optimizer agent has persisted an optimization via `specd spec optimizations set`
- **THEN** it does not invoke `specd spec generate-metadata`
- **AND** normal consumers self-heal their own metadata projection on the next read
