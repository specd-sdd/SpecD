# Change compliance — code-graph-cross-workspace-imports

Session: `f92c17e5-ec29-43ce-a947-b3f948e7929d`

Checked targets: 207. Completed batches: 16. Workers: 7.

## Change violations

### [HIGH] Throwing identity aborts the run

- Issue key: `packages/code-graph/src/application/use-cases/index-code-graph.ts#identity:uncaught-throw`
- Occurrences: 1
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-004`
- Targets: `code-graph:indexer/scenario:added:0019`
- Reason: packageResolution.identity is called without try/catch in the package-map loop, so a throwing identity propagates and stops the run instead of being recorded as an indexing error.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts:884-901`
- Evidence (task): `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/tasks.md:423` — task 23.1 still open

### [HIGH] identity() throw aborts the whole indexing run

- Issue key: `packages/code-graph/src/application/use-cases/index-code-graph.ts#packageResolution.identity:uncaught-aborts-run`
- Occurrences: 1
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-004`
- Targets: `code-graph:language-adapter/scenario:added:0007`
- Reason: The packageToWorkspace loop calls facet.identity with no try/catch (outer try has only finally), so a throwing identity rejects the run instead of recording an error, disabling the facet and indexing other adapters/workspaces.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — lines 884-901 (contrast prepare/link guarded at 1197-1224)
- Recommended decision: Wrap identity in try/catch, push error and add adapter to disabledPackageResolution

### [HIGH] Fallback targets unindexed PSR-4 file

- Issue key: `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts#resolveImports:unindexed-psr4-fallback`
- Occurrences: 1
- Specs: `code-graph:php-language-adapter`
- Batches: `code-graph:php-language-adapter/batch-001`
- Targets: `code-graph:php-language-adapter/scenario:added:0006`
- Reason: When the shared helper is unresolved, resolveImports falls back to resolveQualifiedNameFromSession, which returns the single PSR-4 candidate without checking it is indexed and pushes that absolute path into fileImports, after a diagnostic was already emitted.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts:2268-2279`
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts:978-990`

### [MEDIUM] Identity not first-adapter-wins

- Issue key: `packages/code-graph/src/application/use-cases/index-code-graph.ts#identity:first-adapter-wins`
- Occurrences: 1
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-004`
- Targets: `code-graph:indexer/scenario:added:0020`
- Reason: The package-map loop asks every adapter with the facet for every workspace and never stops after the first non-undefined identity, so a second adapter is still asked and may add another mapping.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts:884-901`
- Evidence (task): `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/tasks.md:423` — task 23.1 still open

### [MEDIUM] adaptersWithoutPackageResolution not provided; facet-absent counted in total

