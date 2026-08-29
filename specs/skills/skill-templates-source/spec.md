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

- `templates/skills/` — contains `specd/`, `specd-archive/`, `specd-design/`, `specd-implement/`, `specd-new/`, `specd-compliance/`, and `specd-verify/`.
- `templates/agents/` — contains specialized agents such as `specd-project-context-optimizer` and `specd-spec-context-optimizer`.
- `templates/shared/` — contains shared template source files like `shared.md.tpl`.

The `templates/skills/` directory SHALL NOT contain a `specd-metadata/` template. Metadata optimization SHALL be exposed through the specialized agent templates.

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

### Requirement: Metadata self-healing guidance in workflow templates

Archive-oriented, commit-oriented, and other metadata-oriented workflow skill templates MUST NOT instruct agents to scan for metadata-status values (`stale`, `missing`, `invalid`) or to run routine manual metadata regeneration as a normal workflow step. Templates MUST describe metadata as a self-healing materialized cache: normal consumers obtain a usable, current projection automatically, and `specd spec generate-metadata` MUST be presented only as an explicit forced-rebuild, cache-warming, repair, or diagnostic tool — never as a required step after a routine spec or lock change.

### Requirement: Optimizer agent gating declared in templates

The `specd-project-context-optimizer` and `specd-spec-context-optimizer` agent templates MUST gate optimization by running `specd project status --format toon` and reading the top-level `llmOptimizedContext` field. They MUST NOT use `specd specs metadata` as a project-configuration gate.

Both templates MUST declare that they perform no optimization work — no generation, no persistence — unless top-level `llmOptimizedContext` is exactly `true`.

Spec optimizer templates MUST direct persistence through the direct lock-owned options defined by `cli:spec-optimizations`. They MUST NOT combine `--input` with either direct set option, and neither optimizer template may instruct invoking spec metadata generation after persisting an optimization.

### Requirement: Agent-facing command roles in templates

Shared workflow guidance MUST distinguish the three spec read surfaces:

- `specd specs show <spec-id>` reads exact raw artifacts for authoring and content review.
- `specd specs context <spec-id>` provides agent-ready semantic context, including filtering, dependency traversal, and optimized-content preference.
- `specd specs metadata <spec-id>` inspects the self-healed normalized projection and materialization diagnostics; it MUST NOT be presented as the general context-loading command or as a source of effective project configuration.

Archive-oriented templates MAY use `specs metadata` to inspect `source`, `regenerated`, and materialization warnings. When they decide whether to suggest an optimizer agent, they MUST read top-level `llmOptimizedContext` from `specd project status --format toon` and MUST NOT reference a nested `approvals.llmOptimized` field.

Template contract tests MUST assert the exact commands and output fields required by these roles, not only the presence of command-group or configuration keywords.

### Requirement: In-place approval gates in workflow templates

Workflow skill templates that own a hop (`specd-new`, `specd-design`, `specd-implement`, `specd-verify`, `specd-archive`) and `templates/shared/shared.md.tpl` MUST describe approval gates as in-place checks on `ready` / `done` (see [`core:transition-checks`](../../core/transition-checks/spec.md)). They MUST NOT mention a `change transition` into `pending-spec-approval` or `pending-signoff` — those hops are not protocol. Teach stay-in-`ready` / `done` plus human `approve`. The `specd` entry skill is a router only and MUST NOT duplicate that copy.

- **`shared.md.tpl`:** agents MUST NEVER run `changes approve`. When the spec or signoff gate is on and no consent is recorded, the change **stays** in `ready` or `done`; the agent MUST tell the human to run `specd changes approve spec|signoff`. Pending states MAY be mentioned only as **drain** for in-flight changes already in those states. Hook guidance MUST NOT list pending parking states as intermediates the happy path “passes through”. Skills that skip auto-hooks MUST NOT run `source.post` on `along` backward / redesign / recovery.
- **`specd-design`:** when `approvals.spec` is on after entering `ready`, stay in `ready` and stop for human `approve spec`. MUST NOT mention a hop to `pending-spec-approval`.
- **`specd-implement`:** MUST NOT `transition implementing` from `ready` while the spec gate is on and no spec approval is recorded. Redirect to human `approve spec`. `spec-approved` remains a drain entry state only.
- **`specd-verify`:** when `approvals.signoff` is on after entering `done`, stay in `done` and stop for human `approve signoff`. MUST NOT mention `pending-signoff` or a transition into it. After consent, this skill still owns `done → archivable`.
- **`specd-new`:** the `nextAction.targetStep` routing table MUST treat `pending-spec-approval` / `pending-signoff` as drain-only rows (in-flight leftovers). For `ready` / `done` with an active unsatisfied gate, suggest the matching `approve` command. MUST NOT present those names as transition targets.
- **`specd`:** router only. MUST NOT teach spec/signoff approval or pending parking; those belong in the skills that own the hop (`specd-design`, `specd-implement`, `specd-verify`, `specd-archive`) and in `shared.md.tpl`.
- **`specd-archive`:** MUST say the change must already be `archivable` or `archiving` (retry after a failed commit) and that signoff wait is `/specd-verify` in `done`. MUST NOT mention a `change transition` into `pending-signoff`.

