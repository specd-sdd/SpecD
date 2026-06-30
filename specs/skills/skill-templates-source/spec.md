# skills:skill-templates-source

## Purpose

Defines how skill templates are sourced, stored, rendered, and linked to shared template content across supported agent runtimes. Templates live without static frontmatter in the skills package, while each skill directory declares its own metadata contract and `@specd/skills` renders the final installed markdown for each runtime.

## Requirements

### Requirement: Template source location

Template files MUST live in categorized subdirectories under `packages/skills/templates/`:

- `packages/skills/templates/skills/<skill-name>/` using the `SKILL.md.tpl` convention for standard skills.
- `packages/skills/templates/agents/<agent-name>/` using the `SPECD-AGENT.md.tpl` convention for specialized agents.

All template source files MUST use the `.md.tpl` extension.

Each skill or agent template directory MUST also contain a metadata file:

- `skill.meta.json` for skills.
- `specd-agent.meta.json` for agents.

Metadata files (`skill.meta.json` and `specd-agent.meta.json`) share the same schema and serve the same purpose: declaring required capabilities and shared template dependencies. The different filenames are used strictly as discriminators for internal discovery and categorization.

Installed files rendered from those templates MUST be emitted as `.md` files after removing the trailing `.tpl` suffix.

### Requirement: Template migration

The template directory structure SHALL be:

- `templates/skills/` — contains `specd/`, `specd-archive/`, `specd-design/`, `specd-implement/`, `specd-new/`, `specd-metadata/`, `specd-compliance/`, and `specd-verify/`.
- `templates/agents/` — contains specialized agents such as `specd-project-context-optimizer` and `specd-spec-context-optimizer`.
- `templates/shared/` — contains shared template source files like `shared.md.tpl`.

Each skill or agent directory contains its respective template file (`SKILL.md.tpl` or `SPECD-AGENT.md.tpl`) plus its metadata contract file.

The current inverse consumer index model in `shared.meta.json` MUST NOT remain the source of truth for which skills consume shared templates.

### Requirement: Template metadata contract (skills and agents)

Each skill or agent template directory MUST declare a metadata file (`skill.meta.json` or `specd-agent.meta.json`) with this shape:

```json
{
  "kind": "skill" | "agent",
  "supportedCapabilities": ["mcp", "agents", "frontmatter"],
  "requiredCapabilities": [],
  "requiredSharedTemplates": ["shared.md"]
}
```

`kind` (required) MUST categorize the template as a standard `skill` or a specialized `agent`. This value MUST match the parent directory name (`skills/` or `agents/`).

`supportedCapabilities` declares the capability identifiers that templates in that directory are allowed to reference.

`requiredCapabilities` declares the capability identifiers that MUST be present for the templates to be installable.

`requiredSharedTemplates` declares the shared template filenames required by the templates.

### Requirement: Capability-aware install-time rendering

Skill templates MUST support capability-aware install-time rendering.

Templates MAY use `Handlebars` conditionals and iteration over structured render context provided at install time.

The rendering model MUST remain deterministic and single-pass at install time. Templates MUST NOT execute arbitrary code or runtime-specific scripting.

The initial required capability identifiers MUST behave as follows:

- `mcp`: enables template branches and content intended for runtimes that support MCP tools or MCP-connected workflows
- `agents`: enables template branches and content intended for runtimes that support delegated agent or subagent workflows
- `frontmatter`: enables final frontmatter composition and insertion from `variables.frontmatter`

Shared template references inside installed markdown MUST use the form `@{{sharedFolder}}/shared.md`.

`sharedFolder` MUST be treated as a normal template variable and MUST remain relative to the project root in rendered output.

### Requirement: Graph impact terminology in workflow templates

Workflow skill templates that instruct agents to run `specd graph impact` SHALL use clear user-facing terminology for impact direction and selector semantics:

- **dependents** — symbols and files that depend on the target; implemented by `--direction dependents`, with `--direction upstream` as a compatibility value
- **dependencies** — symbols and files the target depends on; implemented by `--direction dependencies`, with `--direction downstream` as a compatibility value
- **both** — combined dependents and dependencies analysis; implemented by `--direction both`
- **file selectors** — blast-radius queries over files use `--file`, including multiple file inputs when needed; templates MUST NOT instruct agents to use `--changes`

