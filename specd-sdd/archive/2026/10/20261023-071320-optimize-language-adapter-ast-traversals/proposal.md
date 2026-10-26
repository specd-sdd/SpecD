# Proposal: optimize-language-adapter-ast-traversals

## Motivation

Language-adapter analysis performs repeated native AST traversals and collection-wide searches whose cost grows superlinearly with the number of declarations, calls, and nodes in a source file. This is a production regression: indexing the existing ICCMS project now saturates a CPU core and enters garbage-collection thrashing on a legacy PHP controller that indexed successfully before parser-backed member semantics were introduced.

The change is required now because the failure is not limited to one pathological file. The same algorithmic shape exists in Python, TypeScript, Go, and the shared callable-containment helper, so fixing only the first PHP symptom would leave predictable freezes and multi-second per-file analysis elsewhere.

## Current behaviour

### Reproduction and root cause

The blocking ICCMS input is `app/controllers/default/articles_importers_controller.php`:

- 12,223 source lines
- approximately 158,193 AST nodes
- 152 methods in one class-like owner
- approximately 576 KB of source

`collectPhpTypeInfo` iterates the file's extracted symbols for each class-like declaration. For every contained method it calls `phpMemberSemantics(symbol, ownerNode)`. That function recursively visits every descendant of the owner, collects every `method_declaration`, then performs another linear search by name and source line. For the observed class, member classification alone performs approximately:

`152 methods × 158,193 owner nodes = 24,045,336 native node visits`

Each visit crosses the `@ast-grep/napi` boundary through operations such as `children()`, `kind()`, `field()`, `range()`, and `text()`. The synchronous loop creates large numbers of short-lived JavaScript wrappers around native nodes. Sampling showed the process spending its time in ast-grep NAPI node access and V8 garbage collection while CPU remained near 100% and physical memory approached 5 GB. Replacing the repeated owner traversal with one shallow declaration-list pass reduced isolated analysis of the file to approximately 1.5 seconds while retaining all 152 method classifications.

### Complexity vocabulary

The affected paths can be described with the following per-file quantities:

- `N`: AST nodes in the file
- `C`: AST nodes below one class-like owner
- `S`: extracted symbols in the file
- `M`: members below one owner
- `T`: named types in the file
- `I`: interfaces in the file
- `Q`: call facts or call-expression nodes
- `B`: nodes in an enclosing lexical scope body

Repeated work is considered defective when information whose source AST has not changed is rediscovered for each member, call, or symbol. Comparisons that are inherently required to emit distinct semantic relations may remain, but their prerequisite lookups and expansions must be indexed or memoized.

### PHP adapter

Current PHP type collection has several multiplicative costs:

1. Each class-like declaration finds its owner with `symbols.find`, producing up to `O(T × S)` owner association.
2. Each class loops over the complete symbol list to identify contained members, again up to `O(T × S)`.
3. Each contained method invokes `phpMemberSemantics`, which recursively walks the complete owner and linearly searches the collected method nodes, producing `O(M × C)` native traversal work per owner.

The member-semantics traversal descends into every method body even though static/instance classification depends only on the method declaration and its direct modifier nodes. This also collects nested method-shaped nodes that cannot be direct members of the current owner and must later be disambiguated by name and line.

PHP analysis separately walks the complete root to build `parserState.scopes`. For each function or method it retains `{ name, line, text }`, where `text` is the complete routine source including its body. Repository-wide search found no reader of `PhpParserState.scopes`; the field is declared, populated, serialized into the analysis, and otherwise unused. On large controllers it therefore adds a full AST walk and retains duplicate body-sized strings without contributing to Pass 2 or persisted relations.

### Python adapter

`collectClassInfo` recursively collects all classes, then for each class:

1. Finds its owner and any enclosing class with repeated `symbols.find` calls.
2. Iterates the complete symbol collection to find contained members.
3. Executes `symbols.some` for every candidate member to exclude members belonging to an inner class.
4. Calls `pythonMemberSemantics` for each method.

`pythonMemberSemantics` recursively collects every `function_definition` below the class for every method, then searches the collection by name and line. It crosses nested classes and nested functions even though decorators relevant to class-member semantics occur only on direct class-body definitions. This creates `O(M × C)` traversal in addition to the `symbols × inner classes` containment checks.

An isolated single-class benchmark demonstrates the growth:

| Methods | Source bytes | Analysis time |
| ------: | -----------: | ------------: |
|      50 |        1,839 |         67 ms |
|     100 |        3,689 |        173 ms |
|     200 |        7,589 |        749 ms |
|     400 |       15,389 |      3,158 ms |

Eight times as many methods produced roughly 47 times the analysis time.

Python bare-call resolution has a second independent rescan. `isPythonShadowedByEnclosingScope` builds a fresh set of bound names for every call, walks the enclosing function body, and collects assignments, loop targets, aliases, and named expressions while excluding nested function/class scopes. A function with `Q` candidate calls and `B` body nodes therefore approaches `O(Q × B)` even though its lexical bindings are identical for every call in that function.

### TypeScript and JavaScript adapter

`collectTypeDeclarations` performs one recursive pass for type nodes and another for all method nodes, but discards the opportunity to index them. For each type it searches the complete symbol list for the owner, iterates the complete symbol list again for members, and for every contained member calls `memberNodes.find` by name and source line.

The dominant shape is therefore `O(T × S + member candidates × all member nodes)`. A synthetic benchmark produced:

| Classes | Methods | Source bytes | Analysis time |
| ------: | ------: | -----------: | ------------: |
|      10 |     200 |        3,930 |         72 ms |
|      20 |     400 |        7,870 |        145 ms |
|      40 |     800 |       15,750 |        427 ms |
|      80 |   1,600 |       31,510 |      1,453 ms |

An actual 868 KB vendored `ext-all-debug.js` file took approximately six seconds in `analyzeFile`, while a 109 KB project JavaScript file took approximately 409 ms. ICCMS currently discovers such vendored files, so this cost materially extends the run after the PHP blocker is removed.

### Go adapter

Go is not the immediate ICCMS trigger, but it contains the same repeated-lookup family:

- Struct and interface owners are associated with repeated `symbols.find` calls.
- Every interface method performs another full symbol search constrained by the owner range.
- Every receiver method searches the complete symbol list by kind, name, and line.
- Logical member classification uses `typeInfos.some` per method to decide whether it is an interface signature.
- Every struct is compared with every interface, and `completeMethodSet` recursively expands embedded-interface method sets again for each struct/interface pair.

The struct-to-interface comparison is semantically necessary when every possible same-file implementation fact must be considered. Re-resolving owners, method IDs, signature membership, and identical embedded-interface closures is not. A generated benchmark grew from 10 ms to 83 ms for an eightfold input increase; it is not currently catastrophic, but the present structure will amplify files with many types and interfaces.

### Shared callable containment

All four adapters use `findContainingCallableSymbol` to identify the innermost function or method containing a call position. The helper currently:

1. Filters the complete `symbols` array for every query.
2. Allocates a new eligible-candidate array.
3. Sorts that array by latest start, earliest end, then stable symbol ID.
4. Returns the first candidate.

For `Q` call sites and `S` symbols, this costs up to `O(Q × (S + K log K))`, where `K` is the number of containing callable candidates, and repeats identical policy filtering and ordering. Graph impact reports this helper as `MEDIUM` risk because it is used directly by PHP, Python, TypeScript, and Go call-fact extraction.

### Consequences

The current algorithms have four user-visible effects:

- Large valid source files can make indexing appear permanently frozen.
- Progress cannot advance while one synchronous file analysis is trapped in repeated native calls.
- NAPI wrapper churn and full routine-text retention amplify garbage-collection and memory pressure.
- Incremental indexing does not help a forced/full rebuild or a changed large file because the pathological work occurs inside that file's required analysis.

The separate `napi-keepalive` mechanism makes total-run memory pressure worse but is not the cause of these repeated per-file operations. Its lifecycle, worker recycling, memory guards, and native finalizer safety belong to `bound-indexer-ast-resource-lifecycle`.

## Proposed solution

### Common strategy

Every piece of parser evidence needed more than once within a file will be collected once into compact, file-local indexes. Later phases will use stable keys or owner associations instead of rediscovering AST nodes through recursive traversal or scanning complete collections.

The change will follow these rules:

- Parser nodes remain authoritative. No optimized path may infer syntax from source-line regular expressions.
- Owner/member association must use exact parser-backed identity evidence such as kind, name, source start, and containment; name-only matching is insufficient.
- Index construction may traverse relevant AST nodes once. Querying that index must not traverse method/function bodies or the complete file again.
- Lexical-scope summaries must respect scope boundaries and must not import bindings from nested functions or classes.
- Indexes are local to a single `analyzeFile` invocation or its compact returned analysis. This change does not retain raw AST nodes across files or alter native-root lifetime.
- Any ordering derived from maps or sets must be normalized to preserve deterministic symbols, facts, relations, and diagnostics.

### PHP changes

- During class-like traversal, inspect the owner's direct `declaration_list` once.
- Associate each direct `method_declaration` with its extracted method symbol using a stable declaration key derived from parser position and declared name.
- Read `static_modifier` only from that method declaration's direct children; preserve `__construct` as `MemberKind.Constructor` regardless of modifiers.
- Reuse an owner/member index instead of looping over all symbols and recursively recollecting all methods per member.
- Preserve class, interface, enum, and trait ownership; trait-use, extends, and implements extraction; property classification; and all existing ranges.
- Delete `PhpScopeInfo`, `PhpParserState.scopes`, the `walkScopes` traversal, and full routine `node.text()` retention because no consumer exists. If implementation discovers a real consumer before deletion, it must stop and move the required compact fact into an explicitly consumed structure rather than retaining opaque routine text.

Target member-classification complexity is one bounded owner-body pass plus indexed lookup: approximately `O(C + M)` per owner instead of `O(M × C)`, without descending into method bodies for member modifiers.

### Python changes

- Inspect the direct `class_definition -> block` entries once, including `decorated_definition` wrappers whose direct definition is a function.
- Build direct-member records keyed by parser-backed declaration identity, carrying the normalized decorator evidence required for constructor, static/class method, property getter, and setter classification.
- Do not classify nested functions or methods of nested classes as members of the outer class.
- Associate nested classes and members through explicit owner indexes rather than running `symbols.some` for every candidate.
- Build each function's bound-name summary once from parameters, assignment targets, augmented assignments, loop targets, `as` aliases, and named expressions while excluding nested lexical scopes.
- Reuse that summary for every bare-call shadowing query in the function.

The optimization must preserve these distinctions:

- `__init__` and `__new__` remain constructors.
- `@staticmethod` and `@classmethod` remain static dispatch under the shared model.
- `@property` and `.setter` remain getter/setter accessors.
- Multiline decorators, comments between decorators and definitions, qualified decorator text, nested classes, nested functions, and identical method names in different owners remain parser-resolved and deterministic.

Target member-classification complexity is approximately `O(C + M)` per owner. Target shadowing work is one `O(B)` summary per lexical scope plus constant or logarithmic lookup per candidate call, rather than `O(Q × B)`.

### TypeScript and JavaScript changes

- Build owner-symbol and member-node maps during or immediately after the existing AST collection passes.
- Use exact position/name/kind keys to connect parser nodes to extracted symbols without `symbols.find` or `memberNodes.find` in nested loops.
- Group members by their nearest declaring class/interface once, so each type consumes only its own members.
- Preserve overload ordering, accessors, static/instance dispatch, constructors, abstract/interface signatures, properties, parent IDs, heritage ranges, and nested type boundaries.

Target association complexity is near `O(N + S)` for index construction and consumption, excluding semantically required hierarchy-relation work, instead of multiplying types, symbols, and member-node arrays.

### Go changes

- Build declaration indexes for named types and receiver methods keyed by parser-backed kind/name/location.
- Build direct maps from member symbol ID to owner and from interface method symbol ID to signature membership.
- Replace `typeInfos.some` per method with set membership.
- Memoize each local interface's complete embedded method set, including an explicit unresolved/unknown result when any embedded interface cannot be proven locally.
- Reuse memoized method sets across all struct/interface comparisons.
- Preserve pointer-receiver evidence, package export rules, embedded-interface ordering, conservative unknown handling, and the rule that empty or incomplete method sets prove no `IMPLEMENTS` relation.

The necessary `structs × interfaces × required methods` comparison may remain because it emits distinct potential implementation facts. Its inputs must be preindexed so recursive interface expansion and symbol association do not repeat within each pair.

### Shared callable-containment changes

- Construct the set of eligible callable symbols once per file and policy instead of per call.
- Normalize it once using the existing innermost ordering semantics: latest start, earliest end, then symbol ID.
- Provide indexed containment queries that avoid allocating and sorting a fresh candidate list for each position.
- Preserve half-open source ranges (`start <= position < end`), allowed callable kinds, optional eligible-symbol restrictions, innermost selection, and deterministic tie-breaking.

The target is one `O(S log S)` index build and bounded queries proportional to nesting depth or logarithmic search plus nesting depth, rather than filtering and sorting the complete symbol set for all `Q` calls.

### Semantic invariants

For identical content and session context, the optimized implementation must preserve:

- Every `SymbolNode`, including ID, kind, `parentId`, construct range, selection range, namespace, and deterministic order.
- Every `BindingFact`, `CallFact`, import declaration, public binding, hierarchy fact, and coverage diagnostic.
- Every logical owner and `MemberSemantics` axis: `kind`, `dispatch`, `accessor`, and visibility where supported.
- Every persisted relation and its metadata, including `CALLS`, `CONSTRUCTS`, `USES_TYPE`, `EXTENDS`, `IMPLEMENTS`, and `OVERRIDES`.
- Conservative unresolved behaviour: optimization must not turn ambiguous or unsupported syntax into a guessed target.
- Incremental/full-rebuild equivalence and compatibility with hydrated files.
- Parser-authoritative handling of multiline syntax, comments, same-name declarations, nested owners, same-line constructs, overloads, and exact half-open ranges.

No public API, graph-store schema, logical-symbol encoding, persisted relation format, package-resolution rule, or language capability flag changes as part of this work.

### Verification strategy

Verification will combine semantic parity and deterministic complexity evidence:

1. Existing adapter and cross-language conformance suites must pass unchanged.
2. Add focused fixtures for direct versus nested members, repeated names, multiline decorators/modifiers, overloads, nested scopes, interface embeddings, and containment boundary positions.
3. Compare complete normalized analysis output before and after optimization for representative fixtures where a pre-change result can complete safely.
4. Add generated large-file fixtures that scale one dimension at a time: methods per owner, calls per function, types/members per file, and structs/interfaces per Go file.
5. Instrument or inject traversal/lookup counters at an internal test seam so tests can assert that owner bodies, lexical scopes, member collections, and callable ordering are built once rather than once per query.
6. Retain timing benchmarks as diagnostic regression evidence, including the ICCMS-shaped PHP fixture, but do not make absolute milliseconds the sole CI gate because hosts and operating systems vary.
7. Assert that PHP parser state contains no unused routine text and that Pass 2 results remain identical without `scopes`.

The real ICCMS file is evidence and a manual end-to-end validation target. Proprietary source must not be copied into the repository; committed regression fixtures should reproduce its structural shape synthetically.

## Specs affected

### New specs

None.

### Modified specs

- `code-graph:language-adapter`: define the shared bounded-work contract for reusable file-local structural indexes, lexical summaries, and callable containment while preserving parser authority, deterministic output, conservative resolution, and cross-language conformance.
  - Depends on (added): none.
  - Depends on (removed): none.
- `code-graph:php-language-adapter`: require direct-owner member indexing, bounded parser work for member semantics, preservation of PHP class-like ownership semantics, and removal of unconsumed full routine-text parser state.
  - Depends on (added): none.
  - Depends on (removed): none.
- `code-graph:python-language-adapter`: require direct class-member/decorator indexing, explicit nested-owner boundaries, and reusable lexical bound-name summaries for shadowing.
  - Depends on (added): none.
  - Depends on (removed): none.
- `code-graph:typescript-language-adapter`: require indexed type/member association with exact parser-backed identity and preserved overload, accessor, ownership, and hierarchy semantics.
  - Depends on (added): none.
  - Depends on (removed): none.
- `code-graph:go-language-adapter`: require indexed declaration/receiver association, constant-time signature membership, and memoized complete interface method sets while retaining conservative interface satisfaction.
  - Depends on (added): none.
  - Depends on (removed): none.

All five specs already exist and are registered in the change. Their existing dependency relationships remain unchanged.

## Impact

### Implementation surface

The intended production-code surface is confined to `@specd/code-graph`:

- `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`
- `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`
- `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`
- `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`
- `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts`

Expected test surface:

- The four adapter test files under `packages/code-graph/test/infrastructure/tree-sitter/`
- `reference-fact-helpers.spec.ts`
- `language-adapter-conformance.spec.ts`
- Generated performance/complexity fixtures or helpers under the same package test tree

