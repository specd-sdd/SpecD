# Go Language Adapter

## Purpose

The Go language adapter translates Go source into package-aware code-graph symbols, bindings, hierarchy evidence, and relations. This spec owns the complete behavior of the built-in Go adapter.

## Requirements

### Requirement: Supported files and deterministic analysis

`GoLanguageAdapter` SHALL handle `.go` files as `go`. It SHALL parse supplied content once through the registered Tree-sitter/ast-grep grammar and return one complete `FileAnalysisDraft` containing symbols, imports, scoped facts, call facts, reference facts, and compact serializable parser state needed in Pass 2.

The adapter SHALL derive the declared package from source and package identity from the nearest bounded `go.mod`. It MUST NOT invoke the Go toolchain, compile packages, or retain parser AST objects in persisted analysis state. The adapter SHALL register the parse result in the parser-resource scope of the `IndexSession` (`session.parserResources`), as defined by Requirement: Parser-owned resource registration of `code-graph:language-adapter`. The registration SHALL happen inside `analyzeFile`, immediately after the content is parsed and before any traversal of the parse result, so that the resource is released at the end of the file's epoch even when the analysis throws. The adapter MUST NOT keep parser objects in adapter-private session state, in adapter-instance fields, or in the returned draft.

### Requirement: Go parser-authoritative structural extraction

The adapter SHALL derive type and interface declarations, interface methods, import specs, fields, aliases, type references, selector calls, function calls, construction-like composite literals, receivers, and embedding or hierarchy evidence from Go parser nodes whenever the grammar represents them. Brace counting or whole-source regular expressions MUST NOT determine a declaration body, scope, call, or composite literal.

Token extraction MAY operate inside a parser-proven type-expression node when required by the supported reference policy. Parsing `go.mod` MAY remain textual because it is an auxiliary resolution manifest, but that exception MUST NOT authorize regex reconstruction of Go source structure.

Import specs SHALL emit dependency relations only when package-resolution evidence identifies a workspace or supported external target. An unresolved raw import specifier MAY remain diagnostic evidence, but MUST NOT itself be persisted as a resolved relation target.

### Requirement: Declaration extraction and ranges

The adapter SHALL extract functions, receiver methods, struct types, interface types, named types and aliases, variables, constants, and struct fields. Structs SHALL use the shared class-like broad kind, interfaces the interface kind, struct fields SHALL be extracted as `SymbolKind.Property`, and other named types the type kind without treating broad kind as the complete Go identity.

Each symbol SHALL use its complete parser construct range and exact declared-name `selectionRange` under the shared half-open convention. Immediately preceding attached comments SHALL be retained verbatim. Candidates lacking authoritative parser ranges SHALL be omitted rather than approximated.

### Requirement: Package identity, exports, and imports

Logical declarations SHALL use the indexed Go package as their public surface. Package-level identifiers beginning with an uppercase Unicode letter SHALL produce public bindings; lowercase package declarations SHALL remain non-exported. Public identity MUST remain package-qualified even when several files contribute declarations to the same package.

The adapter SHALL extract single, grouped, aliased, dot, and blank imports. Blank imports SHALL create dependency evidence without a local symbol binding. Dot imports SHALL remain a distinct namespace-import form and MUST NOT cause unqualified names to bind unless a unique indexed target is proven.

The adapter SHALL provide the `packageResolution` facet. `identity` SHALL read the `module` path from the nearest `go.mod` found by the package-root search defined in "Package resolution facet" of `code-graph:language-adapter`; the directory of that `go.mod` is the module directory. A `module` path written as a quoted string SHALL be returned without its quotes. `matchSpecifier` SHALL resolve an import path by the longest known module-path prefix. `prepare` SHALL build the directory index of indexed `.go` files per workspace and SHALL locate the module directory of every configured workspace with the same package-root search, once per run, storing only the location of the code root relative to the module directory. It reads no other manifest data. `entrySurface` SHALL use only the package map and that prepared data: the import path minus the module prefix is a directory under the module directory, expressed relative to the workspace code root, and the entries are the indexed non-test `.go` files directly inside it, each with the package surface of that directory as `surface`. A module directory above the code root is therefore supported, and a package directory that falls outside the code root yields no entries. A path equal to the module path addresses the package at the module directory. Files ending in `_test.go` are never entries.

A Go import resolves to a package, not to a symbol. The adapter SHALL obtain the package files through the shared helper `packageEntryFiles` and add every entry file to the file-level dependencies of the importing file. An import that cannot be resolved yields no dependency and a diagnostic with the reason reported by the helper.

Every resolved package import that is not blank and not a dot import SHALL bind a namespace name in the importing file, used to read qualified selectors such as `pkg.Name`. The namespace name SHALL be, in this order:

1. the explicit alias, when the import has one;
2. otherwise the package name declared by the `package` clause of the indexed non-test entry files of the target package, when all of those entry files declare the same name;
3. otherwise the last segment of the import path.

