# Spec-Compliance Audit — Batch: traversal + cli impact/hotspots

Change: nonblocking-sqlite-graph-store
Auditor scope note: this report contains findings for the assigned batch **code-graph:traversal, cli:graph-impact, cli:graph-hotspots**. The final instruction listed code-graph:graph-store / sqlite-graph-store / composition; those were NOT in this batch and are not audited here (no findings re-derived for them). File name follows the latest instruction (`_partial-code-graph.md`); original task named `_partial-traversal-cli.md`.

---

### code-graph:traversal

- Requirements Summary: 13 — Upstream traversal; Downstream traversal; Bounded batched traversal execution (delta); Bounded hotspot hierarchy retrieval (delta); TraversalOptions/TraversalResult; Impact analysis; Static type dependency impact; File impact; Spec impact; Change detection; Pure functions; Resolved canonical/public-binding impact; File-impact covering specs.

- Implementation Status:

| Requirement                                 | Status                         | Evidence                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream traversal                          | PASS                           | get-upstream.ts:44-149 (batch relations :23-35/:61, cycle visited set :51/:66, maxDepth+truncated :111-140)                                                                                                                                                                           |
| Downstream traversal                        | PASS                           | get-downstream.ts:44-149 (includeFiles importees/exported :73-95)                                                                                                                                                                                                                     |
| Bounded batched traversal execution (delta) | PASS w/ caveat                 | get-upstream.ts:60-71 one relation+symbol batch per frontier, dedup nextIdSet; analyze-files-impact.ts:34-39 shared memoized store + IMPACT_CONCURRENCY=4 mapWithConcurrency; analyze-file-impact.ts:76-81 symbolConcurrency=1 under shared context, createMemoizedReadStore :354-491 |
| Bounded hotspot hierarchy retrieval (delta) | PASS                           | compute-hotspots.ts:71-112 collectHierarchySignals = single getIncomingSymbolRelations(candidateIds,[Extends,Implements,Overrides]); no per-candidate query                                                                                                                           |
| TraversalOptions/TraversalResult            | PASS                           | get-upstream.ts:49-50 defaults maxDepth 3/includeFiles true; result {root,levels,totalCount,truncated} :148                                                                                                                                                                           |
| Impact analysis                             | PASS                           | analyze-impact.ts:30-55,119-255; risk computeRiskLevel :241; file dedup Set :137/:242; depth on affectedSymbols :150-157                                                                                                                                                              |
| Static type dependency impact               | PASS                           | UsesType/Constructs/Extends/Implements/Overrides in TRAVERSAL_RELATION_TYPES (get-upstream.ts:8-15, get-downstream.ts:8-15)                                                                                                                                                           |
| File impact                                 | PASS                           | analyze-file-impact.ts:37-155 (maxRisk :122-125; dedup shallowest :335-344; maxDepth→per-symbol :81-89 and IMPORTS BFS :92)                                                                                                                                                           |
| Spec impact                                 | PARTIAL (not fully re-derived) | provider.analyzeSpecImpact consumed at CLI impact.ts:723; analyze-spec-impact.ts internals not re-read                                                                                                                                                                                |
| Change detection                            | NOT RE-DERIVED                 | detect-changes.ts not read; delta's bounded-concurrency clause unverified there                                                                                                                                                                                                       |
| Pure functions                              | PASS                           | store-injected read-only services; memoization is read-through only (analyze-file-impact.ts:354+)                                                                                                                                                                                     |
| Resolved canonical/public-binding impact    | PASS                           | analyze-impact.ts:37-54 exact precedence + emptyImpact on non-resolved; analyzePublicBindingImpact :84-108 separates binding vs canonical; bounded ambiguity MAX_AMBIGUITY_CANDIDATES=10 resolve-graph-selector.ts:46 with caseExact-first (:157+)                                    |
| File-impact covering specs                  | PASS                           | collectCoveringSpecs two batch queries + min-depth fold + deterministic order analyze-file-impact.ts:241-285; inputs at depth 0 :127-132; multi-file fold analyze-files-impact.ts:69-96                                                                                               |

