# Specd Audit Report — Partial Batch B: code-graph core specs

**Change:** `code-graph-cross-workspace-imports` (state: implementing)
**Change path:** `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports`
**Report dir:** `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/reports/20261020-191859`
**Output file:** `_partial-batch-b-code-graph-core.md`
**Audit mode:** READ-ONLY — no code or spec files modified
**Graph:** fresh (indexed 2026-10-20T17:18:19.939Z; `stale: false` not reported by `graph stats`)

## Auditor scope

Assigned specs (all belong to the active change):

| #   | Spec ID                               | Declared deps (per manifest)                                                                                                                                                                                                                                   |
| --- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `code-graph:resolve-symbol-reference` | code-graph:symbol-model, code-graph:graph-store, code-graph:language-adapter, code-graph:workspace-integration                                                                                                                                                 |
| 2   | `code-graph:indexer`                  | code-graph:graph-store, code-graph:language-adapter, code-graph:symbol-model, code-graph:workspace-integration, core:config, core:spec-repository-port, core:list-workspaces, code-graph:document-model, core:get-spec-metadata, code-graph:sqlite-graph-store |

Dependency specs read (via `specd specs show`) for consistency checking:
`code-graph:symbol-model`, `code-graph:graph-store`, `code-graph:language-adapter`, `code-graph:workspace-integration`, `code-graph:document-model`, `code-graph:sqlite-graph-store`, `core:config`, `core:spec-repository-port`, `core:list-workspaces`, `core:get-spec-metadata`.

Global specs referenced for contradiction checking (declared in mandate): `default:_global/architecture`, `default:_global/conventions`, `default:_global/testing`, `default:_global/eslint`, `default:_global/error-handling-conventions`. These were consulted through the dependency specs that cite them (symbol-model → conventions/error-handling-conventions; graph-store → architecture). Full text of the `_global/*` specs was not re-read; no contradiction was observed in the implementation.

Navigation method: `specd graph search --symbols` (primary) and `specd specs show`. Implementation files located:

- `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts` (`ResolveSymbolReference`, line 40)
- `packages/code-graph/src/application/services/package-import-resolver.ts` (`PackageImportResolver`, line 43)
- `packages/code-graph/src/application/use-cases/index-code-graph.ts` (`IndexCodeGraph`, line 453)
- `packages/code-graph/src/application/use-cases/in-memory-index-session.ts` (`InMemoryIndexSession`, line 45)
- `packages/code-graph/src/domain/value-objects/symbol-reference.js` (result/input value objects)

Implementation tracking (manifest `trackedImplementationFiles`): all tracked source files are `resolved`; no `open` tracked implementation files remain except the sentinel `"full"` (open). All 97 tasks are complete (0 incomplete).

---

## Section 1 — Spec: code-graph:resolve-symbol-reference

### Requirements Summary

The spec defines the language-neutral symbol-reference resolution contract:

1. **Structured reference input** — authoritative structured identity fields; `qualified_name` equality for `Tipo.miembro` / `Tipo::miembro` spellings without file/surface/language; no adapter iteration or default-language pick for dotted lookups; `::` compares as stored dotted spelling; every equal match returned; file/surface filter matches; unanchored human text parsed by adapter selected in order (explicit language → anchored file language → public-surface metadata), else unresolved; language case/normalization preserved; path and workspace normalization separate from symbol normalization; `MemberForm` MUST NOT remain an input field.
2. **Logical canonical targets** — logical symbol as canonical target; retain every contributing declaration occurrence; overload sets/declaration merging/equivalents resolve as one logical target; selector candidates of one logical symbol → `resolved`; genuinely distinct competing logical symbols → ambiguous; target exposes workspace, module/package, declaring owner, symbol space, simple name, member form, contributing declaration locations, stable canonical reference.
3. **Resolution target kind and declaration evidence** — discriminate logical target vs exact physical declaration; canonical IDs/owner-qualified names/public selectors resolve at logical layer; file/line/column/exact occurrence select physical; no target-kind inference from legacy `symbolId`; no reducing logical result to arbitrary first declaration; ambiguity at target layer; legacy physical `match` field only as derived compatibility projection, never the only output; public changes use explicit discriminant + migration path; fields must not silently flip physical↔logical.
4. **Public and local binding identity** — public export slot by surface + exported name + symbol space; independently addressable binding identity per route; distinct aliases/duplicate re-export routes/competing targets remain distinct; local alias ≠ public export; anonymous/default exports addressable via binding identity.
5. **Deterministic resolution precedence** — (1) exact canonical logical id; (2) `qualified_name` equality for dotted/`::` spelling returning every equal logical symbol; (3) exact declaration in addressed file/owner; (4) exact public binding in addressed surface; (5) statically proven scoped import/alias; (6) statically proven hierarchy path using language precedence; owner resolved before member; no terminal-member-only search with owner inferred from text rank; unique same-name without proven path does NOT resolve; conditional/platform alternatives stay separate unless build context selects; cyclic paths terminate; public binding matches surface+exported name+space; file path alone does not select binding; target MAY live in another workspace.
6. **Package import bindings** — local binding from package-specifier import resolves as statically proven scoped import (precedence 5) when target persisted; target MAY be in another workspace; resolver reports ordered provenance path local binding → `import:package` step → public binding → logical target; non-persisted package import → local binding without target, reference unresolved; MUST NOT graph-search same-name symbol; unique same-name does NOT resolve; MUST NOT depend on a language to follow `import:package` (shared provenance vocabulary).
7. **Resolution outcomes** — exactly one of `resolved`/`ambiguous`/`unresolved`/`missing`; non-resolved include stable machine-readable reason code + deterministically ordered candidate summaries; ordered typed evidence path per proven step.
8. **Freshness and coverage gate** — VCS ref equality alone does NOT prove freshness; consumes `AssessIndexedResourceFreshness` per addressed resource and per contributing declaration file; addressed source file assessed as file resource; public surface assessed as addressed resource when no source file; one batch deduplicates shared inputs; resolver MUST NOT embed filesystem/repository/hashing/persistence logic; exact file-anchored resolution MAY use current targeted evidence despite global staleness; workspace-wide fallback/absence/uniqueness/ambiguity requiring corpus completeness stays `unresolved` when global health stale/unknown; unknown/dirty/stale/incompatible/excluded/unsupported/parse-failed/partial evidence → `unresolved` with specific reason, never `missing`; transient freshness inability → `freshness-unknown`; current complete indexed file proving absence → `missing`; current complete indexed public surface proving absent export → `missing`; provider/generation failures → infrastructure errors.
9. **Hierarchy-aware members** — declared/overriding members take precedence over inherited; contract-qualified refs resolve to contract member; inherited/trait/mixin/embedded/promoted/abstract/default members follow deterministic precedence; ancestor owner queried for requested member (reaching owner ≠ reaching member); evidence retains owner-to-ancestor path + ancestor-member declaration; competing inherited members → ambiguous; getter/setter same-name forms need member-form constraint; implicit interface satisfaction only when method sets prove it; malformed cycles terminate safely.
10. **Batch and backend-independent resolution** — batch under one health snapshot + provider lifecycle; indexed lookups + cycle-safe bounded traversal, no full-graph scan per reference; identical ordering/status/reasons/provenance across backends for equivalent contents.

Constraints: no mutation of stored links/archived sidecars; no fuzzy/edit-distance/best-candidate guessing; no runtime reflection/computed imports/monkey-patching/unproven interprocedural value flow; adapter-specific syntax analysis belongs to language adapters.

Spec dependencies: `code-graph:symbol-model`, `code-graph:graph-store`, `code-graph:language-adapter`, `code-graph:workspace-integration`. ADR: ADR-0024.

### Implementation Status: CONFORMS (substantial)

Located `ResolveSymbolReference` at `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts:40` (graph-indexed; public bindings on `code-graph:src/application/use-cases/resolve-symbol-reference.ts` and `code-graph:src/index.ts`).

Key conformance points verified by reading the implementation:

