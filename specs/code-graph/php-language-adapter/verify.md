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

#### Scenario: Unindexed qualified name records the PSR-4 file dependency

- **GIVEN** workspace `billing` has `composer.json` PSR-4 `Acme\\Billing\\` mapped to `src/` and indexes `src/Invoice.php`
- **AND** workspace `app` contains `use Acme\Billing\Invoice;` and no class with that exact qualified name is registered
- **WHEN** imports are resolved
- **THEN** the file imports `billing:src/Invoice.php`
- **AND** no symbol target and no `import:package` step is produced

#### Scenario: Longest prefix across workspaces wins

- **GIVEN** `Acme\\` maps to workspace `shared` and `Acme\\Billing\\` maps to workspace `billing`
- **WHEN** `Acme\Billing\Invoice` is resolved
- **THEN** the owning workspace is `billing`

#### Scenario: Exact qualified name identity wins

- **GIVEN** a class declared with the qualified name `Acme\Billing\Invoice` in any workspace
- **WHEN** `use Acme\Billing\Invoice;` is resolved
- **THEN** the import targets that class through the exact qualified-name map

#### Scenario: Same short class name in another workspace is not used

- **GIVEN** workspace `legacy` declares a class `Invoice` in a different namespace
- **WHEN** `use Acme\Billing\Invoice;` is resolved
- **THEN** the import never targets `legacy`'s `Invoice`

#### Scenario: Qualified name with no matching prefix stays unresolved

- **GIVEN** `use Vendor\Lib\Foo;` and no workspace maps `Vendor\\Lib\\`
- **WHEN** imports are resolved
- **THEN** nothing is persisted and the import is counted in `importDiagnostics.externalPackageImports`, not reported as a failure

#### Scenario: Pass 2 performs no filesystem read

- **GIVEN** a run with several PHP workspaces whose `composer.json` files are deleted after `prepare` ran
- **WHEN** Pass 2 resolves `use` imports and `resolveToPath` is called
- **THEN** resolution still succeeds from the prepared PSR-4 maps
- **AND** an unindexed file is never targeted

#### Scenario: Prepare parses composer.json once

- **GIVEN** a workspace whose selected `composer.json` is named
- **WHEN** `prepare` runs
- **THEN** the selected file is read exactly once and parsed exactly once
- **AND** package-name selection and PSR-4 extraction reuse that parsed value

#### Scenario: Nameless Composer fallback is also read and parsed once

- **GIVEN** a workspace whose bounded search selects a nameless `composer.json` for its own PSR-4 fallback
- **WHEN** `prepare` runs
- **THEN** the selected file is read exactly once and parsed exactly once
- **AND** the fallback map is extracted from that same parsed value

#### Scenario: autoload and autoload-dev share a prefix

- **GIVEN** `autoload` maps `App\` to `src/` and `autoload-dev` maps `App\` to `tests/`
- **WHEN** the PSR-4 map is prepared
- **THEN** the prefix `App\` keeps `src/` then `tests/`
- **AND** no directory is lost

#### Scenario: Candidates follow the longest prefix first

- **GIVEN** prefixes `App\` and `App\Http\` and the name `App\Http\Kernel`
- **WHEN** `entrySurface` runs
- **THEN** the candidate for `App\Http\` comes before the one for `App\`
- **AND** the import depends only on the first candidate that is an indexed file

#### Scenario: Own PSR-4 fallback without a Composer name

- **GIVEN** a workspace whose `composer.json` has no `name` and maps `App\` to `src/`
- **WHEN** a file in that workspace imports `App\Models\User`
- **THEN** the import resolves through the workspace's own PSR-4 map to an indexed file

#### Scenario: Own PSR-4 fallback never returns a test file for production code

- **GIVEN** an `autoload-dev` directory containing the imported class and a production importer
- **WHEN** the own fallback runs
- **THEN** the test file is not the target

#### Scenario: Own PSR-4 fallback never uses an absolute path

- **GIVEN** a qualified name whose mapped file is not an indexed file
- **WHEN** the own fallback runs
- **THEN** the import stays unresolved and no absolute-path lookup occurs

#### Scenario: Prepare prefers named composer.json over nearest nameless composer.json

- **GIVEN** a workspace whose code root contains a nameless `composer.json` and whose parent inside the repository contains a named `composer.json`
- **WHEN** `identity` and `prepare` run for that workspace
- **THEN** both select the named `composer.json` in the parent directory

#### Scenario: entrySurface performs no filesystem access during Pass 2

- **GIVEN** prepared PSR-4 maps with canonicalized paths
- **WHEN** `entrySurface` or `resolveToPath` runs in Pass 2
- **THEN** no filesystem calls (including `realpathSync`) are performed

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

### Requirement: Bounded PHP member classification and compact state

#### Scenario: Large class body is not traversed per method

- **GIVEN** a generated PHP class contains hundreds of methods with large nested bodies
- **AND** deterministic instrumentation records visits used for owner-level member classification
- **WHEN** the adapter analyzes the file
- **THEN** the class declaration list is indexed once
- **AND** method bodies are not visited to determine constructor or static dispatch
- **AND** adding method-body statements without adding members does not multiply member-classification visits by the method count

#### Scenario: Direct and nested declarations retain their own semantics

- **GIVEN** an outer class, nested or anonymous class-like syntax, repeated method names, same-line declarations, a static method, and `__construct`
- **WHEN** members are associated with owners
- **THEN** only direct declarations belong to each owner
- **AND** the static method has static dispatch
- **AND** `__construct` remains a constructor
- **AND** equal names and lines do not cross owner boundaries

#### Scenario: Analysis retains no unconsumed routine source

- **GIVEN** PHP functions and methods contain large bodies
- **WHEN** `analyzeFile` returns its compact parser state
- **THEN** the state contains no `scopes` collection with full routine text
- **AND** import resolution and relation building produce the same facts without that state
