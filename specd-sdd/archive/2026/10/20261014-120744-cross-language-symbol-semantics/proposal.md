# Proposal: cross-language-symbol-semantics

## Motivation

Code Graph currently mixes physical declarations, lexical bindings, and logical targets at several boundaries, while language adapters also reconstruct parser-visible source structure with regular expressions. This produces incorrect callers, false symbols, unstable or colliding logical identities, incomplete impact traversal, and coverage lookups that disagree with the identity written by the indexer; the shared defects affect every built-in language adapter and would otherwise be repeated by future adapters.

## Current behaviour

TypeScript, Python, Go, and PHP each select a call's caller using the nearest symbol that starts on or before the call line instead of proving full range containment and callable eligibility. TypeScript exposes the defect most readily because it extracts more local declarations, but all four adapters carry the same invalid algorithm and the shared scoped-binding fallback has equivalent behaviour.

All four adapters additionally re-scan raw source text with regular expressions for parser-visible constructs. The current uses include calls and construction, dynamic or legacy imports, type references and aliases, parameters and return types, inheritance clauses, and language- or framework-specific dependency calls. Some are legitimate leaf-text or non-source metadata parsing, but others independently reinterpret syntax that Tree-sitter has already parsed. Those structural matches do not inherit AST ancestry, exact ranges, error recovery, or lexical context and can therefore disagree with declaration extraction or match lookalike text in comments, strings, templates, nested expressions, and multiline syntax.

The concrete TypeScript failure in `ArchiveChange` tests combines both problems. An anonymous argument object in `uc.execute({ name: 'my-change' })` is interpreted as a physical `variable:name` declaration with no parent, and regex-derived call extraction then allows the line-only caller heuristic to use that false declaration as the source of a real `ArchiveChange.execute` call. The indexed database contains 72 such false-source `CALLS` relations across the two affected test files. The 72 count describes calls, not exclusively `rejects.toThrow` assertions.

Logical identity is derived without a complete cross-language classification of declaration occurrences, lexical bindings, owners, overload groups, and physical-only evidence. Same-name declarations in distinct lexical scopes can collapse, while adding TypeScript overload signatures can change the identity of an otherwise unchanged logical member.

Selector resolution can recognize a logical target with several declarations, but SDK and provider impact paths reduce it to one physical symbol before traversal. Physical dependency edges are therefore not consistently aggregated across every declaration of the logical target. In parallel, production indexing writes `COVERS_SYMBOL` against logical-symbol IDs while impact coverage readers commonly query with physical IDs, so valid covering specs can disappear from results. Existing tests largely exercise each component in isolation and do not enforce these invariants across languages and layers.

A first implementation pass exposed additional instances of the same boundary violations. Logical declarations can still be grouped solely because they share a name when no language grouping evidence exists; traversal can feed a physical ID into the logical-only coverage frontier; SDK compatibility code can collapse a resolved logical target back to its first declaration; and nested resolved-target locations can escape without project-relative path projection. Import and hierarchy extraction also remain inconsistent across adapters: unresolved imports may be persisted from a first syntactic candidate or raw specifier, while imported hierarchy edges may lack the matching shared reference evidence and provenance.

The persisted-store contract is also internally inconsistent: the implementation and tests use SQLite schema version 15 with declaration `occurrence_form`, while the merged `code-graph:sqlite-graph-store` specification still declares version 14 current and version 15 incompatible. PHP retains regex-based Pass 2 relation discovery and performs PSR-4 metadata I/O from adapter state during that pass, contrary to the parser-authoritative and session-scoped contracts.

## Proposed solution

Define one language-neutral semantic contract that distinguishes physical declaration evidence, scope-local bindings, stable logical targets, and syntax that produces no graph declaration. Centralize caller containment and adapter conformance rules, then require every built-in and future adapter to classify declarations explicitly and prove owners, ranges, callable containers, declaration groups, and identity stability.

Make the parser AST authoritative for facts whose meaning depends on source structure. Calls, construction, callers, declarations, imports, bindings, type references, and hierarchy relations must originate from typed parser nodes, fields, ranges, and ancestry whenever the configured parser represents the construct. Audit every regular expression in the built-in adapters and classify it as structural semantics to replace, legitimate leaf-text extraction, non-source metadata parsing, or a documented compatibility fallback. A fallback must not invent a declaration, caller, or dependency when the parser cannot prove it. Framework-specific knowledge may still recognize API names and argument conventions, but it must operate on AST call nodes and literal arguments rather than rediscovering the call syntax from raw text.

