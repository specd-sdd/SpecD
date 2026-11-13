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

#### Scenario: Non-reassignment write paths cannot replace schema

- **GIVEN** a persisted spec with an existing `schema` value
- **WHEN** archive-time materialization, dependency mutation, implementation mutation, or optimization mutation runs against it
- **THEN** the existing `schema` value is not replaced

### Requirement: Guarded schema reassignment

#### Scenario: Reassignment validates target schema before replacing schema

- **WHEN** a schema-reassignment operation targets a new schema
- **THEN** it resolves and loads the target schema's declared canonical artifacts and verifies they parse under that schema before replacing `schema`

#### Scenario: Reassignment preserves dependsOn when target schema has no dependency extraction

- **GIVEN** a target schema that does not declare dependency extraction
- **WHEN** schema reassignment is performed
- **THEN** the current canonical `dependsOn` is preserved unchanged

#### Scenario: Reassignment fails when extracted dependencies differ from canonical dependsOn

- **GIVEN** a target schema that declares dependency extraction
- **WHEN** dependencies extracted under the target schema do not equal the current canonical `dependsOn`
- **THEN** the reassignment operation fails instead of silently changing dependencies

#### Scenario: Reassignment preserves implementation and optimization values

- **WHEN** a schema-reassignment operation completes
- **THEN** `implementation` and any `optimizations` values and baselines remain unchanged

#### Scenario: Reassignment makes existing optimizations stale without deleting them

- **GIVEN** a persisted spec with existing optimization baselines
- **WHEN** its schema is reassigned
- **THEN** the existing optimization baselines are not cleared or regenerated
- **AND** they become stale relative to the new schema

#### Scenario: Reassigning to the currently recorded schema is a no-op

- **GIVEN** a persisted spec whose recorded `schema` already matches the requested target schema
- **WHEN** a schema-reassignment operation selects that same schema identity
- **THEN** the operation succeeds as a semantic no-op and is not treated as a failure

### Requirement: Persistent dependencies

#### Scenario: Sidecar dependencies are used as durable fallback

- **GIVEN** a persisted spec whose `spec-lock.json` contains `dependsOn`
- **AND** dependency extraction later omits `dependsOn`
- **WHEN** metadata is regenerated
- **THEN** the sidecar `dependsOn` value is used as the authoritative fallback

#### Scenario: Empty dependency entry rejected

- **GIVEN** `spec-lock.json` contains `"dependsOn": [""]`
- **WHEN** the lock is read
- **THEN** it fails with `InvalidSpecLockError`

#### Scenario: Bare dependency entry rejected

- **GIVEN** `spec-lock.json` contains `"dependsOn": ["auth/login"]`
- **WHEN** the lock is read
- **THEN** it fails with `InvalidSpecLockError` naming `dependsOn.0`

#### Scenario: Qualified valid entries accepted

- **GIVEN** `spec-lock.json` contains `"dependsOn": ["core:storage", "default:_global/architecture"]`
- **WHEN** the lock is read
- **THEN** both entries are returned unchanged

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

### Requirement: Optional persisted optimization state

#### Scenario: Optimized field records value, schema baseline, and artifact state

- **WHEN** an optimization-setting operation sets `optimizedDescription` or `optimizedContext`
- **THEN** the field records `value`, `schema`, and `artifactState` describing the exact canonical artifact set it was produced from

#### Scenario: Independent field baselines

- **GIVEN** a lock with both `optimizedDescription` and `optimizedContext` present
- **WHEN** one field is set or cleared
- **THEN** the baseline recorded for the other field does not change

#### Scenario: Clearing the last optimized field omits the optimizations block

- **GIVEN** a lock with exactly one optimization field present
- **WHEN** that field is cleared
- **THEN** `optimizations` is omitted entirely rather than retained as an empty object

#### Scenario: Pre-existing lock without optimizations remains valid

- **GIVEN** a `spec-lock.json` written before this requirement existed with no `optimizations` block
- **WHEN** it is read
- **THEN** it remains valid

#### Scenario: No migration synthesizes optimizations from agent-generated metadata

- **WHEN** metadata regeneration or any migration flow runs
- **THEN** it does not synthesize `optimizations` from previously agent-generated `metadata.json` fields
- **AND** only an explicit optimization-setting operation creates this state

### Requirement: Lock-less specs and explicit initialization

#### Scenario: Lock-less spec with canonical artifacts is valid

- **GIVEN** a spec with canonical artifacts and no `spec-lock.json`
- **WHEN** it is read
- **THEN** the lock-less state is valid and is not silently upgraded by the read

#### Scenario: Explicit initialization adopts existing artifacts

- **GIVEN** a lock-less spec
- **WHEN** an explicit initialization operation adopts its artifacts into persisted state
- **THEN** `dependsOn` is derived from the current canonical artifacts under the resolved schema
- **AND** `implementation` defaults to an empty array
- **AND** `optimizations` is omitted

#### Scenario: Explicit initialization fails when persisted state already exists

- **GIVEN** a spec that already has persisted state
- **WHEN** an explicit initialization operation targets that spec
- **THEN** it fails regardless of whether the requested schema identity matches

#### Scenario: Semantic no-op mutation does not create persisted state

- **GIVEN** a lock-less spec
- **WHEN** a mutation removes a dependency, implementation link, or optimization field that is not present or set
- **THEN** persisted state is not created for that spec

#### Scenario: Persisted lock sidecars cannot be created without canonical artifacts

- **GIVEN** an operation targeting a path with no canonical spec artifacts
- **WHEN** attempting to persist a standalone lock sidecar
- **THEN** the creation is rejected

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

