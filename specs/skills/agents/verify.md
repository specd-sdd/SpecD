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

#### Scenario: Optimization skipped when the top-level status field is not true

- **GIVEN** `specd project status --format toon` returns top-level `llmOptimizedContext: false` or omits the field
- **WHEN** an optimizer agent runs against a spec with missing or stale optimization data
- **THEN** the agent does not generate, persist, or write any optimized field, metadata document, or lock state
- **AND** it exits without performing optimization

#### Scenario: Optimization proceeds when the top-level status field is true

- **GIVEN** `specd project status --format toon` returns top-level `llmOptimizedContext: true`
- **WHEN** an optimizer agent runs against a spec with missing or stale optimization data
- **THEN** the agent proceeds with generating and persisting the optimized content

#### Scenario: Spec metadata is not used as the optimization gate

- **WHEN** an optimizer agent determines whether optimization is enabled
- **THEN** it does not read `specd specs metadata` for effective project configuration
- **AND** it reads the top-level status field instead

### Requirement: Persisted optimization writes replace metadata editors

#### Scenario: Spec optimizer persists both fields through direct options

- **WHEN** the spec optimizer finishes generating optimized description and context for a spec
- **THEN** it invokes `specd specs optimizations set <spec-id> --optimized-description <text> --optimized-context <text>`
- **AND** it does not combine those options with `--input`
- **AND** it does not invoke a metadata-editing command such as `update-metadata` or `write-metadata`

#### Scenario: Spec optimizer may persist one field

- **GIVEN** only one optimized field needs to be refreshed
- **WHEN** the spec optimizer persists the result
- **THEN** it supplies only the corresponding direct option

#### Scenario: Project optimizer retains project-scoped persistence

- **WHEN** the project optimizer finishes generating project-level optimized context
- **THEN** it invokes `specd project update-metadata --optimized-context <text>`
- **AND** it does not invoke `specd specs optimizations set`

#### Scenario: Spec optimizer does not trigger metadata regeneration after persisting

- **WHEN** the spec optimizer has persisted an optimization via `specd specs optimizations set`
- **THEN** it does not invoke `specd specs generate-metadata`
- **AND** normal consumers self-heal their own metadata projection on the next read
