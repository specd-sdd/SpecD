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

#### Scenario: First release includes the core API surface

- **WHEN** the initial public API reference scope is assembled
- **THEN** it includes the public surfaces of `@specd/core`

### Requirement: Public-site integration

#### Scenario: API reference participates in the public site experience

- **WHEN** a user moves between the landing page, public docs, and API reference
- **THEN** the API reference shares the public site's navigation and visual structure
- **AND** the user can reach it without leaving the public site