- Discrepancies:
  1. [AMBIGUOUS] includeFiles branch still issues sequential per-file `store.getImporters(fp)` + `store.findSymbols(...)` (get-upstream.ts:79-94, get-downstream.ts:79-94). Spec letter ("no store request per frontier **symbol or relation type**"; "batch relation lookup and a batch symbol lookup") is satisfied — per-_file_ reads are not prohibited — but frontier file-expansion remains O(files) sequential requests when includeFiles=true (default for direct getUpstream/getDownstream callers; impact paths unaffected since analyzeImpact uses includeFiles:false).
  2. [IMPL-BUG] Redundant duplicate batch read in truncation probe: `getSymbolsByIds(resolvedNextIds)` at get-upstream.ts:122 / get-downstream.ts:122 re-fetches symbols already fetched at :97 — one extra batch request per final level; semantics unchanged.
  3. [AMBIGUOUS] Default `includeFiles=true` is only asserted indirectly (via includeFiles tests traversal.spec.ts:269/:402); no explicit options-defaults unit assertion spotted.

- Test Coverage:
  - Covered: depths/cycles/maxDepth (traversal.spec.ts:55,110,130,147), wide-frontier single logical batch (:239 upstream, :372 downstream), CONSTRUCTS/USES_TYPE/hierarchy edges (:72,166,304,335), impact risk/depth/maxDepth (:426,444,467,490,513), hierarchy-as-direct (:534), imported-file determinism (:569), public-binding separation (analyze-files-impact.spec.ts:118,168), covering-spec two-batch + dedup (:230,299), concurrency cap four (:339), hotspot one-batch hierarchy (compute-hotspots.spec.ts:410), SQLite backpressure parity no-overload (sqlite-wide-traversal.spec.ts:25 @32-queue, :144 hotspots @16-queue, :230 single-file @16-queue).
  - Gaps: detectChanges service tests not located/re-derived; explicit pure-function `getStatistics()` before/after immutability test not spotted; spec-impact scenarios covered mainly via provider/CLI level rather than domain-level.

- Spec Dependency Chain: graph-store (batch relation/symbol ops used as specified), symbol-model (RelationType/SymbolKind sets match), resolve-symbol-reference (SymbolResolutionResult/PublicBinding consumed, ambiguity honored) — _none_ contradictory.

---

### cli:graph-impact

- Requirements Summary: 11 — Command signature; File impact analysis; Symbol impact analysis; Spec impact analysis; Concurrent indexing guard; Output format; Pure display-path projection (delta); Availability validated once per command (delta); Error cases; Public export impact analysis; File-impact covering-spec presentation.

- Implementation Status:

| Requirement                                     | Status | Evidence                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Command signature                               | PASS   | impact.ts:175-297; exactly-one target incl. --export+--from pairing :246-257; direction aliases parseImpactDirection :152-169; config/path exclusive :258-260; usage errors exit 1 before provider open                                                                                                            |
| File impact analysis                            | PASS   | handleFilesImpact :423-580 delegates to provider.analyzeFileImpact(s)/resolveImpactFileSelectors; SDK-only imports :2-8                                                                                                                                                                                            |
| Symbol impact analysis                          | PASS   | handleSymbolImpact :591-699; resolveSymbolSelector :601; missing → `No symbol found matching "<sel>".` exit 0 :602-609; bounded ambiguity list :611-645; resolved → analyzeImpact :664                                                                                                                             |
| Spec impact analysis                            | PASS   | handleSpecImpact :710-749; getSpec→throw GraphSpecNotFoundError propagates via withProvider→handleError exit 1 SPEC_NOT_FOUND (handle-error.ts:196-199)                                                                                                                                                            |
| Concurrent indexing guard                       | PASS   | provider-owned health probe warnGraphStale once after open impact.ts:276 (warn-graph-staleness.ts:20 getGraphHealth); GRAPH_BUSY/STALE → exit 3 (handle-error.ts:191-193)                                                                                                                                          |
| Output format                                   | PASS   | formatImpact :72-117 (labels, d=N grouping, `(depth=N)` header only non-default :73); JSON aggregate fields :487-491/:557-562/:688-691/:741-744; multi-file grouped Changed symbols + Per-file breakdown :527-549; Affected specs block :127-144                                                                   |
| Pure display-path projection (delta)            | PASS   | toGraphDisplayPath(config,path) pure+synchronous, zero provider/store reads (resolve-impact-file-selectors.ts:70-97); mapped synchronously single/multi-file :438-453/:566-573, symbol :599-673, spec :724-733                                                                                                     |
| Availability validated once per command (delta) | PASS   | exactly one getGraphHealth per run after open (:276); formatting does no availability validation (pure projection); no per-resource checks in aggregation paths                                                                                                                                                    |
| Error cases                                     | PASS   | selector count :249-257; config/path :258-260; missing/ambiguous unprefixed selector CliValidationError incl. searched path (resolve-impact-file-selectors.ts:43-54) → exit 1; provider-open failure fatal exit 3 (with-provider.ts:47-49)                                                                         |
| Public export impact analysis                   | PASS   | handlePublicExportImpact :311-412; surface normalization w/ ambiguity error :319-330; conservative resolveSymbolReference :334; exact binding via getExactPublicBinding (not a filtered search page) :350-355; ambiguous candidates deterministic, unmerged :357-380; both views preserved text/json/toon :393-411 |
| File-impact covering-spec presentation          | PASS   | formatCoveringSpecs Direct:/Blast radius groups :39-57 (mixed-evidence spec appears once in Direct since minDepth===0/>0 disjoint); structured coveringSpecs passthrough json/toon :444/:567; file-only evidence rendered regardless of symbol coverage :51-53; graph-health warnings retained :276                |

