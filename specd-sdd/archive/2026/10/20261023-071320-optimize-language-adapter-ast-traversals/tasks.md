# Tasks: optimize-language-adapter-ast-traversals

## 1. Shared structural indexes

- [x] 1.1 Add deterministic structural-work observation contracts
      `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts`: `StructuralWorkKind`, `StructuralWorkObserver` — add package-internal named exports with complete JSDoc and no public-barrel export
      Approach: define the seven fixed work categories from the design; accept observers only as optional builder parameters, never store them in session or module state, and let observer exceptions propagate
      (Req: Bounded per-file structural analysis)
- [x] 1.2 Implement exact declaration-symbol indexing
      `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts`: `DeclarationSymbolIndex`, `createDeclarationSymbolIndex()` — replace repeated declaration searches with exact indexed lookup
      Approach: key by `kind\u0000line\u0000column\u0000name`, sort duplicate exact-key entries by symbol ID, expose `size` and `find(kind, name, line, column)`, and record build/lookups through the optional observer
      (Req: Bounded per-file structural analysis)
- [x] 1.3 Implement the callable interval-tree builder
      `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts`: `CallableInterval`, `CallableIntervalNode`, `CallableContainmentIndex`, `createCallableContainmentIndex()` — build eligible callable structure once per symbols/policy pair
      Approach: filter complete ranges once, sort by start ascending/end descending/ID ascending, build a balanced tree with `minStart` and `maxEnd`, and query without allocating or sorting candidate arrays
      (Req: Bounded per-file structural analysis; scenario: Repeated semantic queries reuse structural evidence)
- [x] 1.4 Preserve the callable-containment compatibility facade
      `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts`: `findContainingCallableSymbol()` — retain its exact public signature and semantic output
      Approach: delegate one-shot calls to the interval implementation while keeping half-open ranges and latest-start/earliest-end/ID ordering; do not export the new index from `src/index.ts` or `src/public.ts`
      (Req: Bounded per-file structural analysis; scenario: Callable containment preserves exact boundaries)
- [x] 1.5 Test exact declaration-index behavior
      `packages/code-graph/test/infrastructure/tree-sitter/reference-fact-helpers.spec.ts`: declaration-index cases — prove exact identity and deterministic duplicate handling
      Approach: assert misses and matches across same names on different lines/columns/kinds, stable lowest-ID selection for duplicate exact keys, empty inputs, and observer build/lookup counts
      (Req: Bounded per-file structural analysis)
- [x] 1.6 Test callable-index semantic parity
      `packages/code-graph/test/infrastructure/tree-sitter/reference-fact-helpers.spec.ts`: callable-index cases — compare reusable index results with the compatibility function
      Approach: cover empty, sibling, nested, equal-range, missing-end, kind-filter, eligible-ID, same-line and multiline boundary positions with explicit assertions and no snapshots
      (Req: Bounded per-file structural analysis; scenario: Indexed and baseline semantics are equivalent; scenario: Callable containment preserves exact boundaries)
- [x] 1.7 Test callable-index bounded work
      `packages/code-graph/test/infrastructure/tree-sitter/reference-fact-helpers.spec.ts`: structural-work counter case — prove queries do not rebuild eligible symbols or ordering
      Approach: build with `S` symbols, issue `Q` queries, assert exactly the eligible symbols are recorded as indexed once and only interval-visit counts change during queries
      (Req: Bounded per-file structural analysis; scenario: Repeated semantic queries reuse structural evidence)

## 2. PHP direct-member analysis and compact state

- [x] 2.1 Add the PHP direct-member evidence builder
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `PhpDirectMemberEvidence`, `collectPhpDirectMemberEvidence()` — associate only direct class-like body members with exact symbols
      Approach: inspect one direct `declaration_list`, exact-lookup parser-supported method/property declarations through `DeclarationSymbolIndex`, preserve source order, observe each direct entry once, and never descend into method bodies
      (Req: Bounded PHP member classification and compact state; scenario: Large class body is not traversed per method)
- [x] 2.2 Make PHP member classification node-local
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `phpMemberSemantics()` — classify the already-associated method node instead of rescanning its owner
      Approach: accept `memberNode`, return constructor first for case-insensitive `__construct`, otherwise inspect only direct children for `static_modifier` and return static/instance method semantics
      (Req: Bounded PHP member classification and compact state)