- Issue key: `packages/code-graph/src/application/use-cases/index-code-graph.ts#importDiagnostics:adapters-without-package-resolution-missing`
- Occurrences: 1
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-004`
- Targets: `code-graph:language-adapter/scenario:added:0004`
- Reason: Run result has no importDiagnostics.adaptersWithoutPackageResolution; absent-facet adapters are recorded as a facet-absent diagnostic that is counted in total/byReason/samples, contradicting the scenario and design.md line 105.
- Evidence (design): `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/design.md` — line 105 says facet-absent never counted in total
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — lines 936-942 and 1931-1936
- Evidence (implementation): `packages/code-graph/src/domain/value-objects/index-result.ts` — ImportDiagnosticSummary lines 72-84 lacks the field
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — line 454 asserts byReason facet-absent >= 1 (opposite)
- Recommended decision: Add adaptersWithoutPackageResolution to summary, exclude facet-absent adapter notices from total/byReason, update test and docs

### [MEDIUM] Missing facet counted as import failure; adaptersWithoutPackageResolution absent

- Issue key: `packages/code-graph/src/application/use-cases/index-code-graph.ts#importDiagnostics:adaptersWithoutPackageResolution-missing`
- Occurrences: 1
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-001`
- Targets: `code-graph:language-adapter/requirement:added:0001`
- Reason: Spec requires listing adapters lacking packageResolution in importDiagnostics.adaptersWithoutPackageResolution and never counting them in total. Indexer records facet-absent via recordImportDiagnostic, which increments total/byReason and samples; ImportDiagnosticSummary has no adaptersWithoutPackageResolution field.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — lines 934-942 record facet-absent via recordImportDiagnostic; total sums counts at ~1931
- Evidence (implementation): `packages/code-graph/src/domain/value-objects/index-result.ts` — ImportDiagnosticSummary lacks the field
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — line 425 test asserts byReason facet-absent >= 1, contradicting the spec
- Recommended decision: Add the field and exclude facet-absent from total/byReason, or amend the spec if counting is intended

### [MEDIUM] adaptersWithoutPackageResolution not reported; facet-absent counted as failure

- Issue key: `packages/code-graph/src/application/use-cases/index-code-graph.ts#IndexCodeGraph:adaptersWithoutPackageResolution-missing`
- Occurrences: 2
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-001`
- Targets: `code-graph:indexer/requirement:added:0001`, `code-graph:indexer/requirement:modified:0003`
- Reason: Spec requires importDiagnostics.adaptersWithoutPackageResolution listing adapters lacking the facet, never counted in total/byReason/samples. ImportDiagnosticSummary has no such field and the indexer records one facet-absent diagnostic per adapter through recordImportDiagnostic, inflating total, byReason and samples.
- Reason: importDiagnostics summary omits adaptersWithoutPackageResolution and facet-absent entries are counted in total/byReason/samples, contrary to the modified requirement.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — lines 934-942 facet-absent recorded as diagnostic; 1931-1936 summary lacks field
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — lines 934-942, 1931-1936
- Evidence (implementation): `packages/code-graph/src/domain/value-objects/index-result.ts` — ImportDiagnosticSummary has no adaptersWithoutPackageResolution
- Evidence (spec): `code-graph:indexer` — Cross-workspace package resolution
- Evidence (spec): `code-graph:indexer` — Facet-driven language independence
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — test at line 396 asserts a diagnostic names the missing facet

### [MEDIUM] Package identity step lacks failure isolation and first-adapter-wins

- Issue key: `packages/code-graph/src/application/use-cases/index-code-graph.ts#IndexCodeGraph:package-identity-failure-and-first-wins`
- Occurrences: 1
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-001`
- Targets: `code-graph:indexer/requirement:modified:0003`
- Reason: Spec: identity failure is recorded as an indexing error, adapter treated as not providing facet for that workspace, run continues; first adapter returning identity wins and later adapters are not asked. Code calls packageResolution.identity for every adapter and workspace without try/catch, and does not stop after the first adapter that returned an identity (a second adapter could register another package name for the same workspace).
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — lines 883-904
- Evidence (spec): `code-graph:indexer` — Cross-workspace package resolution

### [MEDIUM] Throwing identity() aborts the run instead of disabling the facet

- Issue key: `packages/code-graph/src/application/use-cases/index-code-graph.ts#packageResolution.identity:unisolated-throw`
- Occurrences: 2
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-001`, `code-graph:language-adapter/batch-002`
- Targets: `code-graph:language-adapter/requirement:added:0001`, `code-graph:language-adapter/requirement:modified:0002`
- Reason: Package identity is obtained through packageResolution.identity in an unguarded loop; a throwing adapter aborts indexing rather than being treated as lacking the facet.
- Reason: Spec: a throw inside identity is recorded as an indexing error and the adapter is treated as lacking the facet for the rest of the run. The identity loop calls adapter.packageResolution.identity without try/catch and never adds the adapter to disabledPackageResolution, so the exception propagates out of execute. Only prepare and link are guarded.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — lines 1196-1211 prepare is guarded, for contrast
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — lines 884-901 unguarded identity call
- Recommended decision: Wrap identity in try/catch, push an error, add adapter to disabledPackageResolution

### [MEDIUM] Absent facet counted as failure; no adaptersWithoutPackageResolution

- Issue key: `packages/code-graph/src/domain/value-objects/index-result.ts#importDiagnostics:adaptersWithoutPackageResolution`
- Occurrences: 1
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-004`
- Targets: `code-graph:indexer/scenario:added:0018`
- Reason: IndexResult.importDiagnostics has no adaptersWithoutPackageResolution, and the run records facet-absent through recordImportDiagnostic so it is counted in total, byReason and samples. The spec forbids counting it.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts:1931-1936`
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts:935-943`
- Evidence (implementation): `packages/code-graph/src/domain/value-objects/index-result.ts:72-84`
- Evidence (task): `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/tasks.md:427` — task 23.2 still open
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts:396` — asserts facet-absent appears in samples

### [MEDIUM] PHP resolveToPath reads composer.json on every call

