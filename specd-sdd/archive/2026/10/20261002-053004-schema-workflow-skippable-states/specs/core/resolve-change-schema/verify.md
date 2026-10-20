# Verification: ResolveChangeSchema

## Requirements

### Requirement: Input and result contract

#### Scenario: Matching schema returns schema and no advisory

- **GIVEN** a recorded reference `custom@2`
- **AND** the provider returns canonical schema `custom@2`
- **WHEN** `ResolveChangeSchema.execute` runs
- **THEN** it returns that schema
- **AND** its warning collection is empty

### Requirement: Sovereign named lookup

#### Scenario: Different workspace default is never consulted

- **GIVEN** a change records `custom@1`
- **AND** the workspace default is `schema-std@9`
- **WHEN** the change schema is resolved
- **THEN** the provider is called with `custom`
- **AND** no unnamed/default lookup is performed

#### Scenario: Named lookup failure does not fall back

- **GIVEN** the provider cannot resolve the recorded name
- **WHEN** resolution runs
- **THEN** the provider error propagates
- **AND** the workspace default is not requested

#### Scenario: Broken workspace default does not block a named lookup

- **GIVEN** the composed `LazySchemaProvider` whose workspace default schema reference is missing or invalid
- **AND** a change recording a different, resolvable schema `custom-workflow`
- **WHEN** `ResolveChangeSchema.execute` resolves the change's schema
- **THEN** it returns `custom-workflow` without attempting to resolve the default

### Requirement: Provider identity integrity

#### Scenario: Wrong returned canonical name throws typed mismatch

- **GIVEN** the requested name is `custom`
- **AND** the provider returns a schema whose canonical name is `schema-std`
- **WHEN** resolution runs
- **THEN** `SchemaProviderIdentityMismatchError` is thrown
- **AND** it identifies `custom` as requested and `schema-std` as returned

#### Scenario: Identity mismatch is checked before use

- **GIVEN** the provider returned the wrong canonical schema
- **WHEN** a mutating caller resolves it
- **THEN** no schema-derived predicate, effect, hook, mutation, or persistence runs

### Requirement: Same-name version advisory

#### Scenario: Resolved same-name version difference warns and continues

- **GIVEN** the recorded reference is `custom@1`
- **AND** the named lookup returns `custom@2`
- **WHEN** resolution runs
- **THEN** it returns `custom@2`
- **AND** emits an advisory containing recorded version `1` and resolved version `2`

#### Scenario: Workspace default version does not create advisory

- **GIVEN** the recorded reference and named result are both `custom@1`
- **AND** the workspace default is `custom@9`
- **WHEN** resolution runs
- **THEN** no version advisory is emitted

### Requirement: Failure propagation and caller policy

#### Scenario: Mutation propagates lookup failure

- **GIVEN** sovereign lookup fails
- **WHEN** a mutating change operation resolves its schema
- **THEN** the typed failure propagates
- **AND** the mutation is not persisted

#### Scenario: Status may degrade identity mismatch distinctly

- **GIVEN** sovereign lookup returns the wrong canonical name
- **WHEN** `GetStatus` applies its read-only failure policy
- **THEN** it exposes `SCHEMA_IDENTITY_MISMATCH`
- **AND** does not project lifecycle topology from the returned schema

### Requirement: Shared change-operation boundary

#### Scenario: Change-bound consumers use the shared resolver

- **WHEN** composition builds change-bound use cases that require schema-derived behavior
- **THEN** they receive the canonical `ResolveChangeSchema` dependency
- **AND** they do not duplicate provider identity or version comparison logic

#### Scenario: Reconciler, repository sync, and CLI DAG use the shared resolver

- **GIVEN** a change whose `schemaName` is `custom-workflow` and a different workspace default
- **WHEN** validity reconciliation runs, the change repository syncs artifact types on load and save, and `changes status`, `changes validate`, `changes spec-preview`, and `changes artifacts` render the change's artifact DAG
- **THEN** each of them obtains the schema through `ResolveChangeSchema` with `custom-workflow`
- **AND** none of them consults the workspace default

#### Scenario: Advisories are propagated rather than only logged

- **GIVEN** `ResolveChangeSchema` returns a same-name version advisory
- **WHEN** `GetStatus` projects the change
- **THEN** the advisory appears as a structured warning on the status result

#### Scenario: Archive metadata receives the resolved schema name

- **GIVEN** an archived change recorded with `custom-workflow`
- **WHEN** archive materializes metadata for its specs
- **THEN** `MaterializeSpecMetadata` receives `schemaName: 'custom-workflow'`

#### Scenario: CLI DAG commands render advisories

- **GIVEN** a change with same-name version drift
- **WHEN** `changes validate`, `changes spec-preview`, and `changes artifacts` run
- **THEN** each renders the `SCHEMA_VERSION_DRIFT` advisory (text `warnings:` / structured `schemaWarnings`) instead of discarding it

### Requirement: Composition

#### Scenario: Config factory delegates through resolver-backed dependencies

- **WHEN** the config-based factory creates `ResolveChangeSchema`
- **THEN** it resolves `SchemaProvider` through the canonical composition resolver
- **AND** delegates to the dependency-based constructor

#### Scenario: Kernel exposes the shared resolver

- **WHEN** the kernel is composed
- **THEN** `kernel.changes.resolveSchema` is the same `ResolveChangeSchema` instance used by change-bound use cases
- **AND** `createResolveChangeSchema(config)` and `createResolveChangeSchema(deps)` both produce a working instance
