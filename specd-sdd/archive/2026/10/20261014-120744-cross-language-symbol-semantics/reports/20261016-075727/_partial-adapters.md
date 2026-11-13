# Adapter compliance audit

## Requirements Summary

Audited merged change specs:

- `code-graph:language-adapter`: unified single-pass adapter contract; parser-authoritative structural facts; strict callable containment; deterministic bindings/calls/imports; truthful capabilities; logical owners; complete ranges; shared hierarchy/provenance; explicit unsupported coverage; cross-language conformance tests.
- `code-graph:typescript-language-adapter`: TS/TSX/JS/JSX declarations, overload groups, object-property filtering, imports/re-exports, scoped dependencies, lexical caller/identity semantics, hierarchy and build-context boundary.
- `code-graph:python-language-adapter`: Python declarations/owners, imports, annotations/decorators, callable containment, conservative nested functions, ordered bases and unsupported MRO behavior.
- `code-graph:go-language-adapter`: Go declarations/receivers, package bindings/imports, selectors/construction, caller containment, embedding, proven interface satisfaction and unsupported build context.
- `code-graph:php-language-adapter`: PHP declarations/owners, namespaces/Composer, literal loaders, scoped aliases, calls/construction, caller containment, hierarchy/traits and truthful coverage.

Direct dependencies checked for consistency: `code-graph:symbol-model`, `code-graph:workspace-integration`, and the common `code-graph:language-adapter` contract. Global conventions were considered through the dependency chain reported by change status.

## Implementation Status per spec

### `code-graph:language-adapter` — PARTIAL

The unified interface and built-in migration exist; all four adapters expose `analyzeFile`, `resolveImports`, `buildRelations`, manifests, capabilities and declaration policy. Shared range-based caller selection is centralized in `reference-fact-helpers.ts:212-251`, uses line+column half-open containment, and has focused tests. The registry is extension-driven and the indexer uses stored analyses plus shared scoped dependency resolution.

The contract is not fully met because several adapters still emit unproven import targets, imported hierarchy relations can lack matching shared hierarchy provenance, and PHP relation construction still derives assignments/calls from source text rather than parser facts.

### `code-graph:typescript-language-adapter` — PARTIAL

Implemented: complete parser ranges/selection ranges, anonymous argument-object key filtering, physical-only anonymous callbacks, common caller containment, overload occurrence forms, imports/re-exports, member owners, type/value facts, hierarchy relations, manifest declaration and `buildContext: false`. The 72-call ArchiveChange regression has direct production-corpus coverage.

Not compliant: unrelated/nested same-name functions are assigned ownerless file-surface logical identities and may be grouped as overloads; relative imports are emitted to the first syntactic candidate without indexed proof; imported hierarchy relations lack corresponding shared hierarchy/provenance facts.

### `code-graph:python-language-adapter` — PARTIAL

Implemented: parser-driven declarations/imports/calls, complete ranges, class/member owners, nested functions kept physical-only, decorators and annotations, common caller containment, deterministic pyproject identity, local ordered hierarchy evidence and `buildContext: false`.

Not compliant: relative imports are emitted to the first path candidate without proof; imported base/protocol relations can be persisted without matching shared hierarchy/provenance evidence.

### `code-graph:go-language-adapter` — PARTIAL

Implemented: parser-driven declarations, receiver ownership and pointer evidence, fields/parents, grouped import classification, common caller containment, local interface embedding, complete same-file method-set proof, no member-level override invention, exact `go.mod` manifest declaration and `buildContext: false`.

Not compliant: `buildRelations` emits `IMPORTS` from every declaration directly to the raw import specifier, including unresolved packages. A current test explicitly expects target `fmt`, which conflicts with the merged detectable-target/common relation contract.

### `code-graph:php-language-adapter` — PARTIAL

Implemented: AST-driven declarations/ranges, properties/constants/enum cases, owners, namespaces/use aliases, require/include extraction, parser-proven framework-loader discovery, caller containment, local hierarchy evidence, Composer identity and exact manifest declaration.