- Issue key: `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts#qualifiedNameResolution.resolveToPath:reads-composer-json-per-call`
- Occurrences: 3
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-003`, `code-graph:language-adapter/batch-004`
- Targets: `code-graph:language-adapter/constraint:added:0003`, `code-graph:language-adapter/constraint:added:0005`, `code-graph:language-adapter/scenario:added:0019`
- Reason: resolveToPath rebuilds the PSR-4 map from disk per call and takes no session, so it cannot use prepared metadata; deleting composer.json after prepare breaks it, contradicting the facet I/O constraint and the scenario.
- Evidence (implementation): `packages/code-graph/src/domain/value-objects/language-adapter-facets.ts` — QualifiedNameResolutionFacet.resolveToPath(qualifiedName, codeRoot, repoRoot) has no session parameter
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts` — resolveQualifiedNameToPath (~2322) calls buildPsr4Map -> findManifestField (readFileSync) each call
- Recommended decision: Read prepared psr4ByCodeRoot from the session (add session arg or per-codeRoot cache populated in prepare) or decide the delta wording

### [MEDIUM] resolveToPath keeps legacy repoRoot signature and reads the filesystem

- Issue key: `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts#resolveToPath:fs-read-no-session`
- Occurrences: 2
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-001`, `code-graph:language-adapter/batch-002`
- Targets: `code-graph:language-adapter/requirement:added:0004`, `code-graph:language-adapter/requirement:modified:0003`
- Reason: Import specifier resolution requires Pass 2 qualified-name metadata to come from prepared session state; facet resolveToPath still rebuilds PSR-4 map from composer.json per call.
- Reason: Spec: resolveToPath(qualifiedName, codeRoot, session) uses only session-prepared metadata and MUST NOT read the filesystem. Facet interface and PHP facet take (qualifiedName, codeRoot, repoRoot?), and buildPsr4Map re-reads composer.json on every call. resolveQualifiedNameFromSession exists but is not exposed through the facet. tasks.md 23.8 is unchecked.
- Evidence (design): `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/design.md` — line 267 specifies the session parameter
- Evidence (implementation): `packages/code-graph/src/domain/value-objects/language-adapter-facets.ts` — QualifiedNameResolutionFacet.resolveToPath signature
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts` — lines 493 and 2322-2331 resolveQualifiedNameToPath uses buildPsr4Map (file I/O)
- Evidence (task): `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/tasks.md` — item 23.8 unchecked
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts` — lines 684-730 exercise the filesystem-based signature
- Recommended decision: Complete task 23.8
- Recommended decision: Complete task 23.8: take session, delegate to resolveQualifiedNameFromSession, update tests and docs

### [MEDIUM] resolveToPath reads composer.json from disk

- Issue key: `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts#resolveToPath:reads-filesystem`
- Occurrences: 1
- Specs: `code-graph:php-language-adapter`
- Batches: `code-graph:php-language-adapter/batch-001`
- Targets: `code-graph:php-language-adapter/requirement:modified:0001`
- Reason: qualifiedNameResolution.resolveToPath takes (qualifiedName, codeRoot, repoRoot) and rebuilds the PSR-4 map from the filesystem; spec requires reading the session-prepared map with no filesystem fallback.
- Evidence (design): `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/design.md:267`
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts:2322-2329`
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts:493`
- Evidence (task): `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/tasks.md:451` — task 23.8 still open

### [MEDIUM] main used although exports is defined

- Issue key: `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts#publishedTargets:main-fallback-with-exports`
- Occurrences: 1
- Specs: `code-graph:typescript-language-adapter`
- Batches: `code-graph:typescript-language-adapter/batch-001`
- Targets: `code-graph:typescript-language-adapter/scenario:added:0011`
- Reason: Spec says main is used only when exports is absent and a defined exports without '.' yields no candidates. publishedTargets falls back to manifest.main for subpath '.' whenever exports yields no runtime/types target, so exports without '.' (or with only unsupported conditions) still resolves via main.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts` — publishedTargets pushes manifest.main when exports gave no target
- Evidence (spec): `specs/code-graph/typescript-language-adapter/spec.md` — scenario main is ignored when exports is defined
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/package-resolution.spec.ts` — no test for exports without '.' plus main
- Recommended decision: Fall back to main only when manifest.exports is undefined; add scenario test

### [LOW] Adapter guide diverges from spec rules

