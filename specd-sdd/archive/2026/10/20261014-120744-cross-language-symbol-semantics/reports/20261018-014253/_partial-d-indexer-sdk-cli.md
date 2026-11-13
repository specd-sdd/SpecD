# Partial D (round 3): code-graph:indexer, code-graph:composition, sdk:run-graph-impact, cli:graph-impact

Change: cross-language-symbol-semantics. Read-only audit. Evidence from merged spec previews (spec.md + verify.md), source and tests. Line numbers are from the working tree as of this audit.

Severity counts (all four specs): HIGH 3, MEDIUM 9, LOW 8.

## Top findings (ranked)

1. HIGH - cli:graph-impact is self-contradictory on multiple bare-name matches. The verify scenario "Multiple symbol matches" says stdout shows `3 symbols match "validate":` followed by separate impact reports, and Output format says "When multiple symbols match, each analysis is listed sequentially". The Symbol impact requirement (item 6), the Logical presentation requirement, and the scenarios "Exact ambiguity is bounded and not traversed" and "Ambiguous owner-qualified selector lists every match" all forbid traversal. Code and tests implement the no-traversal behaviour (impact.ts:822-850 prints `N symbols exactly match "<sel>"; qualify the selector:`; graph-impact.spec.ts:941-1008 and 1100-1138 assert `analyzeImpact` is not called). The spec text is stale and the literal string differs (`exactly match`).
2. HIGH (static analysis, not run) - A subset run (`--workspace core`) looks like a fingerprint mismatch every time, so subset runs never skip. `computeRootFingerprint` (compute-graph-fingerprint.ts:169-198) hashes the full `workspaces` list. `IndexCodeGraph` computes it from `options.workspaces` (index-code-graph.ts around 590-640), and the SDK passes a filtered list for subset runs. `detectFingerprintMismatch` always compares the `root` key (compute-graph-fingerprint.ts:~410), so a subset run reports `fingerprintMismatch = true` while no workspace fingerprint differs. Consequences:
   - `fullRebuild = true`, the reason is set, and every discovered file is pushed to `newFiles` (index-code-graph.ts:~669-690). A subset run is never incremental.
   - The subset's root fingerprint overwrites the stored `root` entry (the merge only keeps stored entries missing from the current map).
   - The next whole-graph run then sees a root mismatch with `runReplacesWholeGraph` true. With `derivationMismatch: 'fail'` (SDK first attempt) it throws `GraphDerivationMismatchError`, and the SDK physically recreates the whole store. Running `index --workspace core` followed by `index` could therefore destroy and rebuild the graph.
   - In a root-only mismatch, files deleted from disk are not in `deletedFiles` (that list is only built in the non-mismatch branch) and are not in `fingerprintInvalidatedPaths` (only workspaces with a differing fingerprint are added), so their stale rows survive.
   - Nothing in the tests covers this: no test runs a subset non-force pass, or a subset pass followed by a full pass, against a real store. Verify with a probe test before fixing.
3. HIGH - sdk:run-graph-impact forbids "a compatibility branch that selects `declarations[0]`", but legacy physical branches still exist. Details:
   - `ResolvedGraphDeclarationSelector.target` is optional (resolve-graph-selector.ts:57-63). `resolvedResult()` (lines ~480-505) returns `{status:'resolved', match}` with no typed target.
   - `unifyOverloadSetCandidates` (resolve-graph-selector.ts ~400-440) collapses several physical matches to `first`, using `parentId` plus a regex over the physical symbol id (`extractSymbolNameFromId`). That is the "parse a physical ID" and "pick one declaration" pattern the spec forbids.
   - `promoteToLogicalTarget` falls back to that legacy outcome on any store error (`catch { return base }`, ~line 330). The error is swallowed silently.
   - The SDK then synthesizes a `declaration` target from `provider.getSymbol(...)` with a hard-coded `DeclarationOccurrenceForm.Definition` (run-graph-impact.ts:716-748) and traverses one physical seed.
   - For an exact physical id this is legitimate physical semantics. For a name or qualified selector whose declarations did not map to one logical symbol (for example an adapter that emits no logical mapping), it silently produces single-declaration impact labelled "declaration impact".
   - No test covers the mixed, unmapped or store-error fallbacks, so the legacy path is untested.
