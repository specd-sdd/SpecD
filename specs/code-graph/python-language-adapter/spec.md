# Python Language Adapter

## Purpose

The Python language adapter translates Python source and stub syntax into shared code-graph symbols, bindings, reference evidence, and relations. This spec owns the complete behavior of the built-in Python adapter.

## Requirements

### Requirement: Supported files and deterministic analysis

`PythonLanguageAdapter` SHALL handle `.py` and `.pyi` files as `python`. It SHALL parse supplied content once through the registered Tree-sitter/ast-grep grammar and return one complete `FileAnalysisDraft` containing symbols, imports, binding and call facts, reference facts, and compact serializable parser state for Pass 2.

The adapter MUST NOT import or execute analyzed modules, and MUST NOT persist parser objects in file analysis. The adapter SHALL register the parse result in the parser-resource scope of the `IndexSession` (`session.parserResources`), as defined by Requirement: Parser-owned resource registration of `code-graph:language-adapter`. The registration SHALL happen inside `analyzeFile`, immediately after the content is parsed and before any traversal of the parse result, so that the resource is released at the end of the file's epoch even when the analysis throws. The adapter MUST NOT keep parser objects in adapter-private session state, in adapter-instance fields, or in the returned draft.

### Requirement: Python parser-authoritative structural extraction

The adapter SHALL derive imports and literal dynamic imports, class definitions and bases, annotations, return types, assignments and aliases, type aliases, decorators, calls, and construction from Python parser nodes whenever the grammar represents them. Indentation and lexical containment SHALL come from parser ranges and ancestry rather than line scanning or indentation reconstructed from raw source.

Token extraction MAY operate inside a parser-proven annotation or type-expression node when required by the supported reference policy. Parsing `pyproject.toml` or another declared resolution manifest MAY remain textual because it is auxiliary metadata, but that exception MUST NOT authorize regex reconstruction of Python source structure.

Static and literal dynamic imports SHALL emit dependency relations only when module-resolution evidence identifies a target. The adapter MUST NOT persist a relation to the first syntactic candidate when none resolves.

An imported base-class target SHALL emit its physical hierarchy relation together with exactly one matching shared hierarchy reference fact carrying the parser-derived range of the base-class expression, import-resolution provenance, and resolved target.

### Requirement: Declaration extraction and ranges

The adapter SHALL extract module function definitions, class and nested-class definitions, methods declared in class bodies including decorated definitions, module-level assignment targets, and class-level assignment targets.

Class-level assignments, dataclass field definitions, and Protocol field annotations SHALL be extracted as `SymbolKind.Property`. Their declaring owner and `parentId` SHALL be set to the enclosing class symbol. Nested function declarations inside function bodies remain unsupported. It SHALL preserve comments immediately attached to declarations and SHALL map constructs to the shared broad `SymbolKind` without losing supported language-specific identity dimensions.

Each extracted symbol SHALL use the complete parser construct range and exact declared-name `selectionRange` under the shared half-open convention. A symbol whose authoritative range or declared selection cannot be obtained SHALL be omitted rather than approximated.

### Requirement: Python logical identity and declaring owners

The adapter SHALL derive declaring ownership from Python's syntactic nesting. A supported method SHALL use the logical identity of its nearest declaring class as owner, and a nested class SHALL use its nearest enclosing class as owner. Module-level declarations SHALL have no owner. Any extracted method for which that owner cannot be proven SHALL be omitted from logical member facts rather than represented as an ownerless method.

Owner identities SHALL be created and mapped before member logical IDs and MUST NOT be copied from raw parser IDs or optional `SymbolNode.parentId`. Same-name methods in different classes MUST remain distinct. Instance methods, `@classmethod`, `@staticmethod`, properties, property setters, and other statically recognizable forms SHALL retain distinct member-form evidence; unrecognized decorator semantics SHALL not be guessed.

### Requirement: Imports and package resolution

The adapter SHALL extract `import`, `from ... import ...`, aliases, relative imports, and literal `importlib.import_module()` and `__import__()` dependencies. Variable or computed dynamic import arguments SHALL be dropped. For `import package.module`, the locally accessible binding and original qualified module SHALL both be retained.

Relative resolution SHALL honor leading-dot parent traversal and deterministic module/package candidates including module files, package `__init__.py`, stub files, and common `src/` layouts when known indexed paths prove them, through the `relativeImportResolution` facet. Namespace-package selection or other ambiguous layouts SHALL remain unresolved unless indexed context selects one route.

