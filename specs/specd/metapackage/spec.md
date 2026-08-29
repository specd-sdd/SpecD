# SpecD Metapackage

## Purpose

The SpecD ecosystem comprises multiple specialized packages (`core`, `cli`, `code-graph`, `schema-std`, `skills`, `plugin-manager`, and agent plugins). To simplify dependency management and developer distribution, `@specd/specd` serves as an umbrella metapackage bundling the entire platform under a unified versioned package.

## Requirements

### Requirement: Ecosystem Dependency Bundling

The package `@specd/specd` SHALL declare production dependencies for all official SpecD monorepo packages using `workspace:*` resolution:

1. Core runtime and infrastructure: `@specd/core`, `@specd/code-graph`, `@specd/schema-std`, `@specd/skills`.
2. Interfaces and plugins: `@specd/cli`, `@specd/plugin-manager`, and agent plugins (`@specd/plugin-agent-claude`, `@specd/plugin-agent-copilot`, `@specd/plugin-agent-codex`, `@specd/plugin-agent-opencode`, `@specd/plugin-agent-standard`).

### Requirement: Coordinated Versioning and Changesets Release Flow

The metapackage SHALL participate in monorepo versioning orchestrated by `@changesets/cli` and repository development scripts in `dev/scripts/`:

1. Version bumps SHALL be synchronized during `release:version` cycles.
2. Publishing SHALL execute via `release:publish` scripts enforcing prepublish validation checks (`dev/scripts/prepublish-check.js`).
3. Changeset generation SHALL be triggered automatically via archive hooks and root commands.

### Requirement: Pure Aggregator Contract

The `@specd/specd` package SHALL operate strictly as an aggregator and distribution manifest:

1. It MUST NOT introduce isolated domain business logic or separate domain entities.
2. All runtime features and CLI capabilities MUST be delegated to their respective subpackages (`@specd/cli`, `@specd/core`, etc.).

## Constraints

1. Package `private` field MUST be `false` to allow public npm publication.
2. All bundled dependencies within the repository MUST use `workspace:*` references during local development.

## Spec Dependencies

_none_
