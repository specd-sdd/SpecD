# skills:skill-templates-source

## Purpose

Defines how skill templates are sourced, stored, and how frontmatter is handled across supported agent runtimes. Templates live without frontmatter in the skills package, and each agent plugin injects frontmatter that is exact for its target runtime.

## Requirements

### Requirement: Template source location

Template files MUST live in `packages/skills/templates/<skill-name>/` WITHOUT frontmatter YAML blocks.

### Requirement: Template migration

The template directory MUST contain:

- `specd/`, `specd-archive/`, `specd-design/`, `specd-implement/`, `specd-new/`, `specd-metadata/`, `specd-compliance/`, `specd-verify/` directories
- `shared.md` as shared content across all skills; the file MAY live in the root of the template directory or within a `shared/` subdirectory

Each skill directory contains `.md` files (without frontmatter).

### Requirement: Graph impact terminology in workflow templates

Workflow skill templates that instruct agents to run `specd graph impact` SHALL use clear user-facing terminology for impact direction and selector semantics:

- **dependents** — symbols and files that depend on the target; implemented by `--direction dependents`, with `--direction upstream` as a compatibility value
- **dependencies** — symbols and files the target depends on; implemented by `--direction dependencies`, with `--direction downstream` as a compatibility value
- **both** — combined dependents and dependencies analysis; implemented by `--direction both`
- **file selectors** — blast-radius queries over files use `--file`, including multiple file inputs when needed; templates MUST NOT instruct agents to use `--changes`

Templates MUST NOT ask for "downstream dependents" or otherwise describe `downstream` as dependents. When a skill needs the blast radius of changing a symbol or file, it SHALL use `--direction dependents` or describe the query as dependents. When a workflow needs the blast radius of several files, it SHALL use `specd graph impact --file <path1> <path2> ...` rather than a separate change-detection selector.

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

### Requirement: Implementation tracking instructions in templates

Workflow skill templates MUST include implementation-tracking guidance for active changes.

At minimum:

- implementation-oriented workflows MUST mention `specd changes implementation add` when code work is being linked back to specs
- archive-oriented workflows MUST mention resolving tracked implementation files and reviewing implementation integrity before archive
- shared workflow guidance MUST describe tracked implementation files and confirmed implementation links using the same terminology as the change artifacts

## Constraints

- Templates in skills package MUST NOT contain frontmatter YAML.
- Each agent plugin is responsible for storing and injecting its own frontmatter.
- Agent plugins MUST model the full supported frontmatter field set for their target runtime.
- Agent plugins MUST NOT emit fields unsupported by their target runtime.
- Workflow templates MUST use dependents/dependencies wording for graph impact guidance and MUST prefer `--direction dependents` / `--direction dependencies`; `upstream` / `downstream` may appear only as compatibility values.
- Workflow templates MUST use `specd graph impact --file` for file-based blast-radius checks and MUST NOT reference `specd graph impact --changes`.

## Spec Dependencies

- [`skills:skill`](../skill/spec.md) — base skill type