For anonymous executable callbacks, retain a physical, range-backed callable container when needed to preserve a real dependency edge without manufacturing a stable logical identity. Conversely, scalar keys of anonymous argument objects such as `{ name: ... }` produce no graph declaration; properties of a named object declaration remain eligible under the language policy.

Keep physical dependency relations as the authoritative evidence graph. Extend selector and impact orchestration to carry a discriminated resolution with the complete declaration set, traverse from every declaration of a logical target, deduplicate semantic results by logical identity, and retain physical locations and edges as evidence. Align `COVERS_SYMBOL` reads with its existing logical target contract throughout stores, traversal, SDK, and CLI.

Add shared adapter contract tests and language-specific scenarios for range containment, lexical isolation, ownership, overload or merge behaviour, physical-only declarations, logical coverage, and incremental/full-index equivalence. Preserve exact physical navigation and public-binding impact as distinct operations rather than silently reinterpreting existing IDs.

Complete the contract at every remaining boundary found by verification: require positive grouping evidence before declarations share a logical target; forbid physical IDs from entering logical coverage lookup; remove first-declaration SDK fallbacks; project every nested public location consistently; suppress unresolved import relations; pair imported hierarchy relations with shared provenance facts; move PHP structural relation discovery entirely to AST visitors with all filesystem-derived metadata prepared in the analysis session; and declare SQLite schema version 15 as the current compatible schema with explicit 14-to-15 rebuild behaviour.

## Specs affected

### New specs

None.

### Modified specs

- `code-graph:symbol-model`: define the declaration-occurrence, local-binding, and logical-target identity layers, including stable grouped declarations and evidence-preserving semantic projection.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:language-adapter`: require parser-authoritative structural fact extraction, semantic caller containment, explicit declaration classification including no-graph syntax, owner-first identity construction, and reusable cross-language conformance tests.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:typescript-language-adapter`: replace regex-derived structural facts where Tree-sitter supplies typed nodes, correct anonymous-object and callback classification, caller selection, lexical ownership, and stable overload-group semantics.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:python-language-adapter`: replace regex-derived structural facts where Tree-sitter supplies typed nodes and bind caller selection and declaration classification to the common contract while preserving Python-specific ownership semantics.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:go-language-adapter`: replace regex-derived structural facts where Tree-sitter supplies typed nodes and bind caller selection and declaration classification to the common contract while preserving package, receiver, and interface semantics.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:php-language-adapter`: replace regex-derived structural facts where Tree-sitter supplies typed nodes, including framework-aware calls over AST evidence, and bind caller selection and declaration classification to the common contract while preserving namespace, owner, and trait semantics.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:resolve-symbol-reference`: discriminate logical-target resolution from exact declaration resolution and retain all declarations and ordered evidence.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:traversal`: start logical impact from all declarations, define semantic deduplication and physical evidence, and perform logical-symbol coverage lookup.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:graph-store`: make logical versus physical lookup and coverage target units explicit in the backend-neutral port.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:sqlite-graph-store`: preserve complete declaration sets, logical coverage integrity, and set-based queries needed by semantic impact.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:indexer`: enforce owner-first identity construction, consistent coverage projection, and incremental equivalence for identity-sensitive changes.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:composition`: propagate complete logical resolutions through the provider without moving domain semantics into composition.
  - Depends on (added): none
  - Depends on (removed): none
- `sdk:run-graph-impact`: preserve the resolved target kind and full declaration set when orchestrating symbol impact.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:graph-impact`: expose logical-target impact and physical evidence consistently without resolving or collapsing declarations in the CLI.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:staleness-detection`: make the index lock self-healing. The lock records pid and process start time, and acquisition recovers a lock whose owner is dead or whose pid was reused, so a crashed or killed indexer no longer requires deleting the lock by hand.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:isolated-index-worker`: move stale-lock recovery out of the supervisor's prohibited scope and into the lock helper, which the supervisor only consumes.
  - Depends on (added): none
  - Depends on (removed): none

Round 3 verification also amends existing deltas for `code-graph:sqlite-graph-store` (table-shape check, open order, recreation scope), `code-graph:symbol-model` and `code-graph:graph-store` (no `stale` flag on `COVERS_SYMBOL`; absent targets are rejected with `SYMBOL_NOT_FOUND`), and `cli:graph-impact` (exact ambiguity lists candidates and is never traversed).

## Impact

The representative blast-radius query over the identity model, adapter contract, scoped environment, traversal, store port, provider, SDK, and CLI reports **CRITICAL** risk: 245 direct, 196 indirect, and 78 transitive dependents across 63 production files, with 100 test files omitted by the default source-only filter. `GraphStore` is itself a CRITICAL hotspot, so contract changes must be additive or migrated coherently across the abstract port, SQLite worker protocol/database/store, provider, and tests.