The declared package name MUST be read from the indexed analysis of the entry files and MUST NOT require any filesystem read. If two imports of the same file would bind the same namespace name, neither binds it, because the name is ambiguous.

A namespace name that is also bound by a lexical binding in scope at a selector is shadowed there and MUST NOT be treated as the package at that selector. The lexical bindings that shadow are: receivers, named parameters and named results (scoped to the function body, so the type expressions of the signature itself still resolve the package), local `var`, `const`, and `type` declarations including grouped ones, short variable declarations, `range` variables, variables declared in an `if`, `for`, or `switch` initializer, and type-switch bindings. A lexical binding shadows only from the point where Go scoping makes it visible to the end of its block: a reference that precedes the declaration in the same block still resolves the package.

The resolution step returned by the helper SHALL be anchored on the file-scope Namespace local binding of the import itself, whatever namespace name was chosen, so that a declared-name or versioned import such as `.../go-auth` or `.../auth/v2` contributes its step like any other import.

A qualified selector `ns.Name` whose `ns` is a namespace name of the file SHALL be resolved through the shared helper `resolvePackageExport` with the import specifier, the exported name, and the symbol spaces defined in "Scoped bindings, selectors, construction, and types". Only names beginning with an uppercase Unicode letter can resolve; a lowercase name stays unresolved. The adapter MUST NOT guess a selector that the helper leaves unresolved and MUST NOT search symbols by name in the target workspace.

### Requirement: Resolution manifests

`resolutionManifests()` SHALL return exactly `['go.mod']`.

The adapter MUST NOT declare `go.work` or any other basename. The package identity comes from the `module` path in `go.mod`.

### Requirement: Go logical identity and declaring owners

A receiver method SHALL parse its receiver type and pointer/value semantics directly from AST receiver parameter nodes rather than regex text parsing. It SHALL use the logical identity of its declared receiver type as owner when that receiver type is present in the supported file analysis, normalizing pointer syntax while retaining pointer/value receiver evidence in parser state. Interface methods SHALL use the declaring interface logical owner.

Struct fields SHALL be extracted as declaration symbols with `SymbolKind.Property`, having their declaring struct type as their logical owner and `parentId`. Package functions, types, variables, and constants SHALL have no declaring owner beyond their package surface. A receiver method whose owner cannot be proven SHALL be omitted from logical member facts rather than represented as ownerless.

Owner identities SHALL be derived from receiver and interface syntax and mapped to logical symbols before member logical IDs are created. They MUST NOT use raw syntax IDs or optional `SymbolNode.parentId`. Same-name methods on different receiver types MUST remain distinct, and interface signatures MUST remain distinguishable from concrete receiver methods.

### Requirement: Scoped bindings, selectors, construction, and types

The adapter SHALL emit deterministic facts for import aliases, function scopes, typed parameters and results, receiver bindings, selector expressions, named composite literals, constructor-like calls, and type references. It SHALL build `CALLS`, `CONSTRUCTS`, and `USES_TYPE` only when package aliases, receiver types, local declarations, or indexed imports prove the target. Resolved imports SHALL be exposed through `resolveImports()` so the indexer derives file-level `IMPORTS`.

In `buildRelations()`, the adapter SHALL build concrete `CALLS` relations connecting callers to target functions and receiver methods. Resolved imported packages SHALL be returned from `resolveImports()` so the indexer derives the file-level `IMPORTS` relations.

The adapter SHALL emit a qualified reference fact (see `code-graph:symbol-model`) for each `ident.Name` selector whose operand is a single identifier, in these positions:

- `call`: the function operand of a call expression, as in `models.NewUser()`, including an explicitly instantiated generic function such as `models.Map[int](x)`;
- `construct`: the type of a composite literal, as in `models.User{}`; the qualifier MUST be retained and MUST NOT be reduced to the member name;
- `type`: a type expression of a parameter, result, field, variable, constant, type declaration, or type argument, as in `var u models.User`.

For facts of every kind, `sourceSymbolId` SHALL be the innermost declaration whose range contains the reference, using one containment rule for all kinds: functions, methods, type declarations, struct fields, and package-level variables and constants all qualify. A reference inside a package-level `var x = models.New()` therefore has the variable `x` as its source. The lexical shadowing rule of "Package identity, exports, and imports" applies uniformly to facts of kind `call`, `construct`, and `type`, so a shadowed qualifier never resolves as the package for any kind.

The adapter SHALL resolve those facts as defined by "Qualified reference resolution" in `code-graph:language-adapter`. The symbol spaces requested from `resolvePackageExport` SHALL be the `value` space for kind `call` and the `type` space for kinds `construct` and `type`.

A selector whose operand is a receiver, local variable, field, or any value rather than a namespace name of the file produces no qualified reference relation. Unresolved selectors, reflection, interface dispatch without a proven concrete target, generic/type-set choices lacking instantiated context, and values requiring interprocedural flow SHALL not produce guessed relations.

