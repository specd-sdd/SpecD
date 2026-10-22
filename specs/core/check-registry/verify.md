# Verification: core:check-registry

## Requirements

### Requirement: Open check registry

#### Scenario: Retrieve registered check by canonical ID

- **GIVEN** a CheckRegistry initialized with built-in checks and a registered plugin check `@security.code-scan`
- **WHEN** querying `registry.get('@security.code-scan')`
- **THEN** it returns the registered Check instance with matching identifier and properties
- **AND** `registry.has('@security.code-scan')` returns true

#### Scenario: Query unregistered check returns undefined

- **GIVEN** a CheckRegistry instance
- **WHEN** querying `registry.get('@nonexistent.check')`
- **THEN** it returns undefined
- **AND** `registry.has('@nonexistent.check')` returns false

#### Scenario: List all registered checks

- **GIVEN** a CheckRegistry containing the 16 built-in checks and 2 registered plugin checks
- **WHEN** calling `registry.list()`
- **THEN** it returns an array of exactly 18 Check instances

### Requirement: Immutability of built-in checks

#### Scenario: Built-in checks injected at construction

- **GIVEN** a CheckRegistry constructed with the standard built-in check definitions
- **WHEN** inspecting `registry.get('protocol.edge')`, `registry.get('workflow.requires')`, and `registry.get('workflow.tasksEmpty')`
- **THEN** all checks are present with their immutable built-in configurations

#### Scenario: External registrations are always namespaced and never shadow built-ins

- **GIVEN** a CheckRegistry instance
- **WHEN** a plugin named `protocol` registers a check with id `edge`
- **THEN** the check is registered as `@protocol.edge`
- **AND** `registry.get('protocol.edge')` still returns the immutable built-in check

#### Scenario: Invalid plugin name is rejected

- **GIVEN** a CheckRegistry instance
- **WHEN** a plugin registers with a name that is empty or contains whitespace, dots, symbols, or path traversal
- **THEN** the registration throws `InvalidPluginNameError`

#### Scenario: Plugin namespace accepts the documented grammar

- **GIVEN** plugin names matching `^[a-zA-Z0-9_-]+$`
- **WHEN** registering checks under names containing uppercase letters, a leading digit, or an underscore
- **THEN** each valid namespace is accepted

### Requirement: Canonical namespacing and plugin registration

#### Scenario: Valid plugin registration produces canonical namespaced identifier

- **GIVEN** a CheckRegistry and a valid custom check with id `'audit'`
- **WHEN** registering via `registry.register('compliance', check)`
- **THEN** the returned canonical identifier is `'@compliance.audit'`
- **AND** the check is indexed under `'@compliance.audit'`

#### Scenario: Reject invalid plugin name containing special characters

- **GIVEN** a CheckRegistry
- **WHEN** attempting to register with plugin name `'@invalid.name'` or empty string `''`
- **THEN** it throws `InvalidPluginNameError`

#### Scenario: Reject duplicate check registration under same canonical identifier

- **GIVEN** a CheckRegistry with an existing check `'@security.scan'`
- **WHEN** attempting to register another check with id `'scan'` under plugin `'security'`
- **THEN** it throws `DuplicateCheckError`

### Requirement: Adaptation of CustomCheckDefinition to internal Check

#### Scenario: CustomCheckDefinition automatically adapted to predicate kind

- **GIVEN** a `CustomCheckDefinition` specifying `id: 'lint'` and `label: 'Linting files'` without a `kind` property
- **WHEN** registering the check via `registry.register('qa', checkDef)`
- **THEN** the adapted check in the registry has `kind: 'predicate'`

#### Scenario: Reject check definition explicitly declaring effect kind

- **GIVEN** a check definition providing `kind: 'effect'`
- **WHEN** attempting to register it via `registry.register('shell', checkDef)`
- **THEN** it throws `InvalidCheckKindError`

### Requirement: Binding coordinate identity and duplicate prevention

#### Scenario: Register valid check binding coordinates

- **GIVEN** a registered check `'@security.scan'`
- **WHEN** registering default bindings for `{ scope: 'transition', to: 'ready', along: 'forward' }` and `{ scope: 'step-skip', step: 'implementing' }`
- **THEN** both bindings are successfully recorded and accessible via `registry.bindings()`

#### Scenario: Reject duplicate binding on identical coordinate

- **GIVEN** a registered check with a default binding for `{ scope: 'transition', to: 'ready', along: 'forward' }`
- **WHEN** attempting to register a second binding for the exact same coordinate `{ scope: 'transition', to: 'ready', along: 'forward' }`
- **THEN** it throws `DuplicateCheckBindingError`

