# Verification: Resolve Symbol Reference

## Requirements

### Requirement: Structured reference input

#### Scenario: Structured fields disambiguate a member

- **GIVEN** the same member text exists in different owners and symbol spaces
- **WHEN** resolution includes workspace, owner, symbol space, and member form
- **THEN** only the matching structured target is considered
- **AND** its rendered reference round-trips to the same fields

#### Scenario: Language case rules are preserved

- **WHEN** two identifiers differ only by case
- **THEN** resolution follows the addressed language's comparison rules
- **AND** no global lowercase normalization is applied

### Requirement: Logical canonical targets

#### Scenario: Overloads form one logical symbol

- **GIVEN** a language-defined overload set has multiple declaration locations
- **WHEN** its reference is resolved
- **THEN** the result is one logical target containing every declaration occurrence
- **AND** it is not marked ambiguous

#### Scenario: Competing declarations remain ambiguous

- **GIVEN** two declarations do not form one language-defined symbol
- **WHEN** both satisfy the request
- **THEN** the result is ambiguous with both candidates

### Requirement: Public and local binding identity

#### Scenario: Parallel reexports do not collapse

- **GIVEN** two exported names on one surface reach the same target
- **WHEN** bindings are indexed and resolved
- **THEN** each exported name has a distinct binding identity and provenance path

#### Scenario: Competing routes in one export slot are ambiguous

- **GIVEN** one barrel exposes the same name and symbol space from two modules with different canonical targets
- **WHEN** that public export slot is resolved
- **THEN** both routes remain candidates
- **AND** status is `ambiguous` rather than selecting the last indexed route

#### Scenario: Shadowed local alias uses lexical scope

- **GIVEN** nested scopes bind the same alias to different targets
- **WHEN** a use inside the inner scope is resolved
- **THEN** the inner binding wins and both bindings remain distinct

### Requirement: Deterministic resolution precedence

#### Scenario: Same-name candidate is not proof

- **GIVEN** no declaration, binding, or hierarchy path connects the request
- **WHEN** exactly one same-name workspace symbol exists
- **THEN** resolution is unresolved rather than resolved

#### Scenario: Conditional candidates require context

- **GIVEN** two package conditions expose different targets
- **WHEN** no selecting build context is supplied
- **THEN** no incidental host condition is chosen

### Requirement: Resolution outcomes

#### Scenario: Ambiguity never selects a winner

- **WHEN** multiple valid candidates remain after precedence
- **THEN** status is `ambiguous`
- **AND** no canonical target is selected
- **AND** candidates and reason code are deterministic

#### Scenario: Complete fresh absence is missing

- **GIVEN** the addressed target has current complete supported coverage
- **WHEN** no compatible declaration or binding exists
- **THEN** status is `missing`

### Requirement: Freshness and coverage gate

#### Scenario: Dirty addressed file is inconclusive

- **GIVEN** the indexed ref matches but the addressed file content hash differs from disk
- **WHEN** its missing symbol is resolved
- **THEN** status is `unresolved` with a dirty-content reason

#### Scenario: Coverage failure is not stale

- **GIVEN** the target was excluded, unsupported, parse-failed, or partially indexed
- **WHEN** its symbol is absent
- **THEN** status is `unresolved` with the corresponding coverage reason

#### Scenario: Current public surface can prove a missing export

- **GIVEN** a request addresses a public surface without a source-file selector
- **AND** that surface is current, completely indexed, and contains no compatible export slot
- **WHEN** the export reference is resolved
- **THEN** freshness assessment addresses the public surface
- **AND** status is `missing` rather than `unresolved` with `REFERENCE_UNPROVEN`

### Requirement: Hierarchy-aware members

#### Scenario: Local override wins inherited member

- **GIVEN** a derived owner declares a deterministic override
- **WHEN** `Derived.member` is resolved
- **THEN** the override is selected and the hierarchy path is returned

#### Scenario: Competing inherited members are ambiguous

- **GIVEN** language precedence cannot select between inherited candidates
- **WHEN** the derived member is resolved
- **THEN** status is `ambiguous`

#### Scenario: Ancestor owner contributes its requested member

- **GIVEN** hierarchy facts connect a derived owner to a base owner
- **AND** the requested member is declared under the base owner rather than represented by an owner-to-member edge
- **WHEN** the member is resolved through the derived owner
- **THEN** the resolver queries and selects the requested member under the reached base owner
- **AND** evidence retains both the owner hierarchy path and the ancestor-member declaration

### Requirement: Batch and backend-independent resolution

#### Scenario: Batch shares one indexed query context

- **WHEN** multiple review links are resolved as one batch
- **THEN** health is evaluated once
- **AND** the implementation does not scan the complete graph per link

#### Scenario: Supplied batch health still assesses exact resources

- **GIVEN** a caller supplies one shared graph-health snapshot for a batch
- **AND** one candidate declaration's source file changed after indexing
- **WHEN** the batch resolves references that could use that declaration
- **THEN** the resolver performs the targeted freshness assessment for that exact file
- **AND** it does not resolve from the stale declaration merely because global health was supplied

#### Scenario: Backends return identical ordered evidence

- **GIVEN** equivalent SQLite and supported alternative-backend contents
- **WHEN** the same references are resolved
- **THEN** statuses, reason codes, candidates, and provenance ordering match
