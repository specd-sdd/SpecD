# Go Language Adapter

## Purpose

The Go language adapter translates Go source into package-aware code-graph symbols, bindings, hierarchy evidence, and relations. This spec owns the complete behavior of the built-in Go adapter.

## Requirements

### Requirement: Supported files and deterministic analysis

`GoLanguageAdapter` SHALL handle `.go` files as `go`. It SHALL parse supplied content once through the registered Tree-sitter/ast-grep grammar and return one complete `FileAnalysisDraft` containing symbols, imports, scoped facts, call facts, reference facts, and compact serializable parser state needed in Pass 2.

The adapter SHALL derive the declared package from source and package identity from the nearest bounded `go.mod`. It MUST NOT invoke the Go toolchain, compile packages, or retain parser AST objects in persisted analysis state.

### Requirement: Declaration extraction and ranges

The adapter SHALL extract functions, receiver methods, struct types, interface types, named types and aliases, variables, and constants. Structs SHALL use the shared class-like broad kind, interfaces the interface kind, and other named types the type kind without treating broad kind as the complete Go identity.

Each symbol SHALL use its complete parser construct range and exact declared-name `selectionRange` under the shared half-open convention. Immediately preceding attached comments SHALL be retained verbatim. Candidates lacking authoritative parser ranges SHALL be omitted rather than approximated.

### Requirement: Package identity, exports, and imports

Logical declarations SHALL use the indexed Go package as their public surface. Package-level identifiers beginning with an uppercase Unicode letter SHALL produce public bindings; lowercase package declarations SHALL remain non-exported. Public identity MUST remain package-qualified even when several files contribute declarations to the same package.

The adapter SHALL extract single, grouped, aliased, dot, and blank imports. Blank imports SHALL create dependency evidence without a local symbol binding. Dot imports SHALL remain a distinct namespace-import form and MUST NOT cause unqualified names to bind unless a unique indexed target is proven. Import specifiers SHALL resolve by longest known `go.mod` module prefix.

### Requirement: Go logical identity and declaring owners

A receiver method SHALL use the logical identity of its declared receiver type as owner when that receiver type is present in the supported file analysis, normalizing pointer syntax while retaining pointer/value receiver evidence in parser state. Interface methods SHALL use the declaring interface logical owner. Package functions, types, variables, and constants SHALL have no declaring owner beyond their package surface. A receiver method whose owner cannot be proven SHALL be omitted from logical member facts rather than represented as ownerless.

Owner identities SHALL be derived from receiver and interface syntax and mapped to logical symbols before member logical IDs are created. They MUST NOT use raw syntax IDs or optional `SymbolNode.parentId`. Same-name methods on different receiver types MUST remain distinct, and interface signatures MUST remain distinguishable from concrete receiver methods. Struct fields are not declaration symbols in the current adapter.

### Requirement: Scoped bindings, selectors, construction, and types

The adapter SHALL emit deterministic facts for import aliases, function scopes, typed parameters and results, receiver bindings, selector expressions, named composite literals, constructor-like calls, and type references. It SHALL build `IMPORTS`, `CALLS`, `CONSTRUCTS`, and `USES_TYPE` only when package aliases, receiver types, local declarations, or indexed imports prove the target.

Unresolved selectors, reflection, interface dispatch without a proven concrete target, generic/type-set choices lacking instantiated context, and values requiring interprocedural flow SHALL not produce guessed relations.

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

## Constraints

- The adapter MUST NOT execute `go list`, compile code, or infer runtime interface values.
- Build-dependent alternatives, reflection, and speculative interface satisfaction remain unsupported.
- Go-specific package, receiver, embedding, and method-set semantics MUST remain inside this adapter.

## Spec Dependencies

- `code-graph:language-adapter` — common adapter port, phases, and capability contract
- `code-graph:symbol-model` — logical symbols, owners, bindings, ranges, and hierarchy evidence
- `code-graph:workspace-integration` — workspace, module, and path boundaries
