# Standard Schema

## Purpose

SpecD requires a formal, versioned schema definition that governs change lifecycle workflows, artifact dependency graphs (DAGs), validation rules, artifact authoring instructions, and lifecycle transition hooks. This spec defines the structure and requirements of `@specd/schema-std` and its canonical `schema.yaml` contract.

## Requirements

### Requirement: Canonical Schema Definition

The package `@specd/schema-std` SHALL provide a root `schema.yaml` file that declares:

1. `name`: String identifier for the schema (`schema-std`).
2. `version`: Monotonically increasing schema version integer.
3. `artifacts`: Array of artifact definitions specifying artifact IDs, scope (`change` or `spec`), optionality, output file patterns, dependency relationships (`requires`), task tracking (`hasTasks`), rules, validations, metadata extractions, and template references.
4. `workflow`: Array of lifecycle step definitions specifying step names, target transitions, and pre/post hook declarations.

### Requirement: Artifact Dependency Graph (DAG) Invariants

Artifact definitions declared in `schema.yaml` SHALL form an acyclic dependency graph (DAG). The schema:

1. MUST define `proposal` at change scope without prerequisite artifact requirements.
2. MUST define `specs` requiring `proposal` at spec scope.
3. MUST define `verify` requiring `specs` at spec scope.
4. MUST define `design` requiring `proposal`, `specs`, and `verify` at change scope.
5. MUST define `tasks` requiring `specs`, `verify`, and `design` at change scope, with `hasTasks: true`.

### Requirement: Proposal Artifact Contract and Instructions

The schema definition for `proposal` SHALL instruct authoring of the problem statement and scope:

1. It MUST require sections for `Motivation`, `Current behaviour`, `Proposed solution`, `Specs affected` (distinguishing new specs vs modified specs), `Impact`, `Technical context`, and `Open questions`.
2. It SHALL enforce post-authoring rules to resolve all open questions before proceeding and register spec identifiers and dependencies in the change.

### Requirement: Specs Artifact Contract, Instructions, and Deltas

The schema definition for `specs` SHALL instruct authoring of normative requirements:

1. New specs MUST be authored as full files under `specs/` with `Purpose`, `Requirements` (using `### Requirement:` headers and SHALL/MUST language), `Constraints`, and mandatory `Spec Dependencies` declarations.
2. Modified specs MUST be authored as structured deltas under `deltas/` using AST-level operations (`added`, `modified`, `removed`, `renamed`, `no-op`).
3. Structural validations MUST enforce the presence of a single `Requirements` section containing at least one unique `### Requirement:` block.
4. It SHALL enforce a post-authoring rule confirming complete coverage for all specs declared in the proposal.

### Requirement: Verify Artifact Contract, Instructions, and Deltas

The schema definition for `verify` SHALL instruct authoring of acceptance scenarios:

1. Scenarios MUST be grouped under `### Requirement:` headings matching the spec's requirement names and order.
2. Individual scenarios MUST use `#### Scenario:` subheadings with WHEN / THEN assertions and optional GIVEN preconditions.
3. Modified verification suites MUST be authored as structured deltas under `deltas/`.
4. Structural validations MUST enforce that every requirement contains at least one scenario.
5. It SHALL enforce a post-authoring rule ensuring requirement-to-scenario coverage parity between `spec.md` and `verify.md`.

### Requirement: Design Artifact Contract and Instructions

The schema definition for `design` SHALL instruct authoring of an exhaustive, self-contained implementation contract:

1. It MUST instruct authors to materialize and consolidate all implementation-critical information without relying on indirect references.
2. Required sections MUST include `Affected areas`, `New constructs` (complete compilable type signatures), `Data models & Contracts`, `Approach & Execution flow`, `Error handling & Edge cases`, `Key decisions`, `Trade-offs`, `Spec impact`, `Dependency map`, `Migration / Rollback`, `Testing` (unit, integration, and manual verification), and `Open questions`.
3. It SHALL enforce post-authoring rules ensuring complete design coverage for all requirements and scenarios, and resolving any remaining open questions.

### Requirement: Tasks Artifact Contract, Instructions, and Tracking

The schema definition for `tasks` SHALL instruct authoring of an actionable, trackable implementation checklist:

1. Tasks MUST be decomposed into minimal, single-responsibility units grouped under numbered headings (`## <n>. <Group name>`).
2. Each task item MUST follow checkbox format `- [ ] <n>.<m> <description>` followed by indented lines specifying target file/symbol, concrete implementation approach from `design.md`, and referenced requirement ID.
3. The schema SHALL configure `taskCompletionCheck` and `preHashCleanup` to normalize and track completion of `- [ ]` checklist items.
4. It SHALL enforce a post-authoring rule verifying that all components, changes, and test cases defined in `design.md` are covered by at least one task.

### Requirement: Cross-Artifact Validations and Parity Rules

The schema SHALL declare cross-artifact validations:

1. It MUST declare `specs-verify-requirement-parity` requiring exact equality between requirement labels in `specs` and requirement group labels in `verify` for each spec.

### Requirement: Metadata Extraction Rules

The schema SHALL define declarative extractors for project metadata:

1. It MUST extract `title`, `description`, `dependsOn`, `rules` (`spec-requirements`), `constraints`, and `context` from `specs` artifacts.
2. It MUST extract structured `scenarios` (name, requirement, given, when, then) from `verify` artifacts.

### Requirement: Lifecycle Steps and State Transitions

The schema workflow SHALL declare standard lifecycle steps and valid transitions:

1. Steps SHALL include `drafting`, `designing`, `ready`, `implementing`, `verifying`, `done`, `pending-signoff`, `signed-off`, and `archiving`.
2. Step transitions MUST define permitted forward routes and mandatory gate checks.
3. Transitions SHALL support declarative pre- and post-execution hooks.

### Requirement: Schema Package Distribution

The `@specd/schema-std` package SHALL be structured as a standard ESM package exporting its `schema.yaml` and related templates without requiring TypeScript compilation steps.

## Constraints

1. `schema.yaml` MUST NOT contain circular dependencies in artifact prerequisite chains.
2. The schema definition MUST remain backwards-compatible within the same major version.

## Spec Dependencies

_none_