- Discrepancies:
  1. [AMBIGUOUS] Multi-file display-path derivation uses one project-level config lookup per workspace identity (toGraphDisplayPath resolves each file's workspace within shared config.workspaces) rather than a per-input-file separately-resolved config object. Equivalent outcome given one resolved project config; reading of "that file's own resolved workspace configuration" is satisfied transitively.
  2. [AMBIGUOUS] Ambiguity branch issues `provider.getSymbol(candidate.symbolId)` per candidate during presentation (impact.ts:612-618). It is resolution-payload enrichment, not an availability check — conforms to the delta's letter but is a bounded per-candidate fan-out worth noting.

- Test Coverage:
  - Covered: direction aliases + rejection (graph-impact.spec.ts:180,208,240,289), depth pass-through (:316,336,365), context resolution (:411,443), depth headers (:477,510), zero-read display projection (:531), selector validation (:559,574,598,622 normalized missing path), spec output + SPEC_NOT_FOUND text/json (:648,686,702), JSON aggregate fields (:730), symbol single/multi/none (:766,808,870), multi-file aggregation + JSON keys/per-file (:890,964,1029,1060), toGraphDisplayPath unit suite (resolve-impact-file-selectors.spec.ts:25-57: workspace projection, root:, ./ strip, separators, fallbacks).
  - Gaps: no CLI test asserting exactly-one availability validation per run (counting getGraphHealth calls); covering-spec text Direct/Blast-radius rendering has no dedicated CLI assertion located (domain data side covered by analyze-files-impact.spec.ts:230,299); infra-error exit-3 scenario not individually located in this spec file (covered generically by handle-error/graph-cli-context tests — not re-derived).

- Spec Dependency Chain: entrypoint (cliError/output/fatal conventions), graph-cli-context (resolveGraphCliContext/withProvider), core:config (SpecdConfig.projectRoot/workspaces drive projection), composition (provider facade), traversal + workspace-integration + resolve-symbol-reference (selector semantics honored) — _none_ contradictory.

---

### cli:graph-hotspots

- Requirements Summary: 9 — Command signature; Context resolution; Kind filter semantics; Hotspot retrieval; Concurrent indexing guard; Output format; Backpressure-safe hotspot presentation (delta); Error cases; CLI reference documentation.

- Implementation Status:

| Requirement                                    | Status | Evidence                                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature                              | PASS   | hotspots.ts:33-109 all flags; default policy kinds class/method/function + importer-only excluded + minScore>0(1)/minRisk MEDIUM/limit 20 via option omission + domain defaults (compute-hotspots.ts:38-53); per-flag override isolation :151-165                             |
| Context resolution                             | PASS   | resolveGraphCliContext({configPath,repoPath}) :136-145; bootstrap/config semantics delegated to shared graph-cli-context module                                                                                                                                               |
| Kind filter semantics                          | PASS   | parseGraphKinds trims+validates against SymbolKind set, preserves multi-kind (parse-graph-kinds.ts:13-19); invalid token → cliError before query hotspots.ts:129-135; omitted → default set :153                                                                              |
| Hotspot retrieval                              | PASS   | provider.getHotspots(options) with all filters passed through :151-167; opened via withProvider; SDK-only imports :2                                                                                                                                                          |
| Concurrent indexing guard                      | PASS   | warnGraphStale once after open :150; busy/stale → infra exit-3 path                                                                                                                                                                                                           |
| Output format                                  | PASS   | ranked table totals + score/risk/XWS/kind/name/ws-qualified location :179-197; `No hotspots found.` :170-172; json/toon {totalSymbols, entries[symbol,score,directCallers,crossWorkspaceCallers,fileImporters,riskLevel,workspace]} :201-218                                  |
| Backpressure-safe hotspot presentation (delta) | PASS   | renders solely from returned HotspotResult; per-entry path via pure toGraphDisplayPath :175-176/:193/:214; zero per-entry provider/store reads or availability validations                                                                                                    |
| Error cases                                    | PASS   | config+path exit 1 :126-128; infra errors exit 3 via handleError                                                                                                                                                                                                              |
| CLI reference documentation                    | PASS   | help documents comma-separated kinds/default set/full-replacement/widening switch/bootstrap notes :37-42,:44-49,:80-108; docs/cli/cli-reference.md §graph hotspots :1408-1460 covers signature, kind list, default kinds, full replacement, importer-only switch, config/path |

- Discrepancies:
  1. [AMBIGUOUS] cli-reference.md states bootstrap rules by reference ("Context resolution follows the same configured-vs-bootstrap rules as `graph index`"; "--path ... Ignores any discovered config") but never uses the literal framing "bootstrap-only modes, not the normal configured mode" in the hotspots section. Semantics conveyed; phrasing requirement met only implicitly.
  2. [AMBIGUOUS] Text-mode table derives workspace label independently from filePath prefix (hotspots.ts:191-192) while JSON derives `workspace` similarly (:211-213); consistent with "derived workspace field", no drift — noted for completeness.

- Test Coverage:
  - Covered: implicit-defaults preservation (:98), limit/min-risk/min-score/importer-only isolated overrides (:109,147,159,171), kind list passed through + full replacement (:121,134), invalid kind pre-query failure (:183), config/path mutual exclusion (:204), help-text documentation (:226), cli-reference alignment assertions (:244), context resolution (:67,86); domain defaults/kinds covered in compute-hotspots.spec.ts:158,183,213,248,271,313; wide-graph ranking without overload sqlite-wide-traversal.spec.ts:144.
  - Gaps: no CLI-level test asserting zero provider/store reads during text/json rendering of HotspotResult; no explicit empty-result (`No hotspots found.`) CLI assertion located; GRAPH_BUSY exit-3 not individually asserted in graph-hotspots.spec.ts listing reviewed.

- Spec Dependency Chain: entrypoint, graph-cli-context, core:config, code-graph:composition (getHotspots facade; SymbolKind/RiskLevel from sdk model matches symbol-model constraint) — _none_ contradictory.

---

## Global conventions check (all three specs)

- CLI imports platform symbols from `@specd/sdk` only: PASS (impact.ts:2-8, hotspots.ts:2, resolve-impact-file-selectors.ts:1, parse-graph-kinds.ts:1).
- JSDoc present on exported symbols in all audited files: PASS.
- No default exports observed: PASS.
- Domain services remain pure/read-only against the injected GraphStore port: PASS (memoized wrapper is read-through; no mutations).

## Totals

Requirements audited: 33 (traversal 13, impact 11, hotspots 9). Discrepancies: 7 total — 1 [IMPL-BUG] (redundant duplicate getSymbolsByIds in truncation probe), 6 [AMBIGUOUS]. Not re-derived: detect-changes.ts internals, analyze-spec-impact.ts internals, export-selector and covering-spec CLI test bodies.