- [x] 2.3 Refactor PHP type collection to use exact indexes
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `collectPhpTypeInfo()` — remove owner `symbols.find`, full-symbol member loops, and nested-owner leakage
      Approach: create/reuse one declaration index, process each class/interface/enum/trait owner in source order, consume direct-member evidence, and leave trait-use and hierarchy name/range extraction unchanged
      (Req: Bounded PHP member classification and compact state; scenario: Direct and nested declarations retain their own semantics)
- [x] 2.4 Reuse callable containment for PHP binding facts
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `extractBindingFactsFromData()` — stop filtering/sorting all symbols for every inferred scope
      Approach: construct one PHP-policy `CallableContainmentIndex` before the AST walk and use `index.find({ line, column })` in `addFact`, preserving deduplication and file fallback
      (Req: Bounded per-file structural analysis)
- [x] 2.5 Reuse callable containment for PHP call facts
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `extractCallFactsFromData()` — resolve all caller IDs through one file-local index
      Approach: build once before walking calls and replace every repeated helper call with `index.find`, preserving forms, locations, deduplication, and unresolved caller behavior
      (Req: Bounded per-file structural analysis)
- [x] 2.6 Remove unconsumed PHP routine-source state
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `PhpScopeInfo`, `PhpParserState.scopes`, `analyzeFile()` scope walk — eliminate the unused traversal and retained body strings
      Approach: delete the type/field/collector and omit `scopes` from new parser state; continue tolerating the extra field on older hydrated structural data without migration logic
      (Req: Bounded PHP member classification and compact state; scenario: Analysis retains no unconsumed routine source)
- [x] 2.7 Test PHP direct and nested member semantics
      `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: focused member fixtures — prove exact ownership and parser-backed classification
      Approach: cover constructors, static/instance methods, multiline modifiers/comments, repeated names, nested/anonymous classes, interfaces, enums, traits, properties, trait uses, and heritage ranges with explicit symbol/semantic assertions
      (Req: Bounded PHP member classification and compact state; scenario: Direct and nested declarations retain their own semantics)
- [x] 2.8 Test PHP structural bounds and compact parser state
      `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: generated 400-method fixture and parser-state assertions — prove one shallow owner-body pass
      Approach: assert all members, linear `owner-member-node-visited` counts independent of body size, absence of `scopes`, and absence of a unique routine-body marker from every serialized parser-state value
      (Req: Bounded PHP member classification and compact state; scenario: Large class body is not traversed per method; scenario: Analysis retains no unconsumed routine source)
