# Documentation Conventions

## Purpose

Scattered or inconsistently structured documentation slows onboarding and makes decisions hard to trace. All project documentation lives under `docs/`, with each subdirectory scoped to a specific concern (ADRs, CLI, MCP, core, schemas). The same constraints apply to both human and agent contributors.

## Requirements

### Requirement: Directory structure

```
docs/
├── adr/        # Architecture Decision Records
├── cli/        # CLI commands reference (one doc per command + index.md)
├── code-graph/ # Code Graph package reference
├── core/       # @specd/core API and domain model package reference
├── guide/      # User-facing conceptual guides, workflows, and tutorials
├── mcp/        # MCP server tools and resources reference
├── schemas/    # Schema specification and authoring reference
├── sdk/        # SDK integrator host guide
└── skills/     # Skills runtime and template rendering reference
```

No documentation lives outside `docs/` except `README.md` at the project root and `AGENTS.md` / `CLAUDE.md` for agent instructions.

### Requirement: User guide documentation and frontmatter

User-facing guide documentation under `docs/guide/` MUST carry complete Docusaurus frontmatter and MUST stay focused on using `specd`.

- Every document under `docs/guide/` MUST define `title`, `description` and `sidebar_position` in its frontmatter.
- A document under `docs/guide/` that is missing required frontmatter MUST fail validation.
- Documentation of the guide collection MUST open on "What is SpecD".
- Configuration and workflow guide parameters MUST match the core implementation.
- The project update command and plugin asset orchestration MUST be documented.
- Code Graph capabilities and intelligence workflows MUST be prominently documented.

Developer-internal monorepo documentation (such as internal package internals, skills template rendering details, and low-level subsystem references) MUST NOT live under `docs/guide/`. Such material SHALL be placed in their respective package reference directories under `docs/` (e.g. `docs/skills/`, `docs/core/`, `docs/code-graph/`, `docs/sdk/`, `docs/schemas/`), which together form the SDK guide collection.

### Requirement: Skills guide documentation

A user-facing guide `docs/guide/skills.md` MUST exist documenting the SpecD skills layer. It MUST cover:

- What skills are and how they act as the interface between the user and the CLI.
- The interaction pattern: user types a slash command → agent executes steps → CLI is called.
- A catalog of all built-in skills (`/specd`, `/specd-new`, `/specd-design`, `/specd-implement`, `/specd-verify`, `/specd-archive`, `/specd-compliance`, `/specd-fasttrack`) with a concise description of each and guidance on when to use it.
- How skills use `--format toon` and `specd guide` for on-demand documentation.
- Where skill files are stored in the repository (`.agents/skills/`).

### Requirement: ADR format