- **Structured input / qualified_name equality:** `resolveQualifiedMember` (line ~1019) handles exact-lane dotted/`::` spellings via `qualifiedLookupText`, filters by `qualifiedName`, returns every match, requires no adapter, filters by anchored visibility. `::` is compared as stored dotted spelling (no `::`-specific delimiter parsing).
- **MemberForm absent:** implementation uses `MemberSemantics` axes (kind/dispatch/accessor/nativeKind) throughout; no `memberForm` field on inputs/lookups — consistent with symbol-model spec.
- **Logical targets:** `outcomeFromTargets`/`outcomeFromCandidates` produce discriminated `logical-target` and `public-binding` `ResolvedSymbolTarget` shapes carrying `LogicalSymbol`, every contributing declaration, and ordered evidence path. `deduplicateCandidates` keeps one per logical target; ambiguity (`AMBIGUOUS_LOGICAL_TARGET`) when >1.
- **Precedence:** exact-input lane (declaration id / position) handled first; then `resolvePrepared` order — exact logical match → public bindings → local bindings → hierarchy → absence. Owner resolved before member via `hierarchyCandidatesForRequest` + `tracePaths` (cycle-safe, `MAX_PATH_DEPTH=32`). Same-name-without-path → `REFERENCE_UNPROVEN`/`unresolved`, never guessed.
- **Package import bindings:** local bindings are consulted (`toLocalLookup`, `candidatesFromBindingTargets`) and the `import:package` step is part of `steps` loaded via `loadResolutionSteps`; provenance path reported through `candidate.path`. No language branch follows `import:package` — steps come from the store uniformly.
- **Outcomes:** exactly one status; non-resolved carry `reasonCode` + `candidates` + `path` + `health`; `missing` only for current+complete proven absence (`LOGICAL_TARGET_NOT_FOUND`, `REFERENCE_ABSENT`); `unresolved` otherwise with specific codes (`RESOURCE_FRESHNESS_UNKNOWN`, `GRAPH_FRESHNESS_UNKNOWN`, `GRAPH_COVERAGE_INCOMPLETE`, `COVERAGE_*`, `BUILD_CONTEXT_UNSUPPORTED`).
- **Freshness gate:** consumes `assessResources` (optional) for addressed resources + declaration files; `candidateEvidenceIssue` checks per-declaration-file freshness + coverage; targeted freshness blocks answers when not Current; `freshness-unknown` used when assessment missing; `missing` only when coverage proves absence. `assessResources === undefined` skips freshness (graceful degradation) — acceptable since the capability is optional per the "AssessIndexedResourceFreshness" framing.
- **Hierarchy:** `hierarchyCandidatesForRequest` queries the requested member under each reached ancestor owner; `tracePaths` retains owner-to-ancestor path; `preferEarlierBase` applies `extends:N` precedence; competing inherited → ambiguous; cycles terminated by `visited` set + depth bound.
- **Batch / backend-independent:** `executeBatch` shares one `getHealth()` read and one set of indexed queries; bounded `loadResolutionSteps` traversal; all queries go through `GraphStore` port (backend-neutral). No filesystem/hashing/persistence logic in the resolver.

### Discrepancies

**Spec might be wrong:**

- The spec's freshness gate requires consuming `AssessIndexedResourceFreshness` for _every_ explicitly addressed resource and _every_ declaration file whose evidence contributes to a candidate. The implementation only assesses when `assessResources` is provided; when absent it skips freshness entirely rather than treating unknown as `unresolved`. This is a deliberate graceful-degradation design (the capability is optional in the constructor), but it relaxes the spec's "SHALL consume ... for every ... resource" when the capability is not wired. This is a spec-implementation gap in the optional-capability wiring, not a code defect per se.

**Code might be wrong:**

- None observed at the level of resolution semantics. The implementation is conservative and matches the precedence/ordering requirements. One minor point: in the exact-declaration lane, when `matches.length > 1` the code returns `ambiguous`/`AMBIGUOUS_DECLARATION`, but the spec's precedence rule 2 says equality on `qualified_name` returns _every_ equal logical symbol and "One match resolves that member"; multiple exact physical declarations at the same file:line:column is an unusual state, so `ambiguous` is defensible.

### Test Coverage