The adapter SHALL provide the `packageResolution` facet. `identity(codeRoot, repoRoot?, report?)` SHALL read the project name from the nearest `pyproject.toml` found by the package-root search defined in "Package resolution facet" of `code-graph:language-adapter`; the search is bounded by the repository root of the code root, and a `pyproject.toml` without `[project].name` is skipped while reporting a diagnostic via `report` as the walk continues within that bound. `matchSpecifier` SHALL compare the first dotted segment of an absolute import with known package identities after normalizing both sides: letters are lowercased and every run of `-`, `_`, or `.` becomes a single `-`. When exactly one known identity matches, it is returned. When several distinct known identities normalize to the same name (for example `acme-auth` and `acme_auth`), `matchSpecifier` returns `undefined` (which `resolvePackageExport` treats as `package-unknown` and counts in `externalPackageImports`) so the import stays unresolved; the adapter MUST NOT choose by registration order. `prepare` MAY be a no-op: the project name comes from the `identity` result and the code root from the workspace, so nothing more is read. When a module has both a source file and a stub (`mod.py` and `mod.pyi`, or `__init__.py` and `__init__.pyi`), only the source file is an entry. `entrySurface` SHALL perform no filesystem read and use only the package map and the indexed file set:

- `import pkg.sub.mod` and `from pkg.sub.mod import X` request the module file `pkg/sub/mod.py`, the stub `pkg/sub/mod.pyi`, or the package `pkg/sub/mod/__init__.py` (and `.pyi`), searched under the package's code root and its `src/` directory.
- `import pkg` and `from pkg import X` request the package `pkg/__init__.py` (and `.pyi`) under the same roots.

A non-relative absolute import SHALL resolve through the shared package import helpers. A name imported with `from pkg import X` resolves to the module-level declaration `X` published by the entry file's module surface. When `X` is not published by the entry file, or when `pkg` has no `__init__.py` or `__init__.pyi` at all, but `pkg/X.py`, `pkg/X.pyi`, or `pkg/X/__init__.py` is an indexed file under the same roots, the import is a submodule import: it adds a file dependency on that file and creates no binding. When more than one of those files is indexed under different roots, the import stays unresolved. Names that the entry file only re-imports stay local aliases and are not public routes (see "Public surface and stub behavior"), so such an import stays unresolved. The adapter MUST NOT search symbols by name in the target workspace.

Resolved package imports SHALL return an `import:package` step, and unresolved ones SHALL return a diagnostic with the reason reported by the helper.

### Requirement: Resolution manifests

`resolutionManifests()` SHALL return exactly `['pyproject.toml']`.

The adapter MUST NOT declare `setup.cfg`, `setup.py`, or any other basename. The package identity MUST come from `[project].name` in the nearest bounded `pyproject.toml`, and MUST NOT come from a `name` key in another table of that file.

### Requirement: Scoped bindings, calls, annotations, and construction

The adapter SHALL emit deterministic facts for lexical scopes, imported aliases, parameter and return annotations, annotated assignments, type-alias right-hand sides, `self` and `cls` receiver bindings, explicit class construction calls, and locally proven aliases.

The adapter SHALL extract decorator invocations and references on functions and classes to emit `CALLS` or `USES_TYPE` relations when resolvable. It SHALL extract type annotations on class and dataclass fields to emit `USES_TYPE` relations. It SHALL build `CALLS`, `CONSTRUCTS`, and `USES_TYPE` only where these facts identify one indexed target. Resolved imports SHALL be exposed through `resolveImports()` so the indexer derives file-level `IMPORTS`.

The caller SHALL be the innermost enclosing function or method (or class for class-level decorators). Module-level calls, monkey-patched attributes, descriptor results, reflection, computed imports, and aliases requiring runtime data flow SHALL not produce guessed relations.

### Requirement: Python caller containment and declaration classification

The adapter SHALL select the caller of an ordinary call as the innermost supported function or method whose complete parser range contains the call. For a class-level decorator invocation, the class MAY be the caller only where the existing decorator contract explicitly permits it. Line order without range containment MUST NOT establish caller identity.