Not compliant: Pass 2 reconstructs alias assignments, explicit constructions and method calls with regexes over callable text; dynamic loader resolution falls back to a nonexistent first candidate; PSR-4 metadata may be read during Pass 2 into adapter-instance state; imported hierarchy relations lack shared provenance.

## Discrepancies

### HIGH — Unresolved imports are persisted as concrete `IMPORTS` edges

The merged common contract requires deterministic/resolvable targets and says unresolved imports/bindings must be dropped from persisted output. Implementations instead manufacture targets:

- TypeScript `buildRelations` resolves a relative specifier syntactically and always takes candidate zero (`typescript-language-adapter.ts:1240-1252`), independent of `context.resolvedImports` or indexed-file existence.
- Python does the same for relative imports (`python-language-adapter.ts:797-811`).
- Go emits every import directly to its raw specifier (`go-language-adapter.ts:638-651`); `go-language-adapter.spec.ts:676-727` codifies the unresolved target `fmt` as expected behavior.
- PHP dynamic loaders choose an indexed candidate but fall back to `loader.candidates[0]` when none exists (`php-language-adapter.ts:1523-1537`), despite the PHP spec requiring indexed candidate proof.

This can create orphan/speculative graph edges and contradicts `Detectable dependency boundary`, `Import specifier resolution`, and the language-specific import requirements. Either the code must consume only proven `ResolvedImports.fileImports`/session hits, or the merged spec would need to explicitly define unresolved external-import nodes (it currently does not).

### HIGH — Imported hierarchy relations are not mirrored by shared hierarchy/provenance facts

TypeScript, Python and PHP build reference hierarchy only when the parent is a same-file/local declaration:

- TypeScript local-only descriptors: `typescript-language-adapter.ts:985-1013`; imported targets are nevertheless accepted for persisted relations at `:1258-1314`.
- Python local-only descriptors: `python-language-adapter.ts:635-655`; `buildRelations` also resolves imported bases/protocols.
- PHP local-only descriptors: `php-language-adapter.ts:1332-1371`; imported parents/contracts are accepted by `extractHierarchyRelationsFromState` (`:1603-1675`).

Thus an adapter can advertise `hierarchy: true` and emit `EXTENDS`/`IMPLEMENTS` while the shared `ReferenceFacts.hierarchy` and ordered steps contain no matching imported-owner route. This directly violates `Hierarchy evidence consistency`, the language-specific provenance requirements, and the explicit rule that a relation alone does not satisfy resolver capability. Code should create pass-2 shared hierarchy/provenance for resolved imported owners, or refrain from persisting/advertising that unsupported edge.

### HIGH — TypeScript unrelated lexical functions can collapse into one logical target

`buildReferenceFacts` gives every non-anonymous `SymbolKind.Function` the file surface with no owner (`typescript-language-adapter.ts:945-978`). When more than one function has the same name anywhere in the file, all receive `groupKey = function:<file>:<name>` without proving an overload group. Nested function declarations and callable variables are extracted recursively, so equal names in distinct outer functions/blocks can become one logical identity.

This violates `TypeScript overload and declaration-group identity` and `TypeScript caller and local-binding semantics`, which require unrelated lexical scopes to remain distinct and demand deterministic lexical ownership for nested callables exposed logically. The current suite covers method overloads and ordinary block locals, but not two equal nested named/callable declarations in sibling scopes.

### HIGH — PHP Pass 2 still manufactures structural binding/call facts with regexes

Although loader discovery itself was migrated to AST nodes, `buildRelations` stores full callable source text and then:

- finds alias assignments with regex (`php-language-adapter.ts:638-653`),
- finds explicit constructed/acquired instances with regex (`:655-686`), and
- finds receiver method calls with a dynamically built regex over `scopeText` (`:1539-1597`).

This path can match call-shaped text inside a string/heredoc within a real method and emit a `CALLS` relation when a compatible alias/target symbol exists. It also re-derives assignment/call structure instead of consuming the parser-proven `bindingFacts` and `callFacts` already present in the analysis. That contradicts both parser-authoritative structural extraction requirements and the PHP requirement that framework rules inspect parser-proven calls/arguments. The existing lookalike regression checks only `analyzeFile` loader/require state (`php-language-adapter.spec.ts:1529-1620`), not relations produced by this regex compatibility path.

