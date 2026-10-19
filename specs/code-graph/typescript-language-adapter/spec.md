# TypeScript Language Adapter

## Purpose

The TypeScript language adapter translates TypeScript, TSX, JavaScript, and JSX syntax into the shared code-graph analysis, binding, reference, and relation models. This spec owns the complete built-in behavior of that adapter; the general language-adapter spec owns only the common port and cross-language invariants.

## Requirements

### Requirement: Supported languages and deterministic analysis

`TypeScriptLanguageAdapter` SHALL handle `.ts`, `.tsx`, `.js`, and `.jsx` as `typescript`, `tsx`, `javascript`, and `jsx` respectively. It SHALL parse the supplied content once through the registered Tree-sitter/ast-grep grammar and SHALL return one complete `FileAnalysisDraft` without reading source files or retaining AST nodes in persisted analysis state.

The draft SHALL contain symbols, imports, scoped binding facts, call facts, reference facts, and compact serializable parser state sufficient for Pass 2 import, export, hierarchy, and relation construction. Parser-runtime keepalive state MAY be retained only in the run-scoped indexing session.

### Requirement: Declaration extraction and ranges

The adapter SHALL extract named function declarations, callable variable initializers including arrow and higher-order wrappers, classes, class and object methods, class fields, prototype/static assignments, namespace/member assignments, destructured bindings, exported variables, type aliases, interfaces, and enums.

It SHALL classify interface property signatures, class field definitions, and enum members as `SymbolKind.Property`. Function and method overload signatures along with their implementation declaration SHALL be united under a single logical symbol with multiple declaration occurrences.

Each symbol SHALL use the complete parser node as its construct range and the declared identifier node as its `selectionRange`, following the shared half-open range convention. Immediately preceding JSDoc, block, or contiguous line comments SHALL be retained verbatim when attached to the declaration. Invalid or range-less candidates SHALL be omitted rather than approximated.

### Requirement: Object properties in array data records

The adapter SHALL omit a non-callable object property from symbol extraction when the property's enclosing object is anonymous and an array boundary is encountered before a supported named declaration while traversing the property's enclosing expression path. The classification SHALL apply to direct array elements and to objects nested beneath an array element.

The adapter SHALL preserve scalar properties belonging to named object declarations, including declarations wrapped in supported transparent expressions such as parentheses, type assertions, `as const`, and `satisfies`. It SHALL preserve callable property values and object methods regardless of array ancestry.

Filtering these property symbols MUST NOT remove or alter the file's indexed source content. Every preserved property symbol SHALL retain its parser-derived construct range and declared-name selection range, and equivalent analysis SHALL remain deterministic.

### Requirement: Logical identity and declaring owners

The adapter SHALL create logical declarations in the type or value space proven by the supported declaration kind. Supported class and interface method-like declarations and property declarations SHALL carry the logical identity of their syntactically declaring class or interface; they MUST NOT use a raw parser-node ID or an optional `SymbolNode.parentId` as the canonical owner.

The owner SHALL be derived from parser construct containment and mapped to the owner's logical symbol before the member logical ID is created. Same-name members declared by different owners MUST remain distinct, including compact same-line declarations. Top-level declarations SHALL have no declaring owner. Multiple overload signatures of the same member name within a declaring owner SHALL be retained as an overload set rather than overwriting prior signatures. Static, instance, constructor, getter, setter, interface-signature, and supported field-method forms SHALL remain distinguishable whenever syntax proves the form.

Object-literal, prototype-assignment, namespace, or other method-like symbols for which the current parser state does not retain one supported logical owner SHALL remain location-backed discovery symbols and MUST be omitted from logical member facts rather than represented as ownerless members. TypeScript declaration merging and dual type/value identities beyond the supported broad-kind projection remain unsupported.

### Requirement: TypeScript overload and declaration-group identity

Overload signatures and their implementation SHALL contribute declaration occurrences to one logical function or method target when TypeScript syntax proves that they form one overload group. Adding, removing, or reordering overload signatures MUST NOT change the logical target's canonical identity while its semantic owner, name, space, dispatch, and member kind remain unchanged.

Signature versus implementation form SHALL be retained as declaration-occurrence evidence and MUST NOT replace the logical member kind with a signature-only kind. Selectors and semantic impact SHALL receive the complete ordered declaration set for the overload group.

Same-name declarations that are not one TypeScript overload or merge group MUST remain competing logical targets, including declarations separated by distinct lexical owners or scopes. Missing group evidence MUST be represented as no group; it MUST NOT be normalized into a shared empty key that merges unrelated declarations.

### Requirement: Imports, exports, and public bindings

The adapter SHALL extract named, default, namespace, type-only, side-effect, and aliased static imports; literal `import()` and literal `require()` dependencies; ESM declarations and export clauses; CommonJS exports; named re-exports; and star re-exports. Non-literal dynamic imports and requires SHALL be dropped.

Public bindings SHALL preserve public surface, exported name, symbol space, canonical target when known, and each independent re-export route. A named or star barrel route SHALL be linked during Pass 2 without collapsing competing routes that occupy the same public slot. Type-only syntax SHALL not be promoted to a value binding without evidence. Relative imports SHALL consider TypeScript/JavaScript extension and index-file candidates; package imports SHALL use known package identities.

### Requirement: Scoped bindings, calls, types, and construction

The adapter SHALL emit deterministic facts for lexical scopes, imports and aliases, typed parameters, constructor parameter properties, fields/properties, return types, type-alias right-hand sides, `this`/class receiver bindings, and explicit construction expressions. It SHALL build `IMPORTS`, `CALLS`, `CONSTRUCTS`, and `USES_TYPE` only when local declarations, resolved imports, receiver bindings, or other indexed facts prove the target.

