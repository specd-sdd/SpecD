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

- **GIVEN** a CheckRegistry containing 15 built-ins and 2 registered plugin checks
- **WHEN** calling `registry.list()`
- **THEN** it returns an array of exactly 17 Check instances

### Requirement: Immutability of built-in checks

#### Scenario: Built-in checks injected at construction

- **GIVEN** a CheckRegistry constructed with the standard built-in check definitions
- **WHEN** inspecting `registry.get('protocol.edge')` and `registry.get('workflow.requires')`
- **THEN** both checks are present with their immutable built-in configurations

#### Scenario: Reject external registration using unprefixed built-in name

- **GIVEN** a CheckRegistry instance
- **WHEN** an external caller attempts to register a check without plugin namespacing or attempting to override a built-in
- **THEN** the registration is rejected and throws `InvalidPluginNameError`

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
- **WHEN** registering default bindings for `{ scope: 'transition', to: 'ready', along: 'forward' }`
- **THEN** the binding is successfully recorded and accessible via `registry.bindings()`

#### Scenario: Reject duplicate binding on identical coordinate

- **GIVEN** a registered check with a default binding for `{ scope: 'transition', to: 'ready', along: 'forward' }`
- **WHEN** attempting to register a second binding for the exact same coordinate `{ scope: 'transition', to: 'ready', along: 'forward' }`
- **THEN** it throws `DuplicateCheckBindingError`

### Requirement: Two-tier governance and confinement locks

#### Scenario: Check-level allowBindingOverride false enforces confinement

- **GIVEN** a check registered with `allowBindingOverride: false` and default binding to `ready`
- **WHEN** validating a schema that attempts to bind this check to step `implementing`
- **THEN** schema validation throws `CheckEmbeddingForbiddenError`

#### Scenario: Coordinate allowBindingOverride false locks policy overrides

- **GIVEN** a check binding coordinate defined with `allowBindingOverride: false`
- **WHEN** a schema attempts to override `onFailure: 'collect'` on that coordinate
- **THEN** schema validation throws `CheckBindingOverrideForbiddenError`

#### Scenario: Locked config rejects schema config override

- **GIVEN** a check registered with `allowConfigOverride: false` and `defaultConfig: { rule: 'strict' }`
- **WHEN** a schema provides `config: { rule: 'permissive' }` for this check
- **THEN** schema validation throws `CheckConfigOverrideForbiddenError`

#### Scenario: Locked check-level allowDisable rejects schema disablement

- **GIVEN** a check registered with `allowDisable: false`
- **WHEN** a schema declares `disabled: true` for this check in a workflow step
- **THEN** schema validation throws `CheckDisableForbiddenError`

#### Scenario: Locked binding-level allowDisable rejects schema disablement

- **GIVEN** an existing check binding coordinate configured with `allowDisable: false`
- **WHEN** a schema declares `disabled: true` for this check on that coordinate
- **THEN** schema validation throws `CheckDisableForbiddenError`

#### Scenario: Schema cannot relax existing binding allowDisable lock

- **GIVEN** a check binding coordinate configured with `allowDisable: false`
- **WHEN** a schema declares a check binding on that step attempting to disable it
- **THEN** the existing binding's allowDisable lock takes precedence and throws `CheckDisableForbiddenError`

#### Scenario: Schema layer mergers preserve step checks without erasing governance locks

- **GIVEN** a base schema defining step checks with governance protections
- **WHEN** an extending schema layer is merged via `mergeSchemaLayers`
- **THEN** `step.checks` collections are safely combined without clobbering existing checks
- **AND** any attempt to redeclare an identical check coordinate with relaxed governance is prevented

#### Scenario: Permitted check disablement cleanly omits check from execution

- **GIVEN** a check registered with `allowDisable: true` (or omitted)
- **WHEN** a schema step declares `disabled: true` on that check
- **THEN** schema validation succeeds without error
- **AND** the check is cleanly excluded from matching predicate execution for that step without triggering bypass warnings

#### Scenario: Category A built-in checks initialize with locked governance

- **GIVEN** a CheckRegistry initialized with default built-in checks
- **WHEN** inspecting governance for Category A checks (`protocol.edge`, `verification.current`, `archive.archivable`, `schema.nameMatch`, `hook.pre`, `hook.post`)
- **THEN** all report `allowBindingOverride: false` and `allowDisable: false`

#### Scenario: Category B built-in checks initialize with locked governance

- **GIVEN** a CheckRegistry initialized with default built-in checks
- **WHEN** inspecting governance for Category B checks (`workflow.requires`, `workflow.taskCompletion`, `approval.spec`, `approval.signoff`)
- **THEN** all report `allowBindingOverride: false` and `allowDisable: false`

#### Scenario: Category C built-in checks initialize with open governance

- **GIVEN** a CheckRegistry initialized with default built-in checks
- **WHEN** inspecting governance for Category C checks (`impl.linksInScope`, `spec.overlap`, `deps.consistent`, `impl.filesResolved`, `workspace.readOnly`)
- **THEN** all report `allowBindingOverride: true` and `allowDisable: true`

### Requirement: Cascading configuration hierarchy

#### Scenario: Cascade merges check default, binding config, and step config

- **GIVEN** a check with check-level `defaultConfig: { timeout: 1000, level: 'info' }`
- **AND** a binding with `config: { timeout: 2000 }`
- **AND** a schema step declaration with `config: { level: 'debug', extra: true }`
- **WHEN** the orchestrator builds `CheckExecutionContext.config` for this check invocation
- **THEN** the effective config is `{ timeout: 2000, level: 'debug', extra: true }`
