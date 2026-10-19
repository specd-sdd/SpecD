# Partial compliance audit: resolve-symbol-reference, traversal, composition, sdk run-graph-impact, cli graph-impact

Change: cross-language-symbol-semantics. Read-only audit. Specs were fetched merged with deltas through `changes spec-preview`.
Paths are relative to /Users/monki/Documents/Proyectos/specd. SDK = packages/sdk/src/orchestration/run-graph-impact.ts (abbrev. RGI).
Severity: HIGH = behaviour contradicts a MUST/SHALL; MEDIUM = partial or missing behaviour; LOW = docs, naming, test, minor.

Cross-spec findings (details in the per-spec sections):

- X1 (HIGH). Bare-name or file-qualified symbol selectors never reach a logical target. A multi-declaration overload set collapses to one physical declaration, and the SDK runs physical impact on it. It touches resolve-symbol-reference, traversal, sdk:run-graph-impact and cli:graph-impact.
- X2 (MEDIUM). Public-export impact skips path projection for nested resolution/binding/target evidence.
- X3 (MEDIUM). Covering-spec `file` evidence targets are not projected to `projectRelativePath`.
- X4 (MEDIUM). Logical-target impact omits the target's own `COVERS_SYMBOL` specs (roots have no depth 0 in the coverage frontier).
- X5 (MEDIUM). `analyzePublicBindingImpact` still uses the legacy physical aggregation. It produces no logical dedup and no semantic counts.
- X6 (LOW-MEDIUM). Spec-text self-contradictions between old and new requirements (see "Spec-side issues").

---

## 1. code-graph:resolve-symbol-reference

### Requirements Summary

1. Structured reference input. Qualified `Tipo.miembro` / `Tipo::miembro` resolves by `qualified_name` equality with no file, surface or language. Every match is returned. A file or surface filters the matches. Other human text goes to the adapter chosen from explicit language, anchored file or surface metadata, and is otherwise unresolved. Case follows the language. `MemberForm` is not an input field.
2. Logical canonical targets. Overloads and merges form one logical target with every declaration occurrence. Selector-level resolution of same-logical-symbol candidates returns `resolved`.
3. Resolution target kind. The result is discriminated into logical-target and exact-declaration, and a consumer must not reduce a logical result to an arbitrary first declaration.
4. Public and local binding identity. Public slots are keyed by surface, name and space. Local bindings keep scope.
5. Deterministic precedence: canonical id, qualified_name, exact declaration, public binding, scoped import, hierarchy. A same-name guess is never accepted.
6. Outcomes: resolved, ambiguous, unresolved, missing, each with a reason code and ordered evidence.
7. Freshness and coverage gate.
8. Hierarchy-aware members.
9. Batch and backend-independent resolution.

### Implementation Status

| Req                                    | Status                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Structured input / qualified lookup  | Implemented                 | `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts` `resolveQualifiedMember` (~976-1046) uses stored `qualifiedName` and `store.findLogicalSymbolsByQualifiedNames` (execute ~105). It filters with `symbolVisibleIn` when anchored, and returns unresolved `REFERENCE_UNPROVEN` when there is no match. Adapter selection is in `parseAnchoredReference` (~1048). The code never falls back to a default language. Without file or language it returns `REFERENCE_UNPROVEN` (~1017).                                                                 |
| 1 case rules                           | Partial                     | No code lower-cases globally. Equality is exact string compare in `matchesRequest`. Per-language case folding is not exercised anywhere, because the resolver itself does no folding.                                                                                                                                                                                                                                                                                                                                                                                         |
| 2 Logical canonical targets            | Implemented in the resolver | `groupDeclarations`, `candidateFor`, `outcomeFromCandidates` (~560-600) give one candidate per logical target, with all declarations. Competing logical targets return `ambiguous` / `AMBIGUOUS_LOGICAL_TARGET`.                                                                                                                                                                                                                                                                                                                                                              |
| 2 Selector-level same-logical resolved | Partial, with a defect      | `packages/code-graph/src/application/services/resolve-graph-selector.ts:410-431` `resolvedResult` -> `unifyOverloadSetCandidates` (367-401) returns `{status:'resolved', match: first}` with NO `target`. Overload members (same file/parent/name) are unified to one arbitrary physical declaration. Bare-name (271-281), full-id (172-190) and file-qualified (non-exact-lane, 255-263) branches all go through this path. The logical-id branch of `unifyOverloadSetCandidates` (380) cannot fire on these paths, because `match` never carries `logicalId` there. See D1. |
| 3 Target kind discriminant             | Implemented in the resolver | `resolve-symbol-reference.ts:~520-545` emits `kind: 'public-binding' \| 'logical-target'`; the exact path emits `kind: 'declaration'` (~386). `ResolvedGraphDeclarationSelector.kind?`/`target?` stay optional (`resolve-graph-selector.ts:60-61`), so the selector-level discriminant is not total.                                                                                                                                                                                                                                                                          |
| 4 Bindings                             | Implemented                 | `candidatesFromBindingTargets` (773), the `publicBindings` filter on surface, exportedName and space (~496), local binding filter with `scopeId` (~510). A local alias is not classified as public.                                                                                                                                                                                                                                                                                                                                                                           |
| 5 Precedence                           | Implemented                 | `resolvePrepared` (473-528) order: qualified, exact logical/file/owner, public, local, hierarchy, absence. An un-proven same-name symbol gives `absenceOutcome` / unresolved.                                                                                                                                                                                                                                                                                                                                                                                                 |
| 6 Outcomes                             | Implemented                 | `absenceOutcome` (692), `unresolved` (754). Exact-declaration ambiguity returns `candidates: []` (~292-303), so the candidate summaries "when candidates exist" are omitted.                                                                                                                                                                                                                                                                                                                                                                                                  |
| 7 Freshness gate                       | Implemented                 | `executeBatch` (~203-211) calls `assessResources` once, deduplicated (`deduplicateFileResources`), and the surface is assessed as the resource when no file is given (~200). `candidateEvidenceIssue` (604) checks per-declaration freshness and coverage. The exact-declaration freshness/coverage gate (~322-352) only runs when `assessResources` is defined.                                                                                                                                                                                                              |
| 8 Hierarchy                            | Implemented                 | `hierarchyCandidatesForRequest` (792), `tracePaths` (823), `memberLookupAxes` (1283).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 9 Batch                                | Implemented                 | A single `getHealth` and batched store queries in `executeBatch`. Backend parity relies on the contract suite `packages/code-graph/test/domain/ports/graph-store.contract.ts`.                                                                                                                                                                                                                                                                                                                                                                                                |

### Discrepancies

- D1 (HIGH). Spec: "A consumer MUST NOT ... reduce a logical result to an arbitrary first declaration", and logical selectors resolve at the logical layer. Code: `resolveSymbolSelector` for bare names, full ids and file-qualified names returns a physical `match` without `target`/`kind` and never calls the shared resolver (only the qualified-member, `logical|2|` and exact-lane branches do, lines 192 and 207-235). For an overload set, `unifyOverloadSetCandidates` (367-401) returns `first` (sorted by filePath, symbolId). The test `resolve-graph-selector.spec.ts:357-396` asserts only that the match is "one of" the overloads, which locks in the arbitrary pick. Spec side: the "Selector candidate declarations of same logical symbol resolve without ambiguity" scenario requires "all declaration occurrences are retained on the resolved logical symbol". The code retains only one. Code side: it is a documented-looking compat path, but the spec forbids the compat branch.
- D2 (MEDIUM). `ResolvedGraphDeclarationSelector.kind` and `.target` are optional (`resolve-graph-selector.ts:60-61`). Spec: "Public compatibility changes ... MUST use an explicit discriminant", and "A consumer MUST NOT infer target kind from a legacy field". The SDK infers a declaration target from `target === undefined` (RGI:617-648), i.e. by absence.
- D3 (LOW). Exact-declaration `ambiguous` (`AMBIGUOUS_DECLARATION`) and `unresolved` results carry `candidates: []` (`resolve-symbol-reference.ts:~292-303`). The spec says "deterministically ordered candidate summaries when candidates exist", and candidates do exist in that case.
- D4 (LOW). Qualified lookup with no anchor filters on `request.workspace` when non-empty (`resolve-symbol-reference.ts:~1000`). The spec says the lookup must not require a file, surface or language, and says nothing about workspace. This is consistent with "workspace is a required input field". The SDK/selector path passes `workspace: ''`, so it is un-restricted. Behaviour is not covered by a test.
- D5 (LOW, spec silent). The parsing of mixed qualified spellings relies on `qualifiedLookupText`. A path-like spelling containing a dot (`foo.bar` as a bare property name with no owner) would be treated as a qualified name. The spec does not define a guard.

### Test Coverage (packages/code-graph/test/application/use-cases/resolve-symbol-reference.spec.ts unless noted)

| Scenario                                                                                | Test                                                                                                       |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Structured fields disambiguate a member                                                 | `keeps member forms distinct` (686); `resolves the owner before the member...` (848)                       |
| Unanchored dotted / `::` / several equal / anchored filter                              | 738, 784, 822                                                                                              |
| Overloads form one logical symbol                                                       | partial: `discriminates logical target with all contributing declarations` (982)                           |
| Competing declarations remain ambiguous                                                 | 526, 1301                                                                                                  |
| Selector candidates of same logical symbol resolve                                      | only physical-level in `resolve-graph-selector.spec.ts:357,398`; does NOT assert all declarations retained |
| Logical selector returns every declaration / exact location / competing logical targets | 982, 1098/1067, 1301                                                                                       |
| Parallel re-exports / competing routes                                                  | 206, 484                                                                                                   |
| Shadowed local alias                                                                    | 550                                                                                                        |
| Same-name not proof                                                                     | 315                                                                                                        |
| Public binding by surface+name; file path alone                                         | 896                                                                                                        |
| Value/type pair ambiguous                                                               | 927                                                                                                        |
| Missing member of known owner unresolved                                                | 784 (does not borrow a missing member)                                                                     |
| Legacy id / canonical id                                                                | 957                                                                                                        |
| Ambiguity never selects a winner; complete fresh absence missing                        | 526, 331                                                                                                   |
| Dirty addressed file; coverage failure; surface proves missing                          | 427, 450, 367/387/407                                                                                      |
| Hierarchy: nearest ancestor, equal-depth ambiguity                                      | 573, 602                                                                                                   |
| Batch shares health                                                                     | 665                                                                                                        |
| Contract: identical ordered evidence across backends                                    | `graph-store.contract.ts` (not verified in this audit)                                                     |

### Missing Tests

- Language case rules preserved (no test).
- Conditional candidates require context (only the `rejects a proven candidate when requested build context was not indexed` test at 289 touches this).
- Local override wins over inherited member, and competing inherited members are ambiguous (only the nearest/equal-depth test at 602 is related).
- "Supplied batch health still assesses exact resources" (the 231 test covers part of it).
- Overload set at the selector level retaining ALL declarations (the current test would pass the buggy behaviour).
- Qualified lookup filtered by workspace (D4).

### Summary counts

Requirements 9: fully implemented 7, partially 2 (req 2 selector-level, req 3 optional discriminant). Discrepancies: HIGH 1, MEDIUM 1, LOW 3. Scenarios with no direct test: about 5 of 37.

---

## 2. code-graph:traversal

### Requirements Summary

Upstream/downstream traversal, bounded batched execution, bounded hotspot retrieval, TraversalOptions/Result, impact analysis with risk thresholds and category filtering, filtered impact results, static type dependency impact, file/multi-file impact, spec impact, change detection, pure functions, resolved canonical and public-binding impact, logical-target impact aggregation, owner-qualified impact target, file-impact covering specs, logical symbol coverage during impact.

### Implementation Status

| Req                                                | Status                            | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Upstream / downstream, batching, TraversalOptions  | Implemented                       | `packages/code-graph/src/domain/services/get-upstream.ts`, `get-downstream.ts` (148 lines each); `map-with-concurrency.ts`                                                                                                                                                                                                                                                                                                                             |
| Bounded hotspots                                   | Implemented                       | `compute-hotspots.ts` with `compute-hotspots.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                                  |
| Impact analysis / risk / filters / static type     | Implemented                       | `analyze-impact.ts` (`SYMBOL_IMPACT_RELATION_TYPES` line 30 covers CALLS, CONSTRUCTS, USES_TYPE, EXTENDS, IMPLEMENTS, OVERRIDES), `resolveAdmittedCategories`, `store.queryImpactFrontier`                                                                                                                                                                                                                                                             |
| File / multi-file / spec impact / change detection | Implemented                       | `analyze-file-impact.ts`, `analyze-files-impact.ts`, `analyze-spec-impact.ts`, `detect-changes.ts`                                                                                                                                                                                                                                                                                                                                                     |
| Pure functions                                     | Implemented                       | All logic is in `domain/services/`                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Resolved canonical + public-binding impact         | Partial                           | `analyzePublicBindingImpact` (`analyze-impact.ts:114`) calls the legacy `analyzeTraversalTargets` for BOTH views (124-140). The bindingImpact seed is `[input.binding.id]` (a binding id used as a symbol-frontier root). canonicalImpact seeds every declaration, but uses physical counting: no logical dedup, no `semanticCounts`.                                                                                                                  |
| Logical-target aggregation                         | Implemented, with caveats         | `analyzeResolvedSymbolImpact` (164-): roots = every distinct declaration (179-186); BFS over `queryImpactFrontier`; `findLogicalDeclarationsByDeclarationIds` groups reached declarations; semantic targets once at the shallowest depth (~395-470); `semanticCounts` separates logical targets from `physicalDeclarationOccurrences`; physical-only retained. Exact declaration seeds only the selected occurrence (182-183). Caveats: see D3 and D4. |
| Owner-qualified impact target                      | Implemented at the selector layer | `resolveUnanchoredQualifiedSelector` (`resolve-graph-selector.ts:~283-400`) calls the shared resolver. Traversal receives proven ids only.                                                                                                                                                                                                                                                                                                             |
| File-impact covering specs                         | Implemented                       | `analyze-file-impact.ts:175-223` sets input file symbols to depth 0 and batches `collectCoveringSpecs` (378-)                                                                                                                                                                                                                                                                                                                                          |
| Logical symbol coverage                            | Mostly implemented                | `collect-impact-specs.ts:79-` maps physical to logical ids, deduplicates, then queries once; when `symbolFrontier` is empty the symbol coverage store call is skipped (120).                                                                                                                                                                                                                                                                           |

### Discrepancies

- D1 (HIGH, inherited from resolve-symbol-reference D1). "Symbol impact SHALL resolve a selector to one logical canonical target before traversal." Bare-name/file-qualified selectors yield a physical match, so traversal begins from one declaration of an overload set. The spec scenario "Every declaration seeds logical impact" holds only when a typed logical target is supplied.
- D2 (MEDIUM). Public-binding impact does not use logical aggregation. Spec: "a logical symbol with multiple declaration occurrences SHALL be counted once", and "Physical occurrence counts and unique logical-target counts MUST use distinct result fields". `analyzePublicBindingImpact` returns plain `ImpactResult` (no `semanticCounts`, no `semanticAffectedTargets`). `canonicalImpact` is therefore not dedup'd by logical identity. It also has no covering-specs payload in the SDK export result.
- D3 (MEDIUM). Root declarations are never entered into `symbolDepthMap` (`analyze-impact.ts:288` only assigns reached ids). `collectLogicalCoveringSpecs` is then called (508) with symbolDepths lacking the roots, so specs covering the target logical symbol itself (the main "which specs govern this symbol" question) are excluded. The spec says file-impact roots are depth 0, and the file-impact code does set depth 0 (`analyze-file-impact.ts:176`). The spec's logical-coverage section says "every reached physical declaration"; a root is not "reached", so this is arguable. The legacy symbol path (`analyzeFilteredTraversalTargets`, scenario "derives specs-only symbol impact from root and admitted coverage") includes the root. Behavioural regression between legacy and logical paths.
- D4 (LOW-MEDIUM). Risk and dependent counts for logical impact use `Math.max(semanticDirect, fileDirect)` (`analyze-impact.ts:501`). The spec: "Risk SHALL be computed from the documented semantic unit". Mixing file counts into the semantic count changes the unit. The result's `directDependents` is not documented as logical or physical.
- D5 (LOW). The physical-only coverage classification is only implicit (the physical-only declarations are skipped). The spec says: "classify the evidence explicitly as physical-only or coverage-not-applicable". The semantic target list does carry `kind: 'physical-only'`, but covering-spec results carry no explicit classification.
- D6 (LOW). The resolved path leaves `affectedProcesses: []` always (~560), while the spec says processes are included "when process data is available". Likely pre-existing and out of scope.
- Code side evidence of the intended design: `analyzeImpact` (57-) retains the optional `resolution` argument and the physical path (`provider.analyzeImpact`, `code-graph-provider.ts:772`). The facade is public API, which is acceptable for exact-declaration semantics.

### Test Coverage

`packages/code-graph/test/domain/services/traversal.spec.ts` covers upstream/downstream, hierarchy, CONSTRUCTS/USES_TYPE, wide frontier batching (274, 407), risk thresholds (999-1045), category filters (1047-1137), specs-only filters (725, 930, 966), immutability (1138) and `analyzeResolvedSymbolImpact` (1163-1451: seeds from every declaration, aggregation and physical counts, exact not widened, physical-only, covering specs with declaration evidence). `analyze-files-impact.spec.ts:211` covers `analyzePublicBindingImpact` (also `code-graph-provider.spec.ts:902,938`, `index-project-graph-integration.spec.ts:532`). `compute-hotspots.spec.ts` covers hotspots.

### Missing Tests

- Logical aggregation of canonicalImpact for public bindings (D2).
- A logical-target impact whose own symbol is covered by a spec (D3).
- "All-physical-only traversal skips logical coverage storage" (no assertion that the store method is NOT called; test 1336 only checks classification).
- Bounded concurrency for multi-file impact against `StoreOverloadError` is tested only in `analyze-files-impact.spec.ts` (not re-verified).
- Risk invariance when a logical target gains an equivalent declaration (spec statement, no test).
- Overload selector end-to-end (D1).

### Summary counts

Requirements 17: implemented 13, partial 4. Discrepancies: HIGH 1, MEDIUM 2, LOW-MEDIUM 1, LOW 2.

---

## 3. code-graph:composition

### Requirements Summary

Provider facade, filtered-impact surface, factory function, package exports (curated `"."` barrel), public/internal entry points, lifecycle, core dependency, host use cases, symbol-reference provider surface, resolution-aware impact provider surface, adapter-backed normalization, unified search.

### Implementation Status

| Req                               | Status                                                 | Evidence                                                                                                                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Facade                            | Implemented                                            | `packages/code-graph/src/composition/code-graph-provider.ts` (interface ~110-190; class ~700-830)                                                                                                                                              |
| Filtered-impact surface           | Implemented                                            | `analyzeImpact/analyzeResolvedSymbolImpact/analyzePublicBindingImpact/analyzeFileImpact/...` all accept `filter` (interface 145-190). Test `code-graph-provider.spec.ts:790`                                                                   |
| Factory                           | Implemented (not re-audited: unchanged by this change) | tests 102-239                                                                                                                                                                                                                                  |
| Package exports                   | Partial                                                | `packages/code-graph/src/public.ts`, see D1                                                                                                                                                                                                    |
| Lifecycle                         | Implemented                                            | tests 397-475                                                                                                                                                                                                                                  |
| Symbol-reference provider surface | Implemented                                            | `resolveSymbolReference(s)` (interface ~128-135), `getExactPublicBinding` (class 721-740; matches on surface, exportedName, space and `targetId`, no ranked search), typed `InvalidGraphSelectorError` code `INVALID_GRAPH_SELECTOR`, test 967 |
| Resolution-aware impact surface   | Implemented                                            | `analyzeResolvedSymbolImpact` (class ~791-799) delegates to the domain with the typed target. Public-binding preserved via `analyzePublicBindingImpact`. The facade never loads one declaration.                                               |
| Adapter-backed normalization      | Implemented                                            | test 991 `shares one adapter registry between indexing and resolution`                                                                                                                                                                         |
| Unified search                    | Implemented (unchanged)                                | tests 619, 656                                                                                                                                                                                                                                 |

### Discrepancies

- D1 (MEDIUM, spec drift both ways). Spec "Package exports": the `"."` barrel "SHALL export only" an enumerated list. `src/public.ts` additionally exports, among others: `analyzeImpact`, `analyzeResolvedSymbolImpact`, `analyzePublicBindingImpact` (lines ~213-215), `collectImpactSpecIds`, `collectLogicalCoveringSpecs` (~219), `classifyFileCategory`, `normalizeFileSelectorPath`, `createLogicalSymbol`, `parseLogicalSymbol`, `createPublicBinding`, `createLocalBinding`, `FreshnessMode/State/IndexedInputKind`, `InvalidGraphSelectorError`, `GraphBusyError`, `FILE_CATEGORIES`. Several of these are plausibly intended by "resolver ... factories" and "logical-symbol/public-binding vocabulary", but the traversal functions that take an internal `GraphStore` (`analyzeImpact`, `analyzeResolvedSymbolImpact`, `collect*`) are not host-usable (they require a `GraphStore`, which is not public) and contradict "concrete resolver implementations ... SHALL remain internal". The spec list also omits types the barrel needs (`DeclarationOccurrence`, `ResolvedSymbolTarget`, `ExactPublicBinding*`) — they are covered only by the generic "vocabulary" sentence.
- D2 (LOW). `ResolvedSymbolSelectorResult` types are exported from `"."` (public.ts). The facade method `resolveSymbolSelector` returns the compat type with optional `kind/target` (see resolve-symbol-reference D2/D1). The spec for "Resolution-aware impact provider surface" says compatibility fields "MUST be derived explicitly and MUST NOT obscure whether an identifier is logical or physical". `ResolvedSymbolSelector.symbolId` (physical id) sits next to an optional `logicalId`.
- D3 (LOW). Spec dependency/behaviour text for the provider says the surface exposes "an impact operation that accepts or internally preserves the discriminated resolution produced for the requested selector". The provider exposes two separate steps (`resolveSymbolSelector` then `analyzeResolvedSymbolImpact`) and keeps the physical `analyzeImpact(target: string, ...)`. That is allowed ("exact declaration retains physical semantics") but the physical method accepts any symbol id, so nothing prevents a host from calling it for a logical target. The SDK does not.
- D4 (LOW). `src/index.ts` ("./internal") was not diffed against the spec. Out of scope.

### Test Coverage

`packages/code-graph/test/composition/code-graph-provider.spec.ts`: 121 (resolved impact with the full logical declaration set), 475, 489, 521, 542 (exact binding without ranked search), 790 (filter forwarding), 967 (typed selector error), 991 (shared registry). `packages/code-graph/test/barrel.spec.ts` exists but contains no assertion about `analyze*`/`collect*` exports (grep found none), so the "export only" requirement is not enforced for them.

### Missing Tests

- Barrel allow-list assertion for the impact-related exports (D1).
- Provider test for public-binding facade dedup of logical declarations (blocked by traversal D2).

### Summary counts

Requirements 12: implemented 11, partial 1. Discrepancies: MEDIUM 1, LOW 3.

---

## 4. sdk:run-graph-impact

### Requirements Summary

1. Orchestration: all four target families, direction/depth, filter forwarding, transient vs caller-owned provider, file/symbol/spec/export routes, projection to `projectRelativePath`, aggregate metrics.
2. Resolution-preserving symbol impact: pass the discriminated resolution to provider impact; never select `declarations[0]` or call a physical-only method for a logical target; ambiguous/unresolved do not traverse; the result exposes target kind, canonical identity, declarations, physical evidence, semantic affected targets, covering specs and count units; project every nested location.
3. No `displayPath`/`displayTargets`.
4. Pure path projection (no graph reads).
5. No presenter formatting.

### Implementation Status (RGI = `packages/sdk/src/orchestration/run-graph-impact.ts`)

| Req                                                | Status                                            | Evidence                                                                                                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 targets, direction, depth                        | Implemented                                       | files 495-575 (`resolveOneFile`, `analyzeFileImpact`/`analyzeFilesImpact`), symbol 576-786, spec 788-822, export 824-957; `export/from/surface` pairing check 480-485                         |
| 1 filter forwarding                                | Implemented for file, files, symbol, spec, export | e.g. RGI:496-500, 533-537, 651-659, 794-798, 890-900. Filter is omitted when undefined, which preserves the 3-arg call signature.                                                             |
| 1 provider lifecycle                               | Implemented                                       | `withOpenGraphProvider` at the end of the function (~950); caller-provided provider used directly                                                                                             |
| 1 projection                                       | Implemented for files and symbols                 | `toProjectRelativePath(config, ...)`; no provider reads                                                                                                                                       |
| 2 pass the discriminated resolution                | Implemented for typed targets                     | RGI:617-618 uses `resolved.target` as is; 651-659 `provider.analyzeResolvedSymbolImpact(resolvedTarget, ...)`. `provider.analyzeImpact` is never called in the SDK (grep).                    |
| 2 no `declarations[0]` / physical-only for logical | Partially violated                                | see D1, D2                                                                                                                                                                                    |
| 2 ambiguous/unresolved do not traverse             | Implemented                                       | RGI:576-612 returns before any impact call; the export path returns on `status !== 'resolved'` (850-860) and on `selected === null` (862-882)                                                 |
| 2 result shape                                     | Implemented                                       | `ResolvedSymbolImpactResult` (RGI:220-258): `targetKind`, `resolvedTarget`, `logicalSymbol`, `declarations`, `physicalEvidence`, `semanticAffectedTargets`, `semanticCounts`, `coveringSpecs` |
| 2 count-unit documentation                         | Partial                                           | `semanticCounts` names the units. `directDepsCount/indirectDepsCount/transitiveDepsCount/affectedFilesCount` (236-240) have no TSDoc about unit (the spec says they MUST document it).        |
| 2 nested projection                                | Partial                                           | symbol branch OK (`projectDeclaration`, `projectResolvedTarget`, `projectPhysicalEvidence`, semantic targets 700-736). Export branch and covering specs NOT projected, see D3, D4.            |
| 3 no displayPath                                   | Implemented                                       | not present in the result types                                                                                                                                                               |
| 4 pure projection                                  | Implemented                                       | projection uses `config` only                                                                                                                                                                 |
| 5 no presenter formatting                          | Implemented                                       |                                                                                                                                                                                               |

### Assessment of the known item (RGI:665 `targetDeclarations[0]`)

Code: when the selector came back with a typed `resolved.target`, `sym` is undefined at this point. The block at 664-697 builds a synthetic `SymbolNode` from `targetDeclarations[0]` (name from `logicalSymbol.name` when present, otherwise parsed out of the id via `first.symbolId.split(':').slice(-3)[0]`). `sym` is then used for: the deprecated `symbol` field (returned at ~771), the top-level `projectRelativePath` (738-739 uses `projectedDeclarations[0]` first), and `impact.target` (RGI:742 `target: sym.id`).

Against the scenario "Legacy first-declaration provider fallback is unavailable":

- Scenario text: "it never selects `declarations[0]` or calls physical impact as a compatibility fallback". Strictly, the SDK does select `declarations[0]` (lines 665, 738-739), but only to derive a display/compat summary AFTER the discriminated `analyzeResolvedSymbolImpact` has already run with the complete declaration set. Traversal inputs are not affected. The "impact is physical" reading does not apply to this site: no physical-only provider method is called here. So the known item does not break the traversal guarantee, but it does violate the letter of the requirement ("MUST NOT retain a compatibility branch that selects `declarations[0]`") and the consequence is visible in the output:
  - `impact.target` for a logical target is the first declaration's physical `symbolId` (RGI:742), whereas the domain result's `target` is the logical id (`analyze-impact.ts:~190` `resultTarget`). The same result therefore shows a logical identity in `resolvedTarget` and a physical one in `impact.target`. The spec says compat fields "MUST NOT obscure whether an identifier is logical or physical".
  - `symbol` (typed `SymbolNode`, marked `@deprecated` at RGI:232) for a multi-declaration logical target is an arbitrary declaration; the CLI still prints it (`cli/src/commands/graph/impact.ts:~847`, JSON `symbol: result.symbol` ~930).
  - Name recovery by `symbolId.split(':').slice(-3)[0]` (RGI:~676) is fragile string parsing of a physical id, which conflicts with the "do not parse ids" principle of the resolver spec.
- Spec side: the requirement itself says "Compatibility fields MAY remain during a documented migration" in code-graph:composition, which would allow a derived `symbol` summary, but sdk:run-graph-impact has no such allowance and says "MUST NOT retain a compatibility branch". The two specs disagree; the SDK spec is the stricter and the one that applies here. Verdict: MEDIUM; fix by dropping or documenting `symbol`/`impact.target` as derived, using `logicalSymbol.id` for `impact.target`.

Related fallback at RGI:619-648 (`resolved.target === undefined`): `getSymbol(match.symbolId)` then synthesises a physical `declaration` target. This is the real compat branch and it is the direct cause of X1/D1: an overload set unified by `unifyOverloadSetCandidates` arrives here with one arbitrary `match` and is analysed physically.

### Discrepancies

- D1 (HIGH). RGI:617-648 compat branch for selector results without `target` (bare name, file-qualified, legacy id). A logical target (overload set) is analysed physically through one arbitrary declaration. Violates "MUST NOT load one declaration and invoke impact using only that declaration's physical ID" and the scenario "Logical target is not collapsed to one declaration". Stems from resolve-graph-selector (resolve-symbol-reference D1). Note that exact-declaration selectors are allowed to stay physical ("An exact-declaration selector SHALL retain physical impact semantics"), but a bare-name overload set is not an exact-declaration selector.
- D2 (MEDIUM). Known item above (`sym` from `targetDeclarations[0]`, `impact.target = sym.id`, deprecated `symbol`).
- D3 (MEDIUM). Public-export result does not project nested locations: `resolution` (candidates, `resolvedTarget.declarations[].location`, `path`) is returned raw at RGI:856, 876-879, 929, together with `binding`, `target`, `path` (932-934). The spec: "This includes locations nested under ... resolution evidence, declaration sets, ... public-binding surfaces ... No nested location ... MAY expose only a canonical workspace path". Only `projectRelativeSurface` and the affected files/symbols are projected. `SourceLocation.projectRelativePath` is optional in the type (`code-graph/src/domain/value-objects/source-location.ts`), so the shape allows the omission silently.
- D4 (MEDIUM). `coveringSpecs` evidence is passed through unprojected in the symbol (RGI:755), file (527), files (569) results. Evidence items of `kind: 'file'` carry a canonical `workspace:path` target (`collect-impact-specs.ts:138-143`). The spec lists "covering-spec evidence" explicitly among the locations that MUST be projected. Same for `affectedProcesses`/`affectedSpecs` (these are ids, fine).
- D5 (MEDIUM, spec-side inconsistency). Requirement 1 items 6 and the scenario "Symbol impact analysis" still say `provider.analyzeImpact` / "`analyzeSymbolImpact` is executed". The code calls `analyzeResolvedSymbolImpact`, and the implementation test (SDK test 277) asserts `analyzeImpact` is NOT called. `analyzeSymbolImpact` does not exist anywhere in the repo. The spec text contradicts its own newer requirement.
- D6 (LOW). Export `status: 'not_found'` is used for resolver outcomes of `ambiguous`/`unresolved` (RGI:851-857). The type (RGI:322) allows `'not_found' | 'ambiguous' | 'unresolved'`, but only the first is emitted for a non-resolved resolution (the resolution status is nested). The CLI compensates by reading `result.resolution.status`. For the binding-ambiguity branch `candidates: []` is always empty (RGI:880), so the spec's "ambiguous exports SHALL display deterministic candidates" (cli:graph-impact) cannot be met from this branch.
- D7 (LOW). Symbol `ambiguous` outcome returns physical `candidates` from the selector (RGI:586-611), not semantic candidates. Count units on `directDepsCount` etc. undocumented (see above).
- D8 (LOW). Spec mentions files-impact `symbols` etc. No issue.

### Architecture / global spec consistency

- default:\_global/architecture: hosts use `@specd/sdk` only. `packages/cli/src/commands/graph/impact.ts` imports only `commander`, `@specd/sdk` and local helpers (no `@specd/code-graph` or `@specd/core` import found by grep). OK.
- SDK pulls provider types through its own re-exports (`GraphImpactProvider`). OK.
- Docs: `docs/sdk/index.md`, `docs/cli/graph.md`, `docs/code-graph/index.md` are modified in the working tree and describe logical impact. Not verified that they list `projectRelativePath` gaps (D3, D4).

### Test Coverage (packages/sdk/test/orchestration/run-graph-impact.spec.ts)

73 single-file; 131 multi-file; 203 symbol; 277 logical-target through `analyzeResolvedSymbolImpact` (asserts `analyzeImpact` not called, `getSymbol` not called, nested declaration projection at 434-441); 461/503 provider ownership; 544 spec; 600 export; 708 direction/depth/filter forwarding; 766 not_found; 798 ambiguous; 858 SpecNotFound; 884 selector errors.

### Missing Tests

- Multi-declaration logical target (the spec's scenario literally says "multiple declarations"). The test at 277 should be checked for more than one declaration; its mock is a single-declaration target.
- Selector result without `target` (the compat branch, D1).
- Nested projection for the export path, resolution evidence, and covering-spec evidence (D3, D4).
- "No additional provider reads" during projection (no explicit assertion for the symbol path).
- Count-unit documentation / semantic counts exposed (partially via CLI test 2295).
- Export ambiguity returning candidates.

### Summary counts

Requirements 5 (plus 11 sub-items in req 1): implemented 3, partial 2. Discrepancies: HIGH 1, MEDIUM 4, LOW 3.

---

## 5. cli:graph-impact

### Requirements Summary

Command signature (exactly one target family, export/from together, alias normalization, no CLI resolution), provider-owned filters, file/symbol/spec impact, logical and declaration presentation (delegate to SDK, preserve target kind, JSON/TOON preserve everything, CLI computes nothing), concurrent indexing guard, output format, pure display-path projection, availability once per command, error cases, public export presentation, file-impact covering specs.

### Implementation Status (`packages/cli/src/commands/graph/impact.ts`)

| Req                                                             | Status             | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature, one family, export/from, alias normalization | Implemented        | options parsing (not re-listed); CLI tests 240-380, 641-704, 1492                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Filters                                                         | Implemented        | tests 1698-2240                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| File impact                                                     | Implemented        | `handleFileImpact` ~625-780, delegating to `runGraphImpact`                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Symbol impact (older requirement)                               | Superseded         | the requirement still describes `analyzeImpact(symbolId)` and "analyzes each one"                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Logical and declaration presentation                            | Mostly implemented | `handleSymbolImpact` ~790-950: delegates to `runGraphImpact` (794), `Target kind:` line (851-857), logical label (845-846), semantic counts (859-867), declarations list (869-878), semantic affected targets with `[logical]`/`[physical-only]` (880-897), physical evidence (899-907), covering specs (909), JSON/TOON include `targetKind`, `resolvedTarget`, `declarations`, `semanticCounts`, `semanticAffectedTargets`, `physicalEvidence`, `coveringSpecs` (918-937). No CLI-side grouping or risk computation. |
| Spec impact                                                     | Implemented        | `handleSpecImpact` (~955-1000); `SpecNotFoundError` propagation tested 768/784                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Output format, omission notices, aggregate fields               | Implemented        | `formatImpact`, `formatOmissionNotice`; tests 2176, 2211, 812                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Display-path projection / availability once                     | Implemented        | test 611 `performs zero graph reads for display-path projection`; `withProvider` is the only lifecycle                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Error cases                                                     | Implemented        | tests 641-728                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Public export presentation                                      | Partial            | `handlePublicExportImpact` 505-620: renders binding id, target id, path, both impact views, JSON has both. Ambiguous: see D3. Exact binding via the SDK -> `provider.getExactPublicBinding` (test 1512).                                                                                                                                                                                                                                                                                                               |
| File covering specs                                             | Implemented        | `formatCoveringSpecs` (183-), tests 1606, 1655                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### Discrepancies

- D1 (HIGH, inherited). For overloaded/bare-name selectors, the CLI prints "logical impact" only when the SDK got a typed logical target. A bare-name overload set arrives as a declaration-kind, single-declaration result ("declaration impact"), which the spec forbids for a logical selector ("MUST request one canonical logical-target analysis covering every contributing declaration"). The CLI itself is faithful; the root cause is in the selector layer.
- D2 (MEDIUM, spec-side inconsistency). The "Symbol impact analysis" requirement (items 5-6: `analyzeImpact(symbolId, direction)`, "analyzes each one") conflicts with the newer "Logical and declaration symbol-impact presentation" requirement ("MUST NOT call impact separately for one arbitrary declaration or for each overload"). The newer one says it "supersedes legacy behaviour", but the old text was not removed or amended in the merged spec, so the spec as shipped is self-contradictory. The CLI test `reports multiple matching symbols` (940) follows the old text (ambiguous output, `analyzeImpact` not called).
- D3 (MEDIUM). Public export ambiguity: "Ambiguous exports SHALL display deterministic candidates and MUST NOT merge or select them. Text, JSON, and TOON SHALL preserve both impact views and structured provenance." Text prints only `Public export S::N: ambiguous (K routes)` (impact.ts ~537-545), with `candidates` read from the SDK result, which is always `[]` for the binding-ambiguity branch (RGI:880). For resolver-level ambiguity, text prints the status and reason only (no candidate list). JSON/TOON include `resolution` (with candidates), but only for the resolver-level case.
- D4 (LOW). Symbol `ambiguous` presentation prints physical declaration lines (`path:kind:name:line:col`), not "deterministic semantic candidates" (impact.ts ~812-830). Several overload declarations of one logical target may be repeated.
- D5 (LOW). JSON output for logical impact still includes the deprecated `symbol: result.symbol` (impact.ts ~930) and `impact.target` (physical first-declaration id; see sdk D2). The spec requires JSON/TOON to "expose the SDK result without removing" fields; it does not require adding compat ones, but the physical `symbol` beside a logical `resolvedTarget` can mislead.
- D6 (LOW). Text for the logical `Target kind:` line is inserted by `lines.splice(1, 0, ...)` (857), which depends on the `formatImpact` layout. Fragile but functional.
- D7 (LOW). The export JSON `binding`, `target`, `path`, `resolution` are printed without `projectRelativePath` on nested locations (SDK X2). The spec says the CLI must not reconstruct nested path projections, and the SDK is the owner of the fix.
- Architecture: CLI imports only `@specd/sdk` for platform symbols (OK per the requirement "Platform symbols MUST come from `@specd/sdk`"). `process.exit` and `withProvider` handled outside this file.

### Test Coverage (packages/cli/test/commands/graph-impact.spec.ts)

Directions 240-381, depth 382-481, context 483-551, depth indicators 553-638, projection reads 611, selector validation 641-728, spec output 730-848, symbol output 850-1138 (single, provider-derived specs, multiple, none, EditChange.execute, ambiguous owner-qualified, bare `validate`), multi-file 1140-1284, JSON/TOON 1286-1445, exact binding 1512, covering specs 1606/1655, filters 1698-2240, logical impact text 2295 and JSON 2431.

### Missing Tests

- Overloaded bare-name selector produces ONE logical analysis (fails today, D1).
- Declaration-impact label for an exact physical selector.
- Ambiguous export text listing candidates (D3), and symbol ambiguity displaying semantic candidates (D4).
- A multi-declaration logical target in 2295/2431 (check fixture; not verified).
- Nested `projectRelativePath` on `resolvedTarget` for the JSON/TOON export case.

### Summary counts

Requirements 15: implemented 12, partial 2 (public export, logical presentation via D1), superseded/contradictory 1 (symbol impact analysis). Discrepancies: HIGH 1, MEDIUM 2, LOW 4.

---

## Spec-side issues (neither side is automatically right)

1. sdk:run-graph-impact requirement 1 item 6 and scenario "Symbol impact analysis" name `provider.analyzeImpact` / `analyzeSymbolImpact`; the newer requirement and the code use `analyzeResolvedSymbolImpact`. Spec should be updated.
2. cli:graph-impact "Symbol impact analysis" items 5-6 contradict "Logical and declaration symbol-impact presentation". Spec should drop the old items.
3. code-graph:composition "Package exports" is a closed "export only" list, but the implementation (and, in places, the other specs' "factories") require more. Spec should list the new exports or the barrel should drop the domain functions that need an internal `GraphStore`.
4. code-graph:composition allows "compatibility fields MAY remain" while sdk:run-graph-impact says "MUST NOT retain a compatibility branch". Align the wording on `symbol` / `impact.target`.
5. code-graph:traversal says covering specs are computed from "reached" declarations, and does not say whether the target's own coverage (depth 0) counts for symbol impact; file impact says depth 0. Make it explicit.
6. resolve-symbol-reference: selector-level "same logical symbol resolves" scenario does not say whether the selector result must carry the typed logical target; the code gives only a physical `match`.

## Totals (all five specs)

- Requirements audited: about 58. Fully implemented: about 46. Partial: about 11. Contradictory spec text: 1.
- Discrepancies: HIGH 1 (root cause X1, surfacing in 4 specs), MEDIUM 9, LOW about 14.
- Missing or weak tests: about 25 scenarios across the specs; the most important are the multi-declaration logical target in SDK/CLI, the selector compat branch, export nested projection, and the public-binding logical aggregation.
