# Verification: Agent Instruction Template

## Requirements

### Requirement: Shared Base Instruction Template

#### Scenario: Renders standard specd entry points and rules

- **GIVEN** `@specd/skills` template renderer
- **WHEN** `renderBaseAgentInstruction()` is called
- **THEN** output contains `<!-- <specd> -->` and `<!-- </specd> -->`
- **AND** output contains `/specd` and `/specd-new` entry point directives
- **AND** output contains Code Graph mandatory research protocol and `stale: true` re-indexing instructions

### Requirement: Base Prompt Rendering Interface

#### Scenario: Renders inline extraInstructions when supplied

- **WHEN** `renderBaseAgentInstruction({ extraInstructions: "Custom rule" })` is called
- **THEN** output contains "Custom rule" inside the `<!-- <specd> -->` block

#### Scenario: Renders clean prompt when extraInstructions is omitted

- **WHEN** `renderBaseAgentInstruction()` is called without extra instructions
- **THEN** output does not render empty trailing headers

### Requirement: Idempotent Markdown Block Management

#### Scenario: Injects base block into new or existing file

- **GIVEN** a markdown file path
- **WHEN** `injectSpecdBlock(filePath, basePrompt)` is executed
- **THEN** `<!-- <specd> -->` block is written to `filePath`
- **AND** existing user content outside the block is preserved

#### Scenario: Non-empty content guard skips empty blocks

- **GIVEN** a markdown file path
- **WHEN** `injectSpecdBlock(filePath, "   ", "opencode")` is executed
- **THEN** no `<!-- <specd-plugin:opencode> -->` tag is written to `filePath`

#### Scenario: Reference-counted cleanup removes base block when last plugin is uninstalled

- **GIVEN** a file with base `<!-- <specd> -->` and single plugin block `<!-- <specd-plugin:opencode> -->`
- **WHEN** `removeSpecdBlock(filePath, "opencode")` is executed
- **THEN** `<!-- <specd-plugin:opencode> -->` is removed
- **AND** the shared `<!-- <specd> -->` base block is also removed