#### Scenario: Reject duplicate step-skip binding on identical coordinate

- **GIVEN** a check registered with a binding for `{ scope: 'step-skip', step: 'implementing' }`
- **WHEN** attempting to register another binding for the exact same `{ scope: 'step-skip', step: 'implementing' }`
- **THEN** it throws `DuplicateCheckBindingError`

#### Scenario: Duplicate archiveChecks declaration for one check

- **GIVEN** a schema whose `archiveChecks` lists `spec.overlap` twice
- **WHEN** the schema is built
- **THEN** `DuplicateCheckBindingError` is thrown for coordinate `{ checkId: spec.overlap, scope: 'archive' }`

#### Scenario: Archive and transition coordinates are independent

- **GIVEN** `deps.consistent` is bound on `ready` transitions and on archive
- **WHEN** a schema disables it in `archiveChecks`
- **THEN** only the archive coordinate is affected

### Requirement: Two-tier governance and confinement locks

#### Scenario: allowSchemaEmbedding false forbids new coordinates

- **GIVEN** a plugin check registered with `allowSchemaEmbedding: false` and a default binding entering `ready`
- **WHEN** validating a schema that declares this check on step `implementing`
- **THEN** schema validation throws `CheckEmbeddingForbiddenError`

#### Scenario: Embedding defaults follow default bindings

- **GIVEN** a plugin check registered with `defaultBindings` and no `allowSchemaEmbedding`
- **AND** another plugin check registered without `defaultBindings` and no `allowSchemaEmbedding`
- **WHEN** their governance is inspected
- **THEN** the first has `allowSchemaEmbedding: false`
- **AND** the second has `allowSchemaEmbedding: true`

#### Scenario: Declaring a locked built-in at its own coordinate is not embedding

- **GIVEN** the built-in check `impl.filesResolved` with its code-defined binding entering `verifying`
- **AND** a variant of a built-in check with `allowSchemaEmbedding: false` declared on the step of its own code-defined coordinate
- **WHEN** a schema declares the check on that coordinate with only an allowed `config`
- **THEN** schema validation succeeds
- **AND** no `CheckEmbeddingForbiddenError` is thrown, exactly as for a plugin check at its own coordinate

#### Scenario: allowSchemaEmbedding does not lock policy at own coordinates

- **GIVEN** a plugin check registered with `allowSchemaEmbedding: false` and a default binding entering `ready` whose `allowBindingOverride` is `true`
- **WHEN** a schema redeclares that check on step `ready` changing `onFailure`
- **THEN** schema validation accepts the policy change

#### Scenario: Coordinate allowBindingOverride false locks policy overrides

- **GIVEN** a code-defined binding coordinate with `allowBindingOverride: false`
- **WHEN** a schema attempts to override `onFailure: 'collect'` on that coordinate
- **THEN** schema validation throws `CheckBindingOverrideForbiddenError`

#### Scenario: allowBindingOverride does not restrict placement

- **GIVEN** a plugin check with `allowSchemaEmbedding: true` whose default binding entering `ready` has `allowBindingOverride: false`
- **WHEN** a schema declares the check on step `implementing`
- **THEN** schema validation succeeds

#### Scenario: Schema-owned binding may be changed by a later schema layer

- **GIVEN** a base schema that embeds `impl.linksInScope` on step `done` (a coordinate no code-defined binding serves) with `onFailure: 'abort'`
- **AND** an extending layer or `schemaOverrides` that redeclares it on `done` with `onFailure: 'collect'` and `skippable: false`
- **WHEN** the layers are merged and the schema is built
- **THEN** schema validation succeeds and the merged declaration carries `onFailure: 'collect'` and `skippable: false`
- **AND** no `CheckBindingOverrideForbiddenError` is thrown

#### Scenario: Schema-owned binding still honors check-level locks

- **GIVEN** a plugin check with `allowConfigOverride: false` embedded by a base schema at a new coordinate
- **WHEN** a later schema layer adds `config` to that declaration
- **THEN** schema validation throws `CheckConfigOverrideForbiddenError`

#### Scenario: Locked config rejects schema config override

- **GIVEN** a check registered with `allowConfigOverride: false` and `defaultConfig: { rule: 'strict' }`
- **WHEN** a schema provides `config: { rule: 'permissive' }` for this check
- **THEN** schema validation throws `CheckConfigOverrideForbiddenError`

#### Scenario: Omitted binding allowConfigOverride inherits the check-level lock

- **GIVEN** a plugin check registered with `allowConfigOverride: false` whose default binding omits `allowConfigOverride`
- **WHEN** the binding is constructed
- **THEN** the binding's effective `allowConfigOverride` is `false`

