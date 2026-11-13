# Verification: SDK Run Graph Impact

## Requirements

### Requirement: runGraphImpact orchestration

#### Scenario: File impact with transient provider

- **GIVEN** a file selector
- **WHEN** `runGraphImpact(ctx, { files: ["src/auth.ts"] })` is executed without a caller-provided provider
- **THEN** selectors are resolved and `analyzeFileImpact` is executed
- **AND** the returned target exposes `canonicalPath` and `projectRelativePath`
- **AND** affected files and symbols expose `projectRelativePath`
- **AND** the transient provider is cleanly closed

#### Scenario: Multi-file impact exposes projectRelativeTargets

- **GIVEN** multiple file selectors
- **WHEN** `runGraphImpact(ctx, { files: ["src/auth.ts", "src/user.ts"] })` is executed
- **THEN** the returned result exposes `targets` (canonical) and `projectRelativeTargets`

#### Scenario: Symbol impact analysis

- **GIVEN** a symbol selector
- **WHEN** `runGraphImpact(ctx, { symbol: "createKernel" })` is executed
- **THEN** the typed `analyzeResolvedSymbolImpact` operation is executed and affected paths are projected to `projectRelativePath`

#### Scenario: Spec impact analysis

- **GIVEN** a spec identifier
- **WHEN** `runGraphImpact(ctx, { spec: "core:config" })` is executed
- **THEN** `analyzeSpecImpact` is executed and affected paths are projected to `projectRelativePath`

#### Scenario: Public export route impact analysis

- **GIVEN** an exported name and a public surface file
- **WHEN** `runGraphImpact(ctx, { export: "createKernel", from: "core:src/public.ts" })` is executed
- **THEN** public binding resolution and `analyzePublicBindingImpact` are executed
- **AND** the public surface is projected to `projectRelativeSurface`
- **AND** binding and canonical affected files and symbols are projected to `projectRelativePath`

#### Scenario: Provider filter forwarding across targets

- **GIVEN** an impact request with `filter: { types, kinds, workspaces, excludeWorkspaces, categories, includeTests, includeIgnored }`
- **WHEN** `runGraphImpact(ctx, input)` is executed
- **THEN** the filter object is passed directly to the corresponding provider analysis method

#### Scenario: Traversal direction and depth forwarding

- **GIVEN** an impact request with direction `dependents`, `dependencies`, `upstream`, `downstream`, or `both`, and a custom `depth`
- **WHEN** `runGraphImpact(ctx, input)` is executed
- **THEN** the normalized provider direction and depth are forwarded to provider traversal methods

#### Scenario: Impact analysis with caller-owned open provider

- **GIVEN** an open caller-provided `CodeGraphProvider`
- **WHEN** `runGraphImpact(ctx, { files: ["src/auth.ts"], provider })` is executed
- **THEN** execution runs on the supplied provider without closing it

### Requirement: Resolution-preserving symbol impact orchestration

#### Scenario: Logical target is not collapsed to one declaration

- **GIVEN** a symbol selector resolves to one logical target with multiple declarations
- **WHEN** runGraphImpact executes
- **THEN** it passes the complete discriminated resolution to provider impact
- **AND** the result retains canonical identity, all declarations, evidence, coverage, and explicit count units

#### Scenario: Legacy first-declaration provider fallback is unavailable

- **GIVEN** a provider implements the public typed impact contract
- **AND** a logical target contains multiple declarations
- **WHEN** runGraphImpact executes
- **THEN** it invokes the discriminated logical-target operation
- **AND** it never selects `declarations[0]` or calls physical impact as a compatibility fallback

#### Scenario: Ambiguous or unresolved selector does not traverse

- **GIVEN** a symbol selector is ambiguous or unresolved
- **WHEN** runGraphImpact executes
- **THEN** no impact traversal starts
- **AND** the resolution outcome remains available to the caller

#### Scenario: Every evidence path is projected without graph reads

- **GIVEN** an impact result contains locations nested under resolvedTarget, declarations, resolution evidence, affected targets, public surfaces, and covering-spec evidence
- **WHEN** SDK path projection runs
- **THEN** every retained location receives projectRelativePath
- **AND** projection performs no additional provider reads

#### Scenario: Legacy summary fields are derived after traversal

- **GIVEN** a logical target with several declarations
- **WHEN** `runGraphImpact` returns its result
- **THEN** `impact.target` carries the canonical logical identity rather than a physical declaration ID
- **AND** the deprecated `symbol` summary was derived only after the typed traversal completed

### Requirement: Elimination of displayPath and displayTargets

#### Scenario: displayPath and displayTargets are omitted

- **WHEN** `runGraphImpact` returns single-file, multi-file, or symbol results
- **THEN** neither `displayPath` nor `displayTargets` is present in the result

### Requirement: Pure path projection

#### Scenario: Impact projection uses configuration alone

- **WHEN** impact paths are projected to `projectRelativePath`
- **THEN** projection uses project and workspace configuration without additional provider reads

#### Scenario: Export and covering-spec locations are projected

- **GIVEN** a public export impact result with resolution evidence and file-based covering-spec evidence
- **WHEN** paths are projected
- **THEN** every nested location in `resolution`, `binding`, `target`, `path`, and covering-spec evidence exposes `projectRelativePath`
- **AND** no additional graph read is performed

### Requirement: No presenter formatting

#### Scenario: Pure structured data returned

- **WHEN** `runGraphImpact` completes
- **THEN** the output contains structured impact statistics, targets, and affected lists without text trees or ANSI styling