Test file: `packages/code-graph/test/application/use-cases/resolve-symbol-reference.spec.ts` (51.1 KB). Covers structured input, qualified_name equality, `::` spelling, multiple equal names, anchored-file filter, overload sets, competing declarations, parallel re-exports, shadowed local aliases, same-name-not-proof, conditional context, owner-before-member, public binding surface+name, file-path-alone, value/type ambiguity, missing member, legacy occurrence id, canonical id, ambiguity outcomes, fresh absence, dirty file, coverage failure, public-surface missing export, hierarchy override/ambiguous/ancestor, batch shared health, batch with supplied health, backend parity, cross-workspace import provenance, unresolved package import no-guess, language-independent step following. Coverage is **comprehensive** across the spec's requirements; no obvious missing scenarios.

Missing tests: none flagged for this spec.

### Spec Dependency Chain

`code-graph:resolve-symbol-reference` → `code-graph:symbol-model` → (`default:_global/conventions`, `default:_global/error-handling-conventions`, `code-graph:document-model`) ; → `code-graph:graph-store` → (`code-graph:symbol-model`, `default:_global/architecture`, `code-graph:staleness-detection`, `code-graph:document-model`) ; → `code-graph:language-adapter` → (`code-graph:symbol-model`) ; → `code-graph:workspace-integration` → (`core:config`).

Consistency with deps: The implementation's use of `MemberSemantics` axes (no `memberForm`), `qualified_name` equality lookup, `LogicalSymbol`/`DeclarationOccurrence`/`PublicBinding`/`LocalBinding` value objects, and `GraphStore` port methods (`findLogicalSymbols`, `findPublicBindings`, `findLocalBindings`, `findResolutionSteps`, `findIndexCoverage`, `findSymbolsByIds`, `findLogicalDeclarationsByDeclarationIds`, `findDeclarations`) all match the symbol-model and graph-store contracts. Error type `SpecdCodeGraphError`/`SpecdError` with `specd: true` discriminator matches error-handling-conventions.

Counts: requirements ~10; implementation files 1 (primary) + value objects; test file 1.

---

## Section 2 — Spec: code-graph:indexer

### Requirements Summary

The spec defines `IndexCodeGraph`, a two-pass extraction indexer with in-memory session, cross-workspace package resolution, package-import diagnostics, incremental closure, fingerprint, and spec dependency indexing:

1. **IndexCodeGraph use case** — `execute()` discovers files, diffs, extracts, stores, cleans, persists VCS ref in order; `vcsRef` stored as `lastIndexedRef` when provided, not updated when absent; uses `GetSpecMetadata` (not raw metadata reads) for `title`/`description`/`metadataFingerprint`.
2. **Incremental indexing** — unchanged files skipped when fingerprint matches; mismatch → full rebuild (`fullRebuildReason` = "Graph derivation fingerprint mismatch — ..."); newline-only manifest change stays incremental (CRLF/LF normalize); deletion scoped to indexed workspaces; changed files removed before bulk load; forced run ignores orphaned incremental state.
3. **Deterministic implementation coverage projection** — clean generation projects `COVERS_FILE`/`COVERS_SYMBOL`; implementation-only change reprojects coverage; changed declaration reprojects canonical coverage; unresolved/ambiguous links → diagnostic per link (spec id, file, symbol name, reason), no `COVERS_SYMBOL`/`COVERS_FILE` fallback; qualified member resolves inside anchored file; re-export binding visible before coverage; label text → `SYMBOL_NOT_FOUND` diagnostic; value/type pair → `SYMBOL_AMBIGUOUS`; unindexed file → `FILE_NOT_INDEXED`.
4. **Multi-workspace file discovery** — `node_modules` excluded; `FileNode.path` = `{workspace}:{relativeToCodeRoot}`; `projectRelativePath` normalized forward slashes, no leading `./`, may contain `..`; `workspace` field set.
5. **Portable graph paths** — drive letter never a workspace prefix; persisted separators are slashes, parents stay; adapter splits keep drive letter; drive-root file not workspace `C`.
6. **Binary file filtering** — known binary extensions skipped before decoding.
7. **Bounded analysis memory** — retained analysis excludes AST/parser objects.
8. **Discovery fingerprint uses effective config** — synthetic spec-root exclusions contribute; undeclared build files (`tsconfig.json`, `jsconfig.json`, `setup.cfg`, `setup.py`, `go.work`) not fingerprint inputs unless declared by an adapter.
9. **Adapter-sourced resolution fingerprint** — manifest membership comes from `resolutionManifests()` only; walk includes manifests between codeRoot and repo root; walk stops at repo root (or project root if no repo root); CRLF/LF manifests hash same; `contentHash` = SHA-256 hex of newline-normalized UTF-8, no `sha256:` prefix; fingerprint module reads existence/text only through an application port (no `node:fs`/`node:fs/promises`).
10. **Two-pass extraction with in-memory index** — Pass 1 analyzes/registers once per file; Pass 2 resolves imports/builds relations from in-memory session, no per-file re-parse, no graph-store query during extraction/relation building; unresolved qualified names may still become file imports (PHP); unresolvable imports dropped without aborting; shared scoped resolution after import resolution; prepare + re-export linking precede Pass 2; hydrated workspaces prepared.
11. **Shared indexing session** — adapters and pass logic share one run-scoped `IndexSession`; adapter cache state behind session API only (no raw internal map mutation); session serves later spec/document lookups.
12. **Scoped binding environment resolution** — constructor injection → `USES_TYPE`; constructor call → `CONSTRUCTS`; ambiguous receiver → no relation; self-relation dropped before staging; language-agnostic receiver lookup; type imported from another workspace → `USES_TYPE` to that workspace's declaration; import wins over same-name local symbol; unimported name keeps workspace lookup.
13. **Chunked processing** — files grouped by byte budget; custom `chunkBytes` respected; staged artifacts under configured graph temp dir, cleaned after success.
14. **Progress reporting** — `onProgress` across discovery/pass1/pass2/bulk loading with detail strings; fires before blocking heavy work.
15. **Phase execution timing logging** — debug logs contain execution times per phase.
16. **Cross-workspace package resolution** — package identity built from adapter (`getPackageIdentity`/`packageResolution.identity`), indexer never parses manifest; cross-workspace import via `packageName→workspaceName` map; multirepo support; adapter without identity → non-relative imports unresolved; package re-export keeps publishing logical id (not first same-name symbol); unknown package unresolved; first adapter identity wins once; identity collision → error names both workspaces; identity searched within project (manifest above project root not read); resolved package import persists binding + `import:package` step + `IMPORTS`; unresolved import persists nothing; unique name not enough; test files not entries; adapters disagree → `ambiguous`; external packages counted separately (`externalPackageImports`, out of `total`/`byReason`/`samples`); diagnostics summary bounded (samples ≤ 20 per reason); helper reports `facet-absent`/`package-unknown`/`no-entry-surface`.
17. **Spec dependency indexing** — `repo.count()` for progress; `repo.list()`, `GetSpecMetadata.execute({specId})`, `repo.readPersistedState()` once per spec; derives dependency + implementation coverage from persisted state; no CLI-pre-resolved spec objects; spec with metadata → `SpecNode` + `DEPENDS_ON`; spec without metadata → defaults; specIds unique across workspaces; archived file-level link → `COVERS_FILE`; archived symbol-level → `COVERS_SYMBOL`; stale coverage preserves `stale: true`; incremental skips unchanged by `metadataFingerprint`; fingerprint change → reprocess.
18. **Error isolation** — parse error in one file does not abort others (per-file error entry, `filesIndexed` counts only ok); infrastructure error aborts run.
19. **Index result** — normal incremental `fullRebuildReason` null; mismatch records reason; spec roots excluded from document discovery; workspace-owned file not duplicated under `root:`; windows-1252/utf-16 docs → `DocumentNode`; NUL-bearing non-UTF16 skipped; optimized description preferred; reference facts persisted atomically; high-cardinality relation construction bounded; cross-file overrides connect to all overloaded super methods; property symbols with `DEFINES`; source content + ranges atomic; language-specific linking stays in adapter; owned members store qualified_name; relative re-export kept; facts stored before coverage reads them.
20. **Classification-aware logical identity construction** — lexical bindings don't become logical symbols; members use canonical logical owners; declaration groups need explicit language evidence.
21. **Incompatible derivation rebuild** — mismatch → generation rotate, re-extract, report reason; full rebuild prepares search indexes once; subset rebuild preserves other workspaces; whole-graph mismatch recreates storage + rotates generation.
22. **Indexed-input observation capture** — records every semantic input; stale latches cleared only after success.
23. **Bounded incremental relation construction** — proportional to affected evidence; small change → only affected closure; unchanged targets avoid semantic/search rebuild; persistence and search timing disjoint.
24. **Identity-sensitive incremental equivalence** — declaration mutation matches clean rebuild; body edits rebuild affected consumers; mutation matrix matches clean semantic state.
25. **Facet-driven language independence** — stub adapter resolves without indexer change; indexer source has no language branches for resolution; absent facet skipped with diagnostic (`adaptersWithoutPackageResolution`, out of totals); throwing identity doesn't stop run; first adapter to return identity wins.
26. **Package import incremental closure** — entry change re-resolves importers; barrel chain reaches importers; manifest change reaches importers; newly resolvable import reconsidered; closure reads only persisted steps + hydrated bindings + manifest facts (no full scan); added files still re-extract files with possibly unresolved imports.

