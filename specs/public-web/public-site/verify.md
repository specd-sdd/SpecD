# Verification: Public Site

## Requirements

### Requirement: Public landing page

#### Scenario: Landing page prioritizes presentation over doc index behaviour

- **WHEN** a user opens the site root
- **THEN** the page presents `specd` as a project with explanatory content and primary calls to action
- **AND** the root route does not render a default documentation listing as the primary content

### Requirement: Public documentation section

#### Scenario: Public docs expose curated user-facing content

- **WHEN** a user navigates to the public documentation section
- **THEN** the site exposes onboarding and usage content for `specd`
- **AND** that content includes getting started, configuration, workflow, CLI usage, and selected core concepts intended for public consumption

### Requirement: ADR exclusion

#### Scenario: ADR content is not exposed in public documentation navigation

- **WHEN** the public site builds its documentation navigation and routes
- **THEN** ADR content is excluded from the public sidebar and primary navigation
- **AND** ADR pages are not published as part of the public documentation routes

### Requirement: Documentation source of truth

#### Scenario: Public documentation does not create a second handwritten source of truth

- **GIVEN** repository-authored documentation already exists under `docs/`
- **WHEN** the public site selects and renders that content
- **THEN** the authored source of truth remains under the repository `docs/` tree
- **AND** the app workspace does not become the canonical handwritten source for the same public docs

### Requirement: Public site workspace

#### Scenario: Public site implementation is scoped to the public-web workspace

- **WHEN** the public site code is introduced
- **THEN** its implementation lives under `apps/public-web`
- **AND** the site is treated as a deployable app in the `public-web` workspace rather than as a reusable library package

### Requirement: Framework-required entrypoint exceptions

#### Scenario: Default export usage is limited to framework-required entrypoints

- **WHEN** the public site uses Docusaurus-owned route, page, or config entrypoints that require a `default export`
- **THEN** those entrypoints may use the framework-required module shape
- **AND** the rest of the `public-web` code continues to prefer named exports