- Issue key: `docs/code-graph/language-adapters.md#guide-restates-different-rules`
- Occurrences: 1
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-001`
- Targets: `code-graph:language-adapter/requirement:added:0008`
- Reason: Spec requires the page to state the same rules. Page documents resolveToPath(..., repoRoot?) rather than session; says entrySurface may return test files when explicitly addressed (spec: MUST NOT); checklist steps 6 and 7 differ (spec: pass cross-language conformance suite and facet scenarios; add to built-in adapter specs list).
- Evidence (documentation): `docs/code-graph/language-adapters.md` — resolveToPath row, entrySurface rules, checklist steps 6-7
- Evidence (spec): `code-graph:language-adapter` — Adding a language adapter steps 6-7; Package resolution facet
- Recommended decision: Align page and spec after deciding which is authoritative

## Test coverage gaps

### [MEDIUM] Package identity collision error untested

- Issue key: `coverage:code-graph:indexer:identity-collision-error`
- Occurrences: 1
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-003`
- Targets: `code-graph:indexer/scenario:added:0006`
- Reason: No test builds two workspaces with the same package identity and asserts an error naming both workspaces.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts:889` — collision branch
- Evidence (test): `packages/code-graph/test/application/use-cases` — no collision test found

### [MEDIUM] Identity first-wins untested

- Issue key: `coverage:code-graph:indexer:identity-first-wins`
- Occurrences: 1
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-004`
- Targets: `code-graph:indexer/scenario:added:0020`
- Reason: No test registers two adapters answering for one workspace.
- Evidence (test): `packages/code-graph/test/application/use-cases` — no such test

### [MEDIUM] Throwing identity untested

- Issue key: `coverage:code-graph:indexer:throwing-identity`
- Occurrences: 1
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-004`
- Targets: `code-graph:indexer/scenario:added:0019`
- Reason: No test covers an adapter whose identity throws.
- Evidence (test): `packages/code-graph/test/application/use-cases` — no such test

### [MEDIUM] No tests for identity or link throwing

- Issue key: `coverage:code-graph:language-adapter:facet-throw-identity-link`
- Occurrences: 2
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-001`, `code-graph:language-adapter/batch-004`
- Targets: `code-graph:language-adapter/requirement:added:0001`, `code-graph:language-adapter/scenario:added:0007`
- Reason: Only a prepare-throws test exists; identity and link failure isolation are unasserted (identity actually fails).
- Reason: Only a throwing packageResolution.prepare is tested for facet error isolation; identity and link failures are untested.
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — line 425 is the only facet-throw test
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — line 425 only prepare throws

### [MEDIUM] Submodule import dependency untested

- Issue key: `coverage:code-graph:python-language-adapter:submodule-import`
- Occurrences: 1
- Specs: `code-graph:python-language-adapter`
- Batches: `code-graph:python-language-adapter/batch-001`
- Targets: `code-graph:python-language-adapter/scenario:added:0004`
- Reason: No test asserts that 'from pkg import models' (not published by **init**) adds a file dependency on models.py with no binding.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts` — resolveImports submodule fallback
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.languages.spec.ts` — only re-imported alias case covered

### [LOW] Go package-unknown reason not asserted at adapter level

- Issue key: `coverage:code-graph:go-language-adapter:unknown-module-reason`
- Occurrences: 1
- Specs: `code-graph:go-language-adapter`
- Batches: `code-graph:go-language-adapter/batch-001`
- Targets: `code-graph:go-language-adapter/scenario:added:0006`
- Reason: The unknown-module test asserts only empty fileImports, not the package-unknown diagnostic reason.
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts` — import resolution block

### [LOW] Closure not-scanning-every-file untested

- Issue key: `coverage:code-graph:indexer:closure-no-scan`
- Occurrences: 1
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-004`
- Targets: `code-graph:indexer/scenario:added:0025`
- Reason: No test asserts importers of a changed entry are found from persisted steps without re-reading unrelated files.
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts:304` — asserts graph equality only

### [LOW] Incremental closure for newly added workspace or manifest change not asserted end to end

- Issue key: `coverage:code-graph:indexer:incremental-new-workspace-manifest-closure`
- Occurrences: 1
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-001`
- Targets: `code-graph:indexer/requirement:added:0002`
- Reason: Incremental tests cover entry, barrel and importer changes; none asserts a previously unresolved import resolving when its target workspace is newly added, or an identity-altering manifest edit re-resolving importers (manifest change tested only at fingerprint/full-rebuild level).
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — lines 304-346
- Evidence (test): `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts` — manifest change asserts full rebuild only

