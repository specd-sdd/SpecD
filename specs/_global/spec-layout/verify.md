# Verification: Spec Layout

## Requirements

### Requirement: Global specs for cross-cutting constraints

#### Scenario: Global constraint applies to all packages

- **WHEN** a requirement is defined in `specs/_global/`
- **THEN** it binds all packages in the monorepo without exception

#### Scenario: Package-specific concern is not global

- **WHEN** a requirement only concerns a single package's internals
- **THEN** it must not be placed in `specs/_global/`

### Requirement: Package specs for package-internal concerns

#### Scenario: Core use case spec

- **WHEN** a spec describes a use case implemented in `@specd/core`
- **THEN** it lives at `specs/core/<topic>/spec.md` and `specs/core/<topic>/verify.md`

#### Scenario: CLI command spec

- **WHEN** a spec describes a command implemented in `@specd/cli`
- **THEN** it lives at `specs/cli/<topic>/spec.md` and `specs/cli/<topic>/verify.md`

### Requirement: Spec file naming

#### Scenario: Correct spec path

- **WHEN** a spec covers delta merging in `@specd/core`
- **THEN** the files are at `specs/core/delta-merger/spec.md` and `specs/core/delta-merger/verify.md`

#### Scenario: Incorrect co-location

- **WHEN** a spec file is placed directly in `specs/core/spec.md` with no subdirectory
- **THEN** it does not conform to this layout and must be moved

#### Scenario: Scenarios found in spec.md

- **WHEN** a `spec.md` file contains a `#### Scenario:` heading
- **THEN** it does not conform to this layout — scenarios must be moved to `verify.md`

### Requirement: verify.md structure

#### Scenario: Requirement heading missing in verify.md

- **WHEN** a `verify.md` file contains scenarios not grouped under a `### Requirement:` heading
- **THEN** it does not conform to this layout and AST-based delta selectors will fail to locate those scenarios by heading

### Requirement: Spec Dependencies section

#### Scenario: Global spec with no dependencies

- **WHEN** a spec in `specs/_global/` has no dependencies on other specs
- **THEN** its `## Spec Dependencies` section reads `_none — this is a global constraint spec_`

#### Scenario: Package spec referencing global constraints

- **WHEN** a spec in `specs/core/` is constrained by global architecture rules
- **THEN** it lists `specs/_global/architecture/spec.md` in its `## Spec Dependencies` section
