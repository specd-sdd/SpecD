# Verification: Change Manifest

## Requirements

### Requirement: Manifest structure

Scenarios:

#### Scenario: Native v2 round trip preserves projections

- **GIVEN** a v2 change with structured policy, approvals, an active verification attempt, completed evidence, and history
- **WHEN** it is serialized and loaded again
- **THEN** every projection, fingerprint algorithm, attempt identity, and audit event is preserved
- **AND** lifecycle state remains derived from transition history

#### Scenario: Native absence differs from legacy unknown evidence

- **WHEN** v2 projections are absent
- **THEN** they mean never approved or completed
- **AND** adapted legacy missing implementation fingerprints remain explicitly unknown

#### Scenario: Scope-aware approval round trip retains audit scopes

- **GIVEN** approval was renewed after its canonical spec scope changed
- **WHEN** the v2 manifest is serialized and loaded
- **THEN** the current projection retains the renewed scope and artifact fingerprint
- **AND** each approval event retains the scope approved at that earlier decision

#### Scenario: Scope invalidation events survive strict v2 round trip

- **GIVEN** a v2 manifest contains `approval-invalidated` evidence for scope `spec`
- **AND** its kind is `spec-added` or `spec-removed`
- **WHEN** strict v2 decoding and serialization run
- **THEN** the valid event round-trips without coercion or loss
- **AND** an unknown scope or invalidation kind still fails strict validation

### Requirement: Manifest format compatibility

#### Scenario: Missing version adapts as v1 without eager write

- **GIVEN** a legacy manifest without `manifestVersion`
- **WHEN** it is inspected
- **THEN** it is adapted in memory with conservative legacy policy and unknown implementation evidence
- **AND** no migration write occurs

#### Scenario: Unsupported future version fails closed

- **WHEN** the loader sees a version above the supported maximum
- **THEN** it returns the typed unsupported-version error before domain hydration

#### Scenario: Approval without scope stays legacy unknown

- **GIVEN** a v1 or transitional v2 approval record has artifact hashes but no approved `specIds`
- **WHEN** it is adapted
- **THEN** scope freshness is unknown and cannot authorize the spec gate
- **AND** the loader does not copy current scope into historical evidence

### Requirement: Archive outcome history events

#### Scenario: Failed archive attempt appends archive-failed event

- **GIVEN** an archive attempt starts for an active change
- **AND** execution fails before successful archive commit completes
- **WHEN** the manifest is persisted after that failure
- **THEN** `history` includes an `archive-failed` event with `step`, `message`, and `commitStarted`

#### Scenario: Successful archive completion is not appended to active history

- **GIVEN** a change archives successfully
- **WHEN** the active change manifest is considered complete
- **THEN** no additional active-history success event is appended
- **AND** success remains traceable through archived manifest metadata

### Requirement: Artifact filenames use expected paths

#### Scenario: Existing delta-capable spec is persisted as a delta filename

- **GIVEN** `core:config` already exists
- **AND** the active schema artifact `specs` declares `delta: true` and output `spec.md`
- **WHEN** a change is created for `core:config`
- **THEN** the manifest file entry for `specs:core:config` stores `filename: "deltas/core/core/config/spec.md.delta.yaml"`
- **AND** it does not first store `specs/core/core/config/spec.md`

#### Scenario: New spec is persisted as a direct specs filename

- **GIVEN** `core:new-capability` does not exist
- **WHEN** a change is created for `core:new-capability`
- **THEN** the manifest file entry for `specs:core:new-capability` stores `filename: "specs/core/core/new-capability/spec.md"`

#### Scenario: Legacy stale filename can be normalized on load

- **GIVEN** an older manifest stores `specs/core/core/config/spec.md` for an existing delta-capable spec
- **WHEN** the change repository loads or syncs that change
- **THEN** the artifact filename may be normalized to `deltas/core/core/config/spec.md.delta.yaml`
- **AND** the file state and `validatedHash` semantics are preserved

### Requirement: Filename normalization preserves tracked intent

#### Scenario: Partial spec materialization does not flip tracked direct file into delta

- **GIVEN** a manifest tracks `verify.md` for a new capability as `specs/core/core/new-capability/verify.md`
- **AND** a failed archive attempt has already materialized some permanent files for that capability
- **WHEN** the change is reloaded
- **THEN** filename normalization preserves the tracked `specs/.../verify.md` filename
- **AND** it does not silently rewrite it to `deltas/.../verify.md.delta.yaml`

#### Scenario: Representation-changing normalization is rejected

- **GIVEN** a normalization step would change a tracked artifact from direct to delta representation or vice versa
- **WHEN** exact semantic equivalence for that artifact file has not been proven
- **THEN** the normalization is rejected

#### Scenario: Null validated hash does not trigger normalization flip

- **GIVEN** a manifest tracks `specs/core/core/new-spec/spec.md`
- **AND** the file has `validatedHash: null`
- **AND** the spec now exists in the workspace (making it delta-capable)
- **WHEN** the change is reloaded
- **THEN** normalization preserves the direct `specs/...` filename
- **AND** it does not flip the representation to `deltas/...` solely because the hash is null

### Requirement: Schema version

#### Scenario: Schema unchanged

- **WHEN** a change is loaded and its manifest schema matches the active schema name and version
- **THEN** no warning is emitted

#### Scenario: Schema version bumped

- **WHEN** a change is loaded and the active schema has a higher version than recorded in the manifest
- **THEN** specd emits a warning indicating the schema has changed since the change was created and the user should review whether the change artifacts are still compatible

#### Scenario: Schema name changed

- **WHEN** a change is loaded and the active schema name differs from the one recorded in the manifest
- **THEN** loading fails with `SchemaMismatchError`

#### Scenario: Archiving with schema version mismatch remains allowed

- **WHEN** archive is attempted on a change with a schema version mismatch
- **THEN** the mismatch warning is surfaced
- **AND** archiving is not blocked solely because of that version mismatch

### Requirement: Fingerprint serialization

#### Scenario: Equality includes paths and algorithms

- **WHEN** equivalent fingerprint maps are serialized from different insertion orders
- **THEN** their canonical lexical representation is identical
- **AND** adding, removing, renaming, or changing an entry changes equality

#### Scenario: Spec scope equality ignores only ordering

- **WHEN** scope-aware fingerprints contain the same canonical spec set in different input order
- **THEN** scope equality holds
- **AND** an added or removed spec yields the corresponding explicit difference

### Requirement: Verification attempt event serialization

#### Scenario: Explicit attempt lifecycle remains auditable

- **GIVEN** verification is started twice and the second attempt completes
- **WHEN** the manifest is inspected
- **THEN** both starts and the completion retain actor, time, lifecycle state, attempt identity, and algorithm metadata
- **AND** no event contains source content or represents a lifecycle self-transition

### Requirement: Atomic writes

#### Scenario: History events appended atomically

- **WHEN** a state transition occurs
- **THEN** the new `transitioned` event is appended to `history` and the entire manifest is written atomically (temp file + rename); no partial writes are visible