### [LOW] Newly added workspace incremental package import untested

- Issue key: `coverage:code-graph:indexer:newly-added-workspace-resolves-package-import`
- Occurrences: 1
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-004`
- Targets: `code-graph:indexer/scenario:added:0024`
- Reason: Incremental tests cover relative-import additions and entry/barrel/importer changes, not a package import that becomes resolvable when its target workspace is added.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts:808-812`
- Evidence (test): `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts:254` — relative import only

### [LOW] No tests for identity failure, collision error, first-adapter-wins, adaptersWithoutPackageResolution

- Issue key: `coverage:code-graph:indexer:package-identity-failure-collision-first-wins`
- Occurrences: 1
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-001`
- Targets: `code-graph:indexer/requirement:modified:0003`
- Reason: No test asserts identity throw isolation, the two-workspace collision error, first-adapter-wins, or the adaptersWithoutPackageResolution list; only prepare-throw is tested.
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — prepare-throw covered at line 425 only

### [LOW] No test that prepare receives unchanged workspaces

- Issue key: `coverage:code-graph:indexer:prepare-receives-hydrated-workspaces`
- Occurrences: 1
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-003`
- Targets: `code-graph:indexer/scenario:added:0002`
- Reason: No test asserts that packageResolution.prepare receives every workspace in an incremental run where only one workspace changed.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts:1199`
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts:348` — only asserts call order and one prepare call

### [LOW] No test separating hierarchy capability from absent packageResolution

- Issue key: `coverage:code-graph:language-adapter:capabilities-vs-facets`
- Occurrences: 1
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-004`
- Targets: `code-graph:language-adapter/scenario:added:0002`
- Reason: No test combines capabilities().hierarchy true with no packageResolution and checks both outcomes.
- Evidence (test): `packages/code-graph/test` — no matching case found

### [LOW] matchSpecifier purity unasserted

- Issue key: `coverage:code-graph:language-adapter:entry-surface-match-purity`
- Occurrences: 2
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-004`
- Targets: `code-graph:language-adapter/scenario:added:0010`, `code-graph:language-adapter/scenario:added:0014`
- Reason: No-fs assertions cover resolveImports/buildRelations only; entrySurface and matchSpecifier repeat-call purity is not asserted.
- Reason: Same gap.
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/language-adapter-conformance.spec.ts` — lines 1037-1075
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/language-adapter-conformance.spec.ts` — lines 1037-1075 cover pass-2 relations only

### [LOW] No test for per-file facet throw isolation

- Issue key: `coverage:code-graph:language-adapter:facet-throw-per-file`
- Occurrences: 1
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-004`
- Targets: `code-graph:language-adapter/scenario:added:0006`
- Reason: No test makes matchSpecifier/entrySurface/resolve throw for one file and checks other files still index.
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — no per-file throw case

### [LOW] No test for facet/capability separation

- Issue key: `coverage:code-graph:language-adapter:facet-vs-capability-flag`
- Occurrences: 1
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-005`
- Targets: `code-graph:language-adapter/scenario:added:0040`
- Reason: No test asserts capability flags and facets are independent declarations (hierarchy true without packageResolution, or reExportLinking not implying hierarchy).
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/adapter-registry.ts`
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/adapter-registry.spec.ts` — no-capability-vs-facet-assertion

### [LOW] No test that Go omits qualified-name facet

- Issue key: `coverage:code-graph:language-adapter:go-omits-facets`
- Occurrences: 2
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-004`
- Targets: `code-graph:language-adapter/scenario:added:0017`, `code-graph:language-adapter/scenario:added:0020`
- Reason: No assertion that GoLanguageAdapter.relativeImportResolution and qualifiedNameResolution are undefined.
- Reason: Same gap as relative facet omission.
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts` — no such assertion

### [LOW] No type-level test that loose adapter methods are gone

