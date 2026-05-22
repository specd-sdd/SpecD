# Verification: core:spec-lock

## Requirements

### Requirement: Sidecar location and naming

#### Scenario: Sidecar is written next to archived spec artifacts

- **GIVEN** an archived spec with canonical persisted artifacts
- **WHEN** archive materializes its sidecar
- **THEN** `spec-lock.json` is written in that same persisted spec directory

### Requirement: Durable schema identity

#### Scenario: Schema identity remains immutable after first persistence

- **GIVEN** an existing `spec-lock.json` with `schema: { "name": "schema-std", "version": 1 }`
- **WHEN** the active project schema later changes
- **THEN** the sidecar keeps the original stored schema identity

### Requirement: Persistent dependencies

#### Scenario: Sidecar dependencies are used as durable fallback

- **GIVEN** a persisted spec whose `spec-lock.json` contains `dependsOn`
- **AND** dependency extraction later omits `dependsOn`
- **WHEN** metadata is regenerated
- **THEN** the sidecar `dependsOn` value is used as the authoritative fallback

### Requirement: Archived implementation links

#### Scenario: File-level link is stored without symbols

- **GIVEN** an archived implementation link for `core:src/index.ts` with no symbol refinements
- **WHEN** the sidecar is saved and reloaded
- **THEN** the `implementation` entry contains only the canonical `file`
- **AND** it is interpreted as a file-level link

#### Scenario: Symbol-level link preserves symbol list

- **GIVEN** an archived implementation link for `core:src/index.ts` with symbols `["createUser", "deleteUser"]`
- **WHEN** the sidecar is saved and reloaded
- **THEN** the `implementation` entry preserves the canonical `file`
- **AND** it preserves the exact non-empty `symbols` list

### Requirement: Archive-time materialization

#### Scenario: Excluded path is ignored during materialization

- **GIVEN** a confirmed raw implementation link falls under the target workspace `graph.excludePaths`
- **WHEN** archive materializes implementation links
- **THEN** that link is skipped for `spec-lock.json`
- **AND** archive does not fail solely because of that excluded path

#### Scenario: Workspace-boundary mismatch fails archive

- **GIVEN** a confirmed implementation link whose raw file path falls outside the `codeRoot` of the workspace implied by `specId`
- **WHEN** archive attempts materialization
- **THEN** archive fails instead of writing an invalid canonical `workspace:path`

### Requirement: Sidecar is the durable source of truth

#### Scenario: Metadata regeneration does not mutate sidecar implementation links

- **GIVEN** an existing `spec-lock.json` with archived implementation links
- **WHEN** metadata is regenerated later
- **THEN** `spec-lock.json` content remains unchanged
- **AND** metadata only projects from the sidecar
