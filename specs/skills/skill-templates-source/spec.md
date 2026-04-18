# skills:skill-templates-source

## Purpose

Defines how skill templates are sourced, stored, and how frontmatter is handled. Templates live without frontmatter in the skills package, and agent plugins inject their specific frontmatter.

## Requirements

### Requirement: Template source location

Template files MUST live in `packages/skills/templates/<skill-name>/` WITHOUT frontmatter YAML blocks.

### Requirement: Template migration

The template directory MUST contain:

- `specd/`, `specd-archive/`, `specd-design/`, `specd-implement/`, `specd-new/`, `specd-metadata/`, `specd-compliance/`, `specd-verify/` directories
- `shared.md` as shared content across all skills

Each skill directory contains `.md` files (without frontmatter).

### Requirement: Frontmatter source

Original frontmatter MUST be read from `dev/ai-agents/skills/<skill-name>/SKILL.md` before stripping and stored in the appropriate agent plugin package.

### Requirement: Frontmatter injection

Each agent plugin MUST inject its stored frontmatter when installing a skill. The injection happens during the install process with:

- `name` — display name
- `description` — what it does
- `allowed_tools` — permitted tools
- `argument_hint` — autocomplete hint

### Requirement: Why no frontmatter in skills package

The skills package does not include frontmatter because each agent environment (Claude, Copilot, Codex) has different metadata fields. Agent plugins know their target environment and inject appropriate metadata while preserving the base skill definition.

## Constraints

- Templates in skills package MUST NOT contain frontmatter YAML.
- Each agent plugin is responsible for storing and injecting its own frontmatter.

## Spec Dependencies

- [`skills:skill`](../skill/spec.md) — base skill type
