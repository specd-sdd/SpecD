# Documentation Conventions

## Overview

All project documentation lives under `docs/`. Each subdirectory has a specific scope. Documentation is written and maintained by agents and humans alike — the same constraints apply to both.

## Requirements

### Requirement: Directory structure

```
docs/
├── adr/        # Architecture Decision Records
├── cli/        # CLI commands reference
├── mcp/        # MCP server tools and resources reference
├── core/       # @specd/core API and domain model documentation
└── schemas/    # Schema authoring guide
```

No documentation lives outside `docs/` except `README.md` at the project root and `AGENTS.md` / `CLAUDE.md` for agent instructions.

#### Scenario: Doc placed outside docs/

- **WHEN** a documentation file is created outside `docs/` (excluding `README.md`, `AGENTS.md`, `CLAUDE.md`)
- **THEN** it must be moved to the appropriate subdirectory under `docs/`

### Requirement: ADR format

Every Architecture Decision Record follows this structure:

```markdown
# ADR-NNNN: Title

## Status

Accepted | Proposed | Deprecated | Superseded by [ADR-NNNN](NNNN-title.md)

## Context

Why this decision was needed — the forces at play, the problem being solved.

## Decision

What was decided, stated clearly and without ambiguity.

## Consequences

What becomes easier, what becomes harder, what constraints this imposes going forward.

## Spec

Links to the spec(s) that capture the constraints derived from this decision. If this ADR
created a new spec, link to it. If it reinforced an existing one, link to that.

- [`specs/path/to/spec.md`](../../specs/path/to/spec.md)
```

#### Scenario: ADR missing required section

- **WHEN** an ADR file is missing `## Context`, `## Decision`, or `## Consequences`
- **THEN** the review must reject it as malformed

### Requirement: ADR numbering

ADRs are numbered sequentially starting at `0001`. The filename matches the number and a kebab-case title: `0001-hexagonal-architecture.md`. Numbers are never reused — deprecated or superseded ADRs keep their number and update their status.

#### Scenario: Duplicate ADR number

- **WHEN** a new ADR is created with a number already used by an existing ADR
- **THEN** it must be renumbered to the next available number

#### Scenario: Superseded ADR

- **WHEN** a decision is reversed or replaced by a new ADR
- **THEN** the old ADR updates its status to `Superseded by [ADR-NNNN]` and keeps its number

### Requirement: ADR creation

An ADR is created for every significant architectural or design decision. Significant means: it affects multiple packages, it constrains future development, or it was a non-obvious choice between real alternatives. Implementation details that follow naturally from prior ADRs do not need their own ADR.

#### Scenario: Significant decision without ADR

- **WHEN** a decision affects multiple packages or constrains future development
- **THEN** an ADR must be created before or alongside the implementing code

### Requirement: CLI documentation

Every `specd` command has a corresponding doc file in `docs/cli/` describing its purpose, flags, examples, and exit codes.

#### Scenario: New command without docs

- **WHEN** a new `specd` command is added to `@specd/cli`
- **THEN** a corresponding `docs/cli/<command>.md` file must be created in the same change

### Requirement: MCP documentation

Every MCP tool and resource exposed by `@specd/mcp` has a corresponding entry in `docs/mcp/` describing its input schema, output schema, and example usage.

#### Scenario: New MCP tool without docs

- **WHEN** a new tool is added to `@specd/mcp`
- **THEN** a corresponding entry in `docs/mcp/` must be created in the same change

### Requirement: Core documentation

Public types, ports, and use cases in `@specd/core` are documented in `docs/core/` with their purpose, contracts, and usage examples.

#### Scenario: New public port without docs

- **WHEN** a new port interface is added to `@specd/core/application/ports/`
- **THEN** a corresponding entry in `docs/core/` must be created in the same change

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

#### Scenario: Exported function without JSDoc

- **WHEN** an exported function in `@specd/core` has no JSDoc block comment
- **THEN** the linter must report an error

#### Scenario: Internal helper without JSDoc

- **WHEN** a non-exported helper function has no JSDoc
- **THEN** the linter must not report an error

## Constraints

- All documentation files use Markdown
- ADR filenames must match the pattern `NNNN-kebab-case-title.md`
- ADR numbers are sequential and never reused
- Every significant architectural decision must have an ADR
- Every ADR must include a `## Spec` section linking to the spec(s) that capture its constraints
- Specs that have associated ADRs include a `## ADRs` section linking to them — omitted if none exist
- No documentation outside `docs/` except `README.md`, `AGENTS.md`, `CLAUDE.md`

## Spec Dependencies

- [`specs/_global/conventions/spec.md`](../conventions/spec.md) — file naming and Markdown formatting apply to docs too
