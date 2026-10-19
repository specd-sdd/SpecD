# Verification: PHP Language Adapter

## Requirements

### Requirement: Supported files and deterministic analysis

#### Scenario: PHP analysis is static and reusable

- **WHEN** identical `.php` content is analyzed in equivalent sessions
- **THEN** namespace and complete draft facts are deterministic
- **AND** Pass 2 neither executes PHP nor invokes an autoloader

### Requirement: PHP parser-authoritative structural extraction

#### Scenario: Framework call requires a proven PHP call node

- **GIVEN** comments, strings, and heredocs contain text matching registered CakePHP, CodeIgniter, Yii, Laravel, Zend, or Drupal loader patterns
- **AND** one real registered loader invocation has parser-proven callee and literal arguments
- **WHEN** framework dependency facts are extracted
- **THEN** only the real call node may produce loader, binding, import, or call facts
- **AND** the textual lookalikes produce none

#### Scenario: PHP bodies and hierarchy do not use brace scans

- **GIVEN** compact and multiline PHP declarations contain nested braces, traits, adaptations, types, calls, and hierarchy clauses
- **WHEN** the adapter analyzes them
- **THEN** bodies, owners, scopes, types, calls, and hierarchy evidence follow parser nodes and ancestry
- **AND** raw brace counts do not define declaration ranges

#### Scenario: Composer metadata remains separate

- **GIVEN** package and PSR-4 metadata is read from `composer.json`
- **WHEN** PHP source facts are extracted
- **THEN** the metadata may qualify deterministic resolution
- **AND** source declarations and dependencies still require PHP AST evidence

#### Scenario: Pass 2 uses AST facts and performs no filesystem I/O

- **GIVEN** aliases, constructions, and member calls appear in real PHP nodes and as lookalike text in strings or heredocs
- **AND** PSR-4 maps were prepared in run-scoped session state
- **WHEN** Pass 2 relation extraction runs
- **THEN** only parser-proven constructs emit relations
- **AND** no callable-body regex scan or filesystem metadata read occurs
- **AND** a second session cannot observe mutable cache state from the first

#### Scenario: Unresolved PHP loader emits no guessed relation

- **GIVEN** a parser-proven loader call has candidate targets but none resolves
- **WHEN** loader and import relations are emitted
- **THEN** no relation targets the first candidate
- **AND** unresolved evidence remains non-relational

#### Scenario: Imported PHP hierarchy retains provenance

- **GIVEN** an imported parent, interface, or trait resolves deterministically
- **WHEN** hierarchy evidence is emitted
- **THEN** the physical hierarchy relation and shared hierarchy reference fact identify the same target
- **AND** the fact retains the written clause-name range and resolution provenance

### Requirement: Declaration extraction and ranges

#### Scenario: Class-like and member declarations retain parser ranges

- **GIVEN** functions, classes, interfaces, traits, enums, methods, properties, and top-level constants
- **WHEN** symbols are extracted
- **THEN** supported declarations have their expected broad kinds
- **AND** exact name selections are contained by complete parser construct ranges

#### Scenario: Properties, class constants, and enum cases extract as Property kind

- **GIVEN** a PHP class declaring properties and class constants, and a PHP enum declaring enum cases
- **WHEN** symbols are extracted
- **THEN** each property, class constant, and enum case is assigned `SymbolKind.Property`
- **AND** its `parentId` is set to the enclosing class or enum symbol ID

### Requirement: PHP logical identity and declaring owners

#### Scenario: Namespace and class owners prevent member collapse

- **GIVEN** two namespaced classes each declare `save`, including static and instance forms
- **WHEN** logical declarations are built
- **THEN** each member uses its class logical owner rather than a syntax parent ID
- **AND** member form preserves distinct case-preserving identities
- **AND** the adapter does not claim language-complete case-insensitive lookup

#### Scenario: Properties and class constants have container logical owner and parentId

- **GIVEN** a PHP class declaring properties and class constants
- **WHEN** logical member declarations are built
- **THEN** each property and class constant has the enclosing class as its logical owner and `parentId`

### Requirement: Namespaces, use aliases, and Composer resolution

#### Scenario: Namespace alias is local, not public or hierarchical

- **GIVEN** PSR-4 resolves `App\Service` and source declares `use App\Service as Svc`
- **WHEN** reference facts are built
- **THEN** `Svc` is a namespace-scoped local binding to the canonical target
- **AND** no public binding or hierarchy edge is created by the import

### Requirement: Resolution manifests

#### Scenario: PHP declares only composer.json

- **WHEN** the PHP adapter reports `resolutionManifests()`
- **THEN** the result is exactly `['composer.json']`

### Requirement: Static and framework dependency facts

#### Scenario: Literal loader stays scoped while dynamic loader is dropped

- **GIVEN** a registered literal framework loader and a variable-argument lookalike
- **WHEN** dependency and alias facts are built
- **THEN** only the literal resolved target produces imports and scoped aliases
- **AND** aliases do not leak into another method

### Requirement: Scoped bindings, calls, types, and construction

#### Scenario: Explicit instance call is proven without container guessing

- **GIVEN** an explicit `new` alias and a runtime service-container lookup
- **WHEN** calls and type relations are built
- **THEN** the explicit instance can produce construction, type, and call evidence
- **AND** the runtime service lookup produces no guessed relation

### Requirement: PHP caller containment and declaration classification

#### Scenario: Method-local binding is not the caller

- **GIVEN** a PHP method contains an assignment or framework alias followed by a call
- **WHEN** caller identity is extracted
- **THEN** the containing method is the caller
- **AND** the assignment or alias remains lexical evidence rather than a callable declaration

#### Scenario: Compact declarations retain distinct owners

- **GIVEN** multiple PHP methods or classes share a source line
- **WHEN** containment and ownership are evaluated
- **THEN** exact parser ranges and columns select the enclosing callable
- **AND** declarations with distinct owners remain distinct

#### Scenario: Closures require proven semantic identity

- **GIVEN** a closure or local callable is observed without a stable language-level declaration identity
- **WHEN** logical identity is constructed
- **THEN** its physical and lexical evidence is preserved
- **AND** no stable semantic declaration identity is invented

### Requirement: PHP hierarchy and provenance evidence

#### Scenario: Inheritance and contract members retain owner paths

- **GIVEN** a class extends a resolved base, implements an interface, and overrides `save`
- **WHEN** hierarchy facts and relations are built
- **THEN** `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES` agree with ordered owner provenance
- **AND** resolution queries `save` under reached owners rather than treating owners as members

#### Scenario: Trait adaptation gap remains inconclusive

- **GIVEN** two traits compete and selection depends on unsupported `insteadof` or alias adaptation
- **WHEN** the composed member is resolved
- **THEN** no arbitrary trait member is selected

### Requirement: Public surface and capability truthfulness

#### Scenario: Hierarchy capability requires shared evidence

- **GIVEN** supported resolvable class inheritance
- **WHEN** the adapter reports `hierarchy: true`
- **THEN** non-empty hierarchy and provenance facts are emitted
- **AND** unsupported Composer or trait behavior remains explicit coverage
