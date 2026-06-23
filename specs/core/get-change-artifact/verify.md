# Verification: Get Change Artifact

## Requirements

### Requirement: GetChangeArtifact returns content and originalHash

#### Scenario: Tracked file returns content and hash

- **GIVEN** `proposal.md` is tracked on change `foo`
- **WHEN** `GetChangeArtifact` runs
- **THEN** returns UTF-8 content
- **AND** `originalHash` has sha256 prefix

#### Scenario: Untracked filename fails

- **WHEN** filename is not on manifest
- **THEN** typed not-found or validation error
- **AND** no repository read

#### Scenario: Read uses ChangeRepository.mutate

- **WHEN** use case executes
- **THEN** runs inside `mutate` closure
- **AND** HTTP handler does not call repository directly

### Requirement: GetChangeArtifact enforces tracked-file confinement

#### Scenario: Tracked file returns content and hash

- **GIVEN** `proposal.md` is tracked on change `foo`
- **WHEN** `GetChangeArtifact` runs
- **THEN** returns UTF-8 content
- **AND** `originalHash` has sha256 prefix

#### Scenario: Untracked filename fails

- **WHEN** filename is not on manifest
- **THEN** typed not-found or validation error
- **AND** no repository read

#### Scenario: Read uses ChangeRepository.mutate

- **WHEN** use case executes
- **THEN** runs inside `mutate` closure
- **AND** HTTP handler does not call repository directly
