# plugin-agent-copilot:plugin-agent

## Purpose

This spec defines the Copilot plugin contract for concrete install/uninstall behavior, project install location, and exact frontmatter support so agent skills are usable directly in Copilot workflows.

## Requirements

### Requirement: Factory export

The package MUST export `create(): AgentPlugin` as default or named export.

The factory function MUST read `specd-plugin.json` at the infrastructure boundary to obtain `name` and `version`. It MUST search for the manifest in its own directory first, then the parent directory as fallback — this works both in development (source tree) and after build/publish (`dist/` with manifest at package root). The `type` field MUST remain hardcoded as `'agent'`.

### Requirement: Plugin runtime contract

The implementation MUST return a valid `AgentPlugin` that:

- has `type: 'agent'` (hardcoded for type safety)
- has `name` and `version` sourced from `specd-plugin.json` via the factory — not hardcoded in the class
- implements `install(projectRoot, options)` and `uninstall(projectRoot, options)` with real filesystem behavior
- uses a stable frontmatter model for generated skill files

### Requirement: Skill installation and frontmatter injection

The plugin MUST install skills from `@specd/skills` and inject Copilot-compatible frontmatter into markdown skill files during install.

Installation flow MUST:

1. load requested skills (or all skills when no filter is provided)
2. resolve frontmatter for each skill
3. prepend frontmatter to markdown files in the installed skill directories
4. return an `InstallResult` with installed and skipped entries

### Requirement: Frontmatter field contract

The Copilot frontmatter contract MUST model and emit this exact supported set:

- required: `name`, `description`
- optional core field: `license`
- optional CLI-supported fields: `allowed-tools`, `user-invocable`, `disable-model-invocation`

Fields outside this set MUST NOT be emitted by default.

### Requirement: Install location

Project-level skill installation MUST target `.github/skills/` under the provided project root.

## Constraints

- The plugin MUST depend on `@specd/skills` for skill operations.
- The plugin MUST implement concrete install and uninstall behavior.
- `name` and `version` MUST be read from `specd-plugin.json` by the factory and passed to the plugin constructor — never hardcoded in the class.
- `type` MUST remain hardcoded as `'agent'` for type safety.

## Spec Dependencies

- [`plugin-manager:agent-plugin-type`](../plugin-manager/agent-plugin-type/spec.md) — plugin interface
- [`skills:skill-templates-source`](../skills/skill-templates-source/spec.md) — frontmatter injection responsibility and template source contract
