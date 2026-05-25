# Verification: Change Tab Artifacts

## Requirements

### Requirement: change tab refetches status (artifact DAG) when updatedAt advances

#### Scenario: Unchanged status skips tab refetch

- **GIVEN** tab is visible
- **AND** cached `updatedAt` matches server
- **WHEN** `getChangeStatus` returns `{ unchanged: true }`
- **THEN** tab does not refetch heavy views
- **AND** spinner stops without data swap

#### Scenario: Advanced updatedAt refetches tab data

- **GIVEN** status returns newer `updatedAt`
- **WHEN** tab poll observes revision bump
- **THEN** only this tab data sources reload
- **AND** other tabs are unaffected

#### Scenario: Hidden tab pauses polling

- **GIVEN** change tab was visible then hidden
- **WHEN** poll interval fires
- **THEN** no tab-scoped artifact list request is sent
- **AND** cache is retained until visible again

#### Scenario: Artifacts tab uses listChangeArtifacts endpoint

- **GIVEN** active change
- **WHEN** user selects Artifacts tab
- **THEN** UI calls `listChangeArtifacts`
- **AND** renders grouped files even when status returns `unchanged: true`

#### Scenario: Artifacts grouped by scope change then spec

- **GIVEN** active change with `proposal.md` and at least one `specs/.../spec.md`
- **WHEN** user opens the Artifacts tab
- **THEN** UI shows a **Change** section before a **Spec** section
- **AND** `proposal.md` appears under Change grouped by artifact type
- **AND** spec paths appear under Spec grouped by `specId`

#### Scenario: Change scope types follow DAG order without duplicates

- **GIVEN** active change with `proposal.md`, `design.md`, and `tasks.md`
- **WHEN** user opens the Artifacts tab
- **THEN** Change section lists artifact types in order `proposal`, `design`, `tasks`
- **AND** each type appears at most once

#### Scenario: Spec scope lists spec.md first within a spec

- **GIVEN** active change with `specs/ui/foo/spec.md` and `specs/ui/foo/verify.md`
- **WHEN** user opens the Artifacts tab under Spec for `ui:foo`
- **THEN** `spec.md` is listed before `verify.md`

#### Scenario: Archived artifacts tab shows snapshot types

- **GIVEN** archived change context
- **WHEN** user selects Artifacts tab
- **THEN** UI lists `archivedMeta.artifactTypes`
- **AND** does not call `listChangeArtifacts`

### Requirement: artifacts tab exposes validate all for active changes

#### Scenario: Active change shows Validate All on Artifacts tab

- **GIVEN** an active change
- **WHEN** user selects Artifacts
- **THEN** `data-testid="studio-artifacts-tab"` is visible
- **AND** `data-testid="studio-validate-all"` is visible in the tab toolbar

#### Scenario: Archived change hides Validate All

- **GIVEN** archived change context
- **WHEN** user selects Artifacts
- **THEN** no `studio-validate-all` control is rendered

### Requirement: view uses SpecdDataPort hooks only

#### Scenario: Component consumes SpecdDataPort hooks only

- **WHEN** UI package dependency graph is inspected
- **THEN** `@specd/ui` does not import `@specd/core`
- **AND** components call `client:port-*` hooks

#### Scenario: Hook delegates to configured adapter

- **WHEN** component mounts and requests change data
- **THEN** calls go through `SpecdDataPort`
- **AND** no direct repository or kernel import

#### Scenario: Adding a core import fails the boundary

- **WHEN** author introduces `import` from `@specd/core` under `@specd/ui`
- **THEN** lint or build fails
- **AND** data must flow through the port surface

### Requirement: view surfaces loading and error states

#### Scenario: Hook exposes loading while port call is in flight

- **WHEN** port method is invoked from the component
- **THEN** consumers observe loading state until the promise settles

#### Scenario: Failed fetch shows human-readable error

- **GIVEN** port returns a network or HTTP error
- **WHEN** hook promise rejects
- **THEN** consumers receive an error object
- **AND** UI renders the message instead of stale data

#### Scenario: Save conflict shows HTTP 409 to the user

- **GIVEN** save returns 409 problem+json
- **WHEN** inspector save hook completes with error
- **THEN** UI shows the conflict message
- **AND** editor buffer is not silently replaced
