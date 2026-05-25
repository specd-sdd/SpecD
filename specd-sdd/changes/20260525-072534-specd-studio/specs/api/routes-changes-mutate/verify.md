# Verification: Routes Changes Mutate

## Requirements

### Requirement: PUT artifact save uses SaveChangeArtifact use case

#### Scenario: Hash conflict returns 409

- **GIVEN** stored hash does not match body `originalHash`
- **WHEN** `PUT /v1/changes/foo/artifacts/proposal.md` with new content
- **THEN** `SaveChangeArtifact` throws `ArtifactConflictError`
- **AND** HTTP status is 409
- **AND** response is `application/problem+json`

#### Scenario: Successful save bumps updatedAt

- **GIVEN** matching `originalHash` and no blocking approval without force
- **WHEN** `PUT` succeeds
- **THEN** manifest `updatedAt` advances
- **AND** saved file state becomes `in-progress`

#### Scenario: PUT /changes/{name}/artifacts/{filename} returns expected payload

- **WHEN** client calls `PUT /changes/{name}/artifacts/{filename}`
- **THEN** HTTP status is 2xx
- **AND** JSON body matches the documented DTO or envelope

### Requirement: POST routes run validate transition and lifecycle actions

#### Scenario: POST validate delegates to kernel

- **WHEN** `POST /v1/changes/foo/validate`
- **THEN** `ValidateArtifacts` runs
- **AND** findings returned as JSON

#### Scenario: POST .../validate returns expected payload

- **WHEN** client calls `POST .../validate`
- **THEN** HTTP status is 2xx
- **AND** JSON body matches the documented DTO or envelope

#### Scenario: POST .../transition returns expected payload

- **WHEN** client calls `POST .../transition`
- **THEN** HTTP status is 2xx
- **AND** JSON body matches the documented DTO or envelope

### Requirement: PATCH routes edit metadata spec deps and implementation tracking

#### Scenario: PATCH description updates without invalidation

- **WHEN** `PATCH /v1/changes/{name}` with `{ "description": "..." }` only
- **THEN** `EditChange` persists description
- **AND** response is full `ChangeDetailDto`
- **AND** `invalidated` is false

#### Scenario: PATCH scope add and remove spec ids

- **WHEN** `PATCH /v1/changes/{name}` with `addSpecIds` and/or `removeSpecIds`
- **THEN** `EditChange` updates `specIds`
- **AND** approvals may be invalidated when the effective set changes

#### Scenario: PATCH spec-dependencies with set

- **WHEN** `PATCH /v1/changes/{name}/spec-dependencies` with `{ specId, set: [...] }`
- **THEN** `updateSpecDeps` persists `specDependsOn` for that spec
- **AND** response includes `{ specId, dependsOn }`

#### Scenario: PATCH implementation tracking toggles flags

- **WHEN** `PATCH` sets implementation tracking fields
- **THEN** kernel persists tracking state
- **AND** GetStatus reflects new values

### Requirement: mutating routes pass request actor into kernel

#### Scenario: POST create passes resolved actor

- **WHEN** `POST /v1/changes` succeeds
- **THEN** history records request actor
- **AND** adapter supplied identity not fabricated in handler

#### Scenario: PUT save passes actor to SaveChangeArtifact

- **WHEN** artifact save succeeds
- **THEN** history `by` matches resolved actor
- **AND** same actor as other mutations in request

#### Scenario: POST transition passes actor

- **WHEN** `POST /v1/changes/foo/transition` runs
- **THEN** kernel receives actor argument
- **AND** audit trail consistent with CLI