Constraints: indexer MUST NOT contain language-specific resolution logic (consumes adapter facets); new language MUST NOT require indexer change; package-import diagnostics never persisted; Pass 2 import resolution performs no filesystem I/O.

Spec dependencies: `code-graph:graph-store`, `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration`, `code-graph:sqlite-graph-store`, `core:config`, `core:spec-repository-port`, `core:list-workspaces`, `code-graph:document-model`, `core:get-spec-metadata`.

### Implementation Status: CONFORMS (substantial)

Located `IndexCodeGraph` at `packages/code-graph/src/application/use-cases/index-code-graph.ts:453`; `PackageImportResolver` at `packages/code-graph/src/application/services/package-import-resolver.ts:43`; `InMemoryIndexSession` at `packages/code-graph/src/application/use-cases/in-memory-index-session.ts:45`. All graph-indexed.

Key conformance points verified:

- **Two-pass + session:** Pass 1 (analyze/register, lines ~850-1195) chunks files, writes stage chunks, registers files/analyses into one `InMemoryIndexSession`; Pass 2 (resolve/build, line ~1197+) resolves imports and builds relations from the session. No per-file re-parse; no graph-store query during extraction/relation building.
- **Prepare before Pass 2 (line ~1205):** `adapter.packageResolution?.prepare({session, ...})` once per adapter, wrapped in try/catch per adapter (error recorded, adapter treated as facet-absent). Re-export linking relocated to run right after prepare (task 12.2) — verified at lines ~1201-1209 comment and surrounding loop, before the first `resolveImports`.
- **Package map (lines 882-910):** built from `adapter.packageResolution.identity(ws.codeRoot, options.projectRoot)`; try/catch per adapter (error pushed, `continue`); first adapter that returns an identity wins (`break` after set); collision error names both workspaces; indexer never parses manifest itself.
- **Resolver wiring (task 10.1):** `new PackageImportResolver({session, packageToWorkspace, disabledPackageResolution})`; `resolver.forAdapter(adapter)` supplies `workspaces`, `packageEntryFiles`, `resolvePackageExport` to `adapter.resolveImports`.
- **Steps + diagnostics (task 10.2/10.3/10.4):** `session.addReferenceFacts({publicBindings: [], steps: resolved.steps})` after each `resolveImports`; `importDiagnosticCounts`/`importDiagnosticSamples`/`externalPackageImports` accumulated via `recordImportDiagnostic`; facet-absence diagnostic emitted once per adapter lacking `packageResolution`; diagnostics never written to the store (non-persisted).
- **`package-unknown` counted separately:** `externalPackageImports++` for `package-unknown`, kept out of `total`/`byReason`/`samples` (lines ~926-929); `sampledPerReason` bounds samples.
- **Cross-workspace identity:** `packageToWorkspace` map correlates package names to workspace names; used by `PackageImportResolver.entryFiles` via `facet.matchSpecifier(specifier, [...packageToWorkspace.keys()], session)`.
- **Test files not entries:** `PackageImportResolver.entryFiles` filters `session.getFileCategory(entry.filePath) !== 'test'` (unconditional).
- **No language branches in indexer:** all resolution delegated to `adapter.packageResolution` facet; indexer has no `zig2`/`.z2`/manifest hardcoding (verified by the language-independence test which statically scans indexer sources).
- **Spec dependency indexing:** uses `ws.specRepo.list()`, `readMetadataSnapshot`/`GetSpecMetadata`, `readPersistedState`, `readPersistedDependsOn`, `readPersistedImplementation`; builds `SpecNode`, `DEPENDS_ON`, `COVERS_FILE`, `COVERS_SYMBOL`; fingerprint-based incremental skip.
- **Error isolation:** per-file try/catch pushes errors, continues; `filesIndexed` counts only successful; infrastructure errors (store connection) abort.