4. MEDIUM - composition "Package exports": the spec says the `"."` barrel SHALL export only the enumerated list, and the scenario "Barrel exports exactly the enumerated list" requires it. public.ts also exports `FreshnessMode`, `FreshnessState`, `IndexedInputKind`, `IndexedResourceKind`, `FILE_CATEGORIES`, `classifyFileCategory`, `IMPACT_RESULT_TYPES`, `IndexCoverageStatus`, `normalizeFileSelectorPath` and several type groups (`ExactPublicBindingResult`, `IndexPhaseMetric(s)`, `SourceRange`, `FileCategory`, `IndexedInputObservation` and others). barrel.spec.ts:205-300 keeps an `allowed` set that includes these extras, with a comment "Keep in sync with Package exports", so test and spec disagree. Spec and code are both at fault: the spec list is stale and the test cannot catch real leaks beyond its own allow-list.
5. MEDIUM - sdk export impact reports `status:'not_found'` for every non-resolved resolution (run-graph-impact.ts:956-966), although `UnresolvedPublicExportImpactResult.status` is typed `'not_found'|'ambiguous'|'unresolved'`. A resolver `ambiguous` or `unresolved` status is relabelled `not_found`. The CLI then goes to its "other" branch and prints `resolution.status`, so the CLI text and the SDK status disagree. Only the `AMBIGUOUS_PUBLIC_BINDING` path (selected === null) sets `ambiguous`.

## code-graph:indexer

### Requirements summary and status

- IndexCodeGraph use case: OK (index-code-graph.ts). SpecRepository and GetSpecMetadata are consumed. Untested at unit level: "VCS ref not updated when absent" (not verified).
- Incremental indexing: OK/PARTIAL.
  - Fingerprint reason constant: compute-graph-fingerprint.ts:14.
  - Mismatch branch: index-code-graph.ts:~660-700.
  - The newline-only manifest scenario is tested (workspace-indexing.spec.ts:84).
  - PARTIAL because of finding 2 (root fingerprint depends on the workspace subset) and the deleted-file gap in the mismatch branch.
  - Forced run: `fingerprintInvalidatedPaths` is only filled for subset runs. For a whole-graph force the bulk session uses `replaceCodeGraph`, so nothing leaks (OK).
- Deterministic implementation coverage projection: OK (project-spec-coverage.ts, changed). Diagnostic coverage is tested (project-spec-coverage.spec.ts). Not re-audited in depth in this batch.
- Discovery fingerprint, adapter-sourced fingerprint, portable paths, binary filter, bounded memory, two-pass, shared session, scoped binding, chunking, progress, timing, package resolution, error isolation, index result, spec dependency indexing, optimized description, reference fact indexing, classification-aware identity, observation capture, bounded incremental construction, incremental equivalence: not re-verified line by line in this round beyond the points below. The existing suites are present (compute-graph-fingerprint.spec.ts, symbol-index.spec.ts, workspace-indexing.spec.ts, index-project-graph-integration.spec.ts, language-adapter-conformance.spec.ts).
- Incompatible derivation rebuild: PARTIAL.
  - `GraphDerivationMismatchError` (new file) is thrown before any write only when `derivationMismatch==='fail' && fingerprintMismatch && !force && runReplacesWholeGraph` (index-code-graph.ts:~653-668). OK.
  - SDK retry: run-index-project-graph.ts:101-160. It first runs the index with `'fail'`, catches the error, and then runs `withOpenGraphProvider` with `beforeOpen: provider.recreate()`. `recreate()` is only allowed while closed (code-graph-provider.ts:280). `rotateStorageGeneration` is called in sqlite-graph-database.ts:419-436. OK.
  - Subset: `replacesWholeGraph` (domain/services/replaces-whole-graph.ts). The provider (code-graph-provider.ts:319-330) and the indexer each recompute it. The provider adds `root` only when `includePaths.length>0`, and the indexer adds `root` in the same condition (index-code-graph.ts:~536, 560). They are consistent today but are two independent copies.
  - Caller-owned provider: the default `'rebuild'` does an in-place logical rebuild via `replaceCodeGraph: fullRebuild && runReplacesWholeGraph` (index-code-graph.ts:~1702). OK.
  - Removed workspace: if a workspace is dropped from config, its rows are never considered (deletion is limited to indexed workspaces by spec), `runReplacesWholeGraph` becomes false because that workspace still owns files, and recreation is therefore never taken. Orphan rows persist until a forced whole-graph run. This is a spec-level gap (Medium, unverified at runtime).
- Index result: OK. `fullRebuild` and `fullRebuildReason` are returned (index-code-graph.ts:~1806). DRIFT: with `force`, `fullRebuildReason` is the literal `'Forced logical graph reindex requested by indexing'` (index-code-graph.ts:~643), which the spec does not define. The spec describes only the fingerprint-mismatch reason. If force and mismatch coincide, the mismatch reason is lost.

