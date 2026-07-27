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

#### Scenario: Updates existing base block content idempotently

- **GIVEN** a file already containing a `<!-- <specd> -->` block
- **WHEN** `injectSpecdBlock(filePath, updatedPrompt)` is executed
- **THEN** the block content is replaced with `updatedPrompt`
- **AND** surrounding user content is preserved

#### Scenario: Reference-counted cleanup preserves base block when other plugins remain

- **GIVEN** a file with base `<!-- <specd> -->` and two plugin blocks `<!-- <specd-plugin:opencode> -->` and `<!-- <specd-plugin:codex> -->`
- **WHEN** `removeSpecdBlock(filePath, "opencode")` is executed
- **THEN** `<!-- <specd-plugin:opencode> -->` is removed
- **AND** the shared `<!-- <specd> -->` base block is preserved
- **AND** `<!-- <specd-plugin:codex> -->` is preserved

#### Scenario: Reference-counted cleanup removes base block when last plugin is uninstalled

- **GIVEN** a file with base `<!-- <specd> -->` and single plugin block `<!-- <specd-plugin:opencode> -->`
- **WHEN** `removeSpecdBlock(filePath, "opencode")` is executed
- **THEN** `<!-- <specd-plugin:opencode> -->` is removed
- **AND** the shared `<!-- <specd> -->` base block is also removed

### Requirement: Shared File Plugin Registration

#### Scenario: Shared-file plugin injects both base block and plugin marker

- **GIVEN** plugin-agent-codex targeting `AGENTS.md`
- **WHEN** install injects base prompt via `injectSpecdBlock(agentsMdPath, prompt)` and plugin marker via `injectSpecdBlock(agentsMdPath, "Registered by @specd/plugin-agent-codex", "codex")`
- **THEN** `AGENTS.md` contains both `<!-- <specd> -->` base block and `<!-- <specd-plugin:codex> -->` marker block

#### Scenario: Exclusive-file plugin injects only base block

- **GIVEN** plugin-agent-claude targeting `CLAUDE.md`
- **WHEN** install injects base prompt via `injectSpecdBlock(claudeMdPath, prompt)`
- **THEN** `CLAUDE.md` contains only `<!-- <specd> -->` base block
- **AND** no `<!-- <specd-plugin:*> -->` blocks are present

### Requirement: Safe JSON Config Merge Utilities

#### Scenario: mergeJsonConfig preserves existing keys when adding new entries

- **GIVEN** a JSON file `settings.json` containing `{ "permissions": { "allow": ["read"] } }`
- **WHEN** `mergeJsonConfig(settingsPath, (cfg) => ({ ...cfg, hooks: { SessionStart: [...] } }))` is called
- **THEN** `settings.json` contains both `permissions` and `hooks` keys
- **AND** `permissions.allow` is unchanged

#### Scenario: mergeJsonConfig creates file and parent directories when missing

- **GIVEN** a non-existent file path `.claude/settings.json`
- **WHEN** `mergeJsonConfig(settingsPath, (cfg) => ({ ...cfg, hooks: {...} }))` is called
- **THEN** `.claude/settings.json` is created with the updater result
- **AND** parent directory `.claude/` is created

#### Scenario: unmergeJsonConfig is no-op when file does not exist

- **GIVEN** a non-existent file path
- **WHEN** `unmergeJsonConfig(path, updater)` is called
- **THEN** no file is created
- **AND** no error is thrown

#### Scenario: unmergeJsonConfig removes entries from existing JSON

- **GIVEN** a JSON file containing `{ "plugins": ["./.opencode/plugins/specd-agent-init.ts", "other-plugin.ts"] }`
- **WHEN** `unmergeJsonConfig(path, (cfg) => ({ ...cfg, plugins: cfg.plugins.filter(p => !p.includes('specd-')) }))` is called
- **THEN** the file contains `{ "plugins": ["other-plugin.ts"] }`