The minimum implementation surface includes:

- Code Graph value objects for symbols, references, calls, bindings, ranges, and impact results.
- The shared scoped-binding environment and reference-fact helpers.
- All four Tree-sitter language adapters, their structural regex inventory, and a shared adapter contract-test harness.
- Selector resolution, project coverage projection, traversal, impact aggregation, and incremental indexing.
- `GraphStore`, SQLite schema/query/worker DTOs where new batch resolution or evidence shapes are required.
- `CodeGraphProvider`, `runGraphImpact`, and graph-impact CLI structured/text projections.
- Unit, contract, SQLite integration, incremental-index, SDK, CLI, and documentation coverage tests.

Verification of the first implementation pass narrows the remaining corrective surface to declaration grouping, coverage frontier construction, import/hierarchy fact emission, PHP Pass 2 analysis, SDK result projection, and SQLite schema-version requirements. These are not separate features: each is a concrete enforcement point of the identity and parser-authority contracts introduced by this change.

The confirmed caller and false-declaration failure points are:

- `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`
  - `processPairNode()` turns scalar keys of anonymous object literals into `SymbolKind.Variable` declarations. In an argument such as `uc.execute({ name: 'my-change' })`, this creates a parentless physical `variable:name` that is not a source-language declaration.
  - `extractCallFactsFromData()` discovers construction, member, and free calls by scanning the complete source string with regex and assigns their sources through `findEnclosingSymbolIdByLine()`.
  - `findEnclosingSymbolIdByLine()` selects the latest symbol beginning on or before the call line; it proves neither range containment nor callable eligibility.
- `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`, `go-language-adapter.ts`, and `php-language-adapter.ts`
  - Each defines its own `findEnclosingSymbolIdByLine()` with the same line-only policy.
  - Each `extractCallFactsFromData()` re-scans source text for calls and uses that helper to assign a caller.
- `packages/code-graph/src/domain/services/scoped-binding-environment.ts`
  - `resolveMemberCall()` accepts `call.callerSymbolId` and otherwise invokes `findEnclosingSymbol()`.
  - `findEnclosingSymbol()` repeats nearest-preceding line selection, allowing a shared fallback to reintroduce a caller that the adapter did not prove.

The initial structural-regex audit surface is broader than caller extraction:

- TypeScript adapter: `extractImportedNamesFromData()`, `extractBindingFactsFromData()`, `extractCallFactsFromData()`, `extractClassReceiverFacts()`, `extractTypedParameterFacts()`, `extractReturnTypeFacts()`, `extractPropertyTypeFacts()`, `extractConstructionAliasFacts()`, `extractTypeAliasRhsFacts()`, and the textual heritage parsing inside `collectTypeDeclarations()`.
- Python adapter: literal dynamic-import extraction, `collectClassInfo()`, `extractBindingFactsFromData()`, and `extractCallFactsFromData()`; auxiliary manifest/TOML parsing is separately classified because it is not Python source structure.
- Go adapter: `collectTypeInfo()`, `collectInterfaceMethodNames()`, `extractGoImportsFromText()`, `extractBindingFactsFromData()`, and `extractCallFactsFromData()`; `go.mod` parsing is separately classified as auxiliary metadata.
- PHP adapter: `collectPhpTypeInfo()`, `extractBindingFactsFromData()`, `extractCallFactsFromData()`, `extractRequireRelations()`, and `collectRawDynamicLoaders()`. The last method includes framework-specific CakePHP, CodeIgniter, Yii, Laravel, Zend, and Drupal patterns that should retain their framework policy while obtaining call shape and literal arguments from AST nodes.

This list is an audit boundary, not a claim that every listed regex is defective or must be deleted. Implementation must classify each use and preserve regex that only parses auxiliary metadata or tokenizes text already isolated by an authoritative AST node without inferring source structure.

The verification follow-up identifies these concrete remaining code paths:

- `packages/code-graph/src/domain/services/build-logical-declaration-facts.ts`: declarations without a grouping key can still merge on name alone; absence of grouping evidence must keep them distinct.
- `packages/code-graph/src/application/collect-impact-specs.ts`: a physical fallback can enter the logical `COVERS_SYMBOL` frontier; physical-only declarations must never be queried as logical coverage targets.
- `packages/sdk/src/run-graph-impact.ts`: legacy orchestration selects `resolvedTarget.declarations[0]`; public logical-target impact must preserve and traverse the full declaration set, and all nested locations must receive the same project-relative projection as top-level results.
- TypeScript, Python, Go, and PHP import resolution paths: first-candidate or raw-specifier fallbacks can persist an unresolved import relation; no target relation may be emitted without proven resolution.
- TypeScript, Python, and PHP imported hierarchy paths: hierarchy relations need matching shared `ReferenceFacts.hierarchy` evidence and provenance.
- `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: Pass 2 still scans callable text for aliases, constructions, and member calls, and reads PSR-4 metadata through adapter-instance state; structural facts must come from AST nodes and metadata must be prepared once in the analysis session.
- SQLite schema-version declarations and migration tests: schema 15 and `occurrence_form` are implemented, so the specification and compatibility scenarios must define 15 as current, rebuild 14 to 15, and reject unsupported versions.

The concrete regression and database acceptance evidence comes from:

- `packages/core/test/application/use-cases/archive-change.spec.ts`: 63 indexed calls containing `uc.execute({ name: ... })`, beginning at line 173.
- `packages/core/test/application/use-cases/archive-change-batch-restore.spec.ts`: 9 indexed calls containing the same argument shape, beginning at line 278.
- `.specd/config/graph/code-graph.sqlite`: 72 `CALLS` rows whose source is a parentless `variable:name` and whose target is `ArchiveChange.execute`. Reindexing after the fix must retain the real target calls while eliminating every false `name` source and every false declaration created solely from those anonymous argument keys.

No new runtime dependency or workspace is required. The implementation remains inside the owned `code-graph`, `sdk`, and `cli` roots.

## Technical context

The agreed model has three non-bijective identity layers:

1. `SymbolNode` / declaration occurrence: physical, range-backed evidence for navigation and dependency edges.
2. `LocalBinding`: scope-bound identity for parameters, aliases, receivers, and ordinary locals.
3. `LogicalSymbol`: stable semantic identity for language-defined targets, optionally backed by several declarations.

Physical dependency relations remain authoritative. Semantic search and impact project those relations over logical identities while retaining every supporting physical edge and location; declarations with no logical target remain visible as physical evidence.

Caller selection must use parser-derived line and column ranges, require actual containment, and restrict candidates to language-approved executable containers. Failure to prove a caller remains unresolved. Adapters must not retain private line-only nearest-preceding implementations.

Tree-sitter is the authority for source structure whenever its grammar exposes the construct. Regex may normalize already isolated leaf text or parse auxiliary files for which no configured AST exists, but it may not determine whether source text is a call, declaration, import, type relation, owner, scope, or caller. Language- or framework-specific dependency rules inspect AST nodes and proven literal arguments. Unsupported or erroneous syntax yields unresolved or no graph fact instead of a textual guess.

The regex inventory confirms that the issue extends beyond `extractCallFactsFromData`: TypeScript re-scans imports, calls, classes, parameters, returns, properties, aliases, and heritage clauses; Python re-scans dynamic imports, classes, annotations, aliases, and calls; Go re-scans types, interface bodies, imports, type references, aliases, calls, and composite literals; PHP contains both generic structural scans and numerous framework-specific dependency patterns. Not every regex must disappear: token extraction from an AST-isolated type fragment and parsing auxiliary manifests may remain when they do not infer source structure.

The `ArchiveChange` regression establishes the required boundary. `uc.execute()` is a real call, but `{ name: 'my-change' }` does not declare a variable named `name`. The nearest anonymous arrow/function callback may be represented as a physical-only callable caller with a deterministic range-backed identity; if no such executable container can be proven, the call remains caller-unresolved rather than being attributed to an unrelated symbol.

Logical identity remains location-independent. It uses a canonical logical owner where the language defines one, distinguishes competing lexical scopes, and groups declarations only when the language defines one target, such as a TypeScript overload set. Declaration form such as signature versus implementation is occurrence metadata and must not destabilize logical member semantics.

Resolution must explicitly distinguish an exact declaration from a logical target. Logical results carry every declaration and their evidence. Provider, SDK, and CLI paths must preserve that distinction; no public `symbolId` field may be silently reinterpreted.

`COVERS_SYMBOL` continues to target `LogicalSymbol.id`, matching current production indexing and SQLite integrity rules. Traversal projects reached physical declarations to logical IDs before reverse coverage lookup and returns physical declaration evidence where available.

Rejected approaches include fixing TypeScript alone, removing all locals from physical symbols, replacing physical dependency edges with logical edges, adding location to logical IDs, forcing every physical declaration to have a logical target, splitting every same-name declaration, and relying on the currently passing test suite.

## Open questions

None. Detailed data-shape and compatibility mechanics will be selected in `design.md` within the fixed contracts above: stable logical IDs, explicit resolution kinds, complete declaration preservation, physical evidence retention, and logical `COVERS_SYMBOL` targets.