Every Architecture Decision Record follows the [MADR](https://adr.github.io/madr/) format (Markdown Architectural Decision Records) verbatim, with one project-specific addition: a `### Spec` sub-section inside `## More Information` linking to the spec(s) that capture constraints derived from this decision.

```markdown
---
status: '{proposed | rejected | accepted | deprecated | … | superseded by ADR-0123}'
date: YYYY-MM-DD
decision-makers: list everyone involved in the decision
consulted: list everyone whose opinions are sought; two-way communication
informed: list everyone kept up-to-date; one-way communication
---

# {short title, representative of solved problem and found solution}

## Context and Problem Statement

{Describe the context and problem statement, e.g., in free form using two to three sentences or in the form of an illustrative story. You may want to articulate the problem in form of a question and add links to collaboration boards or issue management systems.}

## Decision Drivers

- {decision driver 1, e.g., a force, facing concern, …}
- {decision driver 2, e.g., a force, facing concern, …}
- …

## Considered Options

- {title of option 1}
- {title of option 2}
- {title of option 3}
- …

## Decision Outcome

Chosen option: "{title of option 1}", because {justification. e.g., only option, which meets k.o. criterion decision driver | which resolves force {force} | … | comes out best (see below)}.

### Consequences

- Good, because {positive consequence, e.g., improvement of one or more desired qualities, …}
- Bad, because {negative consequence, e.g., compromising one or more desired qualities, …}
- …

### Confirmation

{Describe how the implementation / compliance of the ADR can/will be confirmed. Is there any automated or manual fitness function? If so, list it and explain how it is applied.}

## Pros and Cons of the Options

### {title of option 1}

{example | description | pointer to more information | …}

- Good, because {argument a}
- Good, because {argument b}
- Neutral, because {argument c}
- Bad, because {argument d}
- …

### {title of other option}

{example | description | pointer to more information | …}

- Good, because {argument a}
- Good, because {argument b}
- Neutral, because {argument c}
- Bad, because {argument d}
- …

## More Information

{You might want to provide additional evidence/confidence for the decision outcome here and/or document the team agreement on the decision and/or define when/how this decision should be realized and if/when it should be re-visited.}

### Spec

- [`core:config`](../config/spec.md)
```

`## Decision Drivers`, `## Considered Options`, `## Pros and Cons of the Options`, and `## More Information` are optional — omit them when they add no value. `### Confirmation` inside `## Decision Outcome` is always present. `### Spec` inside `## More Information` is always present.

### Requirement: ADR numbering

ADRs are numbered sequentially starting at `0001`. The filename matches the number and a kebab-case title: `0001-hexagonal-architecture.md`. Numbers are never reused — deprecated or superseded ADRs keep their number and update their status.

### Requirement: ADR creation

An ADR is created for every significant architectural or design decision. Significant means: it affects multiple packages, it constrains future development, or it was a non-obvious choice between real alternatives. Implementation details that follow naturally from prior ADRs do not need their own ADR.

### Requirement: CLI documentation

Every `specd` command MUST have a corresponding doc file in `docs/cli/`.

- A new command MUST provide dedicated docs for all CLI commands it introduces.
- Output contract changes MUST update the corresponding documentation in the same change.
- `docs/cli/index.md` MUST serve as a complete CLI directory, listing every top-level command family.
- User-facing CLI recipes and workflows MUST be maintained in `docs/guide/cli.md`, including the commands the recipes depend on.
- A command documented in `docs/cli/<command>.md` MUST be listed in the corresponding category of `apps/public-web/sidebars.ts`, so that its reference page is reachable from site navigation rather than existing as an orphan page.

### Requirement: MCP documentation

Every MCP tool and resource exposed by `@specd/mcp` has a corresponding entry in `docs/mcp/` describing its input schema, output schema, and example usage.

### Requirement: Core documentation

Public types, ports, and kernel use cases are documented in `docs/core/` as **`@specd/core` package reference** — semantics, contracts, and behaviour. That section is NOT an integrator import guide.

**Integrators (hosts: cli, mcp, API, IPC) MUST import from `@specd/sdk` only.** Documentation MUST NOT present a pattern of mixing `@specd/core` and `@specd/code-graph` imports for the same host.

`docs/core/index.md` and `docs/code-graph/index.md` MUST include a prominent callout: hosts start at `docs/sdk/` and import from `@specd/sdk`.

Where examples show `@specd/core` imports, they MUST be labeled **plugin / core-only** audience — not hosts. An optional footnote MAY note the symbol is also re-exported from `@specd/sdk`; it MUST NOT read as "integrators may choose either package".

Core-only packages (`plugin-*`, `skills`) MAY use `@specd/core` as the primary import in examples.

Examples in `docs/sdk/` MUST use `@specd/sdk` imports and document both assembly paths where relevant: `createKernel` + `kernel.*.execute()` and standalone `createX` / `create*Repository` factories.

### Requirement: SDK documentation

`docs/sdk/` is the **only** integrator entry point in Docusaurus (sidebar category **SDK**, positioned before package-reference sections). It MUST document:

- `@specd/sdk` as the **single** import surface for hosts — core, code-graph, and SDK orchestration on `"."`, `"./ports"`, and `"./extensions"`
- Explicit rule: hosts do not declare parallel `@specd/core` + `@specd/code-graph` dependencies or mix imports across those packages
- Host bootstrap (`openSpecdHost`, `createSdkContext`) and orchestration helpers
- Kernel-equivalent assembly via `createKernel` or standalone `createX` / `create*Repository` factories (all from `@specd/sdk`)

Legacy `docs/core/sdk.md` content MUST move into `docs/sdk/`. `docs/core/` and `docs/code-graph/` remain package-reference sections (sidebar label **Package reference** or nested under SDK) for plugin authors and symbol semantics — not parallel integrator paths.

When public API reference content is generated for the website, generation entry points and landing copy MUST treat `@specd/sdk` as the integrator surface per `public-web:api-reference`.

### Requirement: SDK guide documentation and discoverability

The SDK guide collection MUST be discoverable by the people it is written for — extension developers and integrators — from the surfaces they already use.

- The `specd guide` command MUST surface the SDK guide in its catalog listing as a structured field naming the command `specd guide-sdk`, present in every supported output format.
- `docs/guide/index.md` MUST point readers to the SDK guide.
- `docs/guide/cli.md` MUST document `specd guide-sdk` as a scenario-based recipe alongside the other command families.
- `docs/cli/guide-sdk.md` MUST exist as the dedicated command reference for `specd guide-sdk`, MUST document its `search` subcommand, and MUST state the difference between `specd guide` and `specd guide-sdk`, including which collection each command serves.
- `docs/cli/index.md` MUST list `specd guide-sdk` as a command family.
- The Docusaurus sidebar MUST expose the guide CLI reference page for `specd guide-sdk`, so that it is reachable from site navigation.

### Requirement: SDK documentation tombstone removal

`docs/core/sdk.md` duplicates the host guide that already lives at `docs/sdk/index.md` and has never been referenced from any sidebar. It MUST NOT be maintained as a separate copy.

- `docs/core/sdk.md` MUST be deleted from the repository, together with its frontmatter.
- No sidebar entry, internal link or cross-reference MUST be left pointing at `docs/core/sdk.md`.
- `docs/core/index.md` MUST NOT be modified to compensate for the deletion, because it never linked the file.
- Deleting the file MUST NOT remove any host integration guidance: that guidance remains owned by `docs/sdk/`, which stays the only integrator entry point into SDK documentation.

### Requirement: SDK collection source documents

The SDK guide collection compiles hand-written package-reference documents alongside generated API topics, so its sources MUST obey the same documentation conventions as the user guide.

- The SDK collection source roots MUST be `docs/sdk/`, `docs/core/`, `docs/code-graph/`, `docs/skills/` and `docs/schemas/`.
- Every hand-written document under those roots MUST define `title`, `description` and `sidebar_position` in its frontmatter, on the same terms as the user guide.
- A package-reference document that is missing required frontmatter MUST fail validation; a lenient or derived fallback, such as deriving the description from the first paragraph, is not permitted.
- The SDK collection MUST NOT be populated from `docs/cli/` or `docs/public-web/`, so command-reference pages and site-only content stay out of the package-reference collection.

### Requirement: JSDoc on all symbols

All functions, methods, classes, type aliases, and interfaces in all packages must have JSDoc comments — not just public exports. This enables IDE tooling, API doc generation, and self-describing code for both agents and human contributors.

JSDoc must include:

- A description of what the symbol does or represents
- `@param` for each parameter with a description
- `@returns` describing the return value (omit for `void` and constructors)
- `@throws` for each error type the function can throw

```typescript
/**
 * Merges a delta spec into a base spec using the schema's delta configuration.
 *
 * @param base - The original spec to merge into
 * @param delta - The spec containing the delta operations
 * @param deltaConfigs - Per-section merge configuration from the schema
 * @param deltaOperations - Optional custom operation keywords (defaults to ADDED/MODIFIED/REMOVED/RENAMED)
 * @returns A new Spec with all delta operations applied
 * @throws {DeltaConflictError} When conflicting operations are detected in the delta
 */
export function mergeSpecs(
  base: Spec,
  delta: Spec,
  deltaConfigs: readonly DeltaConfig[],
  deltaOperations?: OperationKeywords,
): Spec
```

### Requirement: Public composition-surface documentation stays aligned

Documentation under `docs/` SHALL be updated when the public composition surface of `@specd/core` changes.

When composition factories change their public contract shape, the documentation MUST describe at least:

- the canonical `createX(deps)` form
- the convenience `createX(config, options?)` form
- the role split between standalone factories, `createKernel(...)`, and `createKernelBuilder()`
- the shared `CompositionResolver` path used for config-based bootstrap

### Requirement: Documentation stays aligned with removed/renamed template variables and list/summary contracts

When a change removes or renames a public template variable token (for example `{{change.workspace}}`), changes configuration cascade semantics, or changes the shape of a listing/summary use case's inputs, outputs, or dependency-resolution contract, that change MUST update every in-repo doc under `docs/` that documents the old token, cascade rule, or shape, in the same change — not as separate follow-up work.

Configuration documentation across `docs/guide/configuration.md` and `docs/guide/configuration-examples.md` MUST remain consistent regarding the layered config cascade (`specd.yaml` + `specd.*.yaml` + `specd.local.yaml`), avoiding conflicting or outdated claims about local overrides.

This includes, when applicable to the change:

- `docs/guide/configuration.md` — user guide for configuration, archive pattern variable tables, and cascade layering
- `docs/guide/configuration-examples.md` — scenario-based configuration examples and exhaustive reference
- `docs/guide/installation.md` — user guide for installation, initialization, and prerequisites
- `docs/guide/getting-started.md` — quickstart tutorial and skills router introduction
- `docs/guide/workspaces.md` — workspace/template variable guidance
- `docs/guide/workflow.md` — hook and template variable examples
- `docs/guide/schemas.md` and `docs/schemas/schema-format.md` — schema-authoring examples that reference template variables
- `docs/adr/0013-workspaces-not-scopes.md` — ADR prose that mandates or illustrates the removed/renamed token
- `docs/core/use-cases.md` — constructor signatures, return shapes, and ordering claims for use cases whose public contract changed
- `docs/cli/cli-reference.md` — CLI flag tables and examples for commands whose output contract changed

A doc file not listed above but found to document the same stale token or shape is equally in scope — this list is illustrative, not exhaustive.

## Constraints

- All documentation files use Markdown
- ADR filenames must match the pattern `NNNN-kebab-case-title.md`
- ADR numbers are sequential and never reused
- Every significant architectural decision must have an ADR
- Every ADR must include a `### Spec` sub-section inside `## More Information` linking to the spec(s) that capture its constraints
- Specs that have associated ADRs include a `## ADRs` section linking to them — omitted if none exist
- No documentation outside `docs/` except `README.md`, `AGENTS.md`, `CLAUDE.md`
- A spec's `## ADRs` section lists only the ADRs that _produced_ that spec — they are historical provenance, not dependencies
- A spec may only depend on other specs (`## Spec Dependencies`), never on ADRs directly
- If an ADR's decision needs to be enforced as a constraint, it must first be captured in a spec; that spec is then what other specs depend on
- Removing or renaming a template variable token, or changing a listing/summary use case's public contract, is a documentation-affecting change under `docs/config/`, `docs/guide/`, `docs/schemas/`, `docs/adr/`, `docs/core/`, and `docs/cli/` as applicable — not just under `docs/core/`

## Spec Dependencies

- [`default:_global/conventions`](../conventions/spec.md) — file naming and Markdown formatting apply to docs too
