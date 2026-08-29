# Proposal: init-schema-std-and-metapackage-specs

## Motivation

The `@specd/schema-std` and `@specd/specd` (metapackage) workspaces currently lack specification suites in `specs/schema-std` and `specs/specd`. In a spec-driven repository, every package must have specifications defining its responsibilities, contracts, and lifecycle to maintain architectural integrity and testability.

## Current behaviour

Currently, `packages/schema-std` contains `schema.yaml` and markdown templates in `templates/`, while `packages/specd` acts as an aggregation package for `@specd/*` dependencies and release orchestration with Changesets. However, there are no formal specs describing schema requirements, template contracts, or metapackage release mechanics.

## Proposed solution

Initialize the specification suites for both workspaces:

1. `schema-std:standard-schema`: Specifies the canonical schema definition (`schema.yaml`), artifact DAG, lifecycle states, transitions, rules, hooks, and packaging requirements.
2. `schema-std:templates`: Specifies the contract for markdown templates (`proposal.md`, `design.md`, `tasks.md`, `spec.md`, `verify.md`), including required sections, placeholders, and structure.
3. `specd-metapackage:metapackage`: Specifies the metapackage umbrella distribution role, package dependency bundling, synchronized versioning with Changesets, and integration with `dev/scripts/` hooks.

## Specs affected

### New specs

- `schema-std:standard-schema`: Canonical schema specification covering artifacts, workflow lifecycle states, transitions, validation rules, hooks, and packaging as `@specd/schema-std`.
  - Depends on: none
- `schema-std:templates`: Standard markdown template contracts for change and spec artifacts, defining structure, placeholder standards, and consistency rules.
  - Depends on: `schema-std:standard-schema`
- `specd-metapackage:metapackage`: Metapackage distribution specification defining package aggregation, versioning, Changesets release flow, and `dev/scripts/` validation hooks.
  - Depends on: none

### Modified specs

None.

## Impact

- **Packages / Workspaces**:
  - `packages/schema-std`: Added specification coverage in `specs/schema-std/` for `schema.yaml` and `templates/`.
  - `packages/specd`: Added specification coverage in `specs/specd/` for umbrella packaging and release orchestration.
- **Tooling & Workflows**:
  - Ensures compliance with repo-wide spec-driven development standards.
  - No breaking changes or runtime API changes to existing code packages.

## Technical context

- `schema.yaml` defines the default schema for SpecD, used across all change lifecycles.
- Templates in `packages/schema-std/templates/` (`proposal.md`, `design.md`, `tasks.md`, `spec.md`, `verify.md`) serve as base scaffolding for changes and specs.
- Metapackage `@specd/specd` depends on all `@specd/*` packages with `workspace:*` and provides `release:publish` scripts managed by root Changeset tooling (`dev/scripts/`).

## Open questions

None.