Template contract tests MUST assert the absence of happy-path parking copy (for example “routes to `pending-signoff`”, “reaches `pending-spec-approval`” as the normal wait).

### Requirement: Implementation tracking in verify and implement templates

`impl.filesResolved` gates `implementing → verifying` (and archive). Command syntax for listing, adding, resolving, and ignoring tracked files MUST live in `templates/shared/shared.md.tpl` so every skill that already loads shared context can drain tracking without duplicating the CLI cookbook.

- **`shared.md.tpl`:** MUST document `changes implementation list|review|add|resolve|ignore`, the difference between **resolve** (in-scope, reviewed) and **ignore** (not this change’s implementation surface; linked files cannot be ignored), and that open tracked files block entering `verifying`. `add` guidance MUST prefer top-level symbols that realize the spec, MUST NOT treat locals/variables or incidental files as links, and MUST NOT dump catch-all links.
- **`specd-verify`:** this skill owns the hop into `verifying`. When status or a failed `transition verifying` shows `IMPLEMENTATION_STATE` / open tracked files, it MUST drain tracking using shared guidance (`resolve` vs `ignore`) and retry the transition. It MUST NOT redirect to `/specd-implement` solely for open files, and MUST NOT paste the full command cookbook (point at `shared.md`).
- **`specd-implement`:** after the last task checkbox and post-hooks, it MUST `implementation list` (or equivalent) and leave **zero open** tracked files before telling the user to run `/specd-verify`. Linking workflow MUST prefer top-level `--symbol` targets that actually implement the spec; skip unrelated names. Resolve/ignore command details belong in shared.

Template contract tests MUST assert these ownership and drain rules exist in the templates.

### Requirement: Archive skill skips only pre hooks

`specd-archive` MUST run `archiving` pre `run:` / `instruction:` itself, then call `changes archive` with `--skip-hooks pre` (not `all`). After persist, `ArchiveChange` MUST run post `run:` hooks. After a successful archive the skill MUST NOT call `run-hooks <name> archiving --phase post` (that would double-run). It MAY still call `hook-instruction` for post `instruction:` entries.

### Requirement: Design skill review scope without review file lists

`specd-design` MAY key off `review: required: yes` plus `route` / `reason`. It MUST NOT tell agents that artifact files are listed under the text `review:` header. First review scope is artifacts with `pending-review` / `[drift]` under `artifacts (details):` (and JSON/TOON `review.affectedArtifacts` when using structured status).

### Requirement: Overlap invalidation vs live archive overlap in templates

`OVERLAP_CONFLICT` is a **live archive** blocker (`spec.overlap` while `archivable`, skippable with `--allow-overlap`). Skill templates for `specd-design`, `specd-implement`, `specd-verify`, and `specd-new` MUST NOT list `OVERLAP_CONFLICT` as a typical status blocker. Invalidation from another archive is `review.reason: spec-overlap-conflict` and routes to `/specd-design`; it MUST NOT be taught as `--allow-overlap`.

`specd-archive` MAY list `OVERLAP_CONFLICT` as a typical blocker and MUST tell the agent that `--allow-overlap` applies only to that live overlap, not to `spec-overlap-conflict` review.

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
- [`cli:spec-optimizations`](../../cli/spec-optimizations/spec.md) — the command optimizer-agent templates must direct persistence through
- [`skills:workflow-automation`](../workflow-automation/spec.md) — agent-facing command selection and context-loading policy rendered into shared workflow guidance
- [`core:transition-checks`](../../core/transition-checks/spec.md) — in-place `approval.spec` / `approval.signoff`; pending states are drain-only
