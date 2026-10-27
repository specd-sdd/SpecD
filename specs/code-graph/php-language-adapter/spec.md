# PHP Language Adapter

## Purpose

The PHP language adapter translates PHP namespaces, declarations, Composer mappings, static dependencies, and supported framework loader conventions into shared code-graph facts and relations. This spec owns the complete behavior of the built-in PHP adapter.

## Requirements

### Requirement: Supported files and deterministic analysis

`PhpLanguageAdapter` SHALL handle `.php` files as `php`. It SHALL parse supplied content once through the registered Tree-sitter/ast-grep grammar and return one complete `FileAnalysisDraft` containing namespace, symbols, imports, binding and call facts, reference facts, and compact serializable parser state required for Pass 2 relations.

The adapter MUST NOT execute PHP, autoload project code, or retain parser AST nodes in persisted analysis state. Registered loader rules MAY be used only within the indexing session. The adapter SHALL register the parse result in the parser-resource scope of the `IndexSession` (`session.parserResources`), as defined by Requirement: Parser-owned resource registration of `code-graph:language-adapter`. The registration SHALL happen inside `analyzeFile`, immediately after the content is parsed and before any traversal of the parse result, so that the resource is released at the end of the file's epoch even when the analysis throws. The adapter MUST NOT keep parser objects in adapter-private session state, in adapter-instance fields, or in the returned draft.

### Requirement: PHP parser-authoritative structural extraction

The adapter SHALL derive type declarations, traits and adaptations, parameters and return types, namespace uses, require/include expressions, calls, construction, hierarchy clauses, and literal loader invocations from PHP parser nodes whenever the grammar represents them. Brace counting or whole-source regular expressions MUST NOT determine a declaration body, scope, call, construction, or dependency.

CakePHP, CodeIgniter, Yii, Laravel, Zend, Drupal, and other registered framework rules MAY interpret known callee names and literal argument conventions only after the adapter has established the call expression, receiver or static target, arguments, and containing scope from parser nodes. A matching string in a comment, literal, heredoc, or unrelated expression MUST NOT emit a loader, binding, import, or call fact.

Pass 2 alias, construction, member-call, require/include, and loader relation extraction SHALL consume the immutable parser-derived facts produced during the file's analysis. It MUST NOT depend on a parsed syntax tree remaining available after the file's analysis has finished, and it MUST NOT scan callable body text with regular expressions to rediscover those constructs.

Parsing `composer.json` and bounded PSR-4 metadata MAY remain non-AST metadata processing, but that metadata SHALL be prepared once in run-scoped adapter session state before per-file Pass 2 analysis. Pass 2 MUST NOT read the filesystem or consult mutable adapter-instance caches whose contents can leak between indexing sessions. Token extraction MAY operate inside a parser-proven type or literal node, but neither exception permits unbounded reconstruction of PHP source structure.

Namespace uses, require/include expressions, and registered loader calls SHALL emit dependency relations only when resolution evidence identifies a target. The adapter MUST NOT fall back to the first loader candidate when no candidate resolves.

An imported `extends`, `implements`, or trait target SHALL emit its physical hierarchy relation together with exactly one matching shared hierarchy reference fact carrying the parser-derived range of the written `extends`, `implements`, or trait-use name, resolution provenance, and resolved target.

### Requirement: Declaration extraction and ranges

The adapter SHALL extract functions, classes, interfaces, traits, enums, class/interface/trait methods and properties, top-level constant declarations, class constants, and enum cases.

Properties, class constants, and enum cases SHALL be extracted as `SymbolKind.Property`. It SHALL retain the declared namespace separately from the simple symbol name and SHALL map declarations to shared broad kinds without collapsing supported language-specific symbol spaces or member forms.

Each symbol SHALL use the complete parser construct range and exact declared-name `selectionRange` under the shared half-open convention. Attached preceding comments SHALL be retained verbatim. A declaration lacking an authoritative construct or selection range SHALL be omitted rather than approximated.

### Requirement: PHP logical identity and declaring owners

Top-level declarations SHALL use their namespace-qualified module surface. Supported methods, properties, class constants, and enum cases SHALL use the logical identity of the syntactically declaring class, interface, trait, or enum as owner, and their `parentId` SHALL be set to that enclosing container's symbol ID. Owner identities SHALL be derived from parser construct containment and mapped before member logical IDs are created; raw parser IDs and optional `SymbolNode.parentId` MUST NOT be used as canonical owners. Any extracted method whose owner cannot be proven SHALL be omitted from logical member facts rather than represented as ownerless.

Same-name methods declared by different owners MUST remain distinct, including compact same-line declarations. Static and instance methods, constructors, properties, and contract signatures SHALL retain distinct member-form or symbol-space evidence whenever the current syntax projection represents it. Logical identities SHALL remain case-preserving; language-complete case-insensitive lookup and magic property semantics remain unsupported rather than globally lowercased or guessed.

