# Verification: Python Language Adapter

## Requirements

### Requirement: Supported files and deterministic analysis

#### Scenario: Source and stub analysis is reusable

- **WHEN** equivalent `.py` and `.pyi` content is analyzed repeatedly
- **THEN** both map to Python and produce deterministic complete drafts
- **AND** Pass 2 does not execute, import, or reparse either module

### Requirement: Python parser-authoritative structural extraction

#### Scenario: Multiline Python syntax uses node ancestry

- **GIVEN** imports, annotations, class bases, aliases, decorators, and calls use multiline or nested syntax
- **AND** strings and comments contain equivalent textual patterns
- **WHEN** the adapter analyzes the file
- **THEN** structural facts follow Python parser nodes, fields, ranges, and ancestry
- **AND** strings and comments produce no lookalike facts

#### Scenario: Pyproject parsing does not bypass source parsing

- **GIVEN** package metadata is read textually from `pyproject.toml`
- **WHEN** Python source in that package is analyzed
- **THEN** the metadata may affect package resolution
- **AND** declarations, scopes, calls, and dependencies still require Python AST evidence

#### Scenario: Unresolved Python import produces no relation

- **GIVEN** a static or literal dynamic import has syntactic candidates but none resolves
- **WHEN** import relations are emitted
- **THEN** no relation targets the first candidate
- **AND** unresolved evidence does not masquerade as a resolved dependency

#### Scenario: Imported Python base retains provenance

- **GIVEN** a class base resolves through an import
- **WHEN** hierarchy evidence is emitted
- **THEN** the physical hierarchy relation and shared hierarchy reference fact identify the same target
- **AND** the fact retains the base-expression range and resolution provenance

### Requirement: Declaration extraction and ranges

#### Scenario: Nested declarations retain parser ranges

- **GIVEN** a module function, a nested class with decorated methods, and module assignments
- **WHEN** symbols are extracted
- **THEN** supported constructs have the expected broad kinds
- **AND** every selection range is contained by its complete parser range
- **AND** nested functions inside function bodies are not approximated as supported declarations

#### Scenario: Class attributes and dataclass fields extract as Property kind

- **GIVEN** a Python class declaring class attributes, dataclass fields, and Protocol field annotations
- **WHEN** symbols are extracted
- **THEN** each field and class attribute is assigned `SymbolKind.Property`
- **AND** its `parentId` is set to the enclosing class symbol ID

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

### Requirement: Resolution manifests

#### Scenario: Python declares only pyproject.toml

- **WHEN** the Python adapter reports `resolutionManifests()`
- **THEN** the result is exactly `['pyproject.toml']`
- **AND** `setup.cfg` and `setup.py` are not included

#### Scenario: Python identity ignores an earlier table name

- **GIVEN** `[tool.poetry]` declares `name = "poetry-name"` before `[project]` declares `name = "project-name"`
- **WHEN** the Python adapter reads package identity from that file
- **THEN** the result is `project-name`

### Requirement: Scoped bindings, calls, annotations, and construction

#### Scenario: Annotation-proven receiver wins over runtime alias

- **GIVEN** one annotated parameter call and one monkey-patched attribute call
- **WHEN** scoped facts and relations are built
- **THEN** the annotated target can produce type and call evidence
- **AND** the monkey-patched target does not produce a guessed relation

#### Scenario: Decorators and field annotations emit relations

- **GIVEN** a function decorated with a resolvable decorator and a dataclass field annotated with a known type
- **WHEN** relations are built
- **THEN** the decorator emits a `CALLS` relation
- **AND** the field annotation emits a `USES_TYPE` relation to the referenced type symbol

### Requirement: Python caller containment and declaration classification

#### Scenario: Local assignment does not replace the function caller

- **GIVEN** a Python function assigns the result of `Service.run()` to a local name
- **WHEN** the call fact is extracted
- **THEN** the containing function is the caller
- **AND** the assignment target remains a lexical binding

#### Scenario: Class decorator and method call use different containers

- **GIVEN** a class has a resolvable class decorator and a method containing a call
- **WHEN** caller facts are extracted
- **THEN** the class is used only for the class-level decorator call
- **AND** the method is used for the call inside its body

#### Scenario: Unsupported nested function is not flattened into module identity

- **GIVEN** two outer functions each contain an unsupported nested function named `work`
- **WHEN** declarations are analyzed
- **THEN** no ownerless module-level logical target named `work` is fabricated

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