The adapter SHALL extract literal string dynamic `import(...)` expressions as file dependency import facts. It SHALL extract call expressions occurring in nested and chained expressions (such as `factory().method()` or callbacks).

The caller of a call relation SHALL be the innermost enclosing callable symbol. Calls at module scope, ambiguous receivers, unresolved globals, computed dynamic members, and runtime-only aliases SHALL not produce guessed relations.

### Requirement: TypeScript caller and local-binding semantics

The adapter SHALL select a call's caller by applying the common semantic-containment contract to complete parser ranges. Eligible callers SHALL be functions, methods, constructors, arrow functions, function expressions, or another TypeScript construct whose syntax proves that it is executable and contains the call.

A variable declarator initialized by an ordinary `call_expression` MUST NOT be classified as a callable function merely because its initializer is a call. Ordinary variables, parameters, aliases, and block-scoped bindings SHALL remain lexical bindings and MAY retain physical declaration evidence without receiving a logical target.

Nested named functions or callable variables that the adapter exposes as logical targets MUST include deterministic lexical ownership sufficient to distinguish equal names in different functions or blocks. Alternate branches and sibling lexical scopes MUST NOT collapse into one logical identity.

The key of an anonymous object literal used as an expression or call argument MUST NOT become a `SymbolNode` or `LocalBinding` merely because its value is a scalar or nested object. A property of an object literal owned by a supported named declaration MAY remain physical declaration evidence under that named owner according to the existing object-property policy.

An anonymous arrow function or function expression that contains calls MAY be represented as a deterministic, range-backed physical-only callable container. It MUST NOT receive a stable logical identity solely from its location, but it SHALL remain eligible as the physical caller of calls in its body. If the adapter does not represent that executable container, those calls SHALL remain caller-unresolved rather than being assigned to an argument key, local binding, or preceding declaration.

### Requirement: TypeScript hierarchy and provenance evidence

The adapter SHALL extract `extends` and `implements` clauses from classes and interfaces and SHALL resolve their targets through local declarations, imports, and proven public-binding routes. It SHALL emit consistent persisted hierarchy relations and reference facts for every proven edge: class inheritance and interface extension as `EXTENDS`, class-to-interface conformance as `IMPLEMENTS`, and same-form member replacement as `OVERRIDES` when both owner members are known.

Reference facts SHALL include the child owner, ancestor or contract owner, relation kind, deterministic language precedence, and ordered provenance steps needed by `ResolveSymbolReference` to traverse from a child owner to an ancestor owner and then query the requested member under that owner. Reaching an ancestor owner MUST NOT be encoded as reaching a member. Multiple valid base or barrel routes SHALL remain separate evidence paths, and cycles SHALL terminate deterministically.

The adapter SHALL advertise `hierarchy: true` only while this evidence is emitted for the supported syntax. Declaration merging, conditional exports, mixins, decorators, or build-dependent alternatives that cannot be proven from supplied context SHALL remain unsupported rather than guessed.

### Requirement: Package and build-context boundary

The adapter SHALL derive package identity from the nearest bounded `package.json` name and SHALL resolve scoped and bare package specifiers by the longest known package prefix. Filesystem searches MUST stop at the supplied repository root.

Until the adapter consumes the relevant project configuration, `tsconfig` inheritance, references, `baseUrl`, `paths`, platform/condition selection, and conditional package `exports` or `imports` SHALL remain unsupported coverage. The adapter SHALL advertise `buildContext: false`, and unresolved conditional alternatives SHALL remain unresolved or ambiguous.

### Requirement: Capability truthfulness and failure behavior

The adapter SHALL advertise only capabilities backed by its emitted facts. Parse failure, unsupported syntax, or incomplete semantic coverage SHALL be surfaced through shared coverage and MUST NOT be replaced by name-only inference. Every output collection and provenance path SHALL be deterministic for identical content and context.

### Requirement: TypeScript parser-authoritative structural extraction

The adapter SHALL derive static and dynamic imports, CommonJS `require` calls, calls, construction, parameters, return and property types, type aliases, class receivers, and extends or implements clauses from TypeScript/TSX/JavaScript/JSX parser nodes whenever the grammar represents them. Optional chaining, computed members, nested and multiline expressions, generic call syntax, and template or comment lookalikes MUST be distinguished through node type and ancestry rather than whole-source regular expressions.

Text tokenization MAY be applied to the bounded text of a parser-proven type node when the grammar does not expose a finer named child required by the supported type-reference policy. It MUST remain within that node and MUST NOT infer a call, declaration, scope, owner, or hierarchy relation from unbounded source text.

Import resolution SHALL emit a dependency relation only when the configured workspace and module-resolution evidence identifies a target. The adapter MUST NOT persist a relation to the first syntactic candidate merely because no candidate resolves.

An imported `extends` or `implements` target SHALL emit its physical hierarchy relation together with exactly one matching shared hierarchy reference fact. That fact MUST retain the source range of the heritage-clause type expression, import-resolution provenance, and resolved target used by the relation.

## Constraints

- The adapter MUST NOT execute project code or invoke the TypeScript compiler as an implicit fallback.
- Runtime reflection, computed exports, monkey patching, and unproven interprocedural value flow remain unsupported.
- TypeScript-specific syntax handling MUST remain inside this adapter; generic resolution MUST consume only shared facts.

## Spec Dependencies

- `code-graph:language-adapter` — common adapter port, analysis phases, and capability contract
- `code-graph:symbol-model` — logical symbols, owners, bindings, ranges, and provenance vocabulary
- `code-graph:workspace-integration` — workspace, package, and path boundaries