No change outside `packages/code-graph` is currently required. If implementation needs a public SDK, CLI, configuration, or persistence change, that is scope drift and must return to design rather than being added opportunistically.

### Blast radius and risk

Graph impact classifies `phpMemberSemantics`, `pythonMemberSemantics`, and TypeScript `collectTypeDeclarations` as `HIGH` risk because their analysis feeds the public code-graph provider and SDK indexing orchestration. `findContainingCallableSymbol` is `MEDIUM` risk and has direct callers in all four built-in adapters. The files also sit behind composition exports used by graph indexing, impact analysis, project status, implementation review, and SDK host integration.

The risk is semantic rather than API-shaped: a wrong owner, range boundary, decorator, modifier, or tie-break can silently redirect relations. Consequently, reducing elapsed time is insufficient evidence; output equivalence and conservative failure behaviour are mandatory.

### Active-change overlap

The affected specs overlap:

- `code-graph-file-outline`
- `code-graph-symbol-contracts`
- `go-selectors-python-reexports` for Python and Go

The user explicitly accepted these overlaps. This change must keep its deltas limited to bounded adapter analysis and must reconcile merged previews before archive so it does not overwrite newer symbol, outline, selector, re-export, or hierarchy requirements.

## Technical context

### Regression history

The older working branch classified PHP constructor/static form with a constant-time declaration-line check. A later cross-language semantic unification correctly moved authority into the parser but implemented it as a recursive owner traversal per method. The regression is therefore not an argument for returning to regular expressions; it demonstrates that parser authority needs indexed access.

The reported introducing commit and message differed between investigation notes (`2d4423557` was described with two related cross-language/code-graph messages). The proposal intentionally anchors the defect to current symbols and measured behaviour rather than relying on commit-message wording. Historical attribution can be corrected during design without changing scope.

### Allocation model

AST access through `@ast-grep/napi` is not equivalent to walking an in-memory plain JavaScript object. Every repeated `children()`, `field()`, `parent()`, `range()`, `kind()`, or `text()` may cross the native boundary and create wrappers or strings. The optimization must therefore minimize both asymptotic visits and repeated property extraction from the same node.

File-local indexes should retain only the minimum evidence needed until `analyzeFile` returns. Compact serializable facts required by Pass 2 may remain in `FileAnalysis`; raw nodes and copied routine bodies must not be added to parser state by this change.

### Boundaries with the NAPI lifecycle change

`bound-indexer-ast-resource-lifecycle` owns:

- Run-wide `napi-keepalive` root retention
- Native-finalizer/double-free reproduction and dependency upgrade evaluation
- Safe root disposal boundaries
- Worker batching or recycling
- Cleanup on success, failure, and cancellation
- Memory/resource guards and associated IPC diagnostics
- Progress/observability tied to worker/resource lifecycle

This change owns only work performed while analyzing one file and the compact facts retained from that analysis. Neither change formally depends on the other. Applying both should be additive: this change reduces native operations per file; the lifecycle change bounds how many native roots survive across files.

### Explicit exclusions

- ICCMS `specd.yaml` glob corrections and vendor/generated-file exclusions belong to ICCMS configuration.
- General file discovery, binary classification, and document indexing are unchanged.
- Absolute memory limits and RSS behaviour are not acceptance criteria here because root lifetime is handled separately.
- No speculative generalized AST framework or cross-language grammar abstraction is required. Shared helpers are justified only where all current adapters consume the same semantic operation.
- No concurrent per-file traversal is introduced; the immediate problem is synchronous repeated work, and concurrency would multiply native safety and memory risks.

## Open questions

None.

The following decisions are closed for downstream artifacts:

- PHP, Python, TypeScript, Go, and shared callable containment are all in scope.
- Parser-backed single-pass/indexed evidence replaces repeated traversal; source-line regex classification is not restored.
- Python lexical shadowing summaries are cached per scope with nested-scope boundaries.
- Go method-set prerequisites are indexed/memoized, while semantically necessary struct/interface comparisons may remain.
- Unused PHP `parserState.scopes` and its full routine text are removed unless a concrete consumer is discovered before implementation; discovering one requires an explicit compact replacement and design review.
- Semantic parity and deterministic work-bound tests are required; wall-clock thresholds alone are insufficient.
- Native AST root lifetime and worker memory resilience remain exclusively in `bound-indexer-ast-resource-lifecycle`.
