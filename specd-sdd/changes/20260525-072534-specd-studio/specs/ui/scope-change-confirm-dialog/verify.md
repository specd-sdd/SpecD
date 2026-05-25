# Verification: Scope Change Confirm Dialog

## Requirements

### Requirement: scope confirm is a step inside ChangeScopeDialog

#### Scenario: Confirm sub-step after Save when scope changed

- **GIVEN** user changed spec scope in `studio-change-scope-dialog`
- **WHEN** user clicks **Save changes**
- **THEN** dialog title becomes confirm scope change
- **AND** body lists specs to add and remove
- **AND** no PATCH runs until **Apply scope change**

#### Scenario: Back returns to editor

- **GIVEN** confirm sub-step is showing
- **WHEN** user clicks **Back**
- **THEN** warning and scope/dependency editors are visible again

### Requirement: dependency-only saves skip scope confirm

#### Scenario: Only dependsOn changed

- **GIVEN** draft `specIds` match persisted scope
- **WHEN** user clicks **Save changes**
- **THEN** confirm sub-step does not appear
- **AND** dependency PATCHes may run directly

### Requirement: modal copy explains scope invalidation

#### Scenario: Body lists adds and removes

- **GIVEN** user will add `ui:new` and remove `core:old`
- **WHEN** confirm sub-step renders
- **THEN** body mentions invalidate or approvals
- **AND** lists `+ ui:new` and `− core:old`
