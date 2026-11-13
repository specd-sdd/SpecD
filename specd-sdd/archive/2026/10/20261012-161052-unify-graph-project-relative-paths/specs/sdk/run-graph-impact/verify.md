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
- **THEN** `analyzeSymbolImpact` is executed and affected paths are projected to `projectRelativePath`

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

### Requirement: Elimination of displayPath and displayTargets

#### Scenario: displayPath and displayTargets are omitted

- **WHEN** `runGraphImpact` returns single-file, multi-file, or symbol results
- **THEN** neither `displayPath` nor `displayTargets` is present in the result

### Requirement: Pure path projection

#### Scenario: Impact projection uses configuration alone

- **WHEN** impact paths are projected to `projectRelativePath`
- **THEN** projection uses project and workspace configuration without additional provider reads

### Requirement: No presenter formatting

#### Scenario: Pure structured data returned

- **WHEN** `runGraphImpact` completes
- **THEN** the output contains structured impact statistics, targets, and affected lists without text trees or ANSI styling
