# Verification: SpecD Metapackage

## Requirements

### Requirement: Ecosystem Dependency Bundling

#### Scenario: Metapackage dependencies include all official packages

- **GIVEN** `packages/specd/package.json`
- **WHEN** inspecting `dependencies`
- **THEN** `@specd/core`, `@specd/code-graph`, `@specd/schema-std`, `@specd/skills`, `@specd/cli`, `@specd/plugin-manager`, and all official agent plugins are declared with `workspace:*`

### Requirement: Coordinated Versioning and Changesets Release Flow

#### Scenario: Metapackage version is synchronized via Changesets

- **GIVEN** a release cycle running `pnpm release:version`
- **WHEN** Changesets applies versions and updates changelogs
- **THEN** `@specd/specd` version is bumped in sync with its dependencies

#### Scenario: Prepublish check validates release readiness

- **GIVEN** `pnpm release:publish` execution
- **WHEN** `prepublish-check.js` runs
- **THEN** manifest consistency, clean working directory, and package build states are verified before publication

### Requirement: Pure Aggregator Contract

#### Scenario: Package contains no standalone source files

- **GIVEN** `packages/specd` file tree
- **WHEN** checking for TypeScript source directories under `src/`
- **THEN** no `src/` directory exists and functionality is exclusively imported from dependencies