### MEDIUM — PHP PSR-4 metadata can perform Pass-2 I/O outside `IndexSession`

`resolveImports` calls `resolveQualifiedNameToPath` (`php-language-adapter.ts:1439-1441`, `:1474-1476`), which lazily calls `buildPsr4Map`; that reads `composer.json` through `findManifestField` and stores the result in an adapter-instance `psr4Cache` (`:1027`, `:2350-2395`). The common merged spec requires metadata needed during Pass 2 to have been prepared during analysis or live in deterministic run-scoped `IndexSession` cache state, and forbids Pass-2 filesystem probing per import. Adapter-instance cache lifetime can also cross indexing sessions. Either preload PSR-4 state into the session or revise the common contract/interface documentation, which currently disagrees with the merged requirement.

## Test Coverage

Present coverage is strong for:

- shared half-open containment, innermost caller selection, no nearest-preceding fallback, ownership, physical-only declarations, determinism and basic lookalike isolation;
- TypeScript declaration/range breadth, array/object filtering, imports/re-exports, method overloads, nested/chained calls and the 72 ArchiveChange cases;
- Python declarations/imports, package identity, annotations/decorators, nested-function policy, containment and string/comment isolation;
- Go declarations/receivers/import forms, fields, interface embedding/satisfaction, containment and lookalike isolation;
- PHP declarations/owners, Composer/PSR-4 basics, loaders, scoped alias behavior, hierarchy basics, containment and loader/require lookalikes.

The six focused Vitest files were started together. Vitest reached `RUN v4.1.10` but produced no case results for roughly 40 seconds and was interrupted to avoid leaving a hung verification process. Therefore this partial audit does not claim a fresh green execution; it relies on static inspection plus the test definitions. The parent verifier should record the authoritative full-suite result separately.

## Missing Tests

- Cross-language negative test: unresolved relative/package/framework imports produce no persisted `IMPORTS` edge and no orphan target.
- TypeScript: same-name nested functions and callable variables in sibling scopes do not share a logical ID or overload group; invalid duplicate implementations are not treated as overloads.
- TypeScript/Python/PHP: imported `EXTENDS`/`IMPLEMENTS` must have matching shared hierarchy facts and ordered provenance steps, or explicit unsupported coverage.
- PHP: a method string/heredoc containing `$alias->method()` after a real loader must not produce `CALLS`; comments/strings that resemble alias assignments or `new` expressions must not seed aliases.
- PHP: Pass-2 import resolution performs no filesystem read and cache state is isolated per indexing session.
- Conformance boundary matrix per built-in adapter for optional/chained/computed/generic calls, nested expressions and compact same-line constructs. The generic fixture currently proves comments/strings and one multiline call, not the full mandatory matrix for every language.
- Go: replace the current raw-specifier expectation with an indexed resolved target plus a negative unresolved-package case.

## Dependency/Global Conformance

- **Symbol model:** complete ranges, logical owners and declaration occurrences are generally used correctly. The TypeScript lexical-function collapse and imported-hierarchy provenance gaps violate the symbol-model owner/provenance semantics.
- **Workspace integration:** manifest searches are bounded in tests and package identities are present. PHP's adapter-instance PSR-4 cache/Pass-2 I/O does not honor the shared session boundary.
- **General adapter contract:** all built-ins use the unified three-phase API and common caller containment. Speculative import targets and PHP regex relation construction violate deterministic shared-fact boundaries.
- **Global conventions:** no error-handling or architecture issue was found in the audited paths beyond the ownership/session-boundary findings above.

## Summary counts

- Specs audited: **5**
- Status: **0 fully compliant, 5 partial, 0 absent**
- Discrepancies: **5 total — 4 HIGH, 1 MEDIUM**
- Missing test groups: **7**
- Fresh targeted test result: **inconclusive (runner stalled before reporting cases)**