- [x] 2.9 Test complete PHP output parity
      `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: bounded slow-reference comparison — detect changes outside performance
      Approach: normalize and explicitly compare symbols, imports, binding/call/reference facts, type info, and relations for representative fixtures; exclude only removed `parserState.scopes`
      (Req: Bounded per-file structural analysis; scenario: Indexed and baseline semantics are equivalent)

## 3. Python direct members and lexical summaries

- [x] 3.1 Add direct Python member evidence
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: `PythonDirectMemberEvidence` and direct-block collector — capture exact direct definitions and decorator evidence
      Approach: iterate direct class `block` entries once, unwrap one `decorated_definition`, normalize decorators in source order, exact-lookup symbols, and exclude nested class/function bodies
      (Req: Bounded Python member and lexical-scope analysis; scenario: Large class indexes direct definitions once; scenario: Decorators and nested owners remain isolated)
- [x] 3.2 Make Python member semantics evidence-local
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: `pythonMemberSemantics()` — remove recursive `collectByKind` per method
      Approach: accept `PythonDirectMemberEvidence`; preserve constructor, static/class method, setter-before-getter, property, and default method rules exactly
      (Req: Bounded Python member and lexical-scope analysis)
- [x] 3.3 Refactor Python class ownership and member association
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: `collectClassInfo()` — eliminate repeated owner searches, full-symbol scans, and inner-class `symbols.some`
      Approach: create one declaration index, maintain nearest class ownership by exact parser ranges, consume only direct-member evidence, and preserve base names/ranges, indentation, end lines, and source order
      (Req: Bounded Python member and lexical-scope analysis; scenario: Decorators and nested owners remain isolated)
- [x] 3.4 Implement cached Python lexical binding summaries
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: `PythonLexicalBindingIndex`, `createPythonLexicalBindingIndex()` — scan each function/lambda scope body at most once
      Approach: cache immutable name sets by `kind:start.index:end.index`; collect parameters, assignments, augmented assignments, loop targets, aliases, and named expressions while pruning nested functions, lambdas, and classes
      (Req: Bounded Python member and lexical-scope analysis; scenario: Calls in one scope share one bound-name summary)
- [x] 3.5 Integrate Python lexical summaries into call extraction
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: `isPythonShadowedByEnclosingScope()`, call-fact extraction — reuse cached sets for every bare-call decision
      Approach: pass one file-local lexical index, walk only ancestors, preserve module-level behavior and conservative omission when any enclosing function/lambda binds the callee name
      (Req: Bounded Python member and lexical-scope analysis; scenario: Calls in one scope share one bound-name summary)
- [x] 3.6 Reuse callable containment for Python call facts
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: call-fact extraction — resolve caller IDs through one Python-policy interval index
      Approach: construct once before iterating call nodes and retain all current call forms, arity, locations, and unresolved behavior
      (Req: Bounded per-file structural analysis)
- [x] 3.7 Test Python direct-member semantics and bounds
      `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`: generated and focused class fixtures — prove direct-only indexed classification
      Approach: cover 400 methods, constructors, multiline static/class decorators, comments, property getters/setters, repeated names, nested classes/functions, and assert linear owner-member visit counts
      (Req: Bounded Python member and lexical-scope analysis; scenario: Large class indexes direct definitions once; scenario: Decorators and nested owners remain isolated)
- [x] 3.8 Test Python lexical-summary reuse and boundaries
      `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`: many-calls scope fixture — prove one summary per scope
      Approach: assert binding coverage for every supported target form, exclusion of nested scopes, stable call facts, and `lexical-scope-node-visited` independent of calls after the first query
      (Req: Bounded Python member and lexical-scope analysis; scenario: Calls in one scope share one bound-name summary)
- [x] 3.9 Test complete Python output parity
      `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`: bounded slow-reference comparison — preserve semantic output across optimization
      Approach: explicitly compare normalized symbols, parents, imports, binding/call/reference facts, parser state, and relations on representative `.py` and `.pyi` fixtures
      (Req: Bounded per-file structural analysis; scenario: Indexed and baseline semantics are equivalent)

## 4. TypeScript and JavaScript association indexes

- [x] 4.1 Centralize supported TypeScript/JavaScript member node kinds
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: member-kind constant used by extraction and grouping — prevent syntax-support drift
      Approach: define one immutable set covering exactly the existing supported method, signature, property, constructor, and accessor node kinds; use it in both symbol extraction and direct-member indexing
      (Req: Indexed TypeScript type-member association)
- [x] 4.2 Build exact TypeScript owner/member groups
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `TsDirectMemberEvidence`, collection pass — replace global member search with nearest-owner grouping
      Approach: exact-lookup owners/members through `DeclarationSymbolIndex`, use parser-range owner stack boundaries, and sort each group by source start then symbol ID
      (Req: Indexed TypeScript type-member association; scenario: Large type collection uses indexed association; scenario: Indexed keys preserve declaration distinctions)
- [x] 4.3 Refactor TypeScript type declaration collection
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `collectTypeDeclarations()` — consume indexed groups without nested symbol/member-node scans
      Approach: build `memberIdsByName`, `memberSymbolIds`, and `memberSemanticsById` from each owner's group while preserving overload order, constructors, accessors, signatures, nested boundaries, and heritage names/ranges
      (Req: Indexed TypeScript type-member association; scenario: Indexed keys preserve declaration distinctions)
- [x] 4.4 Index TypeScript declarations by owner ID during reference-fact building
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `buildReferenceFacts()` — remove per-symbol `typeDeclarations.find`
      Approach: construct `ReadonlyMap<string, TsTypeDeclarationInfo>` once and use direct lookup for signature/implementation checks without changing logical descriptors
      (Req: Indexed TypeScript type-member association)
- [x] 4.5 Implement cached TypeScript/JavaScript lexical summaries
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `TsLexicalBindingIndex`, `createTsLexicalBindingIndex()` — summarize function parameters, direct block declarations, and catch parameters once per exact scope
      Approach: cache by parser kind/start/end index, preserve whole-block shadow semantics, and keep nested blocks/functions independent
      (Req: Bounded per-file structural analysis)
- [x] 4.6 Integrate TypeScript lexical and callable indexes into call extraction
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `isShadowedByEnclosingScope()`, `extractCallFactsFromData()` — reuse both indexes for all calls/new expressions
      Approach: create one lexical index and one TS-policy callable interval index, preserving free/member/constructor forms, arity, static receiver detection, deduplication, and unresolved branches
      (Req: Bounded per-file structural analysis)
- [x] 4.7 Test TypeScript indexed association and declaration distinctions
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: generated 80-type/1,600-member fixture and focused syntax cases — prove near-linear association
      Approach: assert one indexing event per symbol/member plus exact overload order, signatures, constructors, static/accessor/property semantics, nested owners, same names, and heritage ranges
      (Req: Indexed TypeScript type-member association; scenario: Large type collection uses indexed association; scenario: Indexed keys preserve declaration distinctions)
- [x] 4.8 Test TypeScript lexical-summary reuse
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: function/block/catch fixtures with many calls — prove one summary per scope
      Approach: assert current whole-block shadow behavior, nested-scope isolation, stable call output, and bounded lexical visit counts
      (Req: Bounded per-file structural analysis)
- [x] 4.9 Test TypeScript/JavaScript complete output parity
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: bounded slow-reference comparison — preserve every supported dialect result
      Approach: explicitly compare normalized analysis and relations for TypeScript, TSX, JavaScript, and JSX fixtures, including signature-versus-implementation logical facts
      (Req: Bounded per-file structural analysis; scenario: Indexed and baseline semantics are equivalent)

## 5. Go declaration, scope, and method-set indexes

- [x] 5.1 Use exact declaration indexes for Go named types
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: `collectTypeInfo()` — replace repeated struct/interface owner and interface-method symbol searches
      Approach: accept `DeclarationSymbolIndex`, exact-lookup type owners and direct `method_elem` symbols, and preserve source-ordered embeds and current type-info serialization
      (Req: Indexed Go declarations and method sets; scenario: Named and receiver declarations use direct indexes)
- [x] 5.2 Use exact declaration indexes for Go receiver methods
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: `collectMethodReceivers()` — replace full-symbol scans per method
      Approach: exact-lookup by method kind/name/start location, retain receiver normalization and pointer detection, and preserve method-map overwrite/order behavior
      (Req: Indexed Go declarations and method sets; scenario: Named and receiver declarations use direct indexes)
- [x] 5.3 Replace Go interface-signature scans with set membership
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: `buildReferenceFacts()` — remove `typeInfos.some` per method
      Approach: construct `ReadonlySet<string>` from all `interfaceMethodIds` once and use `has(symbol.id)` during logical member classification
      (Req: Indexed Go declarations and method sets)
- [x] 5.4 Memoize complete Go interface method sets
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: `GoMethodSetCache`, `completeGoInterfaceMethodSet()`, `buildRelations()` — expand each local interface closure once
      Approach: use missing for uncomputed and `null` for unknown, detect cycles with a visiting set, propagate unknown through local dependents, sort known unions, and reuse results for every struct/interface comparison
      (Req: Indexed Go declarations and method sets; scenario: Embedded interface closure is memoized; scenario: Unknown method set remains unknown when cached)
- [x] 5.5 Implement cached Go lexical summaries
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: `GoLexicalBindingIndex`, `createGoLexicalBindingIndex()` — summarize routine receiver/parameters and direct block short-var/var/const names once
      Approach: cache by exact parser scope key, preserve current whole-block shadow semantics, and keep nested blocks/routine literals independent
      (Req: Bounded per-file structural analysis)
- [x] 5.6 Integrate Go lexical and callable indexes into call extraction
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: `isGoShadowedByEnclosingScope()`, `extractCallFactsFromData()` — reuse file-local indexes for every call
      Approach: build one Go-policy callable interval index and one lexical index; preserve call forms, locations, receiver names, deduplication, and conservative omissions
      (Req: Bounded per-file structural analysis)
- [x] 5.7 Test Go indexed declaration and receiver association
      `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts`: generated named-type/receiver fixtures — prove exact direct lookup
      Approach: assert owners, interface method IDs, pointer receiver IDs, signature membership, duplicate names, and deterministic parser-state ordering
      (Req: Indexed Go declarations and method sets; scenario: Named and receiver declarations use direct indexes)
- [x] 5.8 Test Go method-set memoization and conservative unknowns
      `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts`: embedded-interface diamond, cycle, missing/external embed, and empty-interface cases — prove safe cached closure behavior
      Approach: assert each local interface expands at most once, known complete closures emit correct `IMPLEMENTS`, and cached `null` closures never emit partial relations
      (Req: Indexed Go declarations and method sets; scenario: Embedded interface closure is memoized; scenario: Unknown method set remains unknown when cached)
- [x] 5.9 Test Go lexical-summary reuse and complete parity
      `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts`: many-calls scope plus slow-reference fixtures — preserve shadowing and output
      Approach: assert one summary per routine/block and explicitly compare normalized symbols, facts, parser state, `EXTENDS`, `IMPLEMENTS`, and other relations
      (Req: Bounded per-file structural analysis; scenario: Indexed and baseline semantics are equivalent)

## 6. Cross-language regression coverage

- [x] 6.1 Extend cross-language bounded-analysis conformance
      `packages/code-graph/test/infrastructure/tree-sitter/language-adapter-conformance.spec.ts`: shared structural-index scenarios — verify parser authority and deterministic outputs across all four adapters
      Approach: add explicit assertions for nested owners, same-name declarations, half-open caller boundaries, conservative unresolved syntax, and stable ordering without snapshots
      (Req: Bounded per-file structural analysis; scenario: Callable containment preserves exact boundaries)
- [x] 6.2 Verify full, incremental, and hydrated equivalence
      `packages/code-graph/test/infrastructure/tree-sitter/language-adapter-conformance.spec.ts` and existing indexing suites: rebuild-mode comparison — ensure transient indexes do not leak into persisted behavior
      Approach: index identical fixtures through full, incremental changed-file, and hydrated paths; normalize and compare every symbol, fact, diagnostic, and relation
      (Req: Bounded per-file structural analysis; scenario: Indexed and baseline semantics are equivalent)
- [x] 6.3 Run provider and SDK orchestration regression tests
      `packages/code-graph/test/composition/code-graph-provider.spec.ts`, existing SDK indexing tests — cover the CRITICAL downstream blast radius without modifying contracts
      Approach: execute existing provider construction and `run-index-project-graph` behavior against optimized adapters and require identical results
      (Req: Bounded per-file structural analysis)

## 7. Validation and real-project acceptance

- [x] 7.1 Run focused code-graph checks
      `packages/code-graph`: typecheck, lint, focused six-file Vitest selection, and build — validate types, conventions, deterministic tests, and ESM output
      Approach: run the exact commands in `design.md`; every command must exit zero and no snapshot or wall-clock-only assertion may be introduced
      (Req: Bounded per-file structural analysis)
- [x] 7.2 Run complete downstream test suites
      `packages/code-graph`, `packages/sdk`, `packages/cli`: full tests — verify all 29-file blast-radius consumers remain compatible
      Approach: run complete code-graph tests followed by SDK and CLI tests; investigate any semantic delta rather than updating expected output blindly
      (Req: Bounded per-file structural analysis; scenario: Indexed and baseline semantics are equivalent)
- [x] 7.3 Record synthetic scaling evidence
      `packages/code-graph/test/infrastructure/tree-sitter/`: generated 50/100/200/400-size diagnostics — demonstrate structural rather than timing bounds
      Approach: capture work counters while scaling members/calls/types/interfaces; assert index-build counts scale with indexed structures and do not multiply with queries
      (Req: Bounded per-file structural analysis; Req: Bounded PHP member classification and compact state; Req: Bounded Python member and lexical-scope analysis; Req: Indexed TypeScript type-member association; Req: Indexed Go declarations and method sets)
- [x] 7.4 Rebuild CLI and index ICCMS with its current configuration
      `../iccms/specd.yaml`: real-project manual acceptance — prove the original project no longer stalls on the legacy controller
      Approach: build code-graph and CLI, run `node ../specd/packages/cli/dist/index.js graph index --config specd.yaml --format toon` from `../iccms`, confirm progress passes `articles_importers_controller.php` and 600 files, completes, and exits zero; record timing/RSS only as diagnostics and do not commit proprietary source
      (Req: Bounded PHP member classification and compact state; scenario: Large class body is not traversed per method)
- [x] 7.5 Confirm scope and documentation invariants before verification
      change implementation review: production/test file set and curated exports — ensure no lifecycle/resource or public-contract drift entered implementation
      Approach: confirm only the five production modules and documented tests changed, no new helper is re-exported publicly, no docs update is required, PHP scopes are removed, and `napi-keepalive` remains untouched; return to design if any assertion is false
      (Req: Bounded per-file structural analysis)
