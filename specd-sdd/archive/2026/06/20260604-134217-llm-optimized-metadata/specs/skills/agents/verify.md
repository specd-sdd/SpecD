# Verification: skills:agents

## Requirements

### Requirement: Optimizer agents

#### Scenario: Agent availability

- **WHEN** the skills repository is scanned
- **THEN** it finds `specd-project-context-optimizer` and `specd-spec-context-optimizer`
- **AND** their `kind` is `agent`

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