### Requirement: Namespaces, use aliases, and Composer resolution

The adapter SHALL extract namespace declarations and supported class-like `use X as Y` imports. A `use` alias SHALL create a namespace-scoped local binding to its canonical qualified target; it SHALL NOT create a public export or hierarchy edge by itself.

The adapter SHALL provide the `packageResolution` and `qualifiedNameResolution` facets. `identity` SHALL read the Composer `name` from the nearest `composer.json` found by the package-root search defined in "Package resolution facet" of `code-graph:language-adapter`; the search is bounded by the repository root of the code root, and a `composer.json` without `name` is skipped with a diagnostic for identity purposes while the walk continues within that bound. `prepare` SHALL use the same named-manifest search first (falling back to the nearest nameless `composer.json` only when no named manifest exists within the repository bound), read the workspace's chosen `composer.json` exactly once per call from a single JSON parse (`identity` MAY read the same manifest separately), and store its package name, canonical code root, and canonicalized PSR-4 prefix map as compact immutable data. Selection of the named manifest and extraction of its prepared fields MUST reuse that single parsed value; a predicate or fallback search MUST NOT parse or read the chosen file a second time. The same single-read/single-parse rule applies when the chosen manifest is the nameless fallback. The PSR-4 map SHALL merge `autoload` and `autoload-dev`: when both declare the same prefix, the map keeps every directory of both, with the `autoload` directories before the `autoload-dev` directories, and no directory is lost. `matchSpecifier` SHALL resolve a qualified name to the package whose PSR-4 prefix is the longest match among the prepared maps of all workspaces. `entrySurface` SHALL map the qualified name through the matching prefixes of the owning package, longest prefix first and the directories of one prefix in map order, and return one candidate class file per prefix and directory, using only the prepared canonical paths and shared indexed-file lookups with no filesystem access (including no `realpathSync`). The first returned candidate that is an indexed file is the file the import depends on, as Composer's autoloader selects the first file that exists; later candidates are fallbacks and do not add dependencies.

A `use` import SHALL first resolve through the exact fully qualified name map: a qualified name is the language's symbol identity, so an exact match in any workspace is the target. When the map has no exact match, the import SHALL call the shared `packageEntryFiles` helper and record the PSR-4 class file of the imported qualified name, in the workspace that owns the longest prefix, as a file dependency. The adapter publishes no public bindings, so it MUST NOT resolve a symbol target through `resolvePackageExport`. A short class name MUST NOT be matched across workspaces without the qualified name. Repeated Pass 2 resolution SHALL use the prepared compact metadata and perform no filesystem I/O. `qualifiedNameResolution.resolveToPath(qualifiedName, codeRoot, session)` SHALL read the PSR-4 map prepared in the session, not the filesystem, and MUST NOT fall back to an absolute-path lookup of an unindexed file.

A workspace whose `composer.json` has no `name` has no package identity, but it SHALL still resolve qualified names of its own namespaces through its own prepared PSR-4 map (own-PSR-4 fallback). The fallback applies only inside that workspace, resolves only to indexed files by workspace-relative id and never to an absolute path, and a file in an `autoload-dev` directory or classified as a test is a target only when the importing file is itself a test file.

Composer classmap/files, runtime autoloader mutation, and ambiguous case-sensitive filesystem alternatives SHALL remain unsupported until explicitly modeled.

Unresolved imports SHALL return a diagnostic with the reason reported by the helper (or `not-exported` when resolved candidates are excluded for a non-test importer). The adapter returns no `import:package` step, because its symbol targets come from the exact qualified-name map rather than from public bindings.

### Requirement: Resolution manifests

`resolutionManifests()` SHALL return exactly `['composer.json']`.

That basename covers both the Composer package `name` and the PSR-4 map the adapter reads in `packageResolution.prepare`. The adapter MUST NOT declare any other resolution manifest.

### Requirement: Static and framework dependency facts

The adapter SHALL extract literal `require`, `require_once`, `include`, and `include_once` dependencies and SHALL drop variable or concatenated expressions unless a registered deterministic rule proves a concrete path. It SHALL retain the current registry-based framework loader support, including the statically recognized CakePHP, CodeIgniter, Yii, Laravel, Symfony, Zend, and equivalent configured class-literal or loader patterns.

Loader facts SHALL produce `IMPORTS` and receiver bindings only when their literal value and indexed candidate paths prove a target. Loaded-instance aliases, explicit constructed instances, and method-local assignments MAY produce `CALLS` within the proven lexical scope. Aliases MUST NOT leak across methods. Runtime service identifiers, arbitrary container lookups, variable loader arguments, and unrelated same-shaped calls SHALL be dropped.

### Requirement: Scoped bindings, calls, types, and construction

