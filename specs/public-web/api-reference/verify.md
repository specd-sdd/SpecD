# Verification: API Reference

## Requirements

### Requirement: Public API reference section

#### Scenario: API reference is published under a stable site route

- **WHEN** a user navigates to the API reference section
- **THEN** the site serves the API reference from a dedicated public route
- **AND** the reference appears as part of the same website rather than as an external disconnected destination

### Requirement: Generated API content

#### Scenario: API reference is derived from package API source

- **WHEN** API reference content is produced for the public site
- **THEN** that content is generated from package source or exported API surfaces
- **AND** the project does not maintain a separate fully handwritten duplicate of the same API reference

### Requirement: Initial API coverage

#### Scenario: TypeDoc entry points cover sdk, core, and code-graph public barrels

- **WHEN** `apps/public-web/src/lib/public-docs-config.ts` `apiPackageEntryPoints` is inspected
- **THEN** it lists `packages/sdk/src/index.ts`, `packages/core/src/public.ts`, and `packages/code-graph/src/public.ts` in that order
- **AND** it does not reference `packages/core/src/index.ts` or other internal barrels

#### Scenario: Generated API output is partitioned by package

- **WHEN** API docs are generated for the public site
- **THEN** markdown output is written under package-scoped directories such as `.generated/api/sdk`, `.generated/api/core`, and `.generated/api/code-graph`
- **AND** the generated landing page links to each package section

#### Scenario: API sidebar lists packages in integrator-first order

- **WHEN** `apps/public-web/api-sidebars.ts` is inspected
- **THEN** top-level API categories appear as `@specd/sdk`, `@specd/core`, and `@specd/code-graph` in that order

### Requirement: Public-site integration

#### Scenario: API reference participates in the public site experience

- **WHEN** a user moves between the landing page, public docs, and API reference
- **THEN** the API reference shares the public site's navigation and visual structure
- **AND** the user can reach it without leaving the public site