#### Scenario: Locked check-level allowDisable rejects schema disablement

- **GIVEN** a check registered with `allowDisable: false`
- **WHEN** a schema declares `disabled: true` for this check in a workflow step
- **THEN** schema validation throws `CheckDisableForbiddenError`

#### Scenario: Locked binding-level allowDisable rejects schema disablement

- **GIVEN** an existing code-defined binding coordinate configured with `allowDisable: false`
- **WHEN** a schema declares `disabled: true` for this check on that coordinate
- **THEN** schema validation throws `CheckDisableForbiddenError`

#### Scenario: Schema cannot relax existing binding allowDisable lock

- **GIVEN** a code-defined binding coordinate configured with `allowDisable: false`
- **WHEN** any schema layer declares a binding on that step attempting to disable it
- **THEN** the code-defined lock takes precedence and throws `CheckDisableForbiddenError`

#### Scenario: Schema layer mergers preserve step checks without erasing governance locks

- **GIVEN** a base schema defining step checks and skipChecks with governance protections
- **WHEN** an extending schema layer is merged via `mergeSchemaLayers`
- **THEN** `step.checks` and `step.skipChecks` collections are safely combined without clobbering existing checks
- **AND** any attempt to relax a code-set lock through a redeclaration is rejected

#### Scenario: Permitted check disablement cleanly omits check from execution

- **GIVEN** a check registered with `allowDisable: true` (or omitted)
- **WHEN** a schema step declares `disabled: true` on that check
- **THEN** schema validation succeeds without error
- **AND** the check is cleanly excluded from matching predicate execution for that step without triggering bypass warnings

#### Scenario: Category A built-in checks initialize with locked governance

- **WHEN** inspecting Category A built-in checks in CheckRegistry
- **THEN** all declare `allowSchemaEmbedding: false`, `allowBindingOverride: false`, `allowDisable: false`, and `skippable: false`

#### Scenario: Category B built-in checks include workflow.tasksEmpty with native attribute governance

- **WHEN** inspecting `workflow.tasksEmpty` in CheckRegistry
- **THEN** it declares `allowSchemaEmbedding: false`, `allowBindingOverride: false`, `allowDisable: false`, and `skippable: false` under `scope: 'step-skip'` for `step: 'implementing'`

#### Scenario: Category C built-in checks allow embedding

- **WHEN** inspecting `impl.linksInScope`, `impl.filesResolved`, `spec.overlap`, `deps.consistent`, and `workspace.readOnly`
- **THEN** each declares `allowSchemaEmbedding: true`, `allowBindingOverride: true`, and `allowDisable: true`

#### Scenario: Composition forwards plugin governance

- **GIVEN** a plugin check registered through kernel composition with `allowDisable: false` and `allowSchemaEmbedding: false`
- **WHEN** a schema declares `disabled: true` for that check on any step, or declares it at a coordinate its default bindings do not serve
- **THEN** schema validation throws `CheckDisableForbiddenError` or `CheckEmbeddingForbiddenError` respectively

#### Scenario: Plugin step-skip default bindings are evaluated

- **GIVEN** a plugin check registered through kernel composition with a default binding `{ scope: 'step-skip', step: 'implementing' }`
- **AND** `implementing` is optional
- **WHEN** a transition bypasses `implementing`
- **THEN** the plugin check runs as a `step-skip` predicate
- **AND** its failure rejects the shortcut end to end

#### Scenario: Composition registry exposes executable instances

- **GIVEN** the `CheckRegistry` built by kernel composition
- **WHEN** `registry.get('impl.linksInScope')` is executed for a change whose implementation links fall outside its scope
- **THEN** the check returns `fail`, because the registry holds the application implementation and not a domain stub

#### Scenario: Schema-embedded Category C check surfaces its real result

- **GIVEN** a schema embedding `impl.linksInScope` on step `done`, where no code-defined binding serves that coordinate
- **AND** a change with out-of-scope implementation links
- **WHEN** `TransitionChange` attempts `verifying → done`
- **THEN** the synthesized binding evaluates the real check and the transition fails with `CheckPredicateFailedError` for `impl.linksInScope`

#### Scenario: Archive exception locks workspace.readOnly

- **WHEN** a schema declares `archiveChecks: [{ id: workspace.readOnly, disabled: true }]`
- **THEN** `CheckDisableForbiddenError` is thrown

#### Scenario: Archive exception locks impl.filesResolved policy

- **WHEN** a schema declares `archiveChecks: [{ id: impl.filesResolved, skippable: true }]`
- **THEN** `CheckBindingOverrideForbiddenError` is thrown

