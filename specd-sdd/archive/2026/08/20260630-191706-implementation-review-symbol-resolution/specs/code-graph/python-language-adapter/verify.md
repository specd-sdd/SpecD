# Verification: Python Language Adapter

## Requirements

### Requirement: Supported files and deterministic analysis

#### Scenario: Source and stub analysis is reusable

- **WHEN** equivalent `.py` and `.pyi` content is analyzed repeatedly
- **THEN** both map to Python and produce deterministic complete drafts
- **AND** Pass 2 does not execute, import, or reparse either module

### Requirement: Declaration extraction and ranges

#### Scenario: Nested declarations retain parser ranges

- **GIVEN** a module function, a nested class with decorated methods, and module assignments
- **WHEN** symbols are extracted
- **THEN** supported constructs have the expected broad kinds
- **AND** every selection range is contained by its complete parser range
- **AND** nested functions and class assignment members are not approximated as supported declarations

### Requirement: Python logical identity and declaring owners

#### Scenario: Decorated same-name methods preserve owners and forms

- **GIVEN** two classes declare `load`, including instance, class, and static forms
- **WHEN** logical declarations are built
- **THEN** each method uses its class logical owner rather than a syntax parent ID
- **AND** owner and recognized decorator form prevent identity collapse

### Requirement: Imports and package resolution

#### Scenario: Literal and computed imports have different outcomes

- **GIVEN** relative aliases, `import package.module`, a literal dynamic import, and a computed dynamic import
- **WHEN** imports are analyzed and resolved against indexed package layouts
- **THEN** deterministic forms retain their accessible and original names
- **AND** the computed form is dropped without executing Python

### Requirement: Scoped bindings, calls, annotations, and construction

#### Scenario: Annotation-proven receiver wins over runtime alias

- **GIVEN** one annotated parameter call and one monkey-patched attribute call
- **WHEN** scoped facts and relations are built
- **THEN** the annotated target can produce type and call evidence
- **AND** the monkey-patched target does not produce a guessed relation

### Requirement: Python hierarchy and provenance evidence

#### Scenario: Multiple bases preserve owner traversal order

- **GIVEN** a class with two statically resolved bases and an inherited member
- **WHEN** hierarchy facts are built
- **THEN** both owner paths retain declared base order
- **AND** member resolution queries the member under reached owners instead of treating owners as members

#### Scenario: Unsupported MRO choice remains inconclusive

- **GIVEN** selecting one inherited member requires unsupported metaclass or complete C3 behavior
- **WHEN** resolution cannot prove precedence
- **THEN** the result is ambiguous or unresolved rather than arbitrarily selected

### Requirement: Public surface and stub behavior

#### Scenario: Module visibility is not inferred from naming convention

- **GIVEN** a module declaration, an import alias, and unresolved static `__all__`
- **WHEN** public reference facts are built
- **THEN** the alias remains local and no speculative public route is created
- **AND** `.pyi` declarations remain addressable without runtime merging

### Requirement: Capability truthfulness and failure behavior

#### Scenario: Supported inheritance backs the capability

- **GIVEN** a resolvable class base and matching ancestor member
- **WHEN** the adapter reports `hierarchy: true`
- **THEN** hierarchy and ordered provenance facts are present
- **AND** incomplete package coverage remains explicit
