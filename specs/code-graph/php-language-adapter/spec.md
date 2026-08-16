# PHP Language Adapter

## Purpose

The PHP language adapter translates PHP namespaces, declarations, Composer mappings, static dependencies, and supported framework loader conventions into shared code-graph facts and relations. This spec owns the complete behavior of the built-in PHP adapter.

## Requirements

### Requirement: Supported files and deterministic analysis

`PhpLanguageAdapter` SHALL handle `.php` files as `php`. It SHALL parse supplied content once through the registered Tree-sitter/ast-grep grammar and return one complete `FileAnalysisDraft` containing namespace, symbols, imports, binding and call facts, reference facts, and compact serializable parser state required for Pass 2 relations.

The adapter MUST NOT execute PHP, autoload project code, or retain parser AST nodes in persisted analysis state. Registered loader rules and run-scoped parser keepalive state MAY be used only within the indexing session.

### Requirement: Declaration extraction and ranges

The adapter SHALL extract functions, classes, interfaces, traits, enums, class/interface/trait methods and properties, plus supported top-level constant declarations. Class constants and enum cases remain unsupported declaration symbols. It SHALL retain the declared namespace separately from the simple symbol name and SHALL map declarations to shared broad kinds without collapsing supported language-specific symbol spaces or member forms.

Each symbol SHALL use the complete parser construct range and exact declared-name `selectionRange` under the shared half-open convention. Attached preceding comments SHALL be retained verbatim. A declaration lacking an authoritative construct or selection range SHALL be omitted rather than approximated.

### Requirement: PHP logical identity and declaring owners

Top-level declarations SHALL use their namespace-qualified module surface. Supported methods and properties SHALL use the logical identity of the syntactically declaring class, interface, or trait as owner. Owner identities SHALL be derived from parser construct containment and mapped before member logical IDs are created; raw parser IDs and optional `SymbolNode.parentId` MUST NOT be used as canonical owners. Any extracted method whose owner cannot be proven SHALL be omitted from logical member facts rather than represented as ownerless.

Same-name methods declared by different owners MUST remain distinct, including compact same-line declarations. Static and instance methods, constructors, properties, and contract signatures SHALL retain distinct member-form or symbol-space evidence whenever the current syntax projection represents it. Logical identities SHALL remain case-preserving; language-complete case-insensitive lookup, class constants, enum cases, and magic property semantics remain unsupported rather than globally lowercased or guessed.

### Requirement: Namespaces, use aliases, and Composer resolution

The adapter SHALL extract namespace declarations and supported class-like `use X as Y` imports. A `use` alias SHALL create a namespace-scoped local binding to its canonical qualified target; it SHALL NOT create a public export or hierarchy edge by itself.

Package identity SHALL come from the nearest bounded Composer `name`. Qualified names SHALL resolve through precomputed Composer PSR-4 mappings using the longest matching prefix and shared indexed-file lookups. Repeated Pass 2 resolution SHALL use cached compact metadata rather than per-candidate filesystem scans.

Composer classmap/files, runtime autoloader mutation, and ambiguous case-sensitive filesystem alternatives SHALL remain unsupported until explicitly modeled.

### Requirement: Static and framework dependency facts

The adapter SHALL extract literal `require`, `require_once`, `include`, and `include_once` dependencies and SHALL drop variable or concatenated expressions unless a registered deterministic rule proves a concrete path. It SHALL retain the current registry-based framework loader support, including the statically recognized CakePHP, CodeIgniter, Yii, Laravel, Symfony, Zend, and equivalent configured class-literal or loader patterns.

Loader facts SHALL produce `IMPORTS` and receiver bindings only when their literal value and indexed candidate paths prove a target. Loaded-instance aliases, explicit constructed instances, and method-local assignments MAY produce `CALLS` within the proven lexical scope. Aliases MUST NOT leak across methods. Runtime service identifiers, arbitrary container lookups, variable loader arguments, and unrelated same-shaped calls SHALL be dropped.

### Requirement: Scoped bindings, calls, types, and construction

The adapter SHALL emit deterministic facts for namespace aliases, callable scopes, typed parameters and returns, typed properties, `new` expressions, `$this`, `self`, `static`, and `parent` receiver forms, explicit instance aliases, and supported framework-managed bindings. It SHALL build `IMPORTS`, `CALLS`, `CONSTRUCTS`, and `USES_TYPE` only when the target is proven by these facts or resolved imports.

The caller SHALL be the innermost enclosing function or method. Reflection, variable class names, dynamic properties, container values, and interprocedural aliases SHALL not produce guessed relations.

### Requirement: PHP hierarchy and provenance evidence

The adapter SHALL extract class and interface `extends` clauses, class `implements` clauses, and trait-use composition when it can preserve PHP semantics. Proven inheritance SHALL emit `EXTENDS`, contract conformance SHALL emit `IMPLEMENTS`, and matching child/contract or child/ancestor members SHALL emit `OVERRIDES` only when both logical owners and member forms are known.

Reference facts SHALL identify child and ancestor, contract, or trait logical owners; the hierarchy/composition kind; applicable source ordering; and ordered provenance steps. They SHALL let the resolver traverse to an owner and then query the requested member under that owner. The reached owner itself MUST NOT be treated as the requested member. Cycles SHALL terminate deterministically.

Trait aliases and `insteadof` conflict adaptation SHALL affect member identity and precedence only when fully parsed and represented. Until then, a trait conflict or adaptation-dependent lookup SHALL remain ambiguous or unresolved and MUST NOT select an arbitrary trait member. A `use` namespace import MUST NOT be confused with trait use.

### Requirement: Public surface and capability truthfulness

Namespace declarations SHALL be addressable through their namespace-qualified logical surfaces. The adapter SHALL not invent module-style public re-export bindings for namespace `use` aliases. It SHALL advertise `hierarchy: true` only while the hierarchy and ordered provenance facts defined here are emitted for supported syntax.

Build-context support SHALL remain false while Composer classmap/files, runtime configuration, and conditional autoload behavior are unsupported. Parse failures, partial framework resolution, and unsupported semantics SHALL be represented through shared coverage rather than name-only inference. Outputs SHALL be deterministic for identical content and context.

## Constraints

- The adapter MUST NOT execute PHP, instantiate framework containers, or invoke Composer autoloaders.
- Runtime service lookup, reflection, variable class names, and speculative trait precedence remain unsupported.
- PHP-specific namespace, loader, ownership, and trait semantics MUST remain inside this adapter.

## Spec Dependencies

- `code-graph:language-adapter` — common adapter port, phases, and capability contract
- `code-graph:symbol-model` — logical symbols, owners, bindings, ranges, and hierarchy evidence
- `code-graph:workspace-integration` — workspace, Composer package, and path boundaries
