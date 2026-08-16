# Verification: TypeScript Language Adapter

## Requirements

### Requirement: Supported languages and deterministic analysis

#### Scenario: One parse produces complete reusable analysis

- **GIVEN** equivalent `.ts`, `.tsx`, `.js`, and `.jsx` inputs
- **WHEN** each file is analyzed twice with equivalent session context
- **THEN** language selection and every persisted fact are deterministic
- **AND** Pass 2 completes without reparsing source or retaining AST nodes in the file draft

### Requirement: Declaration extraction and ranges

#### Scenario: Extended declarations retain authoritative ranges

- **GIVEN** a multiline class with an arrow field, object method, destructuring, and CommonJS assignment
- **WHEN** symbols are extracted
- **THEN** every supported declaration has its expected broad kind
- **AND** each name selection is contained by its parser-derived complete construct range

### Requirement: Logical identity and declaring owners

#### Scenario: Same-name methods remain owner-qualified

- **GIVEN** two classes each declare an instance method named `save` and one declares a static `save`
- **WHEN** reference facts are built
- **THEN** each member points to its class logical owner rather than a syntax parent ID
- **AND** owner and member form keep all three logical identities distinct

#### Scenario: Unsupported method-like declarations remain location-backed

- **GIVEN** an object-literal method and a prototype assignment without a supported logical owner
- **WHEN** reference facts are built
- **THEN** both declarations remain available as location-backed symbols
- **AND** neither produces an ownerless logical member fact or package-level public binding

### Requirement: Imports, exports, and public bindings

#### Scenario: Competing barrel routes remain competing bindings

- **GIVEN** one barrel re-exports the same name and space from two modules
- **WHEN** Pass 2 links the routes
- **THEN** both independently identified bindings survive
- **AND** a variable dynamic import produces no binding or dependency

### Requirement: Scoped bindings, calls, types, and construction

#### Scenario: Only proven receiver calls become relations

- **GIVEN** one typed constructor alias and one computed runtime receiver call
- **WHEN** relations are built
- **THEN** the typed construction and member call produce deterministic facts and relations
- **AND** the computed receiver call is dropped

### Requirement: TypeScript hierarchy and provenance evidence

#### Scenario: Inherited member resolution has owner traversal evidence

- **GIVEN** a class extends an imported base and implements a local interface
- **AND** the base declares the requested member
- **WHEN** reference facts and relations are built
- **THEN** `EXTENDS`, `IMPLEMENTS`, and applicable `OVERRIDES` agree with hierarchy facts
- **AND** provenance reaches the base owner before selecting the member under that owner

### Requirement: Package and build-context boundary

#### Scenario: Unsupported project selection is not guessed

- **GIVEN** resolution depends on `tsconfig` paths or a conditional package export
- **WHEN** no consumed build context selects a route
- **THEN** `buildContext` is false
- **AND** the result remains unsupported, unresolved, or ambiguous

### Requirement: Capability truthfulness and failure behavior

#### Scenario: Hierarchy capability requires emitted facts

- **GIVEN** supported resolvable `extends` syntax
- **WHEN** the adapter reports `hierarchy: true`
- **THEN** non-empty ordered hierarchy and provenance evidence is emitted
- **AND** parse failure is reported as coverage rather than a same-name guess
