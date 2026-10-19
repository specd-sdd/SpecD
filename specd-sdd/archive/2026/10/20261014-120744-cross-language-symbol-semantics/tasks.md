# Tasks: cross-language-symbol-semantics

## 1. Identity and adapter contracts

- [x] 1.1 Add declaration occurrence forms
      `packages/code-graph/src/domain/value-objects/symbol-reference.ts`: `DeclarationOccurrenceForm`, `DeclarationOccurrence` — add the four-form enum/union and required `form` field.
      Approach: keep form outside `LogicalSymbol.id`; update constructors and JSDoc with strict readonly types.
      (Req: Declaration, binding, and logical identity layers)
- [x] 1.2 Add discriminated resolved-target types
      `packages/code-graph/src/domain/value-objects/symbol-reference.ts`: `ResolvedSymbolTarget` and variants — represent logical target, exact declaration, and public binding without mixed IDs.
      Approach: use the exact union fields from design; every logical result carries all declarations and ordered path evidence.
      (Req: Evidence-preserving semantic projection; Resolution target kind and declaration evidence)
- [x] 1.3 Extend reference input and compatibility result
      `packages/code-graph/src/domain/value-objects/symbol-reference.ts`: `ResolveSymbolReferenceInput`, `SymbolResolutionResult` — add exact declaration/position selectors and `resolvedTarget`, retaining deprecated `target` projection.
      Approach: make selector fields exact-optional-property safe and validate mutual exclusivity through resolver outcomes.
      (Req: Resolution target kind and declaration evidence)
- [x] 1.4 Add semantic impact data contracts
      `packages/code-graph/src/domain/value-objects/impact-result.ts`: `PhysicalDependencyEvidence`, `SemanticAffectedTarget`, `SemanticImpactCounts`, `ResolvedSymbolImpactResult` — separate logical counts from occurrence evidence.
      Approach: calculate risk only from unique logical plus physical-only targets; keep legacy projections deprecated.
      (Req: Logical-target impact aggregation; Evidence-preserving semantic projection)
- [x] 1.5 Clarify the call-fact caller contract
      `packages/code-graph/src/domain/value-objects/call-fact.ts`: `CallFact.callerSymbolId` — document that callers are eligible containing callable declarations only.
      Approach: preserve the field shape; forbid nearest-preceding and lexical-binding callers in its invariant.
      (Req: Semantic caller containment)
- [x] 1.6 Add adapter declaration policy
      `packages/code-graph/src/domain/value-objects/language-adapter.ts`: `AdapterDeclarationPolicy`, `LanguageAdapter.declarationPolicy()` — require pure language capability and callable-container metadata.
      Approach: return readonly language IDs/kinds and classification capabilities; perform no I/O or parser-node exposure.
      (Req: Declaration classification policy)
- [x] 1.7 Export the new public domain types
      `packages/code-graph/src/index.ts`, `packages/code-graph/src/public.ts`: named exports — expose occurrence, resolution, impact, and adapter-policy contracts without infrastructure classes.
      Approach: preserve curated ESM barrels and explicit type-only exports.
      (Req: Declaration, binding, and logical identity layers)

## 2. Shared classification and caller containment

- [x] 2.1 Replace declaration descriptors with a role union
      `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts`: `AdapterDeclarationDescriptor` — discriminate logical, lexical-binding, and physical-only declarations.
      Approach: use the exact role-specific fields from design and require deterministic reasons for non-logical roles.
      (Req: Declaration classification policy)
- [x] 2.2 Make logical fact construction classification-aware
      `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts`: `buildLogicalDeclarationFacts()` — project only logical descriptors, build owners first, preserve occurrence form, and reject conflicting grouping evidence.
      Approach: group only identical canonical identity plus compatible language-proven group keys; never merge by simple name or broad kind.
      (Req: Evidence-preserving semantic projection; Classification-aware logical identity construction)
- [x] 2.3 Add the shared range containment helper
      `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts`: `findContainingCallableSymbol()` — select the innermost eligible half-open range containing a call position.
      Approach: compare line/column starts and exclusive ends, then tie-break deterministically by symbol ID; return `undefined` when unproven.
      (Req: Semantic caller containment)
- [x] 2.4 Remove nearest-preceding fallback from scoped resolution
      `packages/code-graph/src/domain/services/scoped-binding-environment.ts`: caller resolution — use the shared containment algorithm and omit guessed dependency edges.
      Approach: allow lexical bindings to resolve targets but never to become callers; preserve unresolved diagnostic facts.
      (Req: Semantic caller containment)
- [x] 2.5 Validate registered adapter policies
      `packages/code-graph/src/infrastructure/tree-sitter/adapter-registry.ts`: adapter registration — require a declaration policy and callable kinds when calls are supported.
      Approach: fail registration deterministically for an incomplete adapter contract.
      (Req: Cross-language semantic conformance suite)

## 3. Built-in language adapters

- [x] 3.1 Correct TypeScript caller containment
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `findEnclosingSymbolIdByLine`, call extraction — delete the private line-only helper and use shared eligible range containment.
      Approach: admit parser-proven functions, methods, constructors, accessors, and executable initializer containers only.
      (Req: TypeScript caller and local-binding semantics)
- [x] 3.2 Classify TypeScript declarations and locals
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `buildReferenceFacts()` — classify module/exported declarations as logical and locals/parameters/import aliases/destructuring as lexical.
      Approach: keep every physical symbol and binding fact; emit physical-only for anonymous constructs lacking stable semantic identity.
      (Req: TypeScript caller and local-binding semantics)
- [x] 3.3 Stabilize TypeScript overload identity
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: overload descriptor construction — group signatures and implementation under one logical method/function target.
      Approach: normalize callable member semantics and store signature/implementation solely in occurrence form.
      (Req: TypeScript overload and declaration-group identity)
- [x] 3.4 Correct Python semantic classification
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: caller selection and `buildReferenceFacts()` — use complete callable ranges and separate logical declarations from lexical/physical-only evidence.
      Approach: preserve nested canonical owners; assignments, comprehensions, loop targets, parameters, and aliases remain lexical.
      (Req: Python caller containment and declaration classification)
- [x] 3.5 Correct Go semantic classification
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: caller selection and `buildReferenceFacts()` — use complete ranges and distinguish package/receiver declarations from local bindings.
      Approach: receiver methods use named type owners; never group invalid same-name declarations as overloads.
      (Req: Go caller containment and declaration classification)
- [x] 3.6 Correct PHP semantic classification
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: caller selection and `buildReferenceFacts()` — use range/column containment and classify namespace/type members separately from locals and framework aliases.
      Approach: preserve properties/constants/enum cases with proven owners; keep unstable closures physical-only.
      (Req: PHP caller containment and declaration classification)

## 4. Indexing and incremental semantics

- [x] 4.1 Support partial logical mappings in the index session
      `packages/code-graph/src/application/use-cases/in-memory-index-session.ts`: declaration maps — accept physical symbols without logical targets and reject one physical declaration mapped twice.
      Approach: maintain forward and reverse maps explicitly; never parse or synthesize canonical IDs from physical IDs.
      (Req: Classification-aware logical identity construction)
- [x] 4.2 Register owner-first semantic facts
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: reference-fact registration — materialize owners before members and persist complete declaration forms.
      Approach: consume adapter classification rather than mapping every `SymbolNode`; keep physical containment separate.
      (Req: Classification-aware logical identity construction)
- [x] 4.3 Classify physical-only coverage as not applicable
      `packages/code-graph/src/application/services/project-spec-coverage.ts`: symbol coverage projection — distinguish absent physical declaration from a valid physical-only declaration.
      Approach: return `coverage-not-applicable` when no logical mapping exists; continue writing `COVERS_SYMBOL` only to logical IDs.
      (Req: Declaration, binding, and logical identity layers; Logical symbol coverage during impact)
- [x] 4.4 Expand semantic incremental invalidation
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: affected closure and cleanup — reconsider consumers after body, owner, group, rename, move, add, delete, and newly resolvable changes.
      Approach: rebuild every affected consumer or preserve equivalent committed evidence; forbid retained relations to deleted physical IDs.
      (Req: Identity-sensitive incremental equivalence)
- [x] 4.5 Implement session-side bidirectional batches
      `packages/code-graph/src/application/services/session-reference-store.ts`: declaration mapping methods — match the abstract store’s input deduplication and deterministic order.
      Approach: return empty without work, omit unknowns, and preserve first-request order.
      (Req: Logical and declaration batch lookup boundary)

## 5. Store and SQLite persistence

- [x] 5.1 Add reverse declaration mapping to GraphStore
      `packages/code-graph/src/domain/ports/graph-store.ts`: `findLogicalDeclarationsByDeclarationIds()` — add the backend-neutral batch method.
      Approach: use explicit declaration-ID naming and the deterministic batch contract from design.
      (Req: Logical and declaration batch lookup boundary)
- [x] 5.2 Make GraphStore coverage parameters explicitly logical
      `packages/code-graph/src/domain/ports/graph-store.ts`: `getCoveringSpecsForSymbol(s)` — rename parameters/JSDoc and enforce logical-ID-only semantics.
      Approach: retain method names for compatibility; never interpret or retarget physical IDs.
      (Req: Batched logical coverage lookup)
- [x] 5.3 Persist occurrence form in schema 15
      `packages/code-graph/src/infrastructure/sqlite/schema.ts`: schema version and `logical_declarations` — add non-null `occurrence_form` and bump 14 to 15.
      Approach: rely on the existing incompatible-derived-graph rebuild path; do not create an in-place user-data migration.
      (Req: Worker-backed logical declaration mapping)
- [x] 5.4 Extend the SQLite worker protocol
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker-protocol.ts`: `SQLiteWorkerOperationMap` — add reverse mapping payload/result and logical coverage payload names.
      Approach: use one structured-clone-safe request per batch with explicit identity-domain field names.
      (Req: Worker-backed logical declaration mapping; SQLite batched logical coverage reads)
- [x] 5.5 Dispatch new SQLite operations
      `packages/code-graph/src/infrastructure/sqlite/sqlite-worker.ts`: operation switch — route reverse mapping and renamed coverage inputs to the database.
      Approach: keep exhaustive typed operation handling and existing error propagation.
      (Req: Worker-backed logical declaration mapping)
- [x] 5.6 Send one RPC per abstract SQLite batch
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: mapping and coverage methods — short-circuit empty inputs and issue exactly one worker request.
      Approach: do not chunk or loop at the host boundary; deduplicate according to the port contract.
      (Req: Worker-backed logical declaration mapping; SQLite batched logical coverage reads)
- [x] 5.7 Implement set-based SQLite mapping queries
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: declaration queries/mappers/persistence — query both directions in bounded SQL chunks and round-trip occurrence form.
      Approach: merge by first input order then deterministic declaration position; omit unknowns.
      (Req: Worker-backed logical declaration mapping)
- [x] 5.8 Enforce logical coverage integrity in SQLite
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: reverse `COVERS_SYMBOL` reads — join/filter committed logical targets only.
      Approach: an equal-looking physical row must not match, shadow, or widen logical coverage.
      (Req: SQLite batched logical coverage reads; Batched logical coverage lookup)
- [x] 5.9 Update the typed in-memory store test implementation
      `packages/code-graph/test/helpers/in-memory-graph-store.ts`: `GraphStore` implementation — implement all new mapping and logical coverage methods without partial casts.
      Approach: mirror production ordering and no-work behavior so port tests are backend-neutral.
      (Req: Logical and declaration batch lookup boundary)

## 6. Resolution, traversal, and coverage

- [x] 6.1 Resolve targets at the requested identity layer
      `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts`: resolution pipeline — return logical, declaration, or public-binding discriminants with complete evidence.
      Approach: group ambiguity by logical ID for semantic requests and by physical occurrence for exact requests; never select the first declaration.
      (Req: Resolution target kind and declaration evidence)
- [x] 6.2 Discriminate graph selector results
      `packages/code-graph/src/application/services/resolve-graph-selector.ts`: `ResolvedGraphSymbolSelector` — preserve logical targets instead of expanding declarations into false ambiguity.
      Approach: expose logical, declaration, public binding, ambiguous, and missing branches explicitly.
      (Req: Resolution target kind and declaration evidence)
- [x] 6.3 Add resolved-target impact traversal
      `packages/code-graph/src/domain/services/analyze-impact.ts`: `analyzeResolvedSymbolImpact()` — seed logical impact from all declarations and exact impact from only the selected occurrence.
      Approach: keep physical BFS/relations authoritative, aggregate by logical ID at shallowest depth, and retain physical-only targets/evidence.
      (Req: Logical-target impact aggregation)
- [x] 6.4 Separate semantic counts from physical evidence counts
      `packages/code-graph/src/domain/services/analyze-impact.ts`: result aggregation/risk — compute explicit count units and semantic risk.
      Approach: risk uses unique logical plus unique physical-only targets so equivalent overload occurrences cannot change it.
      (Req: Logical-target impact aggregation)
- [x] 6.5 Project reached declarations to logical coverage
      `packages/code-graph/src/domain/services/collect-impact-specs.ts`: reverse coverage — batch-map physical IDs, deduplicate logical IDs, and retain declaration evidence.
      Approach: perform one bounded mapping and one bounded logical coverage query; physical-only targets are not falsely uncovered.
      (Req: Logical symbol coverage during impact)
- [x] 6.6 Align file impact coverage projection
      `packages/code-graph/src/domain/services/analyze-file-impact.ts`, `analyze-files-impact.ts`: covering specs — reuse logical mapping while preserving independent file coverage.
      Approach: all input files/symbols contribute depth-zero evidence and batch calls use deduplicated sets.
      (Req: Logical symbol coverage during impact)

## 7. Provider, SDK, and CLI delivery

- [x] 7.1 Add provider resolved-impact surface
      `packages/code-graph/src/composition/code-graph-provider.ts`: `CodeGraphProvider.analyzeResolvedSymbolImpact()` and implementation — carry the complete discriminated target to domain traversal.
      Approach: retain existing `analyzeImpact(string)` as exact physical compatibility API; composition delegates aggregation and risk.
      (Req: Resolution-aware impact provider surface)
- [x] 7.2 Preserve resolution through SDK orchestration
      `packages/sdk/src/orchestration/run-graph-impact.ts`: symbol branch and result types — stop choosing one declaration and return all semantic/physical evidence.
      Approach: ambiguous/unresolved results do not traverse; path projection uses configuration only and performs no extra graph reads.
      (Req: Resolution-preserving symbol impact orchestration)
- [x] 7.3 Export SDK result contracts
      `packages/sdk/src/orchestration/index.ts`, `packages/sdk/src/index.ts`: named type exports — expose resolved target, semantic counts, declaration locations, and evidence to hosts.
      Approach: use the SDK as the single host import surface and retain deprecated compatibility fields.
      (Req: Resolution-preserving symbol impact orchestration)
- [x] 7.4 Render logical and declaration impact in text
      `packages/cli/src/commands/graph/impact.ts`: `handleSymbolImpact()` text formatter — label target kind, declaration locations, semantic counts, physical evidence, and logical covering specs.
      Approach: call `runGraphImpact` once and format provider-owned values without recomputation.
      (Req: Logical and declaration symbol-impact presentation)
- [x] 7.5 Preserve SDK fields in JSON and TOON
      `packages/cli/src/commands/graph/impact.ts`: structured output — pass through discriminants, declarations, evidence, counts, risk, and coverage.
      Approach: keep deprecated and new fields during the compatibility window; do not group or resolve in CLI.
      (Req: Logical and declaration symbol-impact presentation)

## 8. Adapter and domain verification

- [x] 8.1 Test identity and occurrence invariants
      `packages/code-graph/test/domain/value-objects/symbol-reference.spec.ts`: identity cases — verify location stability, owner changes, form independence, partial mapping, and discriminants.
      Approach: explicit assertions only; add duplicate/conflicting classification cases without snapshots.
      (Req: Declaration, binding, and logical identity layers; Evidence-preserving semantic projection)
- [x] 8.2 Test shared helper algorithms
      `packages/code-graph/test/infrastructure/tree-sitter/reference-fact-helpers.spec.ts`: classification and containment — cover half-open boundaries, nested ranges, same-line columns, grouping, and missing owners.
      Approach: build exact `SymbolNode` ranges and assert deterministic innermost selection or `undefined`.
      (Req: Semantic caller containment; Declaration classification policy)
- [x] 8.3 Add the cross-language conformance harness
      `packages/code-graph/test/infrastructure/tree-sitter/language-adapter-conformance.spec.ts`: new registry-driven suite — require every adapter to pass shared caller, classification, owner, physical-only, and stability fixtures.
      Approach: fail when a registered language has no fixture; reuse policy-independent assertions.
      (Req: Cross-language semantic conformance suite)
- [x] 8.4 Add TypeScript semantic regressions
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: overload/local/caller cases — verify block locals, `var`, parameters, nested names, aliases, constructors, and overload stability.
      Approach: assert one logical overload target with signature/implementation occurrences and containing callable call source.
      (Req: TypeScript overload and declaration-group identity; TypeScript caller and local-binding semantics)
- [x] 8.5 Add Python semantic regressions
      `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`: caller/classification cases — cover assignments, comprehensions, nested functions, methods, decorators, lambdas, and imports.
      Approach: assert exact range owner and no logical identity for ordinary lexical bindings.
      (Req: Python caller containment and declaration classification)
- [x] 8.6 Add Go semantic regressions
      `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts`: caller/classification cases — cover short declarations, receivers, functions, interfaces, literals, and invalid overload-like duplicates.
      Approach: assert receiver ownership and no same-name overload merge.
      (Req: Go caller containment and declaration classification)
- [x] 8.7 Add PHP semantic regressions
      `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: caller/classification cases — cover assignments, aliases, compact declarations, closures, class members, enum cases, traits, and dynamic services.
      Approach: assert column-aware owners and conservative physical-only/unresolved outcomes.
      (Req: PHP caller containment and declaration classification)
- [x] 8.8 Test scoped caller fallback removal
      `packages/code-graph/test/domain/services/scoped-binding-environment.spec.ts`: dependency origins — verify locals never usurp callers and missing containment creates no guessed relation.
      Approach: include calls in initializers, multiline calls, and adjacent declarations.
      (Req: Semantic caller containment)
- [x] 8.9 Test resolution discriminants and ambiguity
      `packages/code-graph/test/application/use-cases/resolve-symbol-reference.spec.ts`: logical/exact/public cases — assert complete declarations, exact positions, reason codes, and compatibility target.
      Approach: use competing logical targets plus multi-declaration overload targets to prove layer-correct ambiguity.
      (Req: Resolution target kind and declaration evidence)

## 9. Store, traversal, and incremental verification

- [x] 9.1 Extend the backend-neutral store contract suite
      `packages/code-graph/test/domain/ports/graph-store.contract.ts`: mapping/coverage contract — test duplicates, unknowns, ordering, empty batches, both mapping directions, and logical-only coverage.
      Approach: run identical assertions for every supported backend.
      (Req: Logical and declaration batch lookup boundary; Batched logical coverage lookup)
- [x] 9.2 Test SQLite schema and batch behavior
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`: schema-15 integration — assert occurrence-form round trip, reverse mapping order, chunking, strict logical IDs, and empty no-RPC semantics.
      Approach: use a real temporary SQLite store with portable path setup and deterministic fixtures.
      (Req: Worker-backed logical declaration mapping; SQLite batched logical coverage reads)
- [x] 9.3 Test worker protocol and one-RPC semantics
      `packages/code-graph/test/infrastructure/sqlite/sqlite-worker-protocol.spec.ts`: operation typing/dispatch — assert one request per logical batch and serializable explicit identity payloads.
      Approach: instrument the worker client boundary while allowing database-side SQL chunks.
      (Req: Worker-backed logical declaration mapping; SQLite batched logical coverage reads)
- [x] 9.4 Test logical traversal aggregation
      `packages/code-graph/test/domain/services/traversal.spec.ts`: resolved impact — assert all-declaration seeding, shallowest logical depth, physical evidence, exact non-widening, count/risk stability, and physical-only targets.
      Approach: add an equivalent declaration and assert unchanged semantic counts/risk with increased occurrence evidence.
      (Req: Logical-target impact aggregation)
- [x] 9.5 Test logical coverage during impact
      `packages/code-graph/test/domain/services/traversal.spec.ts`: coverage cases — assert batch mapping, logical-ID lookup, declaration evidence, file coverage independence, and physical-only classification.
      Approach: fail the fixture if any physical declaration ID is sent to reverse logical coverage.
      (Req: Logical symbol coverage during impact)
- [x] 9.6 Test incremental versus clean equivalence
      `packages/code-graph/test/application/use-cases/index-code-graph.spec.ts`, `index-project-graph-integration.spec.ts`: mutation matrix — compare normalized semantic/physical state after each identity-sensitive change.
      Approach: cover body, move, signature, overload, owner, rename, delete, add, and newly resolvable target; assert no dangling relations.
      (Req: Identity-sensitive incremental equivalence)
- [x] 9.7 Test provider delegation
      `packages/code-graph/test/composition/code-graph-provider.spec.ts`: resolved-impact surface — verify lifecycle/freshness and complete target delegation without primary-declaration collapse.
      Approach: mock the domain operation at the composition boundary and assert no composition-level regrouping.
      (Req: Resolution-aware impact provider surface)

## 10. SDK, CLI, and documentation verification

- [x] 10.1 Test SDK resolution-preserving orchestration
      `packages/sdk/test/orchestration/run-graph-impact.spec.ts`: symbol impact cases — assert logical/exact/public behavior, no traversal on ambiguity, all path projections, and no extra provider reads.
      Approach: use a complete typed provider mock and verify new plus deprecated result fields.
      (Req: Resolution-preserving symbol impact orchestration)
- [x] 10.2 Test CLI target-aware presentation
      `packages/cli/test/commands/graph-impact.spec.ts`: text/JSON/TOON cases — assert logical labels, declaration summaries, exact declaration labels, deterministic ambiguity, field preservation, and no independent queries.
      Approach: mock `runGraphImpact` structured results and use explicit assertions, not snapshots.
      (Req: Logical and declaration symbol-impact presentation)
- [x] 10.3 Record the architecture decision
      `docs/adr/0029-cross-language-symbol-semantics.md`: new MADR — document identity layers, query-time projection, logical coverage, alternatives, migration, and conformance fitness functions.
      Approach: include required metadata, confirmation, consequences, and links to all affected specs.
      (Req: Declaration, binding, and logical identity layers)
- [x] 10.4 Document Code Graph adapter semantics
      `docs/code-graph/index.md`: identity/adapter reference — explain partial mappings, classification, range containment, overload groups, physical evidence, and logical coverage.
      Approach: keep package-reference audience and complete frontmatter; add future-language checklist.
      (Req: Cross-language semantic conformance suite)
- [x] 10.5 Document the SDK impact contract
      `docs/sdk/index.md`: host guide — document discriminated target/result fields, count units, compatibility period, and examples importing only `@specd/sdk`.
      Approach: show logical and exact declaration results without mixed package imports.
      (Req: Resolution-preserving symbol impact orchestration)
- [x] 10.6 Update graph CLI documentation
      `docs/cli/graph.md`: `graph impact` — document target-aware text and JSON/TOON output, declaration locations, count units, and selector examples.
      Approach: align examples exactly with the SDK-owned structured schema.
      (Req: Logical and declaration symbol-impact presentation)
- [x] 10.7 Extend documentation coverage assertions
      `packages/cli/test/documentation-coverage.spec.ts`: graph/SDK/ADR docs — verify changed public behavior is documented and pages remain discoverable.
      Approach: assert required documents/sections and valid frontmatter without snapshots.
      (Req: Logical and declaration symbol-impact presentation)

## 11. Build, migration, and end-to-end validation

- [x] 11.1 Build all workspaces
      repository root: TypeScript build — compile strict domain, store, worker, SDK, and CLI contract changes.
      Approach: run `pnpm build`; resolve every strict, exact-optional-property, JSDoc, and barrel error.
- [x] 11.2 Run focused package suites
      `packages/code-graph`, `packages/sdk`, `packages/cli`: focused verification — execute all changed unit/integration suites.
      Approach: run the three package test commands from design and require zero failures.
- [x] 11.3 Run full tests and lint
      repository root: regression validation — prove global architecture, conventions, and testing compliance.
      Approach: run `pnpm test` and `pnpm lint`; require zero failures and no snapshots/partial port mocks.
- [x] 11.4 Rebuild the project graph on schema 15
      repository graph storage: derived-state migration — re-index with the built CLI and confirm compatible current generation.
      Approach: run `node packages/cli/dist/index.js graph index --format toon`; require no parse failures or dangling-relation diagnostics.
      (Req: SQLite batched logical coverage reads)
- [x] 11.5 Verify logical impact in all output formats
      built CLI: `graph impact --symbol "Change.execute"` — inspect logical target, complete declarations, separate count units, evidence, and covering specs.
      Approach: run JSON, text, and TOON commands; require preserved semantic fields and logical coverage IDs.
      (Req: Logical and declaration symbol-impact presentation)
- [x] 11.6 Verify exact declaration impact
      built CLI and fixture: exact file-position selector — confirm physical target semantics do not widen to sibling declarations.
      Approach: run the fixture selector and assert `resolvedTarget.kind === 'declaration'` plus one traversal seed.
      (Req: Resolution target kind and declaration evidence)
- [x] 11.7 Compare incremental and clean indexes
      integration fixture and graph exports: equivalence check — apply one identity-sensitive mutation and compare normalized final states.
      Approach: compare logical symbols, occurrence forms, bindings, relations, evidence, and coverage; require exact semantic equality.
      (Req: Identity-sensitive incremental equivalence)
- [x] 11.8 Exercise rollback procedure
      derived graph storage: schema rollback rehearsal — verify previous code rejects schema 15 read mode and can rebuild schema 14 after safe graph recreation.
      Approach: use disposable test storage only; never mutate source/spec data or manually edit SQLite tables.

## 12. Review follow-up: parser-authoritative adapter extraction

- [x] 12.1 Add the four-way pre-emission declaration decision
      `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts`: `AdapterDeclarationDecision`, `GraphDeclarationDecision`, `AdapterDeclarationDescriptor`, `AdapterSyntaxCandidate` — distinguish logical, lexical-binding, physical-only, and unsupported syntax before symbol creation.
      Approach: `unsupported` carries no `SymbolNode` and returns before `addSymbol`; only the three graph-bearing branches can produce an emitted descriptor.
      (Req: Declaration classification policy; Parser-authoritative structural fact extraction)
- [x] 12.2 Mark parser-authoritative extraction in adapter policy
      `packages/code-graph/src/domain/value-objects/language-adapter.ts`: `AdapterDeclarationPolicy.structuralFactsAreParserAuthoritative` — require the literal value `true` from every registered adapter.
      Approach: validate the capability in `adapter-registry.ts` without exposing parser nodes or performing I/O.
      (Req: Parser-authoritative structural fact extraction; Cross-language semantic conformance suite)
- [x] 12.3 Inventory and classify every built-in adapter regex
      `packages/code-graph/src/infrastructure/tree-sitter/*-language-adapter.ts`: regex and substring scans — assign each use to AST migration, bounded parser-node tokenization, auxiliary manifest parsing, or documented grammar compatibility.
      Approach: remove every whole-source match that decides a declaration, import, binding, call, construction, type, hierarchy edge, owner, scope, caller, or argument; retain only the three allowed bounded categories from design.
      (Req: Parser-authoritative structural fact extraction)
- [x] 12.4 Replace TypeScript call and import scans with AST traversal
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `extractCallFactsFromData()`, `extractImportedNamesFromData()` — extract `call_expression`, `new_expression`, imports, dynamic imports, and literal `require` from typed nodes and fields.
      Approach: derive exact call range, callee/receiver, arguments and arity during the single parse; resolve static dispatch semantically rather than by capitalization; delete whole-source call/import patterns.
      (Req: TypeScript parser-authoritative structural extraction)
- [x] 12.5 Replace TypeScript binding, type, and heritage scans with AST traversal
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `extractBindingFactsFromData()` and its receiver/parameter/return/property/alias helpers plus `collectTypeDeclarations()` — consume parser type, declaration, and heritage nodes.
      Approach: allow regex/token matching only inside one parser-proven type node and clip offsets to that node; no whole-source structural scan remains.
      (Req: TypeScript parser-authoritative structural extraction)
- [x] 12.6 Eliminate anonymous object-key declarations and model callback callers
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `processPairNode()`, `isArrayDataRecordProperty()`, arrow/function-expression handling — classify anonymous scalar/nested-object argument keys as unsupported and create physical-only `<anonymous>` callable symbols where needed.
      Approach: determine named-object ownership from AST ancestors before `addSymbol`; retain named-owner properties and real object methods, but never emit a symbol/binding for `{ name: ... }` used as an anonymous expression or call argument.
      (Req: TypeScript caller and local-binding semantics)
- [x] 12.7 Replace Python source-structural scans with AST traversal
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: dynamic-import extraction, `collectClassInfo()`, `extractBindingFactsFromData()`, `extractCallFactsFromData()` — derive imports, classes/bases, annotations, aliases, decorators, calls, and scopes from Python nodes.
      Approach: use parser ancestry/ranges for indentation and containment; decide construction only after class-target resolution; keep `pyproject.toml` parsing isolated as metadata.
      (Req: Python parser-authoritative structural extraction)
- [x] 12.8 Replace Go source-structural scans and brace counting with AST traversal
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: `collectTypeInfo()`, `collectInterfaceMethodNames()`, `extractGoImportsFromText()`, `extractBindingFactsFromData()`, `extractCallFactsFromData()` — derive declarations, imports, types, selectors, calls, literals, receivers, and scopes from Go nodes.
      Approach: use typed composite literals only with deterministic type evidence; remove brace-count scope discovery and isolate `go.mod` parsing as metadata.
      (Req: Go parser-authoritative structural extraction)
- [x] 12.9 Replace PHP source-structural scans with AST traversal
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `collectPhpTypeInfo()`, `extractBindingFactsFromData()`, `extractCallFactsFromData()`, `extractRequireRelations()` — derive declarations, traits, uses, types, requires/includes, calls, construction, hierarchy, and scopes from PHP nodes.
      Approach: remove brace-count range discovery and whole-source call/require patterns; keep Composer/PSR-4 processing outside source parsing.
      (Req: PHP parser-authoritative structural extraction)
- [x] 12.10 Move PHP framework loader recognition onto proven call nodes
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `collectRawDynamicLoaders()` and framework registries — consume parser-proven function/member/static calls and literal arguments.
      Approach: preserve CakePHP, CodeIgniter, Yii, Laravel, Zend, Drupal, and registered API policies while deleting whole-source regex recognition; comments, strings, and heredocs cannot trigger facts.
      (Req: PHP parser-authoritative structural extraction; Static and framework dependency facts)
- [x] 12.11 Extend the shared structural-text conformance matrix
      `packages/code-graph/test/infrastructure/tree-sitter/language-adapter-conformance.spec.ts`: parser-authority fixtures — run valid multiline/nested/same-line syntax, comment/string/template lookalikes, unsupported syntax, anonymous callables, and auxiliary-manifest isolation for every built-in adapter.
      Approach: compare emitted facts to parser constructs and fail registry coverage when a language omits the structural-boundary fixtures.
      (Req: Parser-authoritative structural fact extraction; Cross-language semantic conformance suite)
- [x] 12.12 Add the exact TypeScript ArchiveChange regression
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: anonymous callback with `await expect(uc.execute({ name: 'my-change' })).rejects.toThrow()` — assert no `name` symbol/binding/logical target and no false caller.
      Approach: assert the real call target remains resolvable and its source is the physical callback when represented, otherwise unresolved; add named-object control and optional/computed/generic/multiline/lookalike cases.
      (Req: TypeScript caller and local-binding semantics; TypeScript parser-authoritative structural extraction)
- [x] 12.13 Add Python parser-authority regressions
      `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`: multiline imports/annotations/bases/calls and lookalikes — assert node-derived ranges/ancestry and manifest isolation.
      Approach: include strings/comments with structural text and prove they emit no facts while `pyproject.toml` still supplies package metadata.
      (Req: Python parser-authoritative structural extraction)
- [x] 12.14 Add Go parser-authority regressions
      `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts`: grouped imports, interfaces, selectors, composites, multiline syntax, and brace/call lookalikes — assert node-derived structure and `go.mod` isolation.
      Approach: include braces and call-shaped text in strings/comments and require zero spurious facts.
      (Req: Go parser-authoritative structural extraction)
- [x] 12.15 Add PHP parser-authority and framework regressions
      `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: compact/multiline declarations, traits, requires, calls, heredoc/comment lookalikes, and registered framework APIs — assert only proven call nodes emit loader/dependency facts.
      Approach: exercise each framework registry family with one real and one textual-lookalike invocation; keep Composer metadata coverage separate.
      (Req: PHP parser-authoritative structural extraction)
- [x] 12.16 Verify the 72-call corpus after project reindex
      `.specd/config/graph/code-graph.sqlite`, `packages/core/test/application/use-cases/archive-change.spec.ts`, `archive-change-batch-restore.spec.ts`: production-corpus acceptance check — eliminate all parentless `variable:name` sources without losing the 63 plus 9 real `ArchiveChange.execute` targets.
      Approach: reindex with the built CLI, query relations joined to source symbols and exact target, assert zero false sources/no anonymous `name` symbols, and independently assert the real calls remain represented when resolvable.
      (Req: TypeScript caller and local-binding semantics; Parser-authoritative structural fact extraction)
- [x] 12.17 Document the AST-versus-regex adapter rule
      `docs/adr/0029-cross-language-symbol-semantics.md`, `docs/code-graph/index.md`: architecture decision and future-language checklist — document parser authority, four-way classification, allowed regex categories, framework-over-AST policy, and conformance fixtures.
      Approach: make the rule normative for maintainers and link it to the adapter specs; do not imply that auxiliary manifests require Tree-sitter.
      (Req: Parser-authoritative structural fact extraction; Cross-language semantic conformance suite)

## 13. Verification follow-up: semantic boundary corrections

- [x] 13.1 Prevent grouping when declaration evidence is absent
      `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts`: `buildLogicalDeclarationFacts()` — stop treating two undefined `groupKey` values as one declaration group.
      Approach: group multiple descriptors only when all carry the same non-empty language-proven key; on an ungrouped canonical-ID collision retain physical evidence, omit both logical mappings, and emit `UNGROUPED_LOGICAL_COLLISION`.
      (Req: Declaration, binding, and logical identity layers; Classification-aware logical identity construction)
- [x] 13.2 Test positive-only declaration grouping
      `packages/code-graph/test/infrastructure/tree-sitter/reference-fact-helpers.spec.ts`: grouping cases — cover missing, empty, equal non-empty, and different group keys plus same-name nested declarations.
      Approach: assert absent keys never merge, valid overload keys retain all occurrences, and an ungrouped canonical collision produces physical-only evidence with the deterministic diagnostic.
      (Req: Declaration, binding, and logical identity layers; TypeScript overload and declaration-group identity)
- [x] 13.3 Remove physical-ID fallback from logical coverage
      `packages/code-graph/src/domain/services/collect-impact-specs.ts`: coverage-frontier construction — exclude declarations without logical mappings before reverse `COVERS_SYMBOL` lookup.
      Approach: derive the frontier only from returned logical mappings, never substitute a declaration ID, and skip `getCoveringSpecsForSymbols()` when the frontier is empty.
      (Req: Logical symbol coverage during impact; Batched logical coverage lookup)
- [x] 13.4 Test an all-physical-only coverage frontier
      `packages/code-graph/test/domain/services/traversal.spec.ts`: physical-only coverage scenario — prove no logical coverage store operation receives a physical ID.
      Approach: instrument the store method, traverse only unmapped declarations, assert zero calls and explicit `coverage-not-applicable` evidence.
      (Req: Logical symbol coverage during impact)
- [x] 13.5 Delete the SDK first-declaration compatibility traversal
      `packages/sdk/src/orchestration/run-graph-impact.ts`: logical symbol branch — remove selection of `resolvedTarget.declarations[0]` and the physical `provider.analyzeImpact()` fallback.
      Approach: require the typed `analyzeResolvedSymbolImpact()` provider surface and pass the complete discriminated target; exact-declaration requests remain the only physical traversal path.
      (Req: Resolution-preserving symbol impact orchestration; Resolution-aware impact provider surface)
- [x] 13.6 Project every nested SDK result location
      `packages/sdk/src/orchestration/run-graph-impact.ts`: path projection — cover locations nested under `resolvedTarget`, declarations, resolution path, semantic affected targets, physical evidence, public surfaces, and coverage evidence.
      Approach: use configuration-only pure projection helpers recursively; perform no provider/store reads and leave no nested canonical-only location in the public result.
      (Req: Resolution-preserving symbol impact orchestration)
- [x] 13.7 Replace incomplete SDK provider mocks with the typed contract
      `packages/sdk/test/orchestration/run-graph-impact.spec.ts`: provider fixtures — implement the complete provider surface and add logical multi-declaration and nested-path cases.
      Approach: assert the resolved-target method is called once, physical fallback is never called, every nested location has `projectRelativePath`, and projection adds no reads.
      (Req: Resolution-preserving symbol impact orchestration; Logical and declaration symbol-impact presentation)
- [x] 13.8 Suppress unresolved TypeScript import relations
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: import resolution — remove first-syntactic-candidate fallback.
      Approach: retain unresolved import diagnostics but emit a dependency relation only for a workspace/module candidate proven by resolution.
      (Req: TypeScript parser-authoritative structural extraction)
- [x] 13.9 Suppress unresolved Python import relations
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: static and literal dynamic import resolution — remove first-candidate fallback.
      Approach: retain parser-derived unresolved evidence and persist no dependency until module resolution identifies one target.
      (Req: Python parser-authoritative structural extraction)
- [x] 13.10 Suppress unresolved Go import relations
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: import-spec relation construction — stop using the raw specifier as a resolved target.
      Approach: keep the raw path on syntax/diagnostic evidence and emit a relation only for a proven workspace or supported external package target.
      (Req: Go parser-authoritative structural extraction)
- [x] 13.11 Suppress unresolved PHP loader and import relations
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: namespace use, require/include, and loader resolution — remove first-candidate fallback.
      Approach: retain unresolved AST evidence without a relation; only a deterministically resolved target can enter relation construction.
      (Req: PHP parser-authoritative structural extraction)
- [x] 13.12 Emit TypeScript imported hierarchy through shared facts
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: imported `extends`/`implements` handling — pair each physical edge with one shared hierarchy reference fact.
      Approach: route parser range, resolved target, and import provenance through `buildHierarchyReferenceFacts()` and assert relation/fact target equality.
      (Req: TypeScript parser-authoritative structural extraction; Parser-authoritative structural fact extraction)
- [x] 13.13 Emit Python imported bases through shared facts
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: imported base-class handling — pair each physical hierarchy edge with one shared hierarchy reference fact.
      Approach: preserve the base-expression range and module-resolution provenance on the fact used to construct the relation.
      (Req: Python parser-authoritative structural extraction; Parser-authoritative structural fact extraction)
- [x] 13.14 Emit PHP imported hierarchy through shared facts
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: imported parent/interface/trait handling — pair each physical edge with one shared hierarchy reference fact.
      Approach: use the same resolved target, parser range, and namespace/import provenance for the fact and persisted relation.
      (Req: PHP parser-authoritative structural extraction; Parser-authoritative structural fact extraction)
- [x] 13.15 Remove PHP callable-body regex extraction from Pass 2
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: Pass 2 alias, construction, member-call, require/include, and loader extraction — consume retained AST-derived facts only.
      Approach: delete structural regex scans over callable text; framework registries receive proven call nodes and literal arguments, so string/comment/heredoc lookalikes emit nothing.
      (Req: PHP parser-authoritative structural extraction)
- [x] 13.16 Move PHP PSR-4 metadata into adapter session preparation
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `AdapterSessionState` preparation and Pass 2 resolution — eliminate metadata filesystem I/O and mutable adapter-instance caches during per-file analysis.
      Approach: normalize Composer/PSR-4 maps once per run, pass them immutably to every file, and treat missing session metadata as unresolved rather than rereading disk.
      (Req: PHP parser-authoritative structural extraction; Parser-authoritative structural fact extraction)
- [x] 13.17 Add per-language unresolved-import regression fixtures
      `packages/code-graph/test/infrastructure/tree-sitter/*-language-adapter.spec.ts`: unresolved import/loader cases — verify TypeScript, Python, Go, and PHP persist no guessed relation.
      Approach: supply multiple unresolved syntactic candidates or raw specifiers, assert diagnostic evidence remains, and assert the relation collection is empty.
      (Req: TypeScript parser-authoritative structural extraction; Python parser-authoritative structural extraction; Go parser-authoritative structural extraction; PHP parser-authoritative structural extraction)
- [x] 13.18 Add imported-hierarchy provenance regressions
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`, `python-language-adapter.spec.ts`, `php-language-adapter.spec.ts`: resolved imported hierarchy cases — verify shared fact/relation parity.
      Approach: assert exactly one matching hierarchy fact per persisted edge with identical target, parser range, and import-resolution provenance.
      (Req: Parser-authoritative structural fact extraction)
- [x] 13.19 Add PHP Pass 2 purity and session-isolation regressions
      `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: AST-only and metadata-session cases — prove lookalikes emit nothing and Pass 2 performs zero filesystem reads.
      Approach: instrument filesystem access after session preparation, run consecutive sessions with different PSR-4 maps, and assert no cache leakage or regex-derived relations.
      (Req: PHP parser-authoritative structural extraction; Cross-language semantic conformance suite)
- [x] 13.20 Complete the incremental semantic mutation matrix
      `packages/code-graph/test/application/use-cases/index-code-graph.spec.ts`, `index-project-graph-integration.spec.ts`: incremental/full equivalence — add independent fixtures for body, move, signature, group, owner, rename, delete, add, and newly resolvable mutations.
      Approach: compare normalized physical symbols, logical symbols, declaration mappings, bindings, public bindings, relations, provenance, and coverage rather than row counts.
      (Req: Identity-sensitive incremental equivalence)
- [x] 13.21 Complete the cross-language structural boundary matrix
      `packages/code-graph/test/infrastructure/tree-sitter/language-adapter-conformance.spec.ts`: shared fixtures — add optional/chained/computed/generic, nested, multiline, same-line, lookalike, unresolved-import, imported-hierarchy, and no-Pass-2-I/O cases where applicable.
      Approach: require every registered built-in adapter to declare supported cases and pass common invariants; unsupported syntax must remain unresolved rather than guessed.
      (Req: Cross-language semantic conformance suite; Parser-authoritative structural fact extraction)
- [x] 13.22 Align documentation with the verification follow-up
      `docs/adr/0029-cross-language-symbol-semantics.md`, `docs/code-graph/index.md`, `docs/sdk/index.md`, `docs/cli/graph.md`: normative guidance — document positive-only grouping, unresolved-import suppression, hierarchy provenance, session-prepared metadata, empty logical coverage frontiers, and recursive SDK path projection.
      Approach: update future-adapter and host-consumer checklists without changing the one-release compatibility window.
      (Req: Cross-language semantic conformance suite; Resolution-preserving symbol impact orchestration)
- [x] 13.23 Preserve nested projected paths in CLI structured output
      `packages/cli/test/commands/graph-impact.spec.ts`: JSON/TOON resolved-target fixtures — verify nested declarations and evidence retain SDK-provided `projectRelativePath` values.
      Approach: feed a complete discriminated SDK result to the command, assert pass-through equality for nested locations, and assert the CLI performs no path reconstruction or graph read.
      (Req: Logical and declaration symbol-impact presentation)

## 14. Verification follow-up: schema and acceptance

- [x] 14.1 Align SQLite schema-version compatibility tests with version 15
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`, `sqlite-worker-protocol.spec.ts`: schema compatibility — make 15 current, verify 14 read rejection and index-mode rebuild, and reject versions below 14 or above 15.
      Approach: assert `occurrence_form` round trips, storage epoch rotates on rebuild, no `ALTER TABLE` occurs, and schema 15 reopens without recreation.
      (Req: Reference schema upgrade; Worker-backed logical declaration mapping)
- [x] 14.2 Run focused package verification after follow-up fixes
      `packages/code-graph`, `packages/sdk`, `packages/cli`: focused suites — execute all modified unit, contract, integration, and documentation tests.
      Approach: run the package test commands with zero failures and confirm the new negative-path scenarios execute rather than being skipped.
- [x] 14.3 Run repository build, typecheck, tests, and lint
      repository root: full validation — verify strict types, package boundaries, global conventions, and regressions after the corrective implementation.
      Approach: run `pnpm build`, the repository typecheck command, `pnpm test`, and `pnpm lint`; require zero failures.
- [x] 14.4 Reindex and re-run production-corpus acceptance
      `.specd/config/graph/code-graph.sqlite`, ArchiveChange test corpus, and graph-impact CLI: final E2E — rebuild schema 15 and inspect identity, relations, coverage, and structured paths.
      Approach: require zero parentless `variable:name` callers, preserve all 63 plus 9 call facts subject only to existing relation deduplication, verify no physical ID reaches logical coverage, and confirm JSON/TOON nested locations include `projectRelativePath`.
      (Req: TypeScript caller and local-binding semantics; Logical symbol coverage during impact; Logical and declaration symbol-impact presentation)

## 15. Verification round 2: audit corrections

- [x] 15.1 Return the typed logical target from selector-level resolution
      `packages/code-graph/src/application/services/resolve-graph-selector.ts`, `packages/sdk/src/orchestration/run-graph-impact.ts`: `resolveSymbolSelector`, `runGraphImpact` — overload sets return one logical-target result with every declaration; remove the physical `getSymbol` fallback for logical selectors.
      Approach: derive the legacy `match` only as a projection; update the existing test that accepts an arbitrary overload; add a multi-declaration SDK and CLI test.
      (Req: Resolution target kind and declaration evidence; Resolution-preserving symbol impact orchestration)
- [x] 15.2 Make legacy SDK summary fields display-only and project all nested paths
      `packages/sdk/src/orchestration/run-graph-impact.ts`: `impact.target`, `symbol`, export result, covering-spec evidence — canonical logical identity, no ID string parsing, `projectRelativePath` on every nested location, real candidates for binding ambiguity.
      Approach: add tests for export nested projection and covering-spec file evidence; make the CLI print the candidates.
      (Req: Resolution-preserving symbol impact orchestration; Pure path projection; Logical and declaration symbol-impact presentation)
- [x] 15.3 Depth-0 coverage and logical public-binding aggregation in traversal
      `packages/code-graph/src/domain/services/analyze-impact.ts`: root declarations at depth 0, `analyzePublicBindingImpact` logical aggregation with `semanticCounts`, declaration-only evidence for unmapped logical ids.
      Approach: add tests for the target's own covering spec (including a logical target whose dependents are all physical-only, which must still issue one coverage query), canonical aggregation of a public export and skipped-logical-symbol evidence.
      (Req: Logical symbol coverage during impact; Logical-target impact aggregation)
- [x] 15.4 Add the semantic impact services to the barrel test
      `packages/code-graph/test/`: barrel allow-list test comparing runtime exports with the enumerated list in the composition spec.
      Approach: fail on any export outside the list and on any missing enumerated export.
      (Req: Package exports)
- [x] 15.5 Remove name-only CALLS resolution from TypeScript, Go and Python adapters
      `packages/code-graph/src/infrastructure/tree-sitter/{typescript,go,python}-language-adapter.ts`: `buildRelations` — require a proven receiver, binding, import or local declaration.
      Approach: rewrite tests that assert name-only behaviour; add negative fixtures for free call vs class method, unknown-receiver `save()`, interface-value `Save()`.
      (Req: scoped bindings, calls, and construction in each adapter spec; Calls resolve by proof)
- [x] 15.6 Fix property owner identity and TypeScript lexical/overload identity
      TypeScript and Go adapters: class fields, interface properties, enum members, struct fields get declaring owners; nested same-name functions and block-local callables get distinct group keys; overload signatures keep one stable logical id and function overload signatures are extracted.
      Approach: add collision fixtures (two classes/structs with the same field name), nested same-name function fixture, overload-with-and-without-signatures id equality test.
      (Req: Declaration, binding, and logical identity layers; overload and lexical-scope requirements)
- [x] 15.7 Read member forms from the AST
      TypeScript `get`/`set`, Python decorators, PHP `static`: use parser nodes and modifiers, never raw text or adjacent lines.
      Approach: fixtures for a method named `get()`, multiline decorators with interleaved comments, `function a(){} static function b(){}`.
      (Req: member semantics in each adapter spec)
- [x] 15.8 Remove shared-helper and adapter invariant violations
      `scoped-binding-environment.ts` line-only selector, `typescript-language-adapter.ts` mutable state and uncached manifest reads, `in-memory-index-session.ts` language-name branch, PHP `LOADER_RESOLVERS` dead code.
      Approach: replace with range containment and session-prepared metadata; confirm Pass 2 performs no filesystem I/O.
      (Req: LanguageAdapter interface; session-prepared metadata; Pass 2 purity)
- [x] 15.9 Go and Python correctness fixes
      Go struct field public binding, Go import resolution by module prefix and directory, Go `IMPLEMENTS` method-set evidence, Python qualified bases, Python `.pyi`/`src` import candidates, TypeScript conditional exports left unsupported.
      Approach: add resolveImports tests for Go and the negative qualified-base test for Python.
      (Req: Go and Python adapter specs)
- [x] 15.10 Reject physical COVERS_SYMBOL targets with a diagnostic
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts`: relation validation — reject, report an indexing diagnostic, and never return the relation from logical reverse coverage.
      Approach: update the contract test to assert rejection and the diagnostic.
      (Req: Logical-symbol coverage endpoints; SQLite batched logical coverage reads)
- [x] 15.11 Workspace-subset rebuild (done), whole-graph fingerprint recreation, and LocalBinding range
      `index-code-graph.ts`, `sqlite-graph-database.ts`, `scoped-binding-environment.ts` / binding model: subset rebuild clears only targeted workspaces; fingerprint mismatch recreates storage and rotates the generation; `LocalBinding` keeps range and scope in its id.
      Approach: subset rebuild is implemented and tested. Add `IndexOptions.derivationMismatch` and `GraphDerivationMismatchError` with an `IndexCodeGraph` test (fail mode throws before writes; default mode rebuilds in place), the `runIndexProjectGraph` recreate-and-retry with an SDK test, the barrel allow-list entry, and `LocalBinding.range` with adapter fixtures, SQLite columns, worker rows, and a shadowed-binding store test.
      (Req: Incompatible derivation rebuild; Incremental indexing; First-class binding model)
- [x] 15.12 Complete the adapter conformance suite
      `packages/code-graph/test/infrastructure/tree-sitter/language-adapter-conformance.spec.ts` and `AdapterRegistry` tests: cover all eleven mandated areas, drive assertions from `boundarySupport`, make the non-conformant rejection test meaningful.
      Approach: add fixtures for lexical scope, overload groups, retained occurrences, coverage after impact, imported hierarchy provenance, no-I/O and incremental equivalence for every registered adapter.
      (Req: Language adapter conformance)
- [x] 15.13 Align test names with the indexer-owned IMPORTS contract
      Go adapter test "emits IMPORTS and CALLS relations" and TypeScript/Python equivalents: assert resolved imports via `resolveImports()` and indexer-created `IMPORTS`.
      Approach: rename and correct assertions; no production change.
      (Req: LanguageAdapter interface; Go relation scenario)
- [x] 15.14 Format, document, and re-verify
      28 prettier-flagged files, `docs/code-graph/index.md`, `docs/sdk/index.md`, `docs/cli/graph.md`: run `pnpm format`, update docs for typed selector, depth-0 coverage, candidates and barrel exports, then run build, typecheck, tests and lint.
      Approach: require zero failures and re-run `/specd-verify` in full mode.
      (Req: documentation coverage; all)

## 16. Verification round 3 corrections

- [x] 16.1 Version-2 lock record with process start time
      `packages/code-graph/src/infrastructure/index-lock.ts`: `GraphIndexLockFile`, `acquireGraphIndexLockLeaseByStoragePath` — write `{version:2,pid,startedAt,token}`; keep reading version 1.
      Approach: add `readProcessStartTime(pid)` (POSIX `ps -o lstart= -p`, `/proc/<pid>/stat` on Linux, omitted on Windows).
      (Req: Stale index lock recovery)
- [x] 16.2 Classify live versus stale locks
      `index-lock.ts`: new `classifyGraphIndexLock(lockPath)` — live when `process.kill(pid,0)` succeeds or fails with `EPERM` and start times match; stale on `ESRCH`, start-time mismatch, or malformed file older than 10 s.
      Approach: pure function over the parsed record, injectable probes for tests.
      (Req: Stale index lock recovery)
- [x] 16.3 Race-safe stale recovery in acquisition
      `index-lock.ts`: `acquireGraphIndexLockLeaseByStoragePath` — on existing stale lock rename it to a unique sibling, unlink it, retry `wx` once, else throw `GraphBusyError`; add optional `onStaleLockRecovered`.
      Approach: atomic `renameSync` elects one winner; the loser's rename fails and falls through to busy.
      (Req: Stale index lock recovery)
- [x] 16.4 Assert-unlocked tolerates stale locks
      `index-lock.ts`: `assertGraphIndexUnlockedByStoragePath` — throw only for a live lock; never remove.
      Approach: reuse `classifyGraphIndexLock`.
      (Req: Stale index lock recovery)
- [x] 16.5 Forward the recovery warning to the host logger
      `code-graph-provider.ts` and the isolated supervisor entry: pass `onStaleLockRecovered` that logs a warning without changing output or exit code.
      Approach: no pid logic in the supervisor.
      (Req: Stale index lock recovery; Encapsulated index lock ownership)
- [x] 16.6 Lock tests including a real killed process
      `packages/code-graph/test/infrastructure/index-lock.spec.ts`: dead pid, reused pid, live owner, assert-does-not-remove, concurrent recovery, EPERM, version-1 record, SIGKILLed child.
      Approach: injectable probes for unit cases, `child_process.spawn` plus `kill -9` for the integration case.
      (Req: Stale index lock recovery)
- [x] 16.7 Isolated-worker test after a crashed run
      `packages/code-graph/test/application/isolated-index-worker.spec.ts`: leave a stale lock, start a run, assert the child forks.
      Approach: assert the supervisor source has no `process.kill` use.
      (Req: Encapsulated index lock ownership)
- [x] 16.8 Required-columns map next to the DDL
      `packages/code-graph/src/infrastructure/sqlite/schema.ts`: export `REQUIRED_COLUMNS` per table, derived from the DDL definitions.
      Approach: single source so DDL and check cannot drift.
      (Req: Schema versioning)
- [x] 16.9 Open-order and shape check
      `sqlite-graph-database.ts`: version check before DDL, `PRAGMA table_info` check after DDL, throw `GraphSchemaIncompatibleError` (`SCHEMA_INCOMPATIBLE`) after closing partial resources.
      Approach: confirm `getStorageRecoveryReason` maps it; `--force` then reaches recreate-and-retry.
      (Req: Schema versioning; Destructive recreation)
- [x] 16.10 Recreate removes only database files
      `sqlite-graph-store.ts`: `recreate()` removes `code-graph.sqlite`, `-wal`, `-shm`; leaves `index.lock`; rotates `storage.epoch`.
      Approach: add contract test covering a directory with all five files.
      (Req: Destructive recreation)
- [x] 16.11 Reject coverage stale flag in specs and tests
      `graph-store.contract.ts`, `project-spec-coverage` tests, docs: assert no relation carries `stale` and absent symbols yield `SYMBOL_NOT_FOUND`.
      Approach: update the test that asserted the old flag.
      (Req: Minimum graph semantics; Relation staleness removal)
- [x] 16.12 Candidates count logical targets
      `resolve-graph-selector.ts` and `run-graph-impact.ts`: `candidates` and `totalCandidates` count logical targets, overloads collapsed.
      Approach: group by logical id before counting.
      (Req: Exact ambiguity is bounded and not traversed)
- [x] 16.13 Remove the speculative scoped-binding fallback
      `scoped-binding-environment.ts` (fallback ~518-545), `index-code-graph.ts` (~1201-1237): resolve only through import-proven bindings or same-file scope.
      Approach: add negative tests for unimported `save()`, `helper()`, `new Thing()`.
      (Req: LanguageAdapter interface; no speculative edges)
- [x] 16.14 TypeScript public bindings
      `typescript-language-adapter.ts`: bind `export { local as alias }`, `export { priv as pub }` and `export default` to the correct declaration.
      Approach: resolve through the exported specifier's local name; replace the vacuous default test.
      (Req: Public bindings; Default export stays addressable)
- [x] 16.15 Public-binding impact from real indexes
      `analyze-impact.ts`: `analyzePublicBindingImpact` — traverse from the binding's target logical declarations and re-export steps instead of relations to binding ids.
      Approach: indexing-based test asserting a non-empty view.
      (Req: Public-binding impact)
- [x] 16.16 Selector typed target everywhere
      `resolve-graph-selector.ts`, `run-graph-impact.ts`: require `target`, remove the `parentId`+name heuristic and `catch { return base }`, drop the SDK `declarations[0]` shim, type location-id and full-id selectors.
      Approach: update CLI mock to the real contract.
      (Req: Selector resolution returns the typed target)
- [x] 16.17 Resolve import local bindings
      indexer pass 2 and the four adapters: fill `targetId` for import `LocalBinding`s from resolved imports; Python emits public bindings or stops advertising them.
      Approach: conformance test asserts every advertised capability produces output.
      (Req: First-class binding model)
- [x] 16.18 Logical-collision demotion
      `index-code-graph.ts` or the logical-id builder: demote only colliding declarations to physical-only, keep owners and member `ownerId`, expose collision diagnostics in the index result.
      Approach: fixtures for TS interface merge, class+interface, same-name classes in namespaces.
      (Req: Owner-first identity construction)
- [x] 16.19 Emit routine-local and module-state classification
      the four adapters: classify routine-local and non-exported module state as lexical or physical-only.
      Approach: adapter tests with a local variable and a non-exported constant.
      (Req: Declaration classification)
- [x] 16.20 PHP fixes
      `php-language-adapter.ts`: array PSR-4 values, call facts for functions and `self::`/`static::`/`parent::`/`Class::`, hierarchy targets keep written spelling.
      Approach: tests for composer.json with array values and each call form.
      (Req: PHP adapter calls and namespaces)
- [x] 16.21 TypeScript fixes
      `typescript-language-adapter.ts`: default/namespace imports produce `IMPORTS`; `extends ns.Base` keeps qualified spelling; namespace-scoped functions keep distinct ids; `.jsx` language id; shadowing yields no `CALLS`.
      Approach: one test per case.
      (Req: TypeScript adapter specs)
- [x] 16.22 Go and Python fixes
      `go-language-adapter.ts`, `python-language-adapter.ts`: embedded-interface `IMPLEMENTS` requires embedded methods; blank imports produce a dependency; parameter shadowing yields no `CALLS`; Python nested-block imports and `from . import module`.
      Approach: one test per case.
      (Req: Go and Python adapter specs)
- [x] 16.23 Traversal and store fixes
      `analyze-file-impact.ts` (`collectCoveringSpecs`), `analyze-impact.ts`, `sqlite-graph-database.ts` (frontier `COVERS_SYMBOL`): no physical-as-logical ids, covering specs of reached dependents' files, real evidence and depth under a specs-only filter, logical targets preserved.
      Approach: tests per finding.
      (Req: Logical-symbol coverage endpoints; Batched logical coverage lookup)
- [x] 16.24 Resolver fixes
      `resolve-symbol-reference.ts`: use adapter hierarchy precedence, narrow `missing` gating, gate unanchored uniqueness on stale health, multi-dot qualified names.
      Approach: tests for MRO tie, partial coverage, stale health.
      (Req: Resolve symbol reference)
- [x] 16.25 SDK and CLI fixes
      `run-graph-impact.ts`, `graph/impact.ts`: report `ambiguous`/`unresolved`, treat `C:\` as a file selector, include `kind` and `status` in JSON, update `--help` schema, document count units.
      Approach: tests for each.
      (Req: SDK and CLI graph-impact specs)
- [x] 16.26 Subset index without --force
      `index-code-graph.ts`, `compute-graph-fingerprint.ts`: reproduce the root-fingerprint rewrite with a test, then scope the comparison to indexed workspaces.
      Approach: test subset run followed by full run must not throw `GraphDerivationMismatchError`.
      (Req: Incompatible derivation rebuild)
- [x] 16.27 Repair vacuous tests
      `resolve-symbol-reference.spec.ts`, `language-adapter-conformance.spec.ts`, cycle-detection test, `barrel.spec.ts`.
      Approach: each assertion must fail when the behavior is wrong.
      (Req: Language adapter conformance)
- [x] 16.28 Docs, format, validate
      `docs/code-graph/index.md`, `docs/cli/graph.md`, `docs/sdk/index.md`: lock recovery, schema-shape recovery, candidates, JSON fields, real `runGraphImpact` example.
      Approach: `pnpm format`, `pnpm test`, `eslint .`; then re-run `/specd-verify` in full mode.
      (Req: documentation coverage)

## 17. Verification round 4 corrections

- [x] 17.1 Clause-range imported hierarchy helper
      `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts`: `createImportedHierarchyMetadata` takes `clauseRange: SourceRange` instead of `source: SymbolNode`.
      Approach: copy the range verbatim into `sourceRange`; update the helper test.
      (Req: Parser-authoritative structural fact extraction; Imported hierarchy relation has shared provenance)
- [x] 17.2 TypeScript heritage clause ranges
      `typescript-language-adapter.ts`: `TsTypeDeclarationInfo.extendsRanges`/`implementsRanges` from each heritage type node; pass them to the helper.
      Approach: multi-heritage fixture asserts each edge's range matches its own clause text on relation and session fact.
      (Req: Imported TypeScript heritage retains provenance)
- [x] 17.3 Python base-expression ranges
      `python-language-adapter.ts`: `PythonClassInfo.baseRanges` from each `argument_list` base node.
      Approach: `class C(A, B)` fixture asserts two distinct base ranges.
      (Req: Imported Python base retains provenance)
- [x] 17.4 PHP clause-name ranges
      `php-language-adapter.ts`: `extendsRanges`, `implementsRanges`, `traitRanges` on `PhpTypeInfo`/`SerializedPhpTypeInfo`; pass to the three relation sites.
      Approach: imported extends, implements and trait fixtures assert clause-name ranges.
      (Req: Imported PHP hierarchy retains provenance)
- [x] 17.5 Export covering specs in the SDK and CLI
      `sdk/src/orchestration/run-graph-impact.ts`: top-level and `canonicalImpact.coveringSpecs` projected for exports; `cli/src/commands/graph/impact.ts` prints them in text and passes them in JSON/TOON.
      Approach: SDK test with file and symbol evidence; CLI JSON and text tests.
      (Req: Export and covering-spec locations are projected)
- [x] 17.6 Search files-category boundary test
      `packages/code-graph/test/application/use-cases/search-code-graph.spec.ts`: non-symbol source text appears only under `files`; store search methods expose no file category.
      Approach: real in-memory store fixture.
      (Req: Persisted file content is not a file result category)
- [x] 17.7 Manifest isolation tests
      TypeScript, Python, Go and PHP adapter specs: manifests with code-like text produce no source facts.
      Approach: `package.json`, `pyproject.toml`, `go.mod`, `composer.json` fixtures.
      (Req: Auxiliary manifest parsing remains bounded; per-language metadata separation)
- [x] 17.8 Erroneous-source tests
      Conformance suite: a syntax error yields no fact for the broken construct and keeps intact facts, for every adapter.
      Approach: one fixture per language in `language-adapter-conformance.spec.ts`.
      (Req: Parser cannot prove a construct)
- [x] 17.9 TypeScript and PHP structural gaps
      TypeScript call-initializer caller and multiline/lookalike imports, types, heritage; PHP method-local caller, compact multi-class lines, brace/keyword lookalikes.
      Approach: one test per scenario in the language specs.
      (Req: Call initializer remains a variable; Imports, types, and heritage use bounded nodes; Method-local binding is not the caller; Compact declarations retain distinct owners; PHP bodies and hierarchy do not use brace scans)
- [x] 17.10 Traversal, store and indexer gaps
      Shallowest-depth logical target, deduplicated logical coverage frontier, physical-only id retrievable with no logical row, `FileNode.projectRelativePath` incl. `../..`.
      Approach: tests in `traversal.spec.ts`, `graph-store.contract.ts`, `sqlite-graph-store.spec.ts`, `workspace-indexing.spec.ts`.
      (Req: Reached declarations are mapped before coverage lookup; Declaration IDs map without inventing logical identity; Worker row uses schema 15 declaration columns; Paths prefixed with workspace name and project-relative path)
- [x] 17.11 Lock race and CLI label tests
      `index-lock.spec.ts`: two contenders on one stale lock elect one owner; `graph-impact.spec.ts`: `declaration impact` label and non-empty structured `semanticAffectedTargets`.
      Approach: injected rename failure for the race.
      (Req: Concurrent recovery elects one owner; Exact and ambiguous selectors are presented truthfully; Structured formats preserve the SDK contract)
- [x] 17.12 Replace tautological identity tests
      `packages/code-graph/test/domain/value-objects/symbol-reference.spec.ts`: identity-layer tests call the real factories.
      Approach: each assertion fails if identity rules change.
      (Req: Equal local names in competing scopes remain distinct; Overload movement preserves one logical target)
- [x] 17.13 Docs, format, validate
      `docs/sdk/index.md`, `docs/cli/graph.md`, `docs/code-graph/index.md`: export covering specs and clause-range evidence.
      Approach: format changed files, then build, typecheck, lint and `pnpm test`; re-run `/specd-verify` in full mode.
      (Req: documentation coverage)