### Requirement: Go caller containment and declaration classification

The adapter SHALL select a call's caller as the innermost supported function, receiver method, or explicitly modeled function literal whose complete parser range contains the call. A package declaration, type, field, local variable, constant, parameter, or preceding declaration MUST NOT become the caller based only on source order.

Parameters, result names, receivers, import aliases, short-variable declarations, and routine-local variables SHALL be lexical bindings. Package functions and language-defined type or package declarations MAY be logical targets under the existing package surface policy. Function literals SHALL remain physical or lexical callable evidence unless the adapter defines a deterministic semantic identity that cannot collide across lexical scopes.

Receiver methods SHALL continue to use the canonical receiver-type owner. Same-name methods on distinct receiver types and same-name declarations in competing lexical scopes MUST remain distinct. Go declarations MUST NOT be grouped as overloads because Go does not define overload sets by simple name.

### Requirement: Go embedding and hierarchy provenance

The adapter SHALL extract directly embedded interfaces when the embedded target is a statically named interface in the analyzed file. An interface embedding another known local interface SHALL emit `EXTENDS` with declared ordering. Embedded struct fields, cross-file embedding closure, and promoted-member depth selection remain unsupported.

Reference facts SHALL identify the child owner, embedded or contract owner, relation kind, and ordered traversal steps. Traversal to an embedded owner MUST be followed by a query for the requested member under that owner; the owner itself MUST NOT become the member candidate. Cycles SHALL terminate deterministically.

### Requirement: Proven interface satisfaction

The adapter MAY emit `IMPLEMENTS` for a concrete named type when one analyzed file contains the complete known interface declaration and receiver-method facts prove every directly required method. It SHALL retain pointer-versus-value receiver evidence in compact parser state and MUST NOT claim satisfaction for an empty method set, a missing required method, embedded-interface requirements, build selection, or unsupported generic type sets.

When satisfaction is proven, the owner-level `IMPLEMENTS` fact and ordered resolution step SHALL permit contract-owner traversal; the resolver SHALL query the requested interface signature or concrete member under the reached owner. Member-level `OVERRIDES` fulfillment relations remain unsupported. Name-only coincidence or an empty/unknown interface method set MUST NOT prove implementation.

### Requirement: Build-context boundary

The adapter SHALL derive module identity from `go.mod` and resolve known module subpaths by longest prefix. Until explicitly consumed, `go.work`, `replace` directives, vendoring policy, `internal` visibility, build tags, GOOS/GOARCH alternatives, cgo selection, and complete generic method-set rules SHALL remain unsupported.

The adapter SHALL advertise `buildContext: false`. Alternatives that depend on unsupported build context SHALL remain unresolved or ambiguous rather than selecting an arbitrary package or file.

### Requirement: Capability truthfulness and failure behavior

The adapter SHALL advertise `hierarchy: true` only while embedding paths and proven interface method-set facts are emitted in the shared hierarchy/provenance model. Parse failure, partial package coverage, and unsupported semantics SHALL be surfaced through shared coverage. All facts, relations, and candidate ordering SHALL be deterministic for identical content and session context.

### Requirement: Indexed Go declarations and method sets

The adapter SHALL associate named types, interface methods, struct fields, and receiver methods with extracted symbols through file-local parser-backed indexes. Resolving one declaration or receiver MUST NOT linearly search the complete symbol collection after those indexes are built.

Interface-signature membership and member ownership SHALL use direct symbol-ID sets or maps rather than scanning every type for each method. Pointer-receiver evidence, package visibility, exact declaration ranges, and canonical receiver-type ownership SHALL remain unchanged.

The complete local method set of an interface, including locally resolvable embedded interfaces, SHALL be computed at most once per interface and reused for all implementation checks. The memoized result SHALL distinguish a proven method set from an unknown set caused by an unresolved, package-qualified, cyclic, or otherwise unsupported embedding path.

Comparing each concrete named type with candidate interfaces MAY remain when required to emit distinct `IMPLEMENTS` facts, but the comparison MUST reuse indexed receiver methods and memoized interface method sets. An empty, incomplete, or unknown method set MUST NOT prove implementation, and no member-level `OVERRIDES` relation SHALL be invented.

## Constraints

- The adapter MUST NOT execute `go list`, compile code, or infer runtime interface values.
- Build-dependent alternatives, reflection, and speculative interface satisfaction remain unsupported.
- Go-specific package, receiver, embedding, and method-set semantics MUST remain inside this adapter.

## Spec Dependencies

- `code-graph:language-adapter` — common adapter port, phases, and capability contract
- `code-graph:symbol-model` — logical symbols, owners, bindings, ranges, and hierarchy evidence
- `code-graph:workspace-integration` — workspace, module, and path boundaries