The adapter SHALL emit deterministic facts for namespace aliases, callable scopes, typed parameters and returns, typed properties, `new` expressions, `$this`, `self`, `static`, and `parent` receiver forms, explicit instance aliases, and supported framework-managed bindings. It SHALL build `IMPORTS`, `CALLS`, `CONSTRUCTS`, and `USES_TYPE` only when the target is proven by these facts or resolved imports.

The caller SHALL be the innermost enclosing function or method. Reflection, variable class names, dynamic properties, container values, and interprocedural aliases SHALL not produce guessed relations.

### Requirement: PHP caller containment and declaration classification

The adapter SHALL select a call's caller as the innermost supported function, method, or explicitly modeled closure whose complete parser range contains the call. Namespace declarations, classes, traits, interfaces, enums, properties, local variables, or unrelated declarations that only precede the call MUST NOT be selected as callers.

Parameters, namespace aliases, `$this`, local assignments, loaded-instance aliases, and framework-managed names SHALL be lexical bindings. They MAY support deterministic receiver resolution but MUST NOT become independent logical targets unless a PHP declaration rule proves an addressable semantic declaration.

Top-level functions and type declarations SHALL use their namespace-qualified surface; members SHALL use their canonical declaring type owner. Closures or callable variables that receive physical declaration evidence SHALL remain lexical or physical-only unless the adapter defines a deterministic scope-qualified semantic identity. Same-name declarations in distinct namespaces, owners, or lexical scopes MUST remain distinct, and PHP declarations MUST NOT be grouped merely because their simple names match.

### Requirement: PHP hierarchy and provenance evidence

The adapter SHALL extract class and interface `extends` clauses, class `implements` clauses, and trait-use composition when it can preserve PHP semantics. Proven inheritance SHALL emit `EXTENDS`, contract conformance SHALL emit `IMPLEMENTS`, and matching child/contract or child/ancestor members SHALL emit `OVERRIDES` only when both logical owners and member forms are known.

Reference facts SHALL identify child and ancestor, contract, or trait logical owners; the hierarchy/composition kind; applicable source ordering; and ordered provenance steps. They SHALL let the resolver traverse to an owner and then query the requested member under that owner. The reached owner itself MUST NOT be treated as the requested member. Cycles SHALL terminate deterministically.

Trait aliases and `insteadof` conflict adaptation SHALL affect member identity and precedence only when fully parsed and represented. Until then, a trait conflict or adaptation-dependent lookup SHALL remain ambiguous or unresolved and MUST NOT select an arbitrary trait member. A `use` namespace import MUST NOT be confused with trait use.

### Requirement: Public surface and capability truthfulness

Namespace declarations SHALL be addressable through their namespace-qualified logical surfaces. The adapter SHALL not invent module-style public re-export bindings for namespace `use` aliases. It SHALL advertise `hierarchy: true` only while the hierarchy and ordered provenance facts defined here are emitted for supported syntax.

Build-context support SHALL remain false while Composer classmap/files, runtime configuration, and conditional autoload behavior are unsupported. Parse failures, partial framework resolution, and unsupported semantics SHALL be represented through shared coverage rather than name-only inference. Outputs SHALL be deterministic for identical content and context.

### Requirement: Bounded PHP member classification and compact state

The adapter SHALL inspect each class, interface, enum, or trait body at most once to associate its direct member declarations with extracted symbols and to derive constructor, static, instance, property, and method semantics. Resolving one direct member MUST NOT recursively traverse the complete owner or descend into function or method bodies.

Direct member association SHALL use parser-backed declaration identity including owner containment, declared name, kind, and source position. A method of a nested or unrelated class-like declaration MUST NOT be classified as a member of the outer owner, including when names or source lines coincide.

`__construct` SHALL remain a constructor. Static dispatch SHALL be proven by the direct method declaration's `static_modifier`; absence of that parser evidence SHALL retain instance dispatch. Existing class-like ownership, trait-use, extends, implements, property, range, and hierarchy semantics SHALL remain unchanged.

Parser-specific state returned from analysis SHALL contain only compact facts consumed by later phases. The adapter MUST NOT retain full function or method source text, or an unconsumed scope collection containing that text, in `FileAnalysis.parserState`.

## Constraints

- The adapter MUST NOT execute PHP, instantiate framework containers, or invoke Composer autoloaders.
- Runtime service lookup, reflection, variable class names, and speculative trait precedence remain unsupported.
- PHP-specific namespace, loader, ownership, and trait semantics MUST remain inside this adapter.

## Spec Dependencies

- `code-graph:language-adapter` — common adapter port, phases, and capability contract
- `code-graph:symbol-model` — logical symbols, owners, bindings, ranges, and hierarchy evidence
- `code-graph:workspace-integration` — workspace, Composer package, and path boundaries
