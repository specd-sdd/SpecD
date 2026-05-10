# Verification: Spec Validate

## Requirements

### Requirement: Command signature

#### Scenario: No scope argument provided

- **WHEN** the user runs `specd spec validate` without any scope argument
- **THEN** stderr contains an error message about specifying a scope
- **AND** exit code is 1

#### Scenario: --workspace filters to one workspace

- **WHEN** the user runs `specd spec validate --workspace billing`
- **THEN** only specs in the `billing` workspace are validated
- **AND** output follows the multi-spec format

### Requirement: Text output — single spec

#### Scenario: Single spec passes validation

- **WHEN** the user runs `specd spec validate default:auth/login`
- **AND** all required spec-scoped artifacts exist and pass structural rules
- **THEN** stdout contains `validated default:auth/login: all artifacts pass`
- **AND** exit code is 0

#### Scenario: Single spec fails validation

- **WHEN** the user runs `specd spec validate default:auth/login`
- **AND** a required artifact is missing or a structural rule fails
- **THEN** stdout contains `validation failed default:auth/login:`
- **AND** indented error lines follow
- **AND** exit code is 1

### Requirement: Text output — multiple specs

#### Scenario: --all with all specs passing

- **WHEN** the user runs `specd spec validate --all`
- **AND** every spec across all workspaces passes
- **THEN** stdout contains `validated N specs: N passed, 0 failed`
- **AND** exit code is 0

#### Scenario: --all with some specs failing

- **WHEN** the user runs `specd spec validate --all`
- **AND** at least one spec has a validation failure
- **THEN** stdout contains `validated N specs: X passed, Y failed`
- **AND** each failing spec is listed with a `FAIL` prefix and indented errors
- **AND** exit code is 1

### Requirement: JSON output

#### Scenario: JSON output contains expected keys

- **WHEN** the user runs `specd spec validate --all --format json`
- **THEN** the JSON output contains `entries`, `totalSpecs`, `passed`, and `failed` keys

### Requirement: Error — spec not found

#### Scenario: Unknown spec ID

- **WHEN** the user runs `specd spec validate default:nonexistent`
- **AND** the spec does not exist
- **THEN** stderr contains `error: spec not found`
- **AND** exit code is 1

### Requirement: Error — workspace not found

#### Scenario: Unknown workspace

- **WHEN** the user runs `specd spec validate --workspace nonexistent`
- **AND** the workspace does not exist in config
- **THEN** stderr contains `error: unknown workspace`
- **AND** exit code is 1

### Requirement: Scope resolution

#### Scenario: Only spec-scoped artifacts are validated

- **WHEN** `specd spec validate default:auth/login --all` is run
- **THEN** only `scope: 'spec'` artifacts are validated
- **AND** change-scoped artifacts are ignored

### Requirement: Artifact filename derivation

#### Scenario: Artifact filename derived from artifactType.output()

- **WHEN** the schema has `spec.md` artifact with output `specs/**/spec.md`
- **THEN** the command loads `spec.md` from the spec directory

### Requirement: Missing artifact handling

#### Scenario: Missing required artifact counts as failure

- **WHEN** a spec has a required artifact (`optional: false`) that is absent
- **THEN** it counts as a validation failure

### Requirement: Structural validation

#### Scenario: Validation rules evaluated against AST

- **GIVEN** a spec's schema has `validations` defined
- **WHEN** `specd spec validate default:auth/login` is run
- **THEN** validation rules are evaluated against the AST

### Requirement: Exit code

#### Scenario: All specs pass exits 0

- **WHEN** all specs pass validation
- **THEN** exit code is 0

#### Scenario: Any failure exits 1

- **WHEN** any spec has validation failures
- **THEN** exit code is 1
