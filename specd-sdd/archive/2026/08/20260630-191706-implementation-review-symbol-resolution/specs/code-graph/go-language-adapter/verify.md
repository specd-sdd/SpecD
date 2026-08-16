# Verification: Go Language Adapter

## Requirements

### Requirement: Supported files and deterministic analysis

#### Scenario: Go analysis does not depend on the toolchain

- **WHEN** the same `.go` content is analyzed in equivalent sessions
- **THEN** the package and complete draft are deterministic
- **AND** no Go compiler or package command is invoked

### Requirement: Declaration extraction and ranges

#### Scenario: Receiver and type declarations retain authoritative ranges

- **GIVEN** functions, receiver methods, structs, interfaces, aliases, vars, and consts
- **WHEN** symbols are extracted
- **THEN** each supported construct has its expected broad kind
- **AND** its exact name selection is contained by the parser construct range

### Requirement: Package identity, exports, and imports

#### Scenario: Import forms and package exports remain distinct

- **GIVEN** uppercase and lowercase declarations plus alias, dot, and blank imports
- **WHEN** bindings are built
- **THEN** only exported package names create public bindings
- **AND** blank and dot imports retain their distinct dependency and binding semantics

### Requirement: Go logical identity and declaring owners

#### Scenario: Receiver types own methods

- **GIVEN** two receiver types declare `Read` and one uses a pointer receiver
- **WHEN** logical declarations are built
- **THEN** each method uses its receiver type's logical identity as owner
- **AND** no syntax `parentId` collapses the methods or pointer/value evidence

### Requirement: Scoped bindings, selectors, construction, and types

#### Scenario: Proven package selector differs from interface dispatch

- **GIVEN** one selector uses a resolved package alias and another uses an interface value with unknown concrete type
- **WHEN** relations are built
- **THEN** the package selector may produce deterministic call/type evidence
- **AND** the unknown dispatch produces no guessed concrete call

### Requirement: Go embedding and hierarchy provenance

#### Scenario: Embedded interface member follows owner path

- **GIVEN** a local interface directly embeds another local interface that declares the requested signature
- **WHEN** hierarchy facts are built and the member is resolved
- **THEN** provenance retains the embedding path and queries the member under the embedded owner
- **AND** the reached interface owner is not treated as the requested member

#### Scenario: Struct promotion remains unsupported

- **GIVEN** resolving a member depends on an embedded struct field or cross-file promotion depth
- **WHEN** hierarchy facts are built
- **THEN** no speculative hierarchy route or promoted member is emitted

### Requirement: Proven interface satisfaction

#### Scenario: Complete method set is required

- **GIVEN** one struct satisfies every method of a known interface and another misses one method
- **WHEN** implementation facts are built
- **THEN** only the complete same-file method set produces an owner-level `IMPLEMENTS` fact and ordered traversal evidence
- **AND** an empty or unknown interface set proves nothing
- **AND** no member-level `OVERRIDES` relation is invented

### Requirement: Build-context boundary

#### Scenario: Build alternatives remain unsupported

- **GIVEN** target selection depends on build tags, GOOS, `replace`, or `go.work`
- **WHEN** the adapter lacks that consumed context
- **THEN** `buildContext` is false
- **AND** no arbitrary file or package is selected

### Requirement: Capability truthfulness and failure behavior

#### Scenario: Embedding evidence backs hierarchy support

- **GIVEN** a resolvable embedded interface and member
- **WHEN** the adapter reports `hierarchy: true`
- **THEN** shared hierarchy and ordered provenance facts are emitted
- **AND** partial package coverage is not replaced by name-only inference
