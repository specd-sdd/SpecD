# Verification: Get Read Only Change Artifact

## Requirements

### Requirement: GetReadOnlyChangeArtifact returns content and originalHash

#### Scenario: Drafted tracked file returns content and hash

- **GIVEN** drafted change `foo` with tracked `proposal.md`
- **WHEN** `GetReadOnlyChangeArtifact` runs with `readOnlyOrigin` `draft`
- **THEN** returns UTF-8 content
- **AND** `originalHash` has sha256 prefix

#### Scenario: Discarded tracked file returns content and hash

- **GIVEN** discarded change `bar` with tracked `tasks.md`
- **WHEN** `GetReadOnlyChangeArtifact` runs with `readOnlyOrigin` `discarded`
- **THEN** returns UTF-8 content
- **AND** `originalHash` is present

#### Scenario: Archived tracked file returns content and hash

- **GIVEN** archived change `baz` with tracked `tasks.md`
- **WHEN** `GetReadOnlyChangeArtifact` runs with `readOnlyOrigin` `archived`
- **THEN** returns UTF-8 content
- **AND** `originalHash` is present

### Requirement: GetReadOnlyChangeArtifact does not expose Change

#### Scenario: Draft load uses view and artifactReadOnly only

- **WHEN** use case executes for a drafted change
- **THEN** `getDraft` is invoked
- **AND** `artifactReadOnly` is invoked
- **AND** `mutate` and `get` for active storage are not invoked

#### Scenario: HTTP handler delegates to use case

- **WHEN** `GET /v1/drafts/:name/artifacts/:filename` or archived artifact GET succeeds
- **THEN** handler called `getReadOnlyChangeArtifact.execute`
- **AND** handler did not call `ChangeRepository.artifact` directly

### Requirement: GetReadOnlyChangeArtifact enforces tracked-file confinement

#### Scenario: Untracked filename fails

- **GIVEN** a read-only change view without the requested filename
- **WHEN** use case runs
- **THEN** typed not-found or validation error
- **AND** `artifactReadOnly` is not called when manifest has no tracked entry