#### Scenario: Archive exception locks deps.consistent configuration

- **WHEN** a schema declares `archiveChecks: [{ id: deps.consistent, config: { strict: true } }]`
- **THEN** `CheckConfigOverrideForbiddenError` is thrown

#### Scenario: The archive exception does not touch transition bindings

- **WHEN** a schema disables `workspace.readOnly` on `checks` of the `ready` step
- **THEN** it is accepted, because the transition binding keeps its Category C policy

#### Scenario: spec.overlap and impl.linksInScope remain tunable on archive

- **WHEN** a schema declares `archiveChecks` entries that disable `spec.overlap` and set `skippable: false` on `impl.linksInScope`
- **THEN** the schema builds without error

#### Scenario: Plugin archive binding is tunable without embedding

- **GIVEN** a plugin check whose default bindings include `{ scope: 'archive' }` and `allowSchemaEmbedding: false`
- **WHEN** a schema declares it in `archiveChecks` with a `config`
- **THEN** the declaration is accepted as tuning of a code-defined coordinate

#### Scenario: Plugin check without an archive binding cannot be embedded when locked

- **GIVEN** a plugin check with default bindings only on transitions and `allowSchemaEmbedding: false`
- **WHEN** a schema declares it in `archiveChecks`
- **THEN** `CheckEmbeddingForbiddenError` is thrown

#### Scenario: archiveChecks survive layer merging with locks intact

- **GIVEN** a base schema and a `schemaOverrides` layer that both declare `archiveChecks`
- **WHEN** the layers are merged
- **THEN** entries are combined by `id` without clobbering either layer
- **AND** a later layer cannot relax a lock set by code

#### Scenario: Redeclaring a locked archive check without changing its policy is accepted

- **WHEN** a schema declares `archiveChecks: [{ id: workspace.readOnly, skippable: false }]`
- **THEN** the schema builds without error, because the value equals the code-defined policy

#### Scenario: Category A and B archive checks reject disablement

- **WHEN** a schema declares `archiveChecks` that set `disabled: true` on Category A archive checks (`schema.nameMatch`, `archive.archivable`, `verification.current`, `hook.pre`, `hook.post`) or Category B `workflow.taskCompletion`
- **THEN** each declaration throws `CheckDisableForbiddenError`

#### Scenario: Category A archive checks reject becoming skippable

- **WHEN** a schema declares `archiveChecks: [{ id: schema.nameMatch, skippable: true }]`
- **THEN** `CheckBindingOverrideForbiddenError` is thrown

#### Scenario: A check with no archive binding cannot be embedded when locked

- **WHEN** a schema declares `archiveChecks: [{ id: approval.spec }]`
- **THEN** `CheckEmbeddingForbiddenError` is thrown

#### Scenario: Plugin archive binding policy lock

- **GIVEN** a plugin archive binding with `allowBindingOverride: false` and `skippable: false`
- **WHEN** a schema declares it with `skippable: true`
- **THEN** `CheckBindingOverrideForbiddenError` is thrown

#### Scenario: Plugin configuration and disablement locks apply on archive

- **GIVEN** a plugin check with `allowConfigOverride: false` and another with `allowDisable: false`, both bound to archive
- **WHEN** a schema declares `config` on the first and `disabled: true` on the second
- **THEN** `CheckConfigOverrideForbiddenError` and `CheckDisableForbiddenError` are thrown respectively

#### Scenario: Plugin check tuned on archive merges config over its defaults

- **GIVEN** a plugin check with `defaultConfig: { minSeverity: high }` bound to archive
- **WHEN** a schema declares `config: { minSeverity: critical }`
- **THEN** the effective configuration is `{ minSeverity: critical }`

### Requirement: Cascading configuration hierarchy

#### Scenario: Cascade merges check default, binding config, and step config

- **GIVEN** a check with check-level `defaultConfig: { timeout: 1000, level: 'info', tags: ['a'] }`
- **AND** a binding with `config: { timeout: 2000, tags: ['b'] }`
- **AND** a schema step declaration with `config: { level: 'debug', extra: true }`
- **WHEN** `resolveEffectiveBindings` resolves the binding and the predicate runner executes it
- **THEN** `ctx.config` is exactly `{ timeout: 2000, level: 'debug', extra: true, tags: ['a', 'b'] }`

#### Scenario: Runner does not merge configuration again

- **GIVEN** a resolved binding carrying an effective configuration
- **WHEN** the predicate runner executes it
- **THEN** the check receives that configuration unchanged and no array entry is duplicated
