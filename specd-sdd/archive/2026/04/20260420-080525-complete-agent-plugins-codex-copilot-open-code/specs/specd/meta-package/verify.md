# Verification: specd:meta-package

## Requirements

### Requirement: Meta package identity

#### Scenario: Metapackage path and name are correct

- **WHEN** `packages/specd/package.json` is inspected
- **THEN** the package name is `@specd/specd`

### Requirement: Agent plugin dependency coverage

#### Scenario: Metapackage includes all supported agent plugin dependencies

- **WHEN** the `dependencies` map in `packages/specd/package.json` is inspected
- **THEN** it includes `@specd/plugin-agent-claude`, `@specd/plugin-agent-copilot`, `@specd/plugin-agent-codex`, and `@specd/plugin-agent-opencode`
- **AND** each of those entries is set to `workspace:*`

### Requirement: Open Code inclusion

#### Scenario: Open Code plugin is included in metapackage dependencies

- **WHEN** Open Code runtime support is enabled in the project
- **THEN** `@specd/plugin-agent-opencode` exists in `@specd/specd` dependencies