Parameters, imported aliases, assignment targets inside routines, and receiver names such as `self` and `cls` SHALL be lexical bindings rather than logical targets unless a separate supported declaration rule proves otherwise. Their presence before a call MUST NOT displace the enclosing executable caller.

Module functions, classes, nested classes, and class members SHALL follow the Python ownership rules already defined by this spec. If nested functions become supported, their logical identity MUST include deterministic lexical ownership so equal names in different enclosing functions do not collapse. Python has no implicit overload grouping in ordinary source; same-name competing declarations MUST remain distinct unless a supported Python construct explicitly defines one semantic declaration group.

### Requirement: Python hierarchy and provenance evidence

The adapter SHALL retain every syntactically declared base in source order and resolve it through local declarations and proven imports. It SHALL emit consistent hierarchy relations and reference facts for proven class inheritance, protocol-like contracts, and matching declared members. Ordinary class bases SHALL emit `EXTENDS`; a base proven to be a protocol or interface-like declaration MAY emit `IMPLEMENTS`; matching child members SHALL emit `OVERRIDES` only when the ancestor or contract member is known.

Reference facts SHALL identify child and ancestor logical owners, relation kind, declared base ordering, and ordered provenance steps. They SHALL allow the resolver to traverse to each ancestor owner and then query the requested member under that owner. The ancestor owner itself MUST NOT be emitted as a member candidate.

For multiple inheritance, the adapter SHALL preserve declared base order and only advertise precedence that it can prove. Until language-complete C3 MRO, descriptors, dynamic `__mro_entries__`, and metaclass effects are implemented, any candidate whose selection depends on those unsupported semantics SHALL remain ambiguous or unresolved. Hierarchy cycles SHALL terminate deterministically.

### Requirement: Public surface and stub behavior

Module declarations SHALL be addressable through their module surface. Explicit aliases and imports SHALL remain local bindings unless Python syntax and supported static module metadata prove a public route. `.pyi` declarations SHALL participate as declarations without executing or merging runtime modules speculatively.

Static `__all__`, star-import expansion, namespace package aggregation, and runtime module mutation SHALL remain unsupported until directly implemented. The adapter MUST NOT infer public exports merely because a declaration name lacks a leading underscore.

### Requirement: Capability truthfulness and failure behavior

The adapter SHALL advertise `hierarchy: true` only while it emits the hierarchy and provenance facts defined here. Build-context support SHALL remain false while environment markers, interpreter/platform selection, and complete package-layout policy are not consumed. Parse failure and unsupported semantics SHALL be represented as shared coverage outcomes rather than name-only guesses.

All emitted facts, relations, and provenance paths SHALL be deterministic for identical content and indexing context.

### Requirement: Bounded Python member and lexical-scope analysis

The adapter SHALL inspect each class body's direct definitions once and SHALL reuse their parser-backed declaration and decorator evidence when classifying extracted members. Resolving one member MUST NOT recursively recollect every function below the class.

Direct-member indexing SHALL recognize decorated definitions while excluding nested functions and members of nested classes from the outer owner's member set. Association SHALL use owner containment, declared name, kind, and source position rather than name-only matching.

`__init__` and `__new__` SHALL remain constructors. `staticmethod` and `classmethod` decorator evidence SHALL retain static dispatch in the shared model. `property` and `.setter` decorator evidence SHALL retain getter and setter member semantics. Multiline decorators and comments between decorators and definitions SHALL remain parser-authoritative.

For bare-call shadowing, the adapter SHALL derive the bound-name summary of an enclosing function scope at most once and reuse it for references in that scope. The summary SHALL include parameters, assignment and augmented-assignment targets, loop targets, `as` aliases, and named-expression targets, and MUST exclude bindings introduced only inside nested function or class scopes.

Nested-owner exclusion and lexical lookup MUST use reusable owner or scope indexes rather than scanning all class symbols or the complete scope body once per member or reference.

## Constraints

- The adapter MUST NOT execute Python, import analyzed modules, or inspect runtime objects.
- Monkey patching, dynamic attribute hooks, reflection, and whole-program alias flow remain unsupported.
- Python-specific import, ownership, and hierarchy semantics MUST remain inside this adapter.

## Spec Dependencies

- `code-graph:language-adapter` — common adapter port, phases, and capability contract
- `code-graph:symbol-model` — logical symbols, owners, bindings, ranges, and hierarchy evidence
- `code-graph:workspace-integration` — workspace and package-layout boundaries