### Discrepancies

- [HIGH] Finding 2 above (root fingerprint covers the workspace subset).
- [MEDIUM] In the mismatch branch, `deletedFiles` is never computed for workspaces whose own fingerprint did not change (index-code-graph.ts:~666-700 versus 764-778). In a root-only mismatch this leaves stale rows for files deleted from disk.
- [MEDIUM] Spec tension: "Incremental indexing" says the preferred behavior is to "recreate the store" on mismatch and a backend that cannot recreate "MAY fail fast". "Incompatible derivation rebuild" mandates provider-owned recreation and in-place logical rebuild for a caller-supplied provider. The implementation follows the second text. The first paragraph should be reconciled, since it still reads as if the indexer itself recreates the store.
- [MEDIUM] The `derivationMismatch` option on `IndexOptions` (index-options.ts:140-150) is not mentioned in the indexer spec. It is the mechanism that implements the retry, so the contract is code-only.
- [LOW] The scenario "Deleted file removal remains scoped" has fingerprint-matching preconditions that a real subset run does not satisfy (finding 2).
- [LOW] Duplicated `runReplacesWholeGraph` logic in provider and indexer (provider re-reads `getAllFiles` and `getAllDocuments` for every forced run, which is O(graph) memory).

### Tests present

- Subset force preserves the other workspace's file and symbols: workspace-indexing.spec.ts:350-391.
- `derivationMismatch:'fail'` throws and leaves files unchanged; the default rebuilds in place: workspace-indexing.spec.ts:393-429.
- Manifest newline and text changes: workspace-indexing.spec.ts:84-145.
- Incremental closure and newly-added target: workspace-indexing.spec.ts:214-295.

### Missing tests

- Non-forced fingerprint-mismatch run on a strict subset that preserves the other workspaces' files, symbols, relations, specs, coverage records and fingerprints.
- A subset run followed by a full run with a real store: no destructive mismatch, no re-extraction. This would expose finding 2.
- A root-only mismatch with a file deleted from disk (stale row left behind).
- The in-place rebuild test (workspace-indexing.spec.ts:393) asserts only the reason string. It never asserts that stale rows were cleared, that the bulk session used `replaceCodeGraph`, or that the generation behaved correctly.
- `GraphDerivationMismatchError` with `force:true` (must NOT throw) and with a subset (must NOT throw). Neither is tested.
- The generation rotates when a real SQLite store is recreated on the SDK retry path. The SDK test mocks everything.
- Store-error path in `promoteToLogicalTarget` (the silent catch).

## code-graph:composition

### Status per requirement

- CodeGraphProvider facade: OK. `index` force clears logically (code-graph-provider.ts:~311-323), and the test at code-graph-provider.spec.ts:292-326 asserts `clear` is called once and `recreate` is not. `recreate()` rejects while open with `GraphStoreRecreateRequiresClosedError` (spec test :462) and takes the index lock (:469-473).
- PARTIAL: provider-level force over a strict subset (`runReplacesWholeGraph` false, so no `store.clear`) has no provider-level test. The only subset test is the use-case test.
- Filtered-impact provider surface: delegates with a single `assertAvailable` (`analyzeResolvedSymbolImpact` at :811-819). Not re-audited in depth.
- Factory function, Public and internal entry points, Lifecycle, Dependency on core, Host use cases: no discrepancy found in this round.
- Package exports: PARTIAL (finding 4).
- Symbol-reference provider surface, Resolution-aware impact provider surface, Adapter-backed reference normalization, unified search surface: delegation confirmed. `analyzeResolvedSymbolImpact` passes the whole `ResolvedSymbolTarget` to the domain service. Legacy `analyzeImpact(symbolId)` remains on the facade (physical only) as the spec allows for compatibility.

### Discrepancies

- [MEDIUM] Barrel exports versus the spec's "only" list (finding 4). The spec scenario "Barrel exports exactly the enumerated list" is not what the test implements. Fix either the spec list or add the extras to the enumerated list and make barrel.spec.ts assert set equality on runtime names.
- [MEDIUM] Spec says `index({force:true})` "ensures the indexer reprocesses every selected input", while `IndexResult.fullRebuildReason` becomes a force-specific string (see indexer drift).
- [LOW] The `getSpec(specId)` facade returns undefined for absent data (composition spec). The cli:graph-impact spec says "the provider SHALL throw `SpecNotFoundError`". In practice the SDK throws it (run-graph-impact.ts:897-901). The cli wording is wrong about who throws.
- [LOW] public.ts exports `GraphDerivationMismatchError` and the SDK depends on it. The composition spec lists the error subclasses by example ("including"), so this is allowed, but the error's `reason` property and code `GRAPH_DERIVATION_MISMATCH` are not documented in any spec.