- Issue key: `coverage:code-graph:language-adapter:loose-methods-removed`
- Occurrences: 1
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-004`
- Targets: `code-graph:language-adapter/scenario:added:0001`
- Reason: No expectTypeOf/ts-expect-error assertion that LanguageAdapter lacks getPackageIdentity, resolvePackageFromSpecifier, etc., nor a TS facet-shape assertion.
- Evidence (test): `packages/code-graph/test` — no matching assertion found by search

### [LOW] No test deletes composer.json before resolveToPath

- Issue key: `coverage:code-graph:language-adapter:qualified-name-prepared-metadata`
- Occurrences: 1
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-004`
- Targets: `code-graph:language-adapter/scenario:added:0019`
- Reason: Existing PHP tests write composer.json and read it back; none asserts no filesystem access after preparation.
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts` — lines 692-735

### [LOW] Cross-workspace longest-prefix untested

- Issue key: `coverage:code-graph:php-language-adapter:longest-prefix-cross-workspace`
- Occurrences: 1
- Specs: `code-graph:php-language-adapter`
- Batches: `code-graph:php-language-adapter/batch-001`
- Targets: `code-graph:php-language-adapter/scenario:added:0002`
- Reason: Longest prefix is tested only within one workspace map (resolveQualifiedNameToPath), not across workspaces via matchSpecifier.
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts:696`

### [LOW] Python entrySurface no-filesystem-read untested

- Issue key: `coverage:code-graph:python-language-adapter:entry-surface-no-fs-read`
- Occurrences: 1
- Specs: `code-graph:python-language-adapter`
- Batches: `code-graph:python-language-adapter/batch-001`
- Targets: `code-graph:python-language-adapter/scenario:added:0008`
- Reason: No test deletes pyproject.toml after identity and asserts entrySurface still resolves, unlike the TypeScript equivalent.
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/package-resolution.spec.ts` — Python entry surface block

### [LOW] Python init-resolve and unknown-project scenarios untested

- Issue key: `coverage:code-graph:python-language-adapter:init-import-and-unknown-project`
- Occurrences: 1
- Specs: `code-graph:python-language-adapter`
- Batches: `code-graph:python-language-adapter/batch-001`
- Targets: `code-graph:python-language-adapter/scenario:added:0003`
- Reason: No Python test asserts a name published by **init**.py resolves, nor that an unknown absolute import yields package-unknown with nothing persisted, nor the name-found-elsewhere case.
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.languages.spec.ts` — Python case covers only models import and re-imported alias

### [LOW] Provenance path and same-name no-guess only partly asserted

- Issue key: `coverage:code-graph:resolve-symbol-reference:package-import-path-and-no-guess`
- Occurrences: 1
- Specs: `code-graph:resolve-symbol-reference`
- Batches: `code-graph:resolve-symbol-reference/batch-001`
- Targets: `code-graph:resolve-symbol-reference/scenario:added:0001`
- Reason: Language-independence test asserts resolved target and a non-existent name stays unresolved, but not the ordered path (local binding, import:package, public binding, target) nor the case where a unique same-name symbol exists in the package workspace.
- Evidence (implementation): `packages/code-graph/src/application/services/package-import-resolver.ts`
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.language-independence.spec.ts` — 99-125

### [LOW] Default/namespace package import not asserted

- Issue key: `coverage:code-graph:typescript-language-adapter:default-namespace-package-import`
- Occurrences: 1
- Specs: `code-graph:typescript-language-adapter`
- Batches: `code-graph:typescript-language-adapter/batch-001`
- Targets: `code-graph:typescript-language-adapter/scenario:added:0012`
- Reason: No test asserts that a default package import binds the single default declaration, or that a namespace package import depends on entry files and creates a namespace binding.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts` — resolvePackageImport
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — no default/namespace package import case

## Spec ambiguity or drift

### [LOW] Constraints replacement drops two constraints silently

- Issue key: `spec:code-graph:indexer:constraints-section-replaced`
- Occurrences: 1
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-003`
- Targets: `code-graph:indexer/constraint:removed:0008`
- Reason: The delta replaces the whole Constraints section. Six constraints are removed; four are restated in requirement text, but the specs() callback exclusive/no filesystem fallback and the Pass 2 depends on Pass 1 for ALL workspaces constraints have no replacement as constraints. Confirm the removal is intended or restore them.
- Evidence (spec): `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/deltas/code-graph/indexer/spec.md.delta.yaml:103` — Constraints op replaces the section
- Recommended decision: Restore the two dropped constraints or document the removal

## Counts

- Workers completed: 7
- Clean batches: 3
- Batches with issues: 13
- Blocked batches: 0
- Unique issues: 39
- Finding occurrences: 47