#### Scenario: Non-archive writers use conditional revision-guarded writes

- **GIVEN** a persisted-state mutation, explicit initialization, or schema-reassignment operation
- **WHEN** it writes `spec-lock.json`
- **THEN** it constructs the complete persisted state through the shared pure patch/construction rules rather than hand-assembling partial JSON
- **AND** it uses a conditional write guarded by the observed revision so concurrent writers cannot silently overwrite each other

### Requirement: Sidecar is the durable source of truth

#### Scenario: Metadata regeneration does not mutate sidecar implementation links

- **GIVEN** an existing `spec-lock.json` with archived implementation links
- **WHEN** metadata is regenerated later
- **THEN** `spec-lock.json` content remains unchanged
- **AND** metadata only projects from the sidecar

#### Scenario: Generated projection excludes a stale optimization field

- **GIVEN** a sidecar optimization baseline that is stale against current canonical artifacts or schema identity
- **WHEN** metadata is regenerated
- **THEN** the generated projection excludes that optimized field

### Requirement: Repository hash of persisted lock state

#### Scenario: persistedStateMeta hash matches lock sidecar bytes

- **GIVEN** a durable `spec-lock.json` with known content
- **WHEN** `SpecRepository.persistedStateMeta(spec, { includeHash: true })` is called
- **THEN** the returned `hash` is the SHA-256 of those sidecar bytes

#### Scenario: Presence stamps do not expose lock as an artifact

- **GIVEN** a lock sidecar present on disk
- **WHEN** `get()` returns the Spec
- **THEN** `Spec.persistedStateStamp.present` is true
- **AND** `spec-lock.json` does not appear in `Spec.artifacts`

#### Scenario: there is no persistedStateHash method on the port

- **WHEN** the SpecRepository port surface is inspected
- **THEN** it does not declare `persistedStateHash` as a method

### Requirement: Sidecar is not a schema artifact

#### Scenario: Sidecar is omitted from generic artifact metadata

- **GIVEN** an archived spec persisted with `spec.md`, `verify.md`, and
  `spec-lock.json`
- **WHEN** the repository returns the spec's normal artifact metadata
- **THEN** `Spec.artifacts` includes only schema-declared artifacts
- **AND** `spec-lock.json` is not exposed as a normal artifact filename

#### Scenario: Generic artifact reads reject the sidecar

- **GIVEN** an archived spec persisted with `spec-lock.json`
- **WHEN** application logic attempts to load `spec-lock.json` through the generic
  artifact API
- **THEN** the repository rejects the request
- **AND** callers must use persisted-state semantic operations instead

### Requirement: Invalid lock fails with a typed error

#### Scenario: Error names spec, file, and field path

- **GIVEN** the lock of `core:update-spec-deps` has `dependsOn: ['Bad Id']`
- **WHEN** the lock is read
- **THEN** the error is `InvalidSpecLockError` with code `INVALID_SPEC_LOCK`
- **AND** the message names `core:update-spec-deps`, the lock file location, `dependsOn.0`, `Bad Id`, and the violated rule
- **AND** the message does not tell the user to edit the file by hand and names no repair command

#### Scenario: No raw validation-library error escapes

- **WHEN** any lock fails structural validation
- **THEN** the thrown error is a `SpecdError` and not a raw `ZodError`

#### Scenario: Reading never rewrites or drops entries

- **GIVEN** a lock with one valid and one invalid `dependsOn` entry
- **WHEN** the lock is read
- **THEN** the read fails
- **AND** the file on disk is unchanged

#### Scenario: Lenient dependsOn read tolerates only invalid dependsOn entries

- **GIVEN** a lock with one valid and one invalid `dependsOn` entry
- **WHEN** it is read with `lenientDependsOn: true`
- **THEN** both entries are returned as given and nothing is rewritten

#### Scenario: Lenient read still validates other fields

- **GIVEN** a lock whose `implementation` entry has an empty `file`
- **WHEN** it is read with `lenientDependsOn: true`
- **THEN** `InvalidSpecLockError` naming `implementation.0.file` is thrown

#### Scenario: Repository lenient read returns invalid dependsOn as given

- **GIVEN** a spec directory whose `spec-lock.json` has `"dependsOn": ["core:ok", ""]`
- **WHEN** `readPersistedState(spec, { lenientDependsOn: true })` is called on the filesystem repository
- **THEN** the snapshot's `dependsOn` is `["core:ok", ""]`
- **AND** the file on disk is unchanged

#### Scenario: Repository lenient read still rejects other invalid fields

- **GIVEN** a `spec-lock.json` whose `implementation.0.file` is empty
- **WHEN** `readPersistedState(spec, { lenientDependsOn: true })` is called
- **THEN** `InvalidSpecLockError` naming `implementation.0.file` is thrown

#### Scenario: writePersistedState repairs a lock with invalid dependsOn

- **GIVEN** a lock whose `dependsOn` holds an invalid entry and an `expectedRevision` equal to its current hash
- **WHEN** `writePersistedState` is called with a valid state
- **THEN** the write succeeds (its revision check reads the lock leniently) and the invalid entry is gone

#### Scenario: Strict read of a lock with one valid and one invalid entry changes nothing on disk

- **GIVEN** a lock with `"dependsOn": ["core:ok", "Bad Id"]`
- **WHEN** `readPersistedState(spec)` is called without the lenient option
- **THEN** `InvalidSpecLockError` is thrown and the file bytes are unchanged

#### Scenario: Error code and message form

- **WHEN** any strict read of an invalid lock fails
- **THEN** the error `code` is `INVALID_SPEC_LOCK`
- **AND** the message contains neither `edit` instructions nor a command name