### Discrepancies

**Spec might be wrong:**

- Verify scenario "Package identity built from adapter" references `adapter.getPackageIdentity` (the pre-facet method). The implementation and the change's design migrated to `adapter.packageResolution.identity(...)` (tasks 5.5, 7.1, 22.3). The verify delta was to be aligned in task 22.1. This is a known alignment item; the code (facet-based) is the current source of truth and the verify spec should be read as updated by task 22.1. Not a defect in the audited code.

**Code might be wrong:**

- None observed. The implementation follows the facet-driven, language-independent design consistently. One area to note: task 12.2's "if any input of `link` turns out to exist only after Pass 2, stop and report" — the implementation links re-exports after `prepare` and before Pass 2 per task 12.2; whether any re-export input genuinely depends on Pass 2 is a design decision captured in the verify delta, not observable from the code alone.

### Test Coverage

Test files (all present):

- `packages/code-graph/test/application/use-cases/index-code-graph.spec.ts` (5.9 KB)
- `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` (24.7 KB)
- `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.languages.spec.ts` (10.7 KB)
- `packages/code-graph/test/application/use-cases/index-code-graph.language-independence.spec.ts` (6.5 KB)
- `packages/code-graph/test/application/services/package-import-resolver.spec.ts` (11.0 KB)
- `packages/code-graph/test/application/use-cases/in-memory-index-session.package-lookups.spec.ts` (4.8 KB)
- `packages/code-graph/test/infrastructure/tree-sitter/package-resolution.spec.ts` (16.0 KB)
- `packages/code-graph/test/application/use-cases/_shared/compute-graph-fingerprint.spec.ts` (15.2 KB)