### Tests present

- barrel.spec.ts: allowed runtime set, internal helpers absent.
- code-graph-provider.spec.ts: force/clear, recreate closed-only, recreate lock, open propagates recoverable error.

### Missing tests

- Strict equality between the runtime export list and the spec list.
- Provider force with a strict subset must not call `store.clear`.
- `recreate()` leaves the provider closed and rotates the generation (check the generation cache is null after recreate).

## sdk:run-graph-impact

### Status per requirement

- runGraphImpact orchestration: OK. Files, symbol, spec and export branches exist (run-graph-impact.ts:591-1068). The default `maxDepth` is 3 (:577), the transient provider uses `withOpenGraphProvider` (:1075-1079), and the filter is forwarded.
- Resolution-preserving symbol impact orchestration: PARTIAL.
  - The typed `analyzeResolvedSymbolImpact` is used (:750-758). Ambiguous and missing outcomes return before traversal (:677-711). Nested locations are projected for declarations, resolvedTarget, semantic targets, physical evidence and covering specs (:430-540, 805-865).
  - The legacy-physical fallback (:716-748) conflicts with the "no compatibility branch" requirement (finding 3).
  - The count-unit documentation requirement ("Aggregate count and risk fields MUST document whether they count unique logical targets or physical occurrences") is not met. `ResolvedSymbolImpactResult.directDepsCount/indirectDepsCount/transitiveDepsCount/affectedFilesCount` (:257-294) have no unit doc comment. Only `semanticCounts` is explicit.
  - The `impact.target` derivation is OK for logical targets (:847-850).
  - The deprecated `symbol` summary is derived after traversal in the typed branch, but in the fallback branch `sym` is loaded before traversal (:719-726). Display-only, but it contradicts "derived only after".
- Elimination of displayPath: OK. No such fields exist in the types.
- Pure path projection: OK for file, symbol and export paths. PARTIAL for symbol-ambiguity candidates (:699), which use the stored `sym.projectRelativePath` (a graph read result, not config projection).
- No presenter formatting: OK.

### Discrepancies

- [HIGH] Finding 3 (legacy physical fallback and `unifyOverloadSetCandidates`).
- [MEDIUM] Finding 5: every non-resolved export resolution is reported as `not_found` (:956-966).
- [MEDIUM] Export surface normalization is skipped when `from` contains ':' (:934). Windows absolute paths (`C:\...`) and any config-relative path containing ':' bypass `resolveFileSelector`. The workspace then falls back to `'default'` through `splitWorkspaceIdentity(...)?.workspace ?? 'default'` (:947). `from` is documented to accept absolute paths.
- [MEDIUM] Count-unit documentation missing (above).
- [LOW] The spec numbering is broken: step "6)" appears twice and the symbol step is appended after step 10 (spec.md lines 22-35).
- [LOW] `depth` is not validated in the SDK (the spec says "positive integer"). It is validated only in the CLI (impact.ts:413).
- [LOW] The multi-file `perFile` mapping relies on `result.symbols[i]` order matching `resolved[i]` (:638-653). Duplicate selectors resolving to the same file are not deduplicated.
- [LOW] The not-found symbol outcome (`{kind,status,symbol}`) drops the resolution outcome entirely. The scenario "the resolution outcome remains available to the caller" is satisfied only for ambiguous results.
- [LOW] Affected symbols overwrite `filePath` with the project-relative path (:603-607, 856-860, 911-915, 1029-1033). The canonical path is lost on those entries, although the spec says only that `projectRelativePath` is exposed. `canonicalPath` is exposed on the single-file target only.

### Tests present (sdk/test/orchestration/run-graph-impact.spec.ts)

Single and multi-file, symbol (typed and legacy shape), transient and caller-owned provider, spec, export (resolved and ambiguous), forwarding of direction, depth and filter, not-found, ambiguous, SpecNotFound, selector errors.

### Missing tests

- Fallback branch (`resolved.target` undefined) behaviour, and the fact that `analyzeResolvedSymbolImpact` is the only impact call used with a typed declaration target. The test at :203 uses a mock status `'exact'`, which is not a real resolver status, so it passes by accident through the fallback.
- Export `unresolved` and `ambiguous` resolver statuses producing a status that matches the resolver.
- Windows-absolute or colon-containing `from`.
- Projection of declarations in resolution candidates for the not-found export result.
- A provider that implements only the legacy method must be rejected or unsupported (the spec says implementations "SHALL implement the typed operation"). No runtime check exists.

## cli:graph-impact

### Status per requirement

- Command signature: OK (impact.ts:321-500). The mutually-exclusive checks, the half-selector usage error before provider open (:417-419), the direction alias normalization (:298-315) and the depth validation are all present. The synopsis in the spec omits `--type/--kind/--workspace/--exclude-workspace` (added by a later requirement).
- Provider-owned impact result filters: OK (`normalizeImpactResultFilter`, :78-160). The type list is `files|symbols|specs`, and `--kind` requires `symbols` in `--type`. The CLI does not remove entries from results. Tests: graph-impact.spec.ts:1770-2250.
- File impact analysis, Spec impact, Concurrent indexing guard, Pure display-path projection, Availability validated once, Error cases: OK by delegation. Covering-spec rendering is in formatCoveringSpecs (impact.ts:183-201, used at :677, 750, 921).
- Symbol impact analysis: OK, with the contradictory verify scenario (finding 1).
- Logical and declaration presentation: PARTIAL.
  - Text output shows the target kind, semantic counts, declarations, semantic affected targets, physical evidence and covering specs (impact.ts:852-928).
  - JSON/TOON output hand-picks fields (impact.ts:929-955). `kind` and `status` are dropped, and nothing guarantees future SDK fields reach structured output. The requirement says JSON and TOON "SHALL expose the SDK result without removing its target discriminant ...". The `targetKind` discriminant is present.
  - Ambiguous candidates are physical declarations, not semantic targets. `resolveSymbolSelector` flattens every declaration of every logical candidate into `candidates` and counts declarations in `totalCandidates` (resolve-graph-selector.ts:236-249). A logical overload set that conflicts with another symbol is therefore listed as several lines and counted as several matches, contradicting "Several declarations that belong to one logical target are one target, not several matches" and "deterministic semantic candidates".
- Public export impact analysis: OK. It uses the exact public-binding lookup via the SDK. The text view does not render `projectRelativeSurface` (it prints the raw `surface`).
- File-impact covering-spec presentation: OK.

### Discrepancies

- [HIGH] Finding 1 (contradictory verify scenario and Output-format line).
- [MEDIUM] Ambiguity candidates are per declaration rather than per logical target (above).
- [MEDIUM] The JSON/TOON symbol branch cherry-picks fields and drops `kind/status`. The spec requires pass-through of the SDK result. In the same area, the CLI help-text JSON schema (impact.ts:369-387) is stale: it lists `--symbol (single match)` without `targetKind/resolvedTarget/declarations/semanticCounts/semanticAffectedTargets/physicalEvidence`, and has nothing for `--export`.
- [MEDIUM] The count units are not named in the text. "Direct deps / Indirect deps / Transitive deps" render the legacy `impact.*Dependents`. Only the "Semantic counts" block labels logical versus physical. The structured `directDepsCount` etc. have no unit.
- [LOW] The spec numbering is broken: Symbol impact steps run 1-5, then "5", then "6".
- [LOW] Step 4 of "Spec impact analysis" says the CLI calls `analyzeSpecImpact(specId, direction)`. In fact the CLI delegates to `runGraphImpact`, with depth and filter.
- [LOW] Item 3 of "Spec impact analysis" says the provider throws `SpecNotFoundError`. The SDK throws it (`GraphSpecNotFoundError`).
- [LOW] `--all` silently overrides `--category`; the combination is not specified.

### Tests present (cli/test/commands/graph-impact.spec.ts)

Direction, depth, context, selector validation, spec output and SPEC_NOT_FOUND, symbol output (single, ambiguous, not-found, owner-qualified, ambiguous owner-qualified), multi-file aggregation, JSON/TOON output, public export (incomplete selector, exact binding, ambiguous candidates), covering specs, filters and categories, omission notice, logical impact text (:2373) and JSON/TOON (:2511).

### Test-quality issues

- The shared provider mock (graph-impact.spec.ts:67-190) re-implements `analyzeResolvedSymbolImpact` as a shim that calls `analyzeImpact(declarations[0].symbolId)`. Assertions such as :436-481 (`expect(analyzeImpact).toHaveBeenCalledWith(sym.id,'upstream',7)`) therefore check the very collapse the spec forbids, and only pass because the mock does it. The CLI tests do not prove a logical target is analysed once with all declarations, except in the dedicated cases that replace the mock (:2373 onward).
- The "Multiple symbol matches" verify scenario has no matching test (the tests assert the opposite, see finding 1).

### Missing tests

- Exit code 3 for `GRAPH_BUSY` and `GRAPH_PROVIDER_STALE` on impact (not found by name in this file; not verified).
- Single availability check per run (`assertAvailable` count) is not asserted in the CLI tests.
- `--type documents` rejection.
- A wide multi-file impact against a real SQLite store with `maxPendingOperations: 32` (the scenario describes a real store; only mock-level tests exist).
- Ambiguity candidate count per logical target.

## Cross-spec contradictions (merged specs and global specs)

1. cli:graph-impact "Multiple symbol matches" and "each analysis is listed sequentially" versus the same spec's ambiguity rules and sdk:run-graph-impact ("Ambiguous or unresolved selector does not traverse"). Real contradiction; code follows the ambiguity rules.
2. code-graph:indexer "Incremental indexing" (store recreation preferred, caller may fail fast) versus "Incompatible derivation rebuild" (provider-owned recreation, in-place logical rebuild for a caller-owned provider). Reconcile the wording.
3. code-graph:composition "Package exports" ("only" list and "exactly the enumerated list") versus code-graph:composition "Symbol-reference provider surface" ("SHALL export resolver input/result/status/reason/provenance types and factories, logical-symbol/public-binding/member/coverage vocabulary, and the enriched health/index result types") and other requirements that name search, selector and filter types. The "only" list is not closed in practice, so the exact-list scenario cannot be satisfied.
4. cli:graph-impact says the provider throws `SpecNotFoundError`; composition says `getSpec` returns undefined; sdk says the SDK throws it. The behaviour is consistent (SDK throws) but the three texts differ.
5. composition "Recovery ... Force MUST NOT invoke physical storage recreation" and indexer "Incompatible derivation rebuild" ("visible destructive full rebuild through provider-owned recreation"): consistent only because force never recreates and mismatch is the sole trigger. The SDK first-attempt `'fail'` plus retry protocol is not described in any spec (it lives in code and docs/sdk only).

## Docs check (docs/cli/graph.md, docs/sdk/index.md, docs/code-graph/index.md)

- [MEDIUM] docs/sdk/index.md:~212-228: the `runGraphImpact` example uses `{ target: { type: 'file', filePaths: [...] } }` and reads `impactResult.impactedFiles[0]`. Neither exists. The real input is `files: [...]` and the real result field is `affectedFiles`.
- [MEDIUM] docs/sdk/index.md:250-255 documents only the open-failure repair for `force: true`. It does not describe the `GraphDerivationMismatchError` first-attempt-fail, recreate and retry flow, nor `derivationMismatch`, nor that a caller-supplied provider gets an in-place logical rebuild, nor the subset semantics. It says "recreates closed derived storage ... exactly once", which matches open failure but not the second retry path.
- [LOW] docs/code-graph/index.md:278-290 documents recovery and `fullRebuild`/`fullRebuildReason` but not the subset (strict workspace subset) rule or the `derivationMismatch` option.
- [LOW] docs/cli/graph.md matches the symbol behaviours (logical, declaration and public-binding impact; ambiguity). `--force` is described as "a full rebuild" without saying that it is a logical clear and that, for `--workspace` subsets, other workspaces are preserved.
- docs/sdk/index.md:142-175 (resolution-preserving impact) is consistent with the code, except for the fallback branch noted in finding 3.

## Suggested next actions (outside this read-only audit)

1. Confirm finding 2 with a probe test (subset non-force run, then full run on a real SQLite store). If confirmed, make the root fingerprint independent of the indexed subset (or only compare the `root` key on a whole-graph run) and compute `deletedFiles` for non-invalidated workspaces in the mismatch branch.
2. Rewrite the cli:graph-impact "Multiple symbol matches" scenario and the "each analysis is listed sequentially" sentence to the ambiguity behaviour, with the actual string.
3. Remove or fence the legacy physical-selector fallback (optional `target`, `unifyOverloadSetCandidates`, the silent catch) and make the SDK reject results without a typed `target`.
4. Decide on the export list (extend the spec list or trim public.ts) and make barrel.spec.ts assert exact set equality with the spec.
5. Fix the SDK export `status` mapping and the colon-containing `from` normalization.
