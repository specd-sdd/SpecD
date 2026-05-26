# Verification: Validate Confirm Dialog

## Requirements

### Requirement: validate actions require explicit confirmation

#### Scenario: Validate All opens confirm before API call

- **GIVEN** user is on the Artifacts tab for an active change
- **WHEN** user clicks **Validate All**
- **THEN** confirm modal is shown per `ui:design-system` (`StudioDialog`)
- **AND** neither `validateChange` nor `validateChangeAll` is called until user clicks **Continue**

#### Scenario: Cancel dismisses confirm without validating

- **WHEN** confirm modal is open and user clicks **Cancel**
- **THEN** modal closes
- **AND** no validation request is sent

#### Scenario: Inspector Validate uses artifact scope copy

- **WHEN** user clicks **Validate** in the inspector with a change artifact open
- **THEN** confirm modal mentions the artifact filename
- **AND** validation runs with `specId` and `artifactId` derived from that file on **Continue**

#### Scenario: Validate All ignores open artifact selection

- **WHEN** user clicks **Validate All** while a change artifact tab is open
- **THEN** confirm modal copy targets all specs in the change
- **AND** on **Continue** [`ui:hooks-change-validate`](hooks-change-validate/spec.md) calls `validateChangeAll` once (not a per-spec loop)

### Requirement: modal copy explains invalidation and drift

#### Scenario: Body mentions invalidate and drift

- **WHEN** confirm modal is displayed
- **THEN** body text references invalidation or drift and downstream DAG review

### Requirement: problems panel is not overwritten by status polling

#### Scenario: problems panel is not overwritten by status p… — primary path

- **WHEN** Workflow blockers from getChangeStatus MUST remain on Overview.
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: problems panel is not overwritten by status p… — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented
