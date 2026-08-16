# Tasks: implementation-review-symbol-resolution

## 1. Logical symbol domain model

- [x] 1.1 Add structured logical-symbol value objects
      `packages/code-graph/src/domain/value-objects/symbol-reference.ts`: `LogicalSymbol`, `DeclarationOccurrence`, `SymbolSpace`, and `MemberForm` — model semantic identity separately from syntax locations
      Approach: derive deterministic logical IDs and canonical references from length-delimited or percent-escaped structured fields while preserving language-specific case and the existing `SymbolNode.id` and `SymbolKind`
      (Req: Logical symbol and canonical reference model; Member forms and symbol spaces)
- [x] 1.2 Add canonical-reference codec tests
      `packages/code-graph/test/domain/value-objects/symbol-reference.spec.ts`: canonical render/parse cases — prove escaping, round-trip stability, case preservation, and independence from source ranges
      Approach: cover delimiters inside every structured component and assert that consumers never need to split on `.`, `#`, or `::`
      (Req: Logical canonical targets; Structured reference input)
- [x] 1.3 Add first-class public and local binding value objects
      `packages/code-graph/src/domain/value-objects/symbol-reference.ts`: `PublicBinding`, `LocalBinding`, and `ResolutionStep` — preserve aliases, lexical scope, shadowing, anonymous/default exports, and ordered provenance
      Approach: encode public IDs from surface/exported name/space and local IDs from file/scope/local name/space instead of relying on relation metadata
      (Req: First-class binding model; Public and local binding identity)
- [x] 1.4 Add persisted index-coverage value objects
      `packages/code-graph/src/domain/value-objects/index-session.ts`: `IndexCoverage`, `IndexCoverageStatus`, and reason/capability fields — retain evidence for every considered source target
      Approach: represent `indexed`, `excluded`, `unsupported`, `parse-failed`, and `partial` with indexed content hash and stable reason code
      (Req: Index coverage facts; Freshness and coverage gate)
- [x] 1.5 Extend adapter and analysis contracts with reference facts
      `packages/code-graph/src/domain/value-objects/language-adapter.ts`, `file-analysis.ts`, and `index-session.ts`: adapter capabilities, declaration grouping keys, members, bindings, hierarchy, build context, and coverage outputs — make syntax-aware facts available to generic indexing
      Approach: keep adapter outputs additive and require explicit capability/coverage evidence for unsupported semantics
      (Req: Resolver capability declaration; Reference fact indexing)
- [x] 1.6 Export new domain types without breaking existing imports
      `packages/code-graph/src/public.ts` and `packages/code-graph/src/index.ts`: logical, binding, coverage, reference input/result, status, candidate, path, and health types — expose ESM named exports with JSDoc
      Approach: add exports without removing or renaming existing public symbols and add a package-boundary type test
      (Req: Logical symbol and canonical reference model; Symbol-reference provider surface)

## 2. Graph-store contracts and persistence

- [x] 2.1 Add batch reference and coverage operations to the graph-store port
      `packages/code-graph/src/domain/ports/graph-store.ts`: logical-symbol, declaration, public/local binding, provenance, coverage, and prepared batch query methods — define the backend-independent persistence boundary
      Approach: use first-class persistence inputs, deterministic ordering, indexed lookup keys, and batch APIs suitable for one resolver execution
      (Req: Reference and coverage persistence; Batch and backend-independent resolution)
- [x] 2.2 Extend the in-memory graph store for the new port
      `packages/code-graph/test/helpers/in-memory-graph-store.ts`: new persistence and query methods — keep application and contract tests backend-neutral
      Approach: preserve parallel bindings and declaration groups in dedicated maps and sort results with the canonical deterministic comparator
      (Req: Reference and coverage persistence)
- [x] 2.3 Extend shared graph-store contract coverage
      `packages/code-graph/test/domain/ports/graph-store.contract.ts`: logical/reference/binding/coverage cases — verify round-trip, ordering, parallel routes, indexed lookup, and atomic replacement for every backend
      Approach: reuse one fixture matrix against in-memory, SQLite, and Ladybug when supported
      (Req: Reference and coverage persistence; First-class binding model)
- [x] 2.4 Implement SQLite reference storage schema
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: normalized logical-symbol, declaration, binding, provenance, coverage, and lookup/FTS structures — persist all new facts
      Approach: bump the active SQLite schema from 5 to 6 only if 5 is still current, use parameterized queries and covering indexes, and rebuild FTS from structured identities
      (Req: Reference schema upgrade; Reference and coverage persistence)
- [x] 2.5 Implement SQLite batch queries and replacement writes
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: graph-store reference/coverage methods — provide deterministic, transactionally consistent results
      Approach: prepare indexed batch queries, validate storage generation, and atomically replace derived facts with the indexed graph
      (Req: Batch and backend-independent resolution; Incompatible store handling)
- [x] 2.6 Add SQLite schema, FTS, generation, and contract tests
      `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`: upgrade rejection and reference persistence cases — prove schema 6 behavior and deterministic querying
      Approach: test old/new schema rejection, logical/binding/coverage round-trip, FTS grouping, parallel routes, atomic rebuild, and generation mismatch
      (Req: Reference schema upgrade; Incompatible store handling)
- [x] 2.7 Implement the Ladybug reference contract if the backend remains supported
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: equivalent entities, indexes, generation checks, and batch methods — maintain backend parity
      Approach: first confirm Ladybug is still in supported composition; only then bump schema 10 to 11 if still current, otherwise remove the obsolete delta before implementation
      (Req: Reference schema upgrade; Batch and backend-independent resolution)
- [x] 2.8 Add Ladybug parity tests if the backend remains supported
      `packages/code-graph/test/infrastructure/ladybug/ladybug-graph-store.spec.ts` and `ladybug-graph-store-multi-kind.spec.ts`: shared contract and schema cases — prove the same observable behavior as SQLite
      Approach: run the shared fixture matrix plus backend-specific schema/generation tests, or document the task as not applicable if support was removed before implementation
      (Req: Reference schema upgrade; Reference and coverage persistence)

## 3. Indexing and coverage

- [x] 3.1 Group declaration occurrences into logical symbols in memory
      `packages/code-graph/src/application/use-cases/in-memory-index-session.ts`: Pass 1 declaration maps — merge only occurrences sharing the adapter-provided semantic grouping key
      Approach: deduplicate by logical ID while keeping every declaration location and never merge competing declarations by simple name
      (Req: Logical canonical targets; Logical symbol and canonical reference model)
- [x] 3.2 Resolve binding and hierarchy facts during indexing Pass 2
      `packages/code-graph/src/application/use-cases/in-memory-index-session.ts`: indexed lookup maps and provenance assembly — resolve imports, reexports, aliases, members, and hierarchy conservatively
      Approach: use adapter facts and build context, retain ordered paths, bound traversal, and emit no guessed edge when evidence is non-unique or unsupported
      (Req: Reference fact indexing; Deterministic resolution precedence)
- [x] 3.3 Persist one coverage outcome for every considered source target
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: coverage collection and write — make later absence checks evidence-based
      Approach: retain transient `IndexResult.errors` for reporting while persisting content hash, status, reason, and adapter capabilities for indexed and non-indexed targets
      (Req: Index coverage facts; Current-content and coverage freshness)
- [x] 3.4 Persist logical spec coverage without guessed links
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: implementation-link resolution and `COVERS_SYMBOL` emission — attach proven links to logical identity
      Approach: emit logical coverage only for one uniquely proven target; preserve ambiguous/unresolved evidence without creating a relation
      (Req: Reference fact indexing; Resolution outcomes)
- [x] 3.5 Recreate incompatible derived storage during indexing
      `packages/code-graph/src/application/use-cases/index-project-graph.ts` and `packages/code-graph/src/infrastructure/storage-generation.ts`: indexing-specific repair path — rebuild all facts after schema or derivation incompatibility
      Approach: reject incompatibility on ordinary reads, recreate only from the indexing path, rotate `storage.epoch`, re-extract all sources, rebuild FTS, and expose `fullRebuild` plus reason
      (Req: Incompatible derivation rebuild; Incompatibility repair execution)
- [x] 3.6 Add indexing and rebuild regression tests
      `packages/code-graph/test/application/use-cases/index-project-graph.spec.ts` and `index-project-graph-integration.spec.ts`: reference, coverage, and incompatible-store cases — verify atomic rebuild and visible repair
      Approach: include package-fingerprint changes, old schemas, generation rotation, full source re-extraction, FTS rebuild, durable failure coverage, and concurrent old-provider rejection
      (Req: Incompatible derivation rebuild; Incompatibility repair execution; Code Graph version invalidation)

## 4. Language-semantic extraction

- [x] 4.1 Publish adapter capability declarations
      `packages/code-graph/src/infrastructure/tree-sitter/adapter-registry.ts`: registered adapter metadata — expose exactly which binding, member, hierarchy, and build-context semantics each adapter can prove
      Approach: capabilities come from adapters and feed coverage; generic consumers must not infer support from language name
      (Req: Resolver capability declaration)
- [x] 4.2 Implement TypeScript and JavaScript reference extraction
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: module/package resolution, declarations, overload groups, members, imports, reexports, and hierarchy facts — cover public barrels and conditional surfaces
      Approach: honor package conditions, tsconfig inheritance/references, type/value/namespace spaces, default/anonymous exports, and ordered reexport provenance
      (Req: TypeScript and JavaScript reference coverage; Canonical module and package resolution identity)
- [x] 4.3 Add TypeScript and JavaScript adapter fixtures
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: barrels, aliases, conditions, overloads, declaration merging, member forms, and hierarchy cases — lock down issue #52 and #58 regressions
      Approach: assert exact logical groups, public bindings, paths, spaces/forms, capabilities, and conservative unsupported results
      (Req: TypeScript and JavaScript reference coverage; Member forms and symbol spaces)
- [x] 4.4 Implement Python reference extraction
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: package exposure, namespace packages, `.pyi`, imports, properties, members, and MRO facts — map Python lookup semantics without global case normalization
      Approach: preserve aliases and shadowing, distinguish property/member forms, and follow statically known MRO precedence only
      (Req: Python reference coverage; Hierarchy-aware members)
- [x] 4.5 Add Python adapter fixtures
      `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`: packages, stubs, namespace packages, aliases, properties, and MRO cases — verify supported and partial coverage
      Approach: assert canonical package identity, deterministic hierarchy path, local scopes, and explicit unsupported/partial outcomes
      (Req: Python reference coverage)
- [x] 4.6 Implement Go reference extraction
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: modules/workspaces/replace rules, visibility, receiver method sets, embedding, interfaces, aliases, and build context — represent Go semantic identity
      Approach: resolve only under explicit build context, preserve exported-name case rules, and record deterministic embedding/interface paths
      (Req: Go reference coverage; Canonical module and package resolution identity)
- [x] 4.7 Add Go adapter fixtures
      `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts`: module/workspace replacement, build tags, method sets, embedding, interfaces, and alias cases — verify exact and unsupported outcomes
      Approach: assert capability and coverage reasons when build context cannot prove a target
      (Req: Go reference coverage; Freshness and coverage gate)
- [x] 4.8 Implement PHP reference extraction
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: Composer identity, separate import spaces, `use` aliases, traits, and adaptations — preserve alias provenance separately from inheritance
      Approach: resolve `use X as Y` to X for canonical impact, keep Y as a local binding, and model trait `insteadof`/`as` plus inheritance only when statically proven
      (Req: PHP reference coverage; Public and local binding identity; Hierarchy-aware members)
- [x] 4.9 Add PHP adapter fixtures
      `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: Composer, namespace/import spaces, aliases, shadowing, traits, adaptations, and inheritance cases — verify alias and hierarchy impact behavior
      Approach: assert that changing X reaches uses through Y without treating the alias as inheritance, while ambiguous or dynamic evidence stays unresolved
      (Req: PHP reference coverage; Deterministic resolution precedence)

## 5. Symbol resolution

- [x] 5.1 Implement the backend-independent resolver
      `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts`: `ResolveSymbolReference.execute()` — resolve structured requests to one logical target or a conservative diagnostic
      Approach: validate workspace/constraints; share one health snapshot; try exact declaration, public binding, scoped local binding, then deterministic hierarchy; deduplicate by logical ID
      (Req: Structured reference input; Deterministic resolution precedence)
- [x] 5.2 Implement resolution outcomes and stable diagnostics
      `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts`: candidate/result construction — distinguish `resolved`, `ambiguous`, `unresolved`, and `missing`
      Approach: use stable `GRAPH_*`, `COVERAGE_*`, `REFERENCE_*`, `AMBIGUOUS_*`, and `RUNTIME_UNSUPPORTED` codes; return sorted candidates and paths and throw only infrastructure generation failures
      (Req: Resolution outcomes; Freshness and coverage gate)
- [x] 5.3 Implement bounded hierarchy-member resolution
      `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts`: hierarchy traversal — find inherited, embedded, trait, and contract members using language precedence
      Approach: track visited logical/binding IDs, enforce depth/memory bounds, preserve edge direction, and refuse equally valid competing targets
      (Req: Hierarchy-aware members)
- [x] 5.4 Implement batch resolution with shared queries
      `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts`: `executeBatch()` — resolve many implementation links without per-symbol provider or health work
      Approach: share health, prepared graph-store queries, lookup maps, and traversal caches while preserving input/result correspondence and deterministic ordering
      (Req: Batch and backend-independent resolution; One health snapshot and batch resolution)
- [x] 5.5 Add exhaustive resolver unit tests
      `packages/code-graph/test/application/use-cases/resolve-symbol-reference.spec.ts`: precedence, status, reason, candidate, coverage, cycle, build-context, and batching cases — verify the generic policy
      Approach: cover dirty content, exclusions, parse failures, partial capabilities, ambiguous aliases/exports/members, canonical escaping, shadowing, runtime-only behavior, cycles, and bounded query counts
      (Req: all requirements in code-graph:resolve-symbol-reference)

## 6. Traversal, impact, and search

- [x] 6.1 Resolve canonical targets before existing impact traversal
      `packages/code-graph/src/domain/services/analyze-impact.ts`, `analyze-file-impact.ts`, `analyze-files-impact.ts`, and `analyze-spec-impact.ts`: logical-target entry path — prevent location aliases from fragmenting impact
      Approach: resolve once, traverse canonical logical identity, deduplicate by logical ID, preserve existing direction/depth semantics, and surface ambiguity instead of merging candidates
      (Req: Resolved canonical and public-binding impact)
- [x] 6.2 Add separate public-binding impact analysis
      `packages/code-graph/src/domain/services/analyze-impact.ts`: exact binding and canonical result projection — distinguish consumers of one export route from all consumers of its implementation
      Approach: return `{ bindingImpact, canonicalImpact, binding, target, path }` and traverse visited binding/logical IDs with deterministic ordering
      (Req: Resolved canonical and public-binding impact; Public export impact analysis)
- [x] 6.3 Make graph search reference-aware
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: structured identity and binding search — make canonical/member/export names discoverable
      Approach: search every identity field, group declarations by logical target, retain every public/local binding and provenance, and leave existing `kind` filtering unchanged
      (Req: Reference-aware symbol results)
- [x] 6.4 Add traversal and search backend-parity tests
      `packages/code-graph/test/domain/services/analyze-files-impact.spec.ts` and search use-case tests: canonical/public, hierarchy, ambiguity, deduplication, and backend cases — verify exact observable projections
      Approach: run representative SQLite and supported Ladybug fixtures for reexports, aliases, multiple routes, inherited members, cycles, and identical deterministic order
      (Req: Resolved canonical and public-binding impact; Reference-aware symbol results)

## 7. Health, composition, and indexing orchestration

- [x] 7.1 Extend staleness computation with content and coverage
      `packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts` and staleness services: derivation/content/coverage state — prevent VCS ref equality from proving freshness
      Approach: include the released Code Graph package version in derivation fingerprint and compare current content against persisted indexed hashes and coverage completeness
      (Req: Current-content and coverage freshness; Code Graph version invalidation)
- [x] 7.2 Extend graph health with independent reason dimensions
      `packages/code-graph/src/application/use-cases/get-graph-health.ts`: `GetGraphHealthResult` — expose VCS, working-tree/content, derivation, schema/generation, and coverage health separately
      Approach: return stable reasons and counts without collapsing incomplete coverage into stale absence
      (Req: Content freshness and coverage result)
- [x] 7.3 Add health and staleness regression tests
      `packages/code-graph/test/application/use-cases/get-graph-health.spec.ts`, `staleness-detection.verify.spec.ts`, and `compute-graph-fingerprint.spec.ts`: dirty, excluded, unsupported, failure, partial, package-version, and schema cases — prove reason accuracy
      Approach: assert current-but-incomplete evidence differs from fresh complete coverage and that package-version changes invalidate derivation
      (Req: Content freshness and coverage result; Current-content and coverage freshness; Code Graph version invalidation)
- [x] 7.4 Wire resolver and public-impact operations into the provider
      `packages/code-graph/src/composition/code-graph-provider.ts` and `create-code-graph-provider.ts`: `resolveSymbolReference`, `resolveSymbolReferences`, `analyzePublicBindingImpact`, and coverage queries — expose one composed policy surface
      Approach: ordinary `open()` remains read-only and rejects incompatible schemas; an explicit indexing open/repair path owns recreation
      (Req: Symbol-reference provider surface; Incompatible store handling)
- [x] 7.5 Add provider lifecycle and export tests
      `packages/code-graph/test/composition/code-graph-provider.spec.ts` and package barrel tests: resolver wiring, one-open lifecycle, incompatible-read rejection, indexing repair, and public types — protect additive compatibility
      Approach: assert no normal read repairs storage and old providers fail after generation rotation
      (Req: Symbol-reference provider surface; Incompatibility repair execution)
- [x] 7.6 Pass repair results through SDK graph indexing
      `packages/sdk/src/orchestration/run-index-project-graph.ts`: `fullRebuild` and `fullRebuildReason` projection — preserve Code Graph repair diagnostics across the SDK boundary
      Approach: use the indexing-specific provider lifecycle and return the backend result without CLI-owned interpretation
      (Req: Repair lifecycle passthrough)
- [x] 7.7 Add SDK indexing-repair tests
      `packages/sdk/test/orchestration/run-index-project-graph.spec.ts`: compatible and incompatible index runs — verify lifecycle, generation, and result passthrough
      Approach: assert one provider lifecycle and exact preservation of `fullRebuild` and reason
      (Req: Repair lifecycle passthrough)

## 8. SDK implementation-review orchestration

- [x] 8.1 Implement delivery-neutral review construction
      `packages/sdk/src/orchestration/build-implementation-review.ts`: `buildImplementationReview()` — combine Core raw tracking with Code Graph resolution
      Approach: read Core once, open the provider once, read health once, batch all symbol links once, bypass resolution for file-only links, and never mutate stored values
      (Req: Delivery-neutral orchestration; One health snapshot and batch resolution)
- [x] 8.2 Define the stable reviewed-link projection
      `packages/sdk/src/orchestration/build-implementation-review.ts`: `BuildImplementationReviewInput`, `BuildImplementationReviewResult`, and `ReviewedImplementationLink` — expose status, reason, target, candidates, health/coverage, and provenance
      Approach: preserve original file/symbol link values and deterministically correlate batch results without adding SDK matching policy
      (Req: Stable review projection)
- [x] 8.3 Handle unavailable and failing graph infrastructure
      `packages/sdk/src/orchestration/build-implementation-review.ts`: provider availability/error branches — distinguish expected graph absence from infrastructure failures
      Approach: use the shared host lifecycle, return specified unavailable diagnostics, and propagate generation/storage failures rather than converting them to stale
      (Req: Graph availability behavior; Shared host behavior)
- [x] 8.4 Export implementation-review orchestration publicly
      `packages/sdk/src/orchestration/index.ts` and `packages/sdk/src/index.ts`: function and public types — provide ESM named exports with JSDoc
      Approach: keep Core reexports and existing SDK exports compatible and add compile-time barrel coverage
      (Req: Implementation review public orchestration)
- [x] 8.5 Add SDK implementation-review tests
      `packages/sdk/test/orchestration/build-implementation-review.spec.ts`: orchestration, projection, availability, and failure cases — prove the SDK owns cross-subsystem coordination
      Approach: assert one Core read, one provider/health access, one batch call, unchanged stored values, file-link bypass, deterministic mapping, and infrastructure error propagation
      (Req: all requirements in sdk:build-implementation-review)
- [x] 8.6 Add SDK composition and barrel tests
      `packages/sdk/test/composition/host-context.spec.ts`, `with-open-graph-provider.spec.ts`, and `packages/sdk/test/barrel.spec.ts`: shared-host and public-export cases — verify the new orchestration uses standard SDK composition
      Approach: typecheck named exports and assert provider cleanup on success and failure
      (Req: Shared host behavior; Implementation review public orchestration)

## 9. CLI consumers and graph commands

- [x] 9.1 Replace CLI implementation matching with the SDK projection
      `packages/cli/src/commands/change/_implementation-tracking.ts`: implementation-review adapter — remove exact-file, rightmost-member, same-name, reexport, and hierarchy matching helpers
      Approach: call `buildImplementationReview` once and adapt only presentation; file links remain unforced and no stored value is rewritten
      (Req: List subcommand; Review subcommand)
- [x] 9.2 Render one implementation projection in list and review
      `packages/cli/src/commands/change/implementation.ts`: list/review output — expose resolved, ambiguous, unresolved, missing, reason, health/coverage, target, candidates, and provenance
      Approach: render the SDK result in text/JSON/TOON without candidate selection or sidecar/tracking mutation
      (Req: List subcommand; Review subcommand)
- [x] 9.3 Render the same implementation projection in status
      `packages/cli/src/commands/change/status.ts`: implementation section — eliminate independent graph enrichment and preserve lifecycle data from Core
      Approach: reuse the identical SDK reviewed-link projection used by implementation list/review
      (Req: Implementation section)
- [x] 9.4 Add CLI implementation/status equality tests
      `packages/cli/test/commands/change-implementation-tracking.spec.ts` and status command tests: shared projection cases — prove no CLI matching fallback remains
      Approach: assert equal outcomes across list/review/status, all four statuses/reasons, file bypass, no helper fallback calls, no mutations, and text/JSON/TOON parity
      (Req: List subcommand; Review subcommand; Implementation section)
- [x] 9.5 Add the public-export selector to graph impact
      `packages/cli/src/commands/graph/impact.ts`: `--export <name> --from <surface>` target family — select one public binding independently of canonical `--symbol`
      Approach: validate both flags before provider open, make the family mutually exclusive with file/symbol/spec, normalize direction aliases, and delegate resolution
      (Req: Command signature; Public export impact analysis)
- [x] 9.6 Render public and canonical export impact views
      `packages/cli/src/commands/graph/impact.ts`: export result serializers — show binding, target, ordered chain, exact-binding consumers, and complete canonical impact
      Approach: preserve both views and deterministic candidates/provenance in text, JSON, and TOON without merging ambiguity
      (Req: Public export impact analysis)
- [x] 9.7 Add graph-impact selector and projection tests
      `packages/cli/test/commands/graph-impact.spec.ts`: validation and output cases — distinguish public-route and canonical impact
      Approach: test missing selector halves, mutual exclusion, provider-not-opened validation, aliases, ambiguous exports, multiple routes, and format parity
      (Req: Command signature; Public export impact analysis)
- [x] 9.8 Render reference-aware graph search results
      `packages/cli/src/commands/graph/search.ts`: logical, declaration, member, binding, and provenance fields — expose grouped search without changing `--kind`
      Approach: serialize the Code Graph result directly in text/JSON/TOON with deterministic ordering
      (Req: Reference-aware symbol results)
- [x] 9.9 Add graph-search reference output tests
      `packages/cli/test/commands/graph-search.spec.ts`: canonical/member/export search cases — verify grouped targets and retained bindings in every format
      Approach: include same-name spaces/forms and multiple public routes to one logical symbol
      (Req: Reference-aware symbol results)
- [x] 9.10 Surface incompatible repair in graph index
      `packages/cli/src/commands/graph/index-graph.ts`: index result output — display full rebuild and stable reason
      Approach: delegate repair to SDK/Code Graph and preserve existing progress/error output
      (Req: Visible incompatibility repair)
- [x] 9.11 Surface content and coverage reasons in graph stats
      `packages/cli/src/commands/graph/stats.ts` and `warn-graph-staleness.ts`: health diagnostics — distinguish dirty, partial, excluded, unsupported, parse-failed, schema, and derivation states
      Approach: render the structured health projection without reducing every non-fresh state to one stale warning
      (Req: Content freshness and coverage diagnostics)
- [x] 9.12 Add graph index/stats diagnostic tests
      `packages/cli/test/commands/graph-index.spec.ts` and `graph-stats.spec.ts`: repair and health cases — verify text/JSON/TOON reason fidelity
      Approach: assert old-schema repair visibility, full rebuild reason, generation change, fresh completion, dirty content, and incomplete coverage
      (Req: Visible incompatibility repair; Content freshness and coverage diagnostics)

## 10. Release compatibility and documentation

- [x] 10.1 Record the logical-resolution architecture decision
      `docs/adr/0024-logical-symbol-resolution.md`: new MADR — capture logical identity, first-class bindings, conservative evidence, Code Graph/SDK/CLI ownership, and incompatible derived-store rebuilding
      Approach: use the repository MADR format with decision drivers, alternatives, consequences, confirmation, and a `### Spec` subsection linking `code-graph:symbol-model`, `code-graph:resolve-symbol-reference`, and `sdk:build-implementation-review`
      (Req: Logical symbol and canonical reference model; Delivery-neutral orchestration)
- [x] 10.2 Update the released Code Graph derivation version
      `packages/code-graph/package.json` and version source consumed by fingerprinting: package version — force existing indexes to be recognized as derivationally incompatible
      Approach: make exactly one release-version change after reference extraction is complete; do not change `schema-std`, manifest, or spec-lock schemas
      (Req: Code Graph version invalidation)
- [x] 10.3 Update CLI reference documentation
      `docs/cli/cli-reference.md`: graph impact/search/index/stats and change implementation/status sections — document selectors, result shapes, statuses/reasons, public versus canonical impact, and rebuild recovery
      Approach: include deterministic/unsupported boundaries and explicit `graph index` recovery for incompatible derived storage
      (Req: Public export impact analysis; Content freshness and coverage diagnostics; Visible incompatibility repair)
- [x] 10.4 Update SDK and Code Graph documentation
      `docs/sdk/index.md` and `docs/code-graph/index.md`: `buildImplementationReview`, indexing repair, and logical-reference APIs — document ownership, host lifecycle, result shapes, failure behavior, and non-mutation
      Approach: keep `docs/sdk/` as the only integrator entry point; present `docs/code-graph/` as package reference and state that Code Graph owns resolution, SDK orchestrates, Core remains raw tracking, and CLI only presents
      (Req: Delivery-neutral orchestration; Implementation review public orchestration; Repair lifecycle passthrough)
- [x] 10.5 Complete JSDoc and convention coverage
      All added or modified source files in `packages/code-graph`, `packages/sdk`, and `packages/cli`: functions, methods, classes, type aliases, and interfaces — keep generated API and IDE documentation complete
      Approach: add descriptions, every applicable `@param`, `@returns`, and `@throws`; retain kebab-case files, ESM named exports, explicit public return types, strict readonly types, and no `any`
      (Req: Symbol-reference provider surface; Implementation review public orchestration)

## 11. Integrated verification

- [x] 11.1 Run affected automated package suites
      `packages/code-graph`, `packages/sdk`, and `packages/cli`: build, unit, integration, contract, lint, and typecheck commands — verify the complete affected workspace set
      Approach: run pnpm filters for all three packages and record any intentionally unsupported Ladybug result
      (Req: all change requirements)
- [x] 11.2 Verify the multi-language reference fixture end to end
      Code Graph E2E fixture with a TypeScript barrel, Python package, Go embedding, and PHP alias/trait — prove conservative cross-language indexing
      Approach: index the fixture and assert complete expected coverage, zero guessed relations, and explicit reasons for every unsupported construct
      (Req: TypeScript and JavaScript reference coverage; Python reference coverage; Go reference coverage; PHP reference coverage)
- [x] 11.3 Verify canonical, member, and export search end to end
      `graph search`: indexed multi-language fixture — confirm structured names and every public route are discoverable
      Approach: query canonical, member, and export names and compare deterministic logical grouping and provenance
      (Req: Reference-aware symbol results)
- [x] 11.4 Compare public-binding and canonical impact end to end
      `graph impact --export X --from <surface>` and `graph impact --symbol <canonical>`: multi-route fixture — prove the export result represents the real implementation without losing route-specific consumers
      Approach: compare export `canonicalImpact` with symbol impact and separately assert exact `bindingImpact`
      (Req: Public export impact analysis; Resolved canonical and public-binding impact)
- [x] 11.5 Compare implementation list, review, and status end to end
      `changes implementation list`, `changes implementation review`, and `changes status --implementation`: one change fixture — confirm identical SDK-derived symbol outcomes
      Approach: compare normalized structured outputs and verify tracking and sidecars remain byte-for-byte unchanged
      (Req: Stable review projection; List subcommand; Review subcommand; Implementation section)
- [x] 11.6 Verify dirty-content absence handling end to end
      Indexed fixture followed by an uncommitted source edit: resolution and implementation review — ensure absence is not falsely stale
      Approach: remove or rename an indexed symbol without committing and assert `unresolved` with content/coverage reason until reindex
      (Req: Freshness and coverage gate; Current-content and coverage freshness)
- [x] 11.7 Verify incompatible-store recovery end to end
      Old-schema SQLite fixture: ordinary reads, `graph index`, and `graph stats` — prove explicit safe recovery
      Approach: assert reads reject, indexing reports the reason and full rebuild, storage generation rotates, FTS is rebuilt, and final health is fresh
      (Req: Incompatible store handling; Incompatibility repair execution; Visible incompatibility repair)

## 12. Relation-indexing performance

- [x] 12.1 Replace per-relation global scans with session lookup indexes
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: relation construction — precompute declaration-to-logical, logical-by-id, imports-by-local-name, symbols-by-id, and bindings-by-surface/name maps once
      Approach: keep conservative resolution semantics while eliminating full declaration/symbol scans inside call and dependency loops
      (Req: Reference fact indexing)
- [x] 12.2 Bound TypeScript re-export linking work
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: named/star re-export pass — index bindings by surface/exported name and unresolved aliases by route
      Approach: process only newly resolved routes per pass and retain cycle safety without filtering every binding for every re-export
      (Req: Reference fact indexing)
- [x] 12.3 Add high-cardinality relation-performance regressions
      `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts` and focused index tests — synthetic declarations/calls/re-exports
      Approach: assert lookup construction/query counts and a bounded runtime budget generous enough for CI while detecting quadratic scans
      (Req: Reference fact indexing)
- [x] 12.4 Benchmark the repository index and repeat affected verification
      Real `graph index`, Code Graph build/test/lint/typecheck, implementation tracking review, and post hooks — confirm usable end-to-end indexing and no correctness regression
      Approach: compare the relation phase and total elapsed time with the observed regressed run, then resolve every implementation file
      (Req: Reference fact indexing)

## 13. Post-index health accuracy

- [x] 13.1 Compare health against the indexed content snapshot
      `packages/code-graph/src/application/use-cases/get-graph-health.ts` and provider internals — rediscover the graph-visible file set and compare source/document hashes
      Approach: let a dirty VCS tree be current after indexing while retaining dirty detection for changed, added, or removed graph-visible content
      (Req: Current-content and coverage freshness)
- [x] 13.2 Restore effective derivation comparison in provider-owned health
      `packages/code-graph/src/composition/create-code-graph-provider.ts` — preserve the configured spec root needed by synthetic discovery exclusions
      Approach: compute the same effective workspace fingerprint in index and read paths instead of degrading exceptions to unknown
      (Req: Code Graph version invalidation)
- [x] 13.3 Normalize implementation-review file selectors before symbol resolution
      `packages/code-graph/src/composition/code-graph-provider.ts` — resolve stored project-relative paths to canonical graph paths and their owning workspace
      Approach: keep stored tracking values immutable while letting provider-owned selector resolution feed canonical paths into logical, local-binding, and coverage queries
      (Req: Resolution outcomes; Immutable stored inputs and review-time resolution)
- [x] 13.4 Verify forced-index health and repeat completion gates
      Integration regression, repository `graph stats`, Code Graph build/test/lint/typecheck, implementation review, and post hooks
      Approach: prove a reindexed dirty worktree reports current content and known matching derivation before closing implementation
      (Req: Current-content and coverage freshness; Code Graph version invalidation)

## 14. Follow-up: complete source ranges

- [x] 14.1 Add half-open source-range fields to SymbolNode
      `packages/code-graph/src/domain/value-objects/symbol-node.ts`: `SymbolNode`, `createSymbolNode` — add `endLine`, `endColumn`, and contained `selectionRange` while preserving the existing id inputs
      Approach: validate non-empty 1-based-line/0-based-column half-open ranges and keep `line`/`column` as the construct start
      (Req: Symbol node)
- [x] 14.2 Export source-range contracts
      `packages/code-graph/src/public.ts` and `packages/code-graph/src/index.ts`: `SourceRange` and enriched SymbolNode types — expose host-facing named types only
      Approach: add strict readonly named exports with JSDoc; do not export parser nodes or backend row shapes
      (Req: Symbol node; Symbol-reference provider surface)
- [x] 14.3 Extract TypeScript and JavaScript construct and selection ranges
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: symbol extraction — retain parser-node end coordinates and declared-name node ranges
      Approach: use parser-authoritative coordinates and omit a declaration when a trustworthy contained selection cannot be produced
      (Req: Complete symbol source ranges)
- [x] 14.4 Extract Python construct and selection ranges
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: symbol extraction — retain parser construct and declared-name ranges
      Approach: apply the common half-open validation and omit invalid third-party results
      (Req: Complete symbol source ranges)
- [x] 14.5 Extract Go construct and selection ranges
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: symbol extraction — retain parser construct and declared-name ranges
      Approach: apply the common half-open validation and omit invalid third-party results
      (Req: Complete symbol source ranges)
- [x] 14.6 Extract PHP construct and selection ranges
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: symbol extraction — retain parser construct and declared-name ranges
      Approach: apply the common half-open validation and omit invalid third-party results
      (Req: Complete symbol source ranges)
