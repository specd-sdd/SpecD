# Verification: Hooks Changes Read

## Requirements

### Requirement: read hooks route by sidebar list section

#### Scenario: Drafted change loads via getDraft

- **GIVEN** change `dummy-draft` exists only under drafts
- **WHEN** shell opens it with `listSection` `draft`
- **THEN** `useChangesRead` calls `getDraft("dummy-draft")`
- **AND** does not call `getChange` for that name

#### Scenario: Discarded change loads via getDiscarded

- **GIVEN** change exists only under discarded
- **WHEN** shell opens it with `listSection` `discarded`
- **THEN** `useChangesRead` calls `getDiscarded`
- **AND** does not call `getChange`

#### Scenario: Active change still uses getChange

- **GIVEN** change is in the active list
- **WHEN** shell opens it with `listSection` `active` or null
- **THEN** `useChangesRead` calls `getChange` and `getChangeStatus`

#### Scenario: Draft artifact list uses listDraftArtifacts

- **GIVEN** drafted change and Artifacts tab visible
- **WHEN** `useChangeArtifactList` loads
- **THEN** port receives `listDraftArtifacts(name)`
- **AND** not `listChangeArtifacts`

#### Scenario: Inspector artifact body uses draft route when drafted

- **GIVEN** drafted change and user selects an artifact file
- **WHEN** `useChangeArtifact` loads content
- **THEN** port receives `getReadOnlyChangeArtifact(name, filename, 'draft')`

#### Scenario: Inspector artifact body uses discarded route when discarded

- **GIVEN** discarded change and user selects an artifact file
- **WHEN** `useChangeArtifact` loads content
- **THEN** port receives `getReadOnlyChangeArtifact(name, filename, 'discarded')`

#### Scenario: Archived artifact body uses archived route when archived

- **GIVEN** archived change and user selects an artifact file
- **WHEN** `useChangeArtifact` loads content
- **THEN** port receives `getReadOnlyChangeArtifact(name, filename, 'archived')`

#### Scenario: Task-capable artifact lists preserve metadata for downstream tabs

- **GIVEN** change artifact list contains task-capable rows
- **WHEN** `useChangeArtifactList` resolves
- **THEN** the hook preserves `hasTasks`
- **AND** optional task counters remain available to tabs that need them

### Requirement: shelved and archived views do not poll change status or artifacts

#### Scenario: Drafted detail loads once (no poll refreshKey)

- **GIVEN** drafted change open in the shell
- **WHEN** global poll ticks
- **THEN** shell does not refetch drafted detail or status automatically

#### Scenario: Discarded view does not poll status

- **GIVEN** discarded change open in the shell
- **WHEN** global poll ticks
- **THEN** shell does not call `getDiscardedStatus` for that name

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

### Requirement: hooks MUST prevent infinite render loops through stable results

#### Scenario: Hook returns stable array reference when data is unchanged

- **GIVEN** `useChangeArtifactList` has loaded data
- **WHEN** component re-renders without a port refresh
- **THEN** the returned `items` and `scopeGroups` arrays are referentially equal to previous result
- **AND** no downstream effect is re-triggered

#### Scenario: Multi-artifact reader memoizes normalized filenames

- **GIVEN** `useChangeArtifacts` called with `['a.md']`
- **WHEN** parent re-renders and passes a new array `['a.md']` (different reference, same content)
- **THEN** `normalizedFilenames` reference remains stable
- **AND** `useAsyncResource` does not re-trigger a load

### Requirement: useChangesRead scopes status cache per change key

#### Scenario: Revisiting a change restores cached workflow status

- **GIVEN** active changes `alpha` and `beta` with `beta.updatedAt` newer than `alpha.updatedAt`
- **AND** the shell opened `alpha` and received a full `getChangeStatus` payload
- **WHEN** the user opens `beta` then returns to `alpha`
- **THEN** `useChangesRead` calls `getChangeStatus("alpha", { ifModifiedSince: <alpha last seen> })`
- **AND** does not pass `beta`'s `updatedAt` as `ifModifiedSince` for `alpha`
- **AND** consumers still receive `alpha`'s blockers and next action (from cache or fresh payload)
- **AND** Overview does not show **Workflow status unavailable.**

#### Scenario: Unchanged poll retains visible status for the same change

- **GIVEN** `useChangesRead` has a full status cached for change `alpha`
- **WHEN** the next poll returns `{ unchanged: true, updatedAt: <alpha> }`
- **THEN** the hook keeps returning the cached full status for `alpha`
- **AND** `isLoading` is false once the poll settles

#### Scenario: Section bucket does not leak status cache

- **GIVEN** the same change name could appear under different list sections (e.g. after restore)
- **WHEN** `listSection` changes the status cache key
- **THEN** `ifModifiedSince` and cached status are read from the new bucket only
- **AND** not from the previous section bucket
