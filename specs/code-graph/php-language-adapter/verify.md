# Verification: PHP Language Adapter

## Requirements

### Requirement: Supported files and deterministic analysis

#### Scenario: PHP analysis is static and reusable

- **WHEN** identical `.php` content is analyzed in equivalent sessions
- **THEN** namespace and complete draft facts are deterministic
- **AND** Pass 2 neither executes PHP nor invokes an autoloader

### Requirement: Declaration extraction and ranges

#### Scenario: Class-like and member declarations retain parser ranges

- **GIVEN** functions, classes, interfaces, traits, enums, methods, properties, and top-level constants
- **WHEN** symbols are extracted
- **THEN** supported declarations have their expected broad kinds
- **AND** exact name selections are contained by complete parser construct ranges
- **AND** class constants and enum cases are not approximated as supported declaration symbols

### Requirement: PHP logical identity and declaring owners

#### Scenario: Namespace and class owners prevent member collapse

- **GIVEN** two namespaced classes each declare `save`, including static and instance forms
- **WHEN** logical declarations are built
- **THEN** each member uses its class logical owner rather than a syntax parent ID
- **AND** member form preserves distinct case-preserving identities
- **AND** the adapter does not claim language-complete case-insensitive lookup

### Requirement: Namespaces, use aliases, and Composer resolution

#### Scenario: Namespace alias is local, not public or hierarchical

- **GIVEN** PSR-4 resolves `App\Service` and source declares `use App\Service as Svc`
- **WHEN** reference facts are built
- **THEN** `Svc` is a namespace-scoped local binding to the canonical target
- **AND** no public binding or hierarchy edge is created by the import

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