- [x] 14.7 Persist symbol ranges in the in-memory and SQLite stores
      `packages/code-graph/test/helpers/in-memory-graph-store.ts` and `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: symbol writes/reads — round-trip complete and selection ranges
      Approach: add schema fields in the incompatible-rebuild version and preserve half-open coordinates without conversion
      (Req: Symbol node; Reference schema upgrade)
- [x] 14.8 Persist symbol ranges in Ladybug when supported
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: symbol writes/reads — match SQLite range behavior
      Approach: implement only while Ladybug remains registered; otherwise close through the specified removed-backend scenario
      (Req: Symbol node; Reference schema upgrade)
- [x] 14.9 Add source-range model and adapter tests
      `packages/code-graph/test/domain/value-objects/symbol-node.spec.ts` and tree-sitter adapter specs — verify containment, full-body extraction, name extraction, invalid omission, and unchanged ids
      Approach: use multi-line declarations whose name does not start at the construct origin in every built-in language
      (Req: Symbol node; Complete symbol source ranges)

## 15. Follow-up: Code Graph-orchestrated unified search

- [x] 15.1 Define unified search request and result value objects
      `packages/code-graph/src/application/use-cases/search-code-graph.ts` and new domain value-object files: `SearchCodeGraphInput`, `SearchCodeGraphResult`, `SourceContentMatch`, and `SourceFileSearchResult` — define the four-category contract
      Approach: keep exact match, construct, selection, and optional snippet ranges distinct and use `full-query | raw-token | expanded-token` provenance
      (Req: Code Graph-orchestrated search surface; Output format)
- [x] 15.2 Add paged source-content candidate operations to GraphStore
      `packages/code-graph/src/domain/ports/graph-store.ts`: `SourceContentCandidateQuery`, `SourceContentCandidatePage`, and `searchSourceContentCandidates` — expose candidates rather than final search semantics
      Approach: include normalized/full/raw/expanded terms, filters, deterministic cursor, and page limit; leave suppression/ranking/grouping to Code Graph
      (Req: Source-content search candidates)
- [x] 15.3 Implement in-memory source candidate paging
      `packages/code-graph/test/helpers/in-memory-graph-store.ts`: `searchSourceContentCandidates` — provide deterministic contract-test behavior
      Approach: filter first, order by canonical path/backend score, return bounded pages, and never precompute cross-category suppression
      (Req: Source-content search candidates)
- [x] 15.4 Add SQLite trigram source-content index
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: schema and bulk-index maintenance — index persisted FileNode content for substring search
      Approach: create FTS5 trigram structures keyed by canonical file path and rebuild them once after the bulk commit
      (Req: Source-content search candidates; Reference schema upgrade)
- [x] 15.5 Implement SQLite source candidate paging
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: `searchSourceContentCandidates` — return bounded filtered candidates for full/raw/expanded terms
      Approach: use trigram lookup for three-or-more characters and path-ordered pages capped at 512 filtered files for one/two-character fallback
      (Req: Source-content search candidates)
- [x] 15.6 Implement Ladybug source candidate parity when supported
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: source index and paged candidates — match SQLite filtering, ordering, fallback, and cursors
      Approach: keep the implementation conditional on continued Ladybug support and rebuild its search index once per committed generation
      (Req: Source-content search candidates; Reference schema upgrade)
- [x] 15.7 Build the shared query plan inside SearchCodeGraph
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: `execute` — reuse `expandSearchQuery` for normalized query, raw terms, and separator/CamelCase expansion
      Approach: accept all selected categories once and preserve ranking precedence full query, all raw terms, individual raw terms, expanded-only
      (Req: Search behaviour; Semantic-first candidate lanes)
- [x] 15.8 Implement semantic symbol candidate tiers
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: semantic lane and comparator — rank logical identities and bindings before generic local/text hits
      Approach: emit stable `matchTier` and `matchReasons`; apply kind/workspace/path filters before merge and group by logical target before limit
      (Req: Semantic-first candidate lanes; Reference-aware symbol results)
- [x] 15.9 Verify precise source occurrences from persisted content
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: source occurrence locator — produce original matched text and half-open range
      Approach: scan only candidate FileNode content, case-fold literal comparisons, and collapse same-range provenance to full-query over raw over expanded
      (Req: Search behaviour; Source-content search candidates)
- [x] 15.10 Suppress only duplicate declaration-name occurrences
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: symbol/file suppression — remove exact file occurrences represented by returned symbols
      Approach: overlap only `selectionRange` for the same query token; never suppress by complete construct range, so calls, strings, comments, and body text remain
      (Req: Search behaviour)
- [x] 15.11 Apply file limits after suppression with candidate paging
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: candidate loop and final grouping — fill the requested file limit without duplicate declaration slots
      Approach: request stable subsequent pages until the post-suppression limit is filled or the backend is exhausted; omit files with no remaining matches
      (Req: Command signature; Search behaviour)
- [x] 15.12 Wire one unified search operation into CodeGraphProvider
      `packages/code-graph/src/composition/code-graph-provider.ts` and `create-code-graph-provider.ts`: `search(input)` — expose the authoritative use case under provider lifecycle checks
      Approach: retain lower-level methods only for compatibility and ensure unified search owns all cross-category semantics
      (Req: Code Graph-orchestrated search surface)
- [x] 15.13 Export unified host-facing search contracts
      `packages/code-graph/src/public.ts` and `packages/code-graph/src/index.ts`: request/result/source-match types — make the curated API usable without backend candidates
      Approach: export public value objects and omit Store candidate helpers and implementation classes
      (Req: Code Graph-orchestrated search surface)
- [x] 15.14 Make the CLI issue exactly one search request
      `packages/cli/src/commands/graph/search.ts`: `registerGraphSearch` — add `--files`, retain `--file` as path filter, and remove category orchestration
      Approach: send categories, filters, limit, and snippet preference once to `provider.search`; default to symbols/files/specs/documents
      (Req: Command signature; Search behaviour)
- [x] 15.15 Render unified file and range results
      `packages/cli/src/commands/graph/search.ts`: text/JSON/TOON serializers — add the files category and precise occurrence metadata
      Approach: render one file block with ordered matches, keep optional snippet range separate, sanitize controls, and preserve category order
      (Req: Output format)
- [x] 15.16 Add shared Store source-search contract tests
      `packages/code-graph/test/domain/ports/graph-store.contract.ts`: source candidate cases — verify substring, multi-word, expanded terms, short fallback, filters, cursors, and bounded pages
      Approach: run the same fixture against in-memory, SQLite, and supported Ladybug stores
      (Req: Source-content search candidates)
- [x] 15.17 Add unified search application tests
      `packages/code-graph/test/application/use-cases/search-code-graph.spec.ts`: semantic/content merge and occurrence cases — verify all Code Graph-owned behavior
      Approach: cover `Change` precedence, multi-word/CamelCase ranking, declaration-only suppression, retained body occurrences, page refill, and no live filesystem access
      (Req: Semantic-first candidate lanes; Search behaviour)
- [x] 15.18 Add unified search provider and CLI tests
      `packages/code-graph/test/composition/code-graph-provider.spec.ts` and `packages/cli/test/commands/graph-search.spec.ts`: lifecycle, delegation, and formats — prove the CLI has no search policy
      Approach: assert one provider call, no lower-level calls, `--files`/`--file` distinction, four defaults, post-suppression limit output, and text/JSON/TOON parity
      (Req: Code Graph-orchestrated search surface; Command signature; Output format)

## 16. Follow-up: file-impact covering specs

- [x] 16.1 Add covering-spec evidence to FileImpactResult
      `packages/code-graph/src/domain/value-objects/impact-result.ts`: `CoveringSpecEvidence`, `CoveringSpecImpact`, and `FileImpactResult.coveringSpecs` — define the structured projection
      Approach: keep one spec with minimum depth and ordered distinct file/symbol evidence
      (Req: File-impact covering specs)
- [x] 16.2 Add batch reverse coverage operations to GraphStore
      `packages/code-graph/src/domain/ports/graph-store.ts`: file and symbol reverse-coverage methods — eliminate N+1 traversal queries
      Approach: deduplicate inputs, return deterministic source/type/target order, and return before backend work for empty batches
      (Req: Reference and coverage persistence; File-impact covering specs)
- [x] 16.3 Implement reverse coverage batches in stores
      In-memory, SQLite, and supported Ladybug GraphStore implementations: reverse `COVERS_FILE` and `COVERS_SYMBOL` queries — provide backend parity
      Approach: use indexed set-based queries and preserve file coverage independently of empty symbol coverage
      (Req: File-impact covering specs; Reference schema upgrade)
- [x] 16.4 Compute single-file covering specs
      `packages/code-graph/src/domain/services/analyze-file-impact.ts`: impact depth map and coverage fold — attach direct and blast-radius evidence
      Approach: assign input file and its defined symbols depth zero, affected resources shallowest traversal depth, then batch both reverse lookups once
      (Req: File-impact covering specs)
- [x] 16.5 Compute multi-file covering specs as one aggregate
      `packages/code-graph/src/domain/services/analyze-files-impact.ts`: aggregate depth and evidence fold — treat every input and its symbols as depth zero
      Approach: deduplicate all affected resources before coverage lookup and sort by minimum depth/spec/evidence without summing duplicate inputs
      (Req: File-impact covering specs)
- [x] 16.6 Render covering specs in graph impact
      `packages/cli/src/commands/graph/impact.ts`: file-impact text/JSON/TOON output — present direct versus blast-radius coverage
      Approach: show mixed-evidence specs once in the direct text group and preserve every evidence item in structured output without CLI queries
      (Req: File-impact covering-spec presentation)
- [x] 16.7 Add traversal and Store query-count tests
      `packages/code-graph/test/domain/services/traversal.spec.ts` and `analyze-files-impact.spec.ts`: direct, blast, multi-file, file-only, dedupe, and batch cases
      Approach: assert deterministic evidence and constant reverse-coverage call counts over large affected sets
      (Req: File-impact covering specs)
- [x] 16.8 Add graph-impact covering-spec output tests
      `packages/cli/test/commands/graph-impact.spec.ts`: text/JSON/TOON projections — verify groups, mixed evidence, file-only coverage, and provider-only derivation
      Approach: fail the test if the CLI calls an independent coverage operation
      (Req: File-impact covering-spec presentation)

## 17. Follow-up: indexed-input freshness and VCS scopes

- [x] 17.1 Define indexed-input observations and freshness states
      `packages/code-graph/src/domain/value-objects/`: `IndexedInputObservation`, `FreshnessState`, `FreshnessMode`, workspace/aggregate results — model file/input staleness separately from resolution
      Approach: use normalized non-absolute locators and generation-tagged readonly evidence
      (Req: Indexed-input freshness persistence; Monotonic workspace and graph freshness)
- [x] 17.2 Add observation and latch operations to GraphStore
      `packages/code-graph/src/domain/ports/graph-store.ts`: batch reads, generation compare-and-set refresh/stale mutations, and workspace/global latches — define monotonic cache semantics
      Approach: allow equal-content metadata refresh, atomically set applicable latches, and clear only from successful indexing
      (Req: Indexed-input freshness persistence)
- [x] 17.3 Persist observations and latches in SQLite
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: schema and freshness methods — store indexed inputs outside semantic nodes
      Approach: use indexed resource/workspace keys, transactionally compare generation, and keep aggregate/workspace latches monotonic
      (Req: Indexed-input freshness persistence; Reference schema upgrade)
- [x] 17.4 Persist freshness state in Ladybug when supported
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: observation/latch parity — match SQLite semantics
      Approach: implement only while supported and cover generation compare-and-set behavior
      (Req: Indexed-input freshness persistence; Reference schema upgrade)
- [x] 17.5 Capture observations during indexing
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: file, document, aggregate-spec, and repository input capture — persist the evidence used to derive each node
      Approach: record content hash plus mtime/size or stable revision and clear stale state only in the committed bulk generation
      (Req: Indexed-input observation capture)
- [x] 17.6 Make VCS ref stable and cwd-independent
      `packages/core/src/infrastructure/{git,hg,svn}/vcs-adapter.ts` and external adapter contract: `ref`, `modifiedFiles` — separate revision identity from working-tree state
      Approach: return no dirty suffix and normalize complete repository-root-relative results regardless of adapter cwd
      (Req: ref returns the current short revision; modifiedFiles lists changed repository files)
- [x] 17.7 Enumerate all VCS worktree states
      Git, Mercurial, SVN, and external VCS adapters: `modifiedFiles` — include staged, unstaged, untracked, deleted, and both rename sides
      Approach: use native status/history mechanisms and reject execution failures rather than returning false-empty results
      (Req: modifiedFiles lists changed repository files)
- [x] 17.8 Rebase implementation-detector candidates to project root
      Core VCS implementation detector: modified-file mapping — translate repository paths for nested configured projects
      Approach: call `rootDir`, remove outside-project paths, normalize separators, preserve deletion/rename sides, deduplicate, and sort without graph filtering
      (Req: Modified-file candidate mapping)
- [x] 17.9 Implement shared graph-visibility filtering
      `packages/code-graph/src/application/services/` visibility service: VCS candidates and filesystem membership — reuse effective index channels
      Approach: apply excludePaths, allowedPaths, gitignore/default exclusions, and explicit code/document/spec inputs before stat/hash; excluded-only changes are irrelevant
      (Req: VCS and filesystem freshness scopes)
- [x] 17.10 Implement targeted indexed-resource freshness
      `packages/code-graph/src/application/use-cases/assess-indexed-resource-freshness.ts`: files/documents/specs batch use case — assess only addressed observations
      Approach: mtime/size fast path, hash on stamp change, equal-hash refresh, different/missing stale CAS, unknown on transient failure
      (Req: Indexed resource freshness assessment)
- [x] 17.11 Implement VCS repository scope assessment
      `packages/code-graph/src/application/use-cases/get-graph-health.ts`: repository grouping and normalized visible diff — share work across workspaces
      Approach: evaluate each repository once, hash sorted visible `{path,state,contentHash}` without absolute paths, retain independent workspace latches, and stop on stale proof
      (Req: VCS and filesystem freshness scopes; Efficient scope assessment)
- [x] 17.12 Implement non-VCS and hybrid scope assessment
      `packages/code-graph/src/application/use-cases/get-graph-health.ts`: filesystem membership/observation comparison — support workspaces without VCS and ignored graph inputs
      Approach: avoid reads for matching stamps, hash only mismatches, refresh equal hashes, and use hybrid mode when respectGitignore is false
      (Req: VCS and filesystem freshness scopes; Efficient scope assessment)
- [x] 17.13 Project aggregate and workspace health
      `packages/code-graph/src/application/use-cases/get-graph-health.ts`: `GetGraphHealthResult` — expose ordered scope state and stable reasons
      Approach: short-circuit a true aggregate latch, apply stale-over-unknown-over-current precedence, persist no unknown state, and expose no absolute roots
      (Req: Aggregate and workspace health projection; Monotonic workspace and graph freshness)
- [x] 17.14 Gate resolver absence with targeted file freshness
      `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts`: freshness gate — distinguish missing symbol from stale input
      Approach: reuse file observation state; return `missing` only for current complete coverage and `unresolved` for stale/unknown/partial evidence
      (Req: Resolution outcomes; Freshness and coverage gate)
- [x] 17.15 Render workspace health without rescanning in CLI
      `packages/cli/src/commands/graph/stats.ts` and warning helpers: aggregate/workspace diagnostics — project Code Graph results only
      Approach: text shows aggregate plus non-current workspaces; JSON/TOON retain all workspaces, modes, latches, and reasons
      (Req: Content freshness and coverage diagnostics; Aggregate and workspace health projection)
- [x] 17.16 Add Core VCS and detector regressions
      Core VCS adapter and implementation-detector test suites — verify stable ref, cwd independence, every state, rename sides, failures, rebase, and outside omission
      Approach: use nested repositories/projects and native adapter fixtures for Git/Hg/SVN plus external-provider contract cases
      (Req: ref returns the current short revision; modifiedFiles lists changed repository files; Modified-file candidate mapping)
- [x] 17.17 Add Store freshness contract tests
      `packages/code-graph/test/domain/ports/graph-store.contract.ts`: observations, CAS, stale monotonicity, latch clear, and generation races — verify backend parity
      Approach: run shared cases against in-memory, SQLite, and supported Ladybug stores
      (Req: Indexed-input freshness persistence)
- [x] 17.18 Add health scope and targeted freshness tests
      `packages/code-graph/test/application/use-cases/get-graph-health.spec.ts` and new targeted-use-case tests — verify every VCS/filesystem/hybrid path
      Approach: cover aggregate short circuit, shared repo, excluded-only/mixed diffs, deletion/rename, mtime fast path, equal hash refresh, unknown retry, and no all-symbol walk
      (Req: all freshness and health requirements)
- [x] 17.19 Correct missing versus stale review projections and tests
      Resolver, SDK review, CLI implementation/status source and tests — align status vocabulary with file/input staleness
      Approach: use `resolved | ambiguous | unresolved | missing`; retain stale only in health/input fields and preserve stored links
      (Req: Resolution outcomes; Stable review projection)

## 18. Follow-up: single-session bulk indexing

- [x] 18.1 Define the IndexWriteSession port
      `packages/code-graph/src/domain/ports/graph-store.ts`: `beginBulkIndexSession` and chunk writers — replace multi-phase persistence with one atomic boundary
      Approach: provide bounded writers for all node/fact/observation/relation families plus commit/rollback and batch validation
      (Req: Single-session bulk indexing)
- [x] 18.2 Implement SQLite bulk write session
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: transaction-backed `IndexWriteSession` — commit one generation
      Approach: prepare statements once, accept bounded chunks, deduplicate relations, rebuild all search indexes once after commit, and expose no partial data
      (Req: Single-session bulk indexing; Reference schema upgrade)
- [x] 18.3 Implement Ladybug bulk write session when supported
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: equivalent bulk session — preserve backend parity
      Approach: use native bulk operations and one search-index rebuild; rollback or discard the generation on failure
      (Req: Single-session bulk indexing; Reference schema upgrade)
- [x] 18.4 Route index-code-graph through one session
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: complete indexing flow — write files, docs, specs, symbols, facts, observations, and relations in one session
      Approach: prebuild lookup maps once, issue batch endpoint/hierarchy checks, chunk writes, commit once, and clear latches only after success
      (Req: Bounded incremental relation construction; Single-session bulk indexing)
- [x] 18.5 Add bulk atomicity and query-shape tests
      GraphStore contract and index integration tests — prove one commit, one FTS rebuild, rollback, deduplication, and no per-relation validation
      Approach: instrument Store calls and transactions over high-cardinality fixtures and assert bounded counts
      (Req: Single-session bulk indexing; Bounded incremental relation construction)
- [x] 18.6 Benchmark relation construction and repository reindex
      Code Graph performance fixture and real repository `graph index`: relation phase and total timing — guard usability
      Approach: compare against the pre-follow-up baseline and fail regressions that restore declaration/global scans or repeated FTS rebuilds
      (Req: Bounded incremental relation construction)

## 19. Follow-up: compatibility and documentation

- [x] 19.1 Bump backend and derivation versions once
      SQLite/Ladybug schema constants and `packages/code-graph/package.json`: incompatible source-range/search/freshness schema — force safe re-extraction
      Approach: choose the actual next versions at implementation time, keep schema-std unchanged, and route old stores through explicit index repair
      (Req: Reference schema upgrade; Code Graph version invalidation)
- [x] 19.2 Update the logical-symbol ADR
      `docs/adr/0024-logical-symbol-resolution.md`: unified search, file staleness, VCS visibility, covering specs, and bulk indexing decisions — make the final architecture durable
      Approach: record rejected CLI orchestration, all-file health scans, whole-body suppression, and per-relation Store calls
      (Req: Code Graph-orchestrated search surface; Monotonic workspace and graph freshness)
- [x] 19.3 Update CLI documentation
      `docs/cli/cli-reference.md`: `--files`, `--file`, source matches/ranges, impact coverage groups, health modes, and missing status — document observable behavior
      Approach: include text/JSON/TOON examples and explicit excluded-only/non-VCS recovery behavior
      (Req: Output format; File-impact covering-spec presentation; Content freshness and coverage diagnostics)
- [x] 19.4 Update Code Graph and SDK documentation
      `docs/code-graph/index.md` and `docs/sdk/index.md`: unified search ownership, public contracts, freshness scopes, targeted assessment, and review projection — document package boundaries
      Approach: state that Code Graph orchestrates search and freshness, SDK composes review, and CLI only renders
      (Req: Code Graph-orchestrated search surface; Shared host behavior)
- [x] 19.5 Complete JSDoc and barrel/type coverage
      All added/modified public and internal TypeScript symbols plus barrel tests — satisfy repository documentation and ESM conventions
      Approach: document parameters/returns/throws, use named exports and strict readonly types, and keep backend candidate helpers internal
      (Req: Symbol-reference provider surface; Code Graph-orchestrated search surface)

## 20. Follow-up: integrated completion

- [x] 20.1 Run affected build, typecheck, lint, unit, contract, and integration suites
      Core, Code Graph, SDK, and CLI workspaces — validate all changed boundaries
      Approach: run package-scoped suites first, then the repository verification commands and resolve every failure
      (Req: all change requirements)
- [x] 20.2 Verify unified search end to end
      Real indexed repository `graph search`: semantic `Change`, multi-word files, CamelCase, snippets, and path filters — verify Code Graph-owned results
      Approach: inspect text/JSON/TOON, duplicate declaration suppression, retained calls/strings/comments, and post-suppression limits
      (Req: Semantic-first candidate lanes; Search behaviour; Output format)
- [x] 20.3 Verify covering specs end to end
      Real `graph impact --file` and multi-file impact fixture — confirm direct and blast-radius evidence
      Approach: include a file-only `COVERS_FILE` case with zero `COVERS_SYMBOL` relations and compare structured evidence
      (Req: File-impact covering specs; File-impact covering-spec presentation)
- [x] 20.4 Verify VCS and non-VCS freshness end to end
      Git workspace, nested project, non-VCS fixture, and hybrid ignored-input fixture — confirm latch and observation behavior
      Approach: test excluded-only, mixed, deletion/rename, mtime-equal hash, transient failure retry, and aggregate short circuit
      (Req: VCS and filesystem freshness scopes; Efficient scope assessment)
- [x] 20.5 Verify missing symbol status after freshness transitions
      Implementation list/review/status fixture before edit, after dirty edit, and after reindex — prove status vocabulary
      Approach: expect unresolved while file evidence is stale/unknown and missing only after current complete absence; ensure all three CLI views match
      (Req: Resolution outcomes; Stable review projection)
- [x] 20.6 Verify one bulk session and usable reindex timing
      Instrumented integration fixture and real forced repository reindex — confirm transaction and performance contracts
      Approach: assert one commit, one semantic/source FTS rebuild, bounded Store calls, and record phase/total timings
      (Req: Single-session bulk indexing; Bounded incremental relation construction)
- [x] 20.7 Run specd verification and compliance for the completed change
      `implementation-review-symbol-resolution`: verify scenarios, implementation tracking, hooks, and compliance — close every task and finding
      Approach: execute the lifecycle verification only after all implementation and E2E tasks pass
      (Req: all change requirements)
- [x] 20.8 Discard absorbed obsolete changes after successful verification
      `graph-staleness-dirty-fingerprint` and `file-impact-covering-specs`: active change records — remove only after this change fully implements and verifies their accepted scope
      Approach: use the specd discard lifecycle commands after confirming no unique artifact or requirement remains
      (Req: all absorbed freshness and file-impact requirements)

## 21. Compliance remediation

- [x] 21.1 Gate every contributing declaration file through one freshness batch
      `ResolveSymbolReference` and focused tests — prevent resolved/ambiguous outcomes from stale candidate evidence
      Approach: prepare candidates first, deduplicate declaration resources, assess once, and downgrade affected outcomes to unresolved
      (Req: Freshness and coverage gate; Batch resolution)
- [x] 21.2 Make adapter capabilities truthful and verify unsupported policy
      Built-in adapter capability declarations and tests — advertise only context actually consumed
      Approach: disable unsupported TypeScript/Go build context and assert advanced unimplemented package/build semantics are never guessed
      (Req: Resolver capability declaration; language reference coverage)
- [x] 21.3 Persist and aggregate coverage health
      GraphStore backends, in-memory contract, and `GetGraphHealth` — replace the last-index timestamp shortcut
      Approach: add deterministic coverage summaries and project excluded/unsupported/parse-failed/partial counts and reasons
      (Req: Content freshness and coverage result; Index coverage facts)
- [x] 21.4 Compose aggregate health across every canonical dimension
      `GetGraphHealth` and CLI tests — forbid current state with stale derivation/VCS/schema/coverage reasons
      Approach: apply stale-over-unknown-over-current precedence over content, VCS, derivation, schema/generation, coverage, and latches
      (Req: Aggregate and workspace health projection; Current-content and coverage freshness)
- [x] 21.5 Fingerprint deterministic package-resolution inputs
      fingerprint helpers, index/health callers, and tests — invalidate on project/package/autoload configuration changes
      Approach: hash normalized workspace-relative manifest/config contents without persisting absolute roots
      (Req: Canonical module and package resolution identity; Code Graph version invalidation)
- [x] 21.6 Expose deterministic incremental phase metrics
      index result/progress contracts and indexer tests — demonstrate bounded reconstruction and named phase counts/timings
      Approach: retain content-hash accounting and indexed-map reconstruction while publishing stable metrics for every semantic and persistence phase
      (Req: Bounded incremental relation construction)
- [x] 21.7 Preflight multi-file implementation mutations
      CLI implementation command and tests — guarantee zero partial resolve/unresolve/ignore mutation
      Approach: validate the complete input set through the host before invoking the first mutation
      (Req: Resolve subcommand; Unresolve subcommand; Ignore subcommand)
- [x] 21.8 Add resolver backend parity and failure-path regressions
      SQLite/Ladybug resolver fixtures plus health/fingerprint/preflight focused suites — cover every compliance finding
      Approach: compare complete ordered outcomes and assert transient failures never create false freshness
      (Req: all remediation requirements)
- [x] 21.9 Gate build-context resolution by persisted adapter coverage
      `ResolveSymbolReference` and focused tests — refuse resolved or ambiguous outcomes when a request requires build context that candidate declarations did not index
      Approach: inspect every contributing declaration coverage capability before selection and return the stable unsupported diagnostic
      (Req: Freshness and coverage gate; Resolver capability declaration)
- [x] 21.10 Make ordinary semantic refresh genuinely incremental
      `IndexCodeGraph`, `GraphStore` backends, compact reference-fact hydration, and integration tests — process only new/changed files and their affected closure
      Approach: retain unaffected graph state, hydrate unchanged semantic facts, close importer/relation/hierarchy/public routes transitively, and compare incremental output with a full rebuild
      (Req: Incremental indexing; Bounded incremental relation construction)
- [x] 21.11 Correct direct index result and phase accounting
      `IndexResult`, bulk sessions, SDK projection, and tests — expose `fullRebuild` at the source and separate persistence from search-index time
      Approach: derive rebuild truth in Code Graph and use the backend search-step boundary so no-op search timing is exactly zero
      (Req: Index result; Bounded incremental relation construction)
- [x] 21.12 Reuse the shared SDK provider lifecycle for indexing
      `withOpenGraphProvider` and `runIndexProjectGraph` — remove duplicated transient open/close orchestration while preserving indexing repair diagnostics
      Approach: parameterize the shared helper's open operation and capture `openForIndexing` result through the shared lifecycle
      (Req: SDK With Open Graph Provider; SDK Run Index Project Graph)
- [x] 21.13 Run CLI indexing under a parent-owned worker lock
      graph-index host command, internal lock surface, and CLI tests — acquire the shared lock in the parent, spawn one worker, forward termination signals, and propagate exit status
      Approach: mark the child with `SPECD_GRAPH_INDEX_WORKER` and `SPECD_GRAPH_INDEX_LOCK_HELD`; retain `SPECD_GRAPH_INDEX_NO_WORKER` as the deterministic in-process/test bypass
      (Req: CLI Graph Index)
- [x] 21.14 Prove no-op generations perform zero semantic replacement writes
      index integration regression — instrument the Store compatibility writer in addition to comparing final facts
      Approach: assert neither `writeReferenceFacts` nor `replaceReferenceFacts` executes for a byte-equivalent generation
      (Req: Bounded incremental relation construction)
- [x] 21.15 Rerun full matrix and compliance until clean
      Core, Code Graph, SDK, CLI and specd lifecycle reports — require zero high/medium discrepancies
      Approach: run focused tests, package lint/typecheck/build/tests, E2Es, hooks, and a fresh compliance audit
      (Req: all change requirements)

## 22. Follow-up review: structured search and selector usability

- [x] 22.1 Record the reviewed behavior in lifecycle artifacts
      Change proposal, specs, verify, and design — capture exact ranking, bounded ambiguity, actionable text, file caps, path normalization, and backend parity
      Approach: preserve completed task history, add explicit SQLite/Ladybug schema-version requirements, and leave no open implementation decision
      (Req: all follow-up requirements)
- [x] 22.2 Extend unified search result contracts
      `packages/code-graph/src/application/use-cases/search-code-graph.ts` and result value objects: `ReferenceAwareSymbolResult`, `SourceFileSearchResult` — add matched bindings and occurrence counts
      Approach: retain all bindings for structured discovery, add directly matched bindings, `totalMatches`, and `omittedMatches` with deterministic readonly shapes
      (Req: Reference-aware symbol results; Search behaviour; Output format)
- [x] 22.3 Enforce exact-first semantic search ranking
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: candidate tiering and comparison — make case-exact names precede normalized/prefix/component/text hits
      Approach: compute semantic tiers from structured name, owner, space, member-form, and binding fields; keep backend scores inside one tier
      (Req: Semantic-first candidate lanes)
- [x] 22.4 Identify directly matched public exports
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: logical grouping — retain the public binding(s) whose surface/exported name matched the query
      Approach: derive match provenance during semantic candidate classification rather than reconstructing it in the CLI
      (Req: Reference-aware symbol results)
- [x] 22.5 Normalize exact search file selectors in Code Graph
      `packages/code-graph/src/composition/code-graph-provider.ts` and file-selector service: unified `search` input — resolve canonical, config-relative, and absolute exact paths
      Approach: reuse impact file identity resolution; preserve wildcard patterns and pass the normalized filter into semantic and source lanes
      (Req: Code Graph-orchestrated search surface; Canonical module and package resolution identity)
- [x] 22.6 Cap general content occurrences per file
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: source occurrence projection — limit general/wildcard results to ten matches per file
      Approach: suppress symbol overlaps first, compute the visible total, retain the first ten, and derive `omittedMatches`; exact single-file selectors retain all
      (Req: Search behaviour; Output format)
- [x] 22.7 Prevent final symbol slicing from creating duplicate file hits
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: suppression input — use all semantically returned candidates before the display limit
      Approach: separate suppression candidates from visible symbol groups so omitted symbols still suppress their declaration occurrence
      (Req: Search behaviour)
- [x] 22.8 Return explicit selector resolution outcomes
      `packages/code-graph/src/application/services/resolve-graph-selector.ts`: `resolveGraphSelector` — return resolved, ambiguous, or missing
      Approach: preserve qualified/full exact forms; for bare names query case-exact first and case-insensitive exact only when empty, sort and cap ambiguity at ten
      (Req: Resolved canonical and public-binding impact; Symbol-reference provider surface)
- [x] 22.9 Stop impact traversal on selector ambiguity
      Code Graph provider/traversal and `packages/cli/src/commands/graph/impact.ts`: symbol impact flow — render candidates instead of analyzing all matches
      Approach: Code Graph owns candidate precedence and bounded result; CLI renders the outcome and never widens or selects it
      (Req: Command signature; Resolved canonical and public-binding impact)
- [x] 22.10 Move SQLite semantic lookup to structured indexes
      `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`: schema, indexes, `findSymbols`, semantic search and binding queries — remove canonical-id parsing/ranking
      Approach: query workspace, surface, name, space, owner, member form, and exported name columns; retain canonical ids as unique external values
      (Req: Reference and coverage persistence; Reference schema upgrade)
- [x] 22.11 Move Ladybug semantic lookup to structured indexes
      `packages/code-graph/src/infrastructure/ladybug/ladybug-graph-store.ts`: schema indexes and equivalent queries — match SQLite without canonical-id parsing/ranking
      Approach: store/index the same structured properties and preserve deterministic ordering, case precedence, and result shapes
      (Req: Reference and coverage persistence; Reference schema upgrade)
- [x] 22.12 Increment both backend schema versions once
      SQLite and Ladybug schema constants plus incompatible-store fixtures — invalidate the previous physical layouts
      Approach: increment SQLite `5 -> 6` and Ladybug `10 -> 11` unless the implementation-start constants already advanced; reject old normal reads and repair by generation-rotating full rebuild
      (Req: Reference schema upgrade; Incompatible store handling)
- [x] 22.13 Render actionable graph-search text
      `packages/cli/src/commands/graph/search.ts`: symbol and source-file text output — omit canonical ids and noisy binding lists
      Approach: print declaration locations; for direct export matches print config-relative `matched export` then declaration; append per-file omission summaries
      (Req: Output format)
- [x] 22.14 Add unified search application regressions
      `packages/code-graph/test/application/use-cases/search-code-graph.spec.ts`: ranking, provenance, suppression, cap, counts, and exact-file cases
      Approach: cover `Change`, `ValidateArtifact`/`ValidateArtifacts`, barrel exports, more than ten occurrences, wildcard cap, exhaustive exact file, and hidden-symbol suppression
      (Req: Reference-aware symbol results; Semantic-first candidate lanes; Search behaviour)
- [x] 22.15 Add selector and traversal regressions
      `packages/code-graph/test/application/services/resolve-graph-selector.spec.ts` and traversal/provider tests — verify exact precedence and bounded ambiguity
      Approach: assert unique `Change` beats lowercase locals, duplicate exact names return ten candidates plus total, and prefixes never become impact targets
      (Req: Resolved canonical and public-binding impact; Symbol-reference provider surface)
- [x] 22.16 Add SQLite and Ladybug parity regressions
      Shared GraphStore contract and backend integration suites — verify structured lookup and schema upgrade behavior
      Approach: compare exact/case fallback, binding provenance, path-filtered source counts, old-version rejection, generation rotation, and rebuilt indexes on both backends
      (Req: Reference and coverage persistence; Reference schema upgrade)
- [x] 22.17 Add CLI graph search and impact regressions
      `packages/cli/test/commands/graph-search.spec.ts` and `graph-impact.spec.ts`: text/JSON/TOON and selector outcomes — lock delivery behavior
      Approach: assert no canonical text, project-relative matched export, omission summaries, exact-file completeness, `Change` selection, bounded ambiguity, and prefix rejection
      (Req: Command signature; Output format; Public export impact analysis)
- [x] 22.18 Update CLI and Code Graph documentation
      `docs/cli/cli-reference.md`, `docs/code-graph/index.md`, and ADR 0024 — document the final search/impact/storage behavior
      Approach: include exact versus partial tiers, matched-export/declaration text, file caps/counts/path forms, structured canonical identity, and SQLite/Ladybug parity/version rebuild
      (Req: all follow-up observable requirements)
- [x] 22.19 Run focused and package verification without lifecycle transition
      Core, Code Graph, SDK, and CLI suites — establish implementation readiness while the change remains implementing
      Approach: run focused tests, typecheck, lint, build, backend contracts, real CLI search/impact probes, and implementation hooks; stop before entering verifying
      (Req: all follow-up requirements)

## 23. Follow-up review: resolution and structured projection regressions

- [x] 23.1 Preserve targeted freshness in batched provider resolution
      `packages/code-graph/src/composition/code-graph-provider.ts`: `resolveSymbolReferences` — inject the same exact-resource assessor used by single resolution when aggregate health is supplied
      Approach: pass `resources => this.assessExactResources(resources)` to every `ResolveSymbolReference` construction; keep the caller health snapshot only as the aggregate-health source
      (Req: Freshness and coverage gate; Batch and backend-independent resolution)
- [x] 23.2 Add supplied-health batch freshness regression
      `packages/code-graph/test/composition/code-graph-provider.spec.ts`: batch resolver tests — prove stale declaration evidence cannot resolve through the supplied-health branch
      Approach: supply current aggregate health, make targeted assessment stale for a candidate file, execute a batch, and assert unresolved plus one targeted assessment
      (Req: Freshness and coverage gate, scenario: Supplied batch health still assesses exact resources)
- [x] 23.3 Restrict exact-logical-identity classification to canonical ids
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: `classifySymbolMatch` — remove simple-name equality from the canonical-identity tier
      Approach: assign `exact-logical-identity` only for `logicalTarget.id === raw`; allow binding and declaration tiers to classify ordinary names
      (Req: Semantic-first candidate lanes)
- [x] 23.4 Add logical-name versus canonical-id ranking regression
      `packages/code-graph/test/application/use-cases/search-code-graph.spec.ts`: semantic tier tests — distinguish ordinary `run` from the target's canonical identity
      Approach: index a target named `run` with an exact public binding, search `run`, and assert exact-public-binding rather than exact-logical-identity; separately assert canonical id receives the identity tier
      (Req: Semantic-first candidate lanes, scenario: Logical-name equality is not canonical-identity equality)
- [x] 23.5 Expose exact public-binding retrieval through the provider
      `packages/code-graph/src/composition/code-graph-provider.ts` and public contract barrels: `getExactPublicBinding` — return one exact binding plus target declarations without ranked search
      Approach: reuse `GraphStore.findPublicBindings` with the complete surface/name/space/target key and the existing batched declaration lookup; return null for absence and export only the host-facing selector/result types
      (Req: Symbol-reference provider surface)
- [x] 23.6 Add exact public-binding provider regression
      `packages/code-graph/test/composition/code-graph-provider.spec.ts`: exact binding lookup tests — prove lookup is uncapped and search-independent
      Approach: arrange more than one page of same-name bindings, request a later target by complete key, assert exact binding/declarations and that no search method is invoked
      (Req: Symbol-reference provider surface, scenario: Exact public binding lookup bypasses search pagination)
- [x] 23.7 Use exact binding retrieval for export impact
      `packages/cli/src/commands/graph/impact.ts`: export selector flow — remove capped `searchReferenceSymbols` recovery after conservative target resolution
      Approach: call `getExactPublicBinding` with surface, export, resolved target space/id; combine its binding/declarations with the resolver target/path for `analyzePublicBindingImpact`
      (Req: Public export impact analysis)
- [x] 23.8 Add common-export impact regression
      `packages/cli/test/commands/graph-impact.spec.ts`: export-impact tests — ensure a selected target beyond twenty same-name exports still produces routes
      Approach: mock conservative resolution and exact binding retrieval for a target outside the legacy page; assert impact succeeds and `searchReferenceSymbols` is not called
      (Req: Public export impact analysis, scenario: Common export name cannot hide the selected binding)
- [x] 23.9 Preserve matched bindings in structured graph-search output
      `packages/cli/src/commands/graph/search.ts`: JSON/TOON symbol mapper — include `matchedPublicBindings` beside `publicBindings`
      Approach: project the provider field directly without recomputation or filtering
      (Req: Output format)
- [x] 23.10 Add structured matched-binding regressions
      `packages/cli/test/commands/graph-search.spec.ts`: JSON and TOON projections — retain the public route that caused an alias match
      Approach: render one group with distinct all/matched binding arrays and assert both serialized formats preserve `matchedPublicBindings`
      (Req: Output format, scenario: Structured symbol output retains matched bindings)
- [x] 23.11 Preserve source truncation counts in structured graph-search output
      `packages/cli/src/commands/graph/search.ts`: JSON/TOON file mapper — include `totalMatches` and `omittedMatches` beside retained `matches`
      Approach: project provider-owned counts directly so structured consumers can detect truncation
      (Req: Output format)
- [x] 23.12 Add structured source-count regressions
      `packages/cli/test/commands/graph-search.spec.ts`: JSON and TOON projections — retain visible total and omitted count for a capped file
      Approach: render a file with more than ten visible occurrences and assert both formats include `totalMatches`, retained `matches`, and `omittedMatches`
      (Req: Output format, scenario: Structured file output retains truncation counts)
- [x] 23.13 Document exact public-binding provider lookup
      `docs/code-graph/index.md`: provider query surface — explain exact binding selection for impact and its separation from ranked discovery search
      Approach: document the complete selector key and the absence of pagination/ranking without exposing backend internals
      (Req: Symbol-reference provider surface; Public export impact analysis)
- [x] 23.14 Run focused and package checks without entering verify
      Code Graph and CLI test/typecheck/lint/build suites plus implementing post-hooks — confirm every review regression passes
      Approach: run the focused new tests first, then affected package suites and hooks; keep lifecycle state at implementing
      (Req: all review follow-up requirements)

## 24. Follow-up review: relevance-ranked per-file occurrences

- [x] 24.1 Rank capped source occurrences before truncation
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: source-file occurrence projection and comparator — prevent later complete-query evidence from being displaced by earlier expanded tokens
      Approach: for general and wildcard searches sort visible matches by `full-query`, `raw-token`, and `expanded-token`, then source range; compute counts from the full visible set and slice only after sorting
      (Req: Search behaviour; Output format)
- [x] 24.2 Preserve exhaustive source order for exact-file search
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: exact-file occurrence projection — keep inspection output exhaustive and navigable
      Approach: use the shared source-range comparator without match-kind weighting when `exactFile` is true; do not cap the result
      (Req: Search behaviour; Output format)
- [x] 24.3 Add per-file ordering regressions
      `packages/code-graph/test/application/use-cases/search-code-graph.spec.ts`: source occurrence cap tests — reproduce the `SpecRepository` shape with more than ten early expanded matches and a later full-query match
      Approach: assert general/wildcard results retain and lead with the later full-query match, preserve source order inside tiers and accurate counts, while exact-file results return every match in source order
      (Req: Search behaviour, scenarios: General matches are ranked before the per-file cap; Exact single-file matches remain exhaustive source inspection)
- [x] 24.4 Document source-occurrence ordering
      `docs/code-graph/index.md`: unified source-content search — distinguish relevance-ranked capped discovery from exhaustive source-ordered exact-file inspection
      Approach: document `full-query > raw-token > expanded-token`, source-range tie-breaking, cap-after-ranking, and pre-cap total/omitted counts
      (Req: Search behaviour; Output format)
- [x] 24.5 Run focused and package checks without entering verify
      Code Graph tests, typecheck, lint, build, implementation tracking, and implementing post-hooks — confirm the follow-up is complete
      Approach: run the focused regression first, then affected package and repository checks required by hooks; keep lifecycle state at implementing
      (Req: all occurrence-ordering follow-up requirements)

## 25. Follow-up review: competing routes, inherited members, and visible search tiers

- [x] 25.1 Make public binding identities target-aware
      `packages/code-graph/src/domain/value-objects/symbol-reference.ts`: `createPublicBinding` — keep public-slot lookup separate while preventing competing resolved routes from sharing one persisted ID
      Approach: append the proven target identity, or one stable unresolved marker, to the length-prefixed binding ID; retain surface/exported-name/space as the Store lookup tuple
      (Req: First-class binding model; Public and local binding identity)
- [x] 25.2 Preserve competing routes during re-export linking
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: `replaceUnresolvedRoute` and re-export pass — remove only unresolved placeholders and retain every resolved target in one export slot
      Approach: index target-aware binding IDs in the per-surface/per-route maps; never delete or overwrite a resolved sibling route while replacing an unresolved placeholder
      (Req: First-class binding model; Public and local binding identity)
- [x] 25.3 Add competing barrel-route regression
      `packages/code-graph/test/application/use-cases/symbol-index.spec.ts`: TypeScript re-export integration — prove the same barrel/name/space can expose two targets
      Approach: index two source modules plus one competing barrel, assert both public bindings survive, and resolve the slot as `ambiguous` without last-write selection
      (Req: Public and local binding identity, scenario: Competing routes in one export slot are ambiguous)
- [x] 25.4 Load requested members beneath reached ancestor owners
      `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts`: batch preparation and hierarchy candidate selection — query the requested name under ancestor owner IDs rather than treating reached owners as members
      Approach: build bounded breadth-first owner paths, issue one deduplicated `findLogicalSymbols` batch for ancestor/name/space/form lookups, and retain only the nearest depth that yields candidates
      (Req: Hierarchy-aware members)
- [x] 25.5 Add real inherited-member and precedence regressions
      `packages/code-graph/test/application/use-cases/resolve-symbol-reference.spec.ts`: hierarchy cases — replace artificial owner-to-member evidence with owner-to-parent facts
      Approach: assert ancestor declaration resolution, nearest-ancestor precedence, equal-depth ambiguity, preserved hierarchy path, and cycle termination
      (Req: Hierarchy-aware members, scenarios: Ancestor owner contributes its requested member; Competing inherited members are ambiguous)
- [x] 25.6 Restrict source suppression to visible symbol groups
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: `execute` — pass the post-limit `symbols` projection into file occurrence suppression
      Approach: slice ordered semantic groups first; only those surviving groups may suppress overlapping declared-name occurrences
      (Req: Search behaviour)
- [x] 25.7 Reverse the hidden-symbol suppression regression
      `packages/code-graph/test/application/use-cases/search-code-graph.spec.ts`: symbol/file limit case — retain the file occurrence for a declaration whose symbol group was omitted
      Approach: arrange more groups than the symbol limit and assert only visible groups suppress, while the omitted declaration remains in `files`
      (Req: Search behaviour, scenario: Symbol omitted by the limit does not suppress its file occurrence)
- [x] 25.8 Make exact-local-symbol classification reachable
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: `classifySymbolMatch` — reserve declaration tiers for groups with a proven logical target
      Approach: classify a case-exact targetless hit as `exact-local-symbol`, keep normalized-only targetless hits textual, and preserve logical-component precedence
      (Req: Semantic-first candidate lanes)
- [x] 25.9 Add exact-local tier ordering regression
      `packages/code-graph/test/application/use-cases/search-code-graph.spec.ts`: semantic tier cases — distinguish targetless locals from logical declarations/components
      Approach: assert the local receives `exact-local-symbol`, the logical component remains above it, and neither branch is mislabeled as a declaration
      (Req: Semantic-first candidate lanes, scenario: Exact local tier remains reachable after logical components)
- [x] 25.10 Update Code Graph documentation for route, hierarchy, and suppression semantics
      `docs/code-graph/index.md`: public bindings, resolver hierarchy, and unified search — document the corrected observable behavior
      Approach: distinguish export slots from target-aware route IDs, describe ancestor-member lookup, and state that only visible symbol groups suppress file occurrences
      (Req: Public and local binding identity; Hierarchy-aware members; Search behaviour)
- [x] 25.11 Refresh implementation links and resolve touched files
      implementation tracking manifest — associate modified symbols/files with `code-graph:symbol-model`, `code-graph:resolve-symbol-reference`, and `cli:graph-search`
      Approach: add or merge symbol-level links, review stale diagnostics, then resolve every touched file after tests pass
      (Req: implementation traceability)
- [x] 25.12 Run focused and package checks without entering verify
      Code Graph tests, typecheck, lint, build, implementation review, and implementing post-hooks — confirm every review regression passes
      Approach: run the three focused suites first, then affected package checks and lifecycle hooks; keep lifecycle state at implementing
      (Req: all review follow-up requirements)

## 26. Follow-up review: complete language facts, direct search, and trustworthy absence

- [x] 26.1 Add shared two-pass reference-fact helpers
      `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts`: `buildLogicalDeclarationFacts`, `buildHierarchyReferenceFacts` — centralize logical owner mapping and hierarchy provenance
      Approach: create owner logical identities before members, translate syntax-resolved symbol IDs to logical IDs, preserve precedence, deduplicate exact edges, and sort facts/steps deterministically
      (Req: Logical declaring-owner facts; Hierarchy evidence consistency)
- [x] 26.2 Add shared helper regression tests
      `packages/code-graph/test/infrastructure/tree-sitter/reference-fact-helpers.spec.ts`: two-pass and hierarchy cases — lock shared semantics independently from parsers
      Approach: cover same-name members under different owners, missing owner gaps, hierarchy precedence/deduplication, matching resolution steps, and cycles
      (Req: Logical declaring-owner facts; Hierarchy evidence consistency)
- [x] 26.3 Derive TypeScript logical owners from syntax
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: analysis descriptors and `buildReferenceFacts` — stop using `SymbolNode.parentId`
      Approach: retain nearest class/interface/enum/namespace/object owner symbol IDs plus proven static/instance/constructor/accessor form and pass them through the shared two-pass helper
      (Req: TypeScript logical identity and declaring owners)
- [x] 26.4 Emit TypeScript hierarchy facts and provenance
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: hierarchy parser state, reference facts and relations — make capability output truthful
      Approach: derive local/imported `extends` and `implements` descriptors once, reuse them for relations and logical hierarchy/steps, and retain unsupported build-dependent choices
      (Req: TypeScript hierarchy and provenance evidence; Capability truthfulness and failure behavior)
- [x] 26.5 Add TypeScript owner and hierarchy regressions
      `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`: logical fact cases — verify complete TypeScript adapter contract additions
      Approach: cover same-name cross-owner methods, static/instance forms, non-syntax owner IDs, non-empty hierarchy/steps, relation consistency, imported bases and unsupported build context
      (Req: Logical identity and declaring owners; TypeScript hierarchy and provenance evidence)
- [x] 26.6 Derive Python logical owners from syntax
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: declaration descriptors and `buildReferenceFacts` — preserve class/nested ownership and recognized method forms
      Approach: map class nesting and deterministic decorators to logical owners/forms through the shared helper; never promote raw parent IDs
      (Req: Python logical identity and declaring owners)
- [x] 26.7 Emit Python hierarchy facts and provenance
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: base descriptors, reference facts and relations — preserve declared base order without guessing complete MRO
      Approach: reuse resolved local/imported base descriptors for `EXTENDS`/protocol `IMPLEMENTS`, override evidence and logical steps; leave metaclass/C3-dependent selection inconclusive
      (Req: Python hierarchy and provenance evidence; Capability truthfulness and failure behavior)
- [x] 26.8 Add Python owner and hierarchy regressions
      `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts`: logical fact cases — verify complete Python adapter contract additions
      Approach: cover same-name class methods, decorator forms, ordered multiple bases, protocol evidence, non-empty steps, relation consistency and unsupported MRO
      (Req: Python logical identity and declaring owners; Python hierarchy and provenance evidence)
- [x] 26.9 Derive Go logical owners from receiver and interface syntax
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: declaration descriptors and `buildReferenceFacts` — owner-qualify receiver/interface methods
      Approach: normalize receiver type identity while retaining pointer/value evidence, map interface members to interface owners, and construct logical members with the shared helper
      (Req: Go logical identity and declaring owners)
- [x] 26.10 Emit Go embedding and method-set provenance
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: type parser state, hierarchy facts and relations — make `hierarchy: true` evidence-backed
      Approach: reuse embedded-interface/type and proven complete method-set descriptors for owner steps and `EXTENDS`/`IMPLEMENTS`; keep equal-depth/build/generic uncertainty unresolved
      (Req: Go embedding and hierarchy provenance; Proven interface satisfaction)
- [x] 26.11 Add Go owner and hierarchy regressions
      `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts`: receiver, embedding and method-set cases — verify complete Go adapter additions
      Approach: cover same-name receiver methods, pointer/value evidence, promoted owner paths, complete versus incomplete interface sets, non-empty steps and relation consistency
      (Req: Go logical identity and declaring owners; Go embedding and hierarchy provenance; Proven interface satisfaction)
- [x] 26.12 Derive PHP logical owners from class-like syntax
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: declaration descriptors and `buildReferenceFacts` — owner-qualify class/interface/trait/enum members
      Approach: retain namespace surface, map class-like AST ancestry and static/instance form, and keep namespace `use` aliases local through the shared helper
      (Req: PHP logical identity and declaring owners; Namespaces, use aliases, and Composer resolution)
- [x] 26.13 Emit PHP hierarchy and trait provenance conservatively
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: hierarchy parser state, reference facts and relations — align inheritance/contract evidence
      Approach: reuse resolved extends/implements descriptors and only emit trait composition when adaptation precedence is proven; unsupported conflicts remain inconclusive
      (Req: PHP hierarchy and provenance evidence; Public surface and capability truthfulness)
- [x] 26.14 Add PHP owner and hierarchy regressions
      `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts`: namespace, member and hierarchy cases — verify complete PHP adapter additions
      Approach: cover same-name members under separate owners, static/instance forms, local `use`, extends/implements/override steps, relation consistency and unsupported trait adaptation
      (Req: PHP logical identity and declaring owners; PHP hierarchy and provenance evidence)
- [x] 26.15 Include direct canonical logical targets in search grouping
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: semantic candidate merge — prevent exact non-exported canonical IDs from disappearing
      Approach: add parsed `directLogicalTargets` to result IDs before declaration/binding grouping while reserving the tier for raw canonical-ID equality
      (Req: Semantic-first candidate lanes)
- [x] 26.16 Add direct logical target search regression
      `packages/code-graph/test/application/use-cases/search-code-graph.spec.ts`: canonical-ID case — prove a private target survives without text or public-binding hits
      Approach: return the target only from exact logical lookup, assert its declarations and exact-logical-identity tier
      (Req: Semantic-first candidate lanes, scenario: Canonical identity returns a non-exported target without text hits)
- [x] 26.17 Rank the complete visible file candidate set before limit
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: source candidate paging — remove early stop after the first `limit` visible files
      Approach: consume each stable backend cursor once, suppress and score the complete candidate set, sort by final semantic file score, then slice the category limit
      (Req: Search behaviour)
- [x] 26.18 Add later-page file ranking regression
      `packages/code-graph/test/application/use-cases/search-code-graph.spec.ts`: paged source candidates — prove a later strong match displaces early expanded-only files
      Approach: mock at least two pages with the first filling the limit and assert full-query/all-raw ordering after exhaustion
      (Req: Search behaviour, scenario: Later candidate page can win the final file limit)
- [x] 26.19 Assess a public surface when proving export absence
      `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts`: freshness input construction and missing gate — support requests without `filePath`
      Approach: use `publicSurface` as the addressed exact resource when no file is supplied, deduplicate it with declaration inputs, and permit `missing` only for current complete surface coverage
      (Req: Freshness and coverage gate)
- [x] 26.20 Add public-surface absence regressions
      `packages/code-graph/test/application/use-cases/resolve-symbol-reference.spec.ts`: export absence cases — distinguish current missing from unknown/stale unresolved
      Approach: address only `publicSurface`, assert exact assessment input and `missing` for current complete coverage, then counter-test stale and unknown evidence
      (Req: Freshness and coverage gate, scenario: Current public surface can prove a missing export)
- [x] 26.21 Keep health content-inspection failures unknown
      `packages/code-graph/src/application/use-cases/get-graph-health.ts`: discovery/stat/read/hash error mapping — stop returning false freshness for exceptions
      Approach: propagate null/unknown evidence, preserve aggregate precedence, and never set input/workspace/global stale latches without a proven mismatch
      (Req: Content freshness and coverage result; Efficient scope assessment)
- [x] 26.22 Add health inspection-failure regressions
      `packages/code-graph/test/application/use-cases/get-graph-health.spec.ts`: transient I/O cases — lock unknown state and latch immutability
      Approach: inject discovery, stat, read and hash failures, assert unknown reasons and no dirty/stale mutation unless independent evidence proves staleness
      (Req: Content freshness and coverage result, scenario: Content inspection failure remains unknown)
- [x] 26.23 Update Code Graph documentation for adapter and review semantics
      `docs/code-graph/index.md` and ADR 0024 — document complete specific adapter contracts and the six corrected behaviors
      Approach: describe logical owners, evidence-backed hierarchy capabilities, direct canonical-ID search, all-page file ranking, public-surface absence proof and inspection-failure unknown state
      (Req: all language-adapter, search, freshness and health follow-up requirements)
- [x] 26.24 Refresh implementation links for all follow-up files
      implementation tracking manifest — associate code, tests, helper and docs with the four specific adapter specs and affected common specs
      Approach: add/merge symbol-level links, review diagnostics, and resolve each touched file only after focused checks pass
      (Req: implementation traceability)
- [x] 26.25 Run focused and affected-package checks before verify
      Code Graph tests, typecheck, lint, build, real graph probes and implementing hooks — establish review readiness
      Approach: run new helper/adapter/resolver/search/health tests first, then full Code Graph and affected CLI/SDK checks; remain before the verifying transition
      (Req: all follow-up requirements)

## 27. Follow-up review: truthful adapter boundaries and terminating search

- [x] 27.1 Use complete ranges for compact owner containment
      `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts`: `containsSymbolRange` — determine syntactic ownership across full half-open ranges
      Approach: require matching files and compare start/end positions lexicographically so same-line compact owners contain their members correctly
      (Req: Logical declaring-owner facts; Complete symbol source ranges)
- [x] 27.2 Omit required-owner declarations without a proven owner
      `packages/code-graph/src/infrastructure/tree-sitter/reference-fact-helpers.ts`: `AdapterDeclarationDescriptor`, `buildLogicalDeclarationFacts` — prevent ownerless logical methods
      Approach: add `requiresOwner` and skip logical projection when its supported syntax owner cannot be mapped
      (Req: Logical declaring-owner facts)
- [x] 27.3 Align TypeScript and Python owner/public projections
      TypeScript and Python language adapters — apply full-range owner lookup, require owners for supported methods, and prevent members or naming conventions from inventing public routes
      Approach: retain unsupported method-like symbols as location-backed only; Python emits no public bindings until supported static module metadata exists
      (Req: TypeScript logical identity and declaring owners; Python logical identity and declaring owners; Public surface and stub behavior)
- [x] 27.4 Align Go package, ownership, and hierarchy boundaries
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: package surface and reference descriptors — use one root-package surface and only prove local interface embedding/same-file method sets
      Approach: normalize receiver owners while retaining pointer evidence, exclude members from package exports, and omit struct promotion/member-level fulfillment guesses
      (Req: Package identity, exports, and imports; Go logical identity and declaring owners; Go embedding and hierarchy provenance; Proven interface satisfaction)
- [x] 27.5 Align PHP owner and declaration boundaries
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: class-like owner collection and declaration kinds — support full-range class/interface/trait members without overclaiming constants, enum cases, or case-insensitive lookup
      Approach: require proven owners for methods/properties, preserve case in identities, and exclude members from namespace public bindings
      (Req: Declaration extraction and ranges; PHP logical identity and declaring owners; Public surface and capability truthfulness)
- [x] 27.6 Terminate repeated source-search cursors
      `packages/code-graph/src/application/use-cases/search-code-graph.ts`: `searchFiles` — guard malformed or repeated backend pagination
      Approach: consume each cursor once, process each canonical file once, exhaust valid pages, then rank and limit the complete set
      (Req: Search behaviour)
- [x] 27.7 Add compact-owner and public-surface adapter regressions
      shared helper and TypeScript/Python/Go/PHP adapter tests — verify same-line containment, required-owner omission, member/public separation, Python no-export behavior, and Go root-package identity
      Approach: use minimal parser fixtures that fail if a raw parent ID, line-only range, filename surface, or member visibility leaks into logical facts
      (Req: all specific adapter ownership and public-surface requirements)
- [x] 27.8 Add repeated-cursor search regression
      `packages/code-graph/test/application/use-cases/search-code-graph.spec.ts`: repeated backend cursor case — prove deterministic termination and deduplication
      Approach: return the same non-empty cursor twice and assert two backend calls plus one processed file result
      (Req: Search behaviour)
- [x] 27.9 Align adapter specs, verification, design, tasks, and documentation
      change artifacts and `docs/code-graph/index.md`/ADR 0024 — record supported owner, hierarchy, export, package-surface, and paging boundaries without weakening the shared contract
      Approach: preserve review history, make unsupported semantics explicit, and map every revised scenario to a regression suite
      (Req: complete specific adapter contracts; documentation)
- [x] 27.10 Run all focused, package, lifecycle, and clean-audit checks
      affected Code Graph, CLI, SDK suites plus implementation tracking and `code-auditor` — close the loop before verify
      Approach: run focused regressions first, then lint/typecheck/build/package tests, refresh graph and implementation links, execute code audit, and return to design for any new finding
      (Req: all follow-up requirements)
