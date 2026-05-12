# specd:meta-package

## Purpose

The `@specd/specd` package is the distribution metapackage that must expose the full shipped plugin set for consistent install experience. This spec defines the dependency contract that keeps agent plugin availability aligned with supported runtimes, including Open Code.

## Requirements

### Requirement: Meta package identity

The metapackage MUST be `packages/specd/package.json` with package name `@specd/specd`.

### Requirement: Agent plugin dependency coverage

The `dependencies` block in `@specd/specd` MUST include these workspace dependencies:

- `@specd/plugin-agent-claude`
- `@specd/plugin-agent-copilot`
- `@specd/plugin-agent-codex`
- `@specd/plugin-agent-opencode`

Each declared dependency MUST use version `workspace:*`.

### Requirement: Open Code inclusion

`@specd/plugin-agent-opencode` MUST be present in `@specd/specd` dependencies whenever Open Code support is part of the supported runtime matrix.

## Constraints

- The metapackage dependency list MUST remain aligned with officially supported agent plugin runtimes.
- Agent plugin dependency entries in `@specd/specd` MUST use `workspace:*`.

## Spec Dependencies

- [`plugin-agent-opencode:plugin-agent`](../../plugins-opencode/plugin-agent/spec.md) — declares Open Code support contract that must be represented in metapackage dependencies
