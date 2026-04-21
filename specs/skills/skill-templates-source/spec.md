# skills:skill-templates-source

## Purpose

Defines how skill templates are sourced, stored, and how frontmatter is handled across supported agent runtimes. Templates live without frontmatter in the skills package, and each agent plugin injects frontmatter that is exact for its target runtime.

## Requirements

### Requirement: Template source location

Template files MUST live in `packages/skills/templates/<skill-name>/` WITHOUT frontmatter YAML blocks.

### Requirement: Template migration

The template directory MUST contain:

- `specd/`, `specd-archive/`, `specd-design/`, `specd-implement/`, `specd-new/`, `specd-metadata/`, `specd-compliance/`, `specd-verify/` directories
- `shared.md` as shared content across all skills

Each skill directory contains `.md` files (without frontmatter).

### Requirement: Frontmatter source

Frontmatter definitions MUST come from canonical skill metadata and vendor documentation for each target agent runtime. Plugin-specific frontmatter types and maps MUST reflect those documented contracts exactly.

### Requirement: Frontmatter injection

Each agent plugin MUST inject its stored frontmatter when installing a skill.

Injection MUST be runtime-specific: each plugin emits only fields recognized by its target runtime and excludes unsupported fields.

### Requirement: Agent frontmatter matrix

The plugin frontmatter models MUST cover the complete known field set per runtime:

- **Codex**: `name`, `description`
- **Copilot**: `name`, `description`, `license`, `allowed-tools`, `user-invocable`, `disable-model-invocation`
- **Open Code**: `name`, `description`, `license`, `compatibility`, `metadata`

Runtime defaults MAY emit a smaller subset, but model/type coverage MUST include each runtime's full supported set.

### Requirement: Why no frontmatter in skills package

The skills package does not include frontmatter because each agent environment has different metadata fields and compatibility rules. Agent plugins know their target environment and inject the appropriate metadata while preserving the base skill definition.

## Constraints

- Templates in skills package MUST NOT contain frontmatter YAML.
- Each agent plugin is responsible for storing and injecting its own frontmatter.
- Agent plugins MUST model the full supported frontmatter field set for their target runtime.
- Agent plugins MUST NOT emit fields unsupported by their target runtime.

## Spec Dependencies

- [`skills:skill`](../skill/spec.md) — base skill type