Templates MUST NOT ask for "downstream dependents" or otherwise describe `downstream` as dependents. When a skill needs the blast radius of changing a symbol or file, it SHALL use `--direction dependents` or describe the query as dependents. When a workflow needs the blast radius of several files, it SHALL use `specd graph impact --file <path1> <path2> ...` rather than a separate change-detection selector.

### Requirement: Graph search snippet guidance in workflow templates

Workflow skill templates that instruct agents to run `specd graph search` SHALL describe snippet previews as opt-in output.

Specifically:

- templates MUST NOT imply that `specd graph search` always returns visible snippet content by default
- when a workflow example or instruction depends on reading preview text, the template SHALL include `--snippet`
- when a workflow only needs identifiers, locations, or structured metadata, templates SHOULD omit `--snippet`
- workflow guidance that mentions `json` or `toon` output SHALL describe the `snippet` field as omitted unless `--snippet` is passed

### Requirement: Frontmatter source

Frontmatter definitions MUST come from canonical skill metadata and vendor documentation for each target agent runtime. Plugin-specific frontmatter types and value collections MUST reflect those documented contracts exactly.

Agent plugins MUST provide structured frontmatter data under `variables.frontmatter`; they MUST NOT pass prebuilt YAML frontmatter documents for direct insertion.

### Requirement: Frontmatter injection

Agent plugins MUST provide their capability list when installing a skill.

`@specd/skills` MUST inject the final frontmatter block when rendering skill-local markdown templates, using `variables.frontmatter` as input.

Frontmatter insertion MUST occur only when the `frontmatter` capability is present. If `variables.frontmatter` is present while the `frontmatter` capability is absent, the frontmatter block MUST NOT be emitted.

Injection MUST remain runtime-specific: the rendered output for each plugin emits only fields recognized by its target runtime and excludes unsupported fields.

Files marked as shared MUST NOT receive runtime skill frontmatter.

### Requirement: Agent frontmatter matrix

The plugin frontmatter models MUST cover the complete known field set per runtime:

- **Codex**: `name`, `description`
- **Copilot**: `name`, `description`, `license`, `allowed-tools`, `user-invocable`, `disable-model-invocation`
- **Open Code**: `name`, `description`, `license`, `compatibility`, `metadata`

Runtime defaults MAY emit a smaller subset, but model/type coverage MUST include each runtime's full supported set.

### Requirement: Why no frontmatter in skills package

The skills package does not include static frontmatter blocks because each agent environment has different metadata fields and compatibility rules. Agent plugins know their target environment and provide the runtime-specific values, while `@specd/skills` composes and injects the final frontmatter block during template rendering.

### Requirement: Implementation tracking instructions in templates

Workflow skill templates MUST include implementation-tracking guidance for active changes.

At minimum:

- implementation-oriented workflows MUST mention `specd changes implementation add` when code work is being linked back to specs
- archive-oriented workflows MUST mention resolving tracked implementation files and reviewing implementation integrity before archive
- shared workflow guidance MUST describe tracked implementation files and confirmed implementation links using the same terminology as the change artifacts

## Constraints

- Templates in the skills package MUST NOT contain static frontmatter YAML blocks.
- Template source files in the skills package MUST use the `.md.tpl` extension.
- Each skill directory MUST contain a `skill.meta.json` file.
- `shared.meta.json` MUST NOT remain the canonical source for determining which skills require shared templates.
- Templates MAY contain a frontmatter insertion point that is resolved by `@specd/skills` at install time.
- Agent plugins are responsible for declaring supported runtime capabilities and providing structured `variables.frontmatter` data.
- Agent plugins MUST NOT emit fields unsupported by their target runtime.
- `@specd/skills` MUST perform the final frontmatter insertion for skill-local markdown files.
- Installed markdown MUST NOT render absolute filesystem paths.
- Workflow templates MUST use dependents/dependencies wording for graph impact guidance and MUST prefer `--direction dependents` / `--direction dependencies`; `upstream` / `downstream` may appear only as compatibility values.
- Workflow templates MUST use `specd graph impact --file` for file-based blast-radius checks and MUST NOT reference `specd graph impact --changes`.

## Spec Dependencies

- [`skills:skill`](../skill/spec.md) — base skill type