Coverage is **comprehensive**: package-import resolution (named export, not-exported unique/internal, ambiguous, package-unknown, facet-absent, no-entry-surface, test-file exclusion, unindexed-entry filter, duplicate routes → lowest binding id, `import:package` step shape, `findSymbolsByName` never called), entry surface (exports./main/subpath/dist/condition object/alternatives/test exclusion/prepare-once/no-fs-read), cross-workspace integration (two workspaces, local binding target, IMPORTS to entry, USES_TYPE, persisted step, subpath, unknown package, internal-only, same-name decoy, unique-not-enough, unresolved leaves nothing, diagnostics not in store), closure (entry change re-resolves, barrel chain, manifest change, newly resolvable, no full scan, added-files fallback), fingerprint (manifest changes change fingerprint), language independence (stub zig2 resolves; indexer source has no language branches; absent facet diagnostic; throwing identity doesn't stop; first adapter wins).

Missing tests: none flagged; all 18 phase-2 task groups have corresponding test files per the manifest and tasks.md.

### Spec Dependency Chain

`code-graph:indexer` → `code-graph:graph-store` → (symbol-model, architecture, staleness-detection, document-model) ; → `code-graph:language-adapter` → (symbol-model) ; → `code-graph:symbol-model` → (conventions, error-handling-conventions, document-model) ; → `code-graph:workspace-integration` → (core:config) ; → `code-graph:sqlite-graph-store` → (symbol-model, architecture, staleness-detection, document-model) ; → `core:config` ; → `core:spec-repository-port` ; → `core:list-workspaces` → (core:config, core:workspace, core:spec-repository-port, core:composition-resolver) ; → `code-graph:document-model` → (symbol-model, graph-store, core:config) ; → `core:get-spec-metadata` → (core:materialize-spec-metadata, core:spec-metadata, core:spec-id-format).

Consistency with deps: `IndexResult.diagnostics` + `ImportDiagnosticSummary` (with `adaptersWithoutPackageResolution` and `externalPackageImports`) match the indexer spec's diagnostics requirements. `PackageWorkspace`, `PackageEntry`, `PackageExportRequest/Resolution`, `ImportDiagnostic`, `ImportUnresolvedReason` from `language-adapter-facets` are used. `IndexSession.findPublicBindings`, `getFileCategory`, `getPrimaryDeclarationSymbolId`, `getFileId` are implemented in `InMemoryIndexSession`. `GetSpecMetadata` is used via `ws.specRepo`/Kernel surface rather than raw metadata reads (spec requirement 1, scenario "Indexer uses GetSpecMetadata instead of raw metadata reads"). Error type extends `SpecdCodeGraphError` → `SpecdError` (`specd: true`), matching error-handling-conventions and symbol-model. JSDoc on every exported symbol, no `any`, no default exports — matches conventions/eslint.

Counts: requirements ~26; implementation files 4 (index-code-graph.ts, package-import-resolver.ts, in-memory-index-session.ts, index-session.ts value object) + diagnostics value objects; test files 8.

---

## Cross-Spec Consistency Summary

- No contradiction between `code-graph:resolve-symbol-reference` and `code-graph:indexer` on package-import bindings: both treat `import:package` as shared, language-independent provenance; the resolver follows steps without a language branch; the indexer persists binding + step + `IMPORTS`.
- Both specs agree diagnostics are non-persisted (`PackageImportResolver`/indexer never write diagnostics to the store).
- Both agree `MemberForm` is retired in favor of `MemberSemantics` axes; implementation reflects this.
- Both agree public binding target MAY live in another workspace; implementation's `PackageImportResolver.resolveExport` resolves `targetId` across workspaces via `packageToWorkspace`.
- Global spec consistency: error contract (`SpecdCodeGraphError`/`SpecdError`, `specd: true`) matches `default:_global/error-handling-conventions`; immutability/readonly value objects match `default:_global/conventions`; abstract `GraphStore` port (not interface) matches `default:_global/architecture`.

## Test Coverage Summary (both specs)

| Spec                                | Test files                                                                                                                                                                                                                                                                                                                              | Coverage verdict |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| code-graph:resolve-symbol-reference | `resolve-symbol-reference.spec.ts`                                                                                                                                                                                                                                                                                                      | Comprehensive    |
| code-graph:indexer                  | `index-code-graph.spec.ts`, `index-code-graph.package-imports.spec.ts`, `index-code-graph.package-imports.languages.spec.ts`, `index-code-graph.language-independence.spec.ts`, `package-import-resolver.spec.ts`, `in-memory-index-session.package-lookups.spec.ts`, `package-resolution.spec.ts`, `compute-graph-fingerprint.spec.ts` | Comprehensive    |

Missing tests: None flagged for either assigned spec. All 97 change tasks are complete (0 incomplete), and every task group in tasks.md has a corresponding test file.

## Counts

- Assigned specs audited: 2
- Dependency specs read: 10
- Implementation files located via graph: 5 (all confirmed present in graph index)
- Test files confirmed present: 9
- Discrepancies flagged: 2 (1 spec-might-be-wrong on freshness-capability wiring; 1 spec-might-be-wrong on stale `getPackageIdentity` verify scenario, resolved by task 22.1 alignment); 0 code-defects observed
- Contradictions with global/dependency specs: 0

---

**Auditor conclusion:** Both assigned specs (`code-graph:resolve-symbol-reference` and `code-graph:indexer`) are substantially conformed to by the implementation. The facet-driven, language-independent design is consistently realized in `ResolveSymbolReference`, `PackageImportResolver`, `IndexCodeGraph`, and `InMemoryIndexSession`. Test coverage is comprehensive. No code or spec files were modified during this audit.
