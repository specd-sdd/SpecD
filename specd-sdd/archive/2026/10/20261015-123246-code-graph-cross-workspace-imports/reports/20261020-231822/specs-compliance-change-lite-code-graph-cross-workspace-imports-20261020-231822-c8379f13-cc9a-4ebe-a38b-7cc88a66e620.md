# Change compliance — code-graph-cross-workspace-imports

Session: `c8379f13-cc9a-4ebe-a38b-7cc88a66e620`

Checked targets: 207. Completed batches: 16. Workers: 11.

## Change violations

### [MEDIUM] Throwing identity does not disable the packageResolution facet for the run

- Issue key: `packages/code-graph/src/application/use-cases/index-code-graph.ts#packageIdentity:identity-throw-does-not-disable-facet`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-001`
- Targets: `code-graph:language-adapter/requirement:added:0001`
- Reason: Spec and design require an adapter whose identity, prepare or link throws to be treated as facet-absent for the rest of the run. prepare and link failures add the adapter to disabledPackageResolution, but the identity catch only records an error and continues, so the adapter still gets prepare and matchSpecifier and is not listed in adaptersWithoutPackageResolution.
- Evidence (design): `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/design.md:544` — identity/prepare/link failures treat adapter as having no facet
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts:1218` — prepare catch does disable
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts:886` — identity catch pushes error and continues without disabledPackageResolution.add
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts:496` — identity throw test asserts only error recorded and run completes
- Recommended decision: Add the adapter to disabledPackageResolution in the identity catch and assert it in the test

### [MEDIUM] resolveToPath targets unindexed absolute paths and multi-PSR-4 filter never matches

- Issue key: `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts#resolveQualifiedNameFromSession:unindexed-absolute-path-target`
- Occurrences: 1
- Origins: coherence
- Specs: `code-graph:php-language-adapter`
- Batches: `code-graph:php-language-adapter/batch-001`
- Targets: `code-graph:php-language-adapter/scenario:added:0006`
- Coherence reviews: `r1`
- Reason: Spec says an unindexed file is never targeted. With a single PSR-4 candidate resolveQualifiedNameFromSession returns the absolute path unchecked. With several candidates it filters by session.getFileId on absolute paths, but session files are workspace-prefixed (ws:rel), so it never matches and returns undefined. The resolveImports own-PSR-4 fallback has the same absolute-path getFileId check, so it can never succeed.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts:2271` — candidates[0] returned without index check; getFileId on absolute candidates
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts:983` — fallback getFileId(ownFile) with absolute path
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts:772` — asserts unindexed absolute path is returned

### [LOW] Throwing identity does not disable the adapter's packageResolution facet

- Issue key: `packages/code-graph/src/application/use-cases/index-code-graph.ts#IndexCodeGraph.execute:identity-throw-does-not-disable-facet`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-004`
- Targets: `code-graph:language-adapter/scenario:added:0007`
- Reason: Scenario requires an adapter whose identity, prepare, or link throws to be treated as lacking the facet for the rest of the run. prepare and link failures add the adapter to disabledPackageResolution, but an identity failure only records an error and continues, so matchSpecifier/entrySurface stay active and the adapter is not listed in adaptersWithoutPackageResolution.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts:886` — identity catch pushes error and continue without disabledPackageResolution.add (prepare 1218 and link 1232 do add)
- Evidence (spec): `code-graph:language-adapter` — Facet that throws in identity, prepare, or link does not stop the run

## Test coverage gaps

### [MEDIUM] Identity collision untested

- Issue key: `coverage:code-graph:indexer:identity-collision`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-003`
- Targets: `code-graph:indexer/scenario:added:0006`
- Reason: No test builds two workspaces with the same package identity and asserts the error naming both workspaces.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — package identity collision error near line 898
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — no collision case

### [LOW] No assertion that closure avoids reading unrelated files

- Issue key: `coverage:code-graph:indexer:closure-no-full-scan`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-004`
- Targets: `code-graph:indexer/scenario:added:0025`
- Reason: Closure uses persisted steps/bindings (collectAffectedFileClosure) but no test asserts unrelated files are not read or re-extracted.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — collectAffectedFileClosure (~1985)
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — lines 315-357 assert equality only

### [LOW] No test for duplicate package identity error

- Issue key: `coverage:code-graph:indexer:duplicate-package-identity-error`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-001`
- Targets: `code-graph:indexer/requirement:modified:0003`
- Reason: Spec requires an error naming both workspaces when two workspaces claim one package identity; implementation emits it but no test asserts it.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — identity collision error at L898-L903
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — no collision case

### [LOW] Manifest change and new-workspace closure untested at indexer level

- Issue key: `coverage:code-graph:indexer:manifest-change-and-new-workspace-closure`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-001`
- Targets: `code-graph:indexer/requirement:added:0002`
- Reason: Incremental tests cover entry, barrel, importer and target-file addition; none changes a package manifest or adds a workspace between runs (manifest change relies on fingerprint-mismatch full rebuild).
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — fingerprint mismatch path L687-L705
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — incremental cases at L315-L357 and L599

### [LOW] Manifest change to importer rebuild not asserted end-to-end

- Issue key: `coverage:code-graph:indexer:manifest-change-reaches-importers`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-004`
- Targets: `code-graph:indexer/scenario:added:0023`
- Reason: Only a fingerprint unit test shows exports/manifest change alters the fingerprint; no indexer-level test asserts the importing workspace result equals a clean rebuild after a target manifest change.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — fingerprint mismatch forces newFiles=allDiscoveredPaths (lines ~642-712)
- Evidence (test): `packages/code-graph/test/application/use-cases/compute-graph-fingerprint.spec.ts` — manifest change only changes fingerprint

### [LOW] Hydrated workspace prepare untested

- Issue key: `coverage:code-graph:indexer:prepare-receives-all-workspaces`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-003`
- Targets: `code-graph:indexer/scenario:added:0002`
- Reason: Incremental tests compare graph snapshots but none asserts prepare receives every workspace including unchanged ones; the order test only checks one prepare call.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — prepare call with packageWorkspaces near line 1208
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — order test near line 359 records no workspace list

### [LOW] Newly added workspace case untested

- Issue key: `coverage:code-graph:indexer:workspace-added-reconsidered`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-004`
- Targets: `code-graph:indexer/scenario:added:0024`
- Reason: Test at index-code-graph.package-imports.spec.ts:599 re-adds a missing file in a configured workspace; it does not add a previously unconfigured workspace in an incremental run.
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — line 599 file-reappears only

### [LOW] Unimported type workspace lookup unasserted

- Issue key: `coverage:CODE-GRAPH:INDEXERnimported-name-workspace-lookup`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-003`
- Targets: `code-graph:indexer/scenario:added:0005`
- Reason: No located test asserts that an unimported parameter type name still targets the single same-workspace symbol after the import change.
- Evidence (implementation): `packages/code-graph/src/domain/services/scoped-binding-environment.ts` — symbolLookup.findByName near line 446
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — only import-wins and cross-workspace cases found

### [LOW] No test that a facet does not imply a capability flag

- Issue key: `coverage:code-graph:language-adapter:facet-not-capability`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-005`
- Targets: `code-graph:language-adapter/scenario:added:0043`
- Reason: No test asserts that an adapter providing reExportLinking without hierarchy provenance cannot advertise hierarchy; conformance only checks advertised capabilities produce output.
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/language-adapter-conformance.spec.ts:714` — covers advertised capabilities only

### [LOW] Go facet omission not asserted

- Issue key: `coverage:code-graph:language-adapter:go-omits-relative-and-qualified-facets`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-004`
- Targets: `code-graph:language-adapter/scenario:added:0017`
- Reason: No test asserts the Go adapter exposes no relativeImportResolution or qualifiedNameResolution (scenarios 0015/0017 equivalent for Go).
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts` — no assertion on facet absence

### [LOW] No type-level test that former loose methods are absent

- Issue key: `coverage:code-graph:language-adapter:no-loose-methods-type-test`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-004`
- Targets: `code-graph:language-adapter/scenario:added:0001`
- Reason: Scenario states a type-level test checks LanguageAdapter declares none of the former loose methods and TypeScript adapter facet objects; only the missing qualifiedNameResolution is checked (package-resolution.spec.ts:450). No test references the removed method names.
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/package-resolution.spec.ts:450` — only qualifiedNameResolution absence asserted

### [LOW] No test asserts re-export linking reads no file

- Issue key: `coverage:code-graph:language-adapter:re-export-linking-no-io`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-005`
- Targets: `code-graph:language-adapter/scenario:added:0024`
- Reason: linkReExports only uses session state, but no test spies on filesystem access while link() runs.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts:2838` — linkReExports uses session only
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts:1190` — link tests assert bindings, not absence of I/O

### [LOW] Link-throw and identity-disables-facet not asserted

- Issue key: `coverage:code-graph:language-adapter:throw-identity-prepare-link-disables-facet`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-004`
- Targets: `code-graph:language-adapter/scenario:added:0007`
- Reason: Tests cover prepare throwing (adapter treated as absent) and identity throwing (error recorded, run completes), but none asserts the adapter is treated as absent after an identity failure, and no test makes reExportLinking.link throw.
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts:434` — prepare-throw test; identity-throw test at 496 only checks error and completion

### [LOW] No test deletes pyproject.toml before Python entrySurface

- Issue key: `coverage:code-graph:python-language-adapter:entry-surface-no-fs-read`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:python-language-adapter`
- Batches: `code-graph:python-language-adapter/batch-001`
- Targets: `code-graph:python-language-adapter/scenario:added:0008`
- Reason: Scenario requires entrySurface to still resolve after pyproject.toml files are deleted; Python entrySurface tests use a session only and never delete manifests (TypeScript has such a test, Python does not). Implementation is fs-free by inspection.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts` — entrySurface uses only session.getFileId
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/package-resolution.spec.ts` — Python entry surface block lines 234-284 lacks the manifest-deleted assertion (TS analog at line 180)

### [LOW] No test for positive name resolution via package **init**.py

- Issue key: `coverage:code-graph:python-language-adapter:package-import-uses-init`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:python-language-adapter`
- Batches: `code-graph:python-language-adapter/batch-001`
- Targets: `code-graph:python-language-adapter/scenario:added:0003`
- Reason: Scenario requires 'from acme_auth import make_client' to resolve to a name declared in acme_auth/**init**.py; existing Python tests only exercise **init** as a re-import alias (unresolved) and a module import.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts` — entrySurface returns **init**.py candidates (line ~376)
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.languages.spec.ts` — Python tests at lines 76 and 110 never declare a name in **init**.py
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/package-resolution.spec.ts` — Python entry surface returns **init** (line 252) but not name binding

### [LOW] Step following tested only with stub language

- Issue key: `coverage:code-graph:resolve-symbol-reference:import-package-step-all-languages`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:resolve-symbol-reference`
- Batches: `code-graph:resolve-symbol-reference/batch-001`
- Targets: `code-graph:resolve-symbol-reference/scenario:added:0003`
- Reason: No resolver test follows import:package steps from TypeScript, Python, Go, and PHP files; only the made-up stub adapter is exercised. Implementation has no language branch (generic step tracing).
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.language-independence.spec.ts:99` — stub language only

### [LOW] Provenance path of cross-workspace import not asserted

- Issue key: `coverage:code-graph:resolve-symbol-reference:package-import-provenance-path`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:resolve-symbol-reference`
- Batches: `code-graph:resolve-symbol-reference/batch-001`
- Targets: `code-graph:resolve-symbol-reference/scenario:added:0001`
- Reason: Only resolved status and target id are asserted for an import:package step; no test checks the ordered path local binding, import:package step, public binding, logical target.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts:788` — candidateFor with tracePath (generic)
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.language-independence.spec.ts:99` — asserts status and target id only

### [LOW] Namespace package import has no test

- Issue key: `coverage:code-graph:typescript-language-adapter:namespace-package-import`
- Occurrences: 3
- Origins: batch
- Specs: `code-graph:typescript-language-adapter`
- Batches: `code-graph:typescript-language-adapter/batch-001`
- Targets: `code-graph:typescript-language-adapter/scenario:added:0003`, `code-graph:typescript-language-adapter/scenario:added:0012`, `code-graph:typescript-language-adapter/scenario:added:0013`
- Reason: Implementation depends on entry files and binds no declaration, but no test asserts the namespace package import scenarios.
- Reason: Package-boundary namespace scenario (13) is the intended target of the earlier occurrence.
- Reason: Same gap for the package-boundary namespace scenario.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts` — resolvePackageImport namespace branch
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — no import \* as package case
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/package-resolution.spec.ts` — no namespace case
- Recommended decision: Add indexing test for namespace package import

### [LOW] Prepare read-once not asserted

- Issue key: `coverage:code-graph:typescript-language-adapter:prepare-reads-once`
- Occurrences: 2
- Origins: batch
- Specs: `code-graph:typescript-language-adapter`
- Batches: `code-graph:typescript-language-adapter/batch-001`
- Targets: `code-graph:typescript-language-adapter/scenario:added:0018`, `code-graph:typescript-language-adapter/scenario:added:0019`
- Reason: Scenario 19 (prepare reads once) has no read-count assertion.
- Reason: prepareWorkspaceManifest memoizes per codeRoot and entrySurface reads from session, but tests only check manifests are available (and survive deletion), not a single read per workspace.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts` — prepareWorkspaceManifest
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/package-resolution.spec.ts` — no read count
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/package-resolution.spec.ts` — Several workspaces prepare test, no read count

### [INFO] Prepare receiving hydrated workspaces untested

- Issue key: `coverage:code-graph:language-adapter:prepare-receives-hydrated-workspaces`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-004`
- Targets: `code-graph:language-adapter/scenario:added:0010`
- Reason: Prepare-once is asserted (spec:402), but no incremental test asserts prepare receives every configured workspace including hydrated-only ones; implementation passes all options.workspaces so behavior appears correct.
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts:404` — only once-count asserted

## Spec ambiguity or drift

### [MEDIUM] Constraints delta drops still-valid baseline constraints

- Issue key: `spec:code-graph:indexer#constraints:delta-replaces-whole-section`
- Occurrences: 7
- Origins: batch
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-002`
- Targets: `code-graph:indexer/constraint:removed:0001`, `code-graph:indexer/constraint:removed:0002`, `code-graph:indexer/constraint:removed:0003`, `code-graph:indexer/constraint:removed:0004`, `code-graph:indexer/constraint:removed:0005`, `code-graph:indexer/constraint:removed:0006`, `code-graph:indexer/constraint:removed:0007`
- Reason: The Constraints delta is op modified with full-section content, so merged Constraints keeps only 4 bullets and drops all 13 baseline bullets (incl. store lifecycle, normalized paths, excludePaths defaults, Pass1-before-Pass2, per-file errors collected). The delta description only mentions language independence and design.md does not retire these; implementation still honors them (e.g. per-file errors collected at index-code-graph.ts Pass 2 catch). Likely authoring error: use append/preserve.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — Pass 2 per-file catch pushes to errors (~1318)
- Evidence (spec): `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/deltas/code-graph/indexer/spec.md.delta.yaml` — modified Constraints replaces whole section
- Evidence (spec): `specs/code-graph/indexer/spec.md` — baseline Constraints lines 333-345
- Recommended decision: Rewrite delta to keep baseline constraints (or explicitly justify each removal) and add the new bullets

### [LOW] entrySurface does not itself exclude test files

- Issue key: `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts#entryCandidatePaths:entry-surface-includes-test-files`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-004`
- Targets: `code-graph:language-adapter/scenario:added:0013`
- Reason: Scenario says entrySurface does not return a candidate classified as a test. TypeScript entryCandidatePaths filters only on indexed status; the exclusion is applied afterwards by PackageImportResolver.entryFiles (session.getFileCategory). Observable behavior through the indexer satisfies it, but the facet contract as written is not met at the facet level; indexer spec phrases it as helper filtering.
- Evidence (implementation): `packages/code-graph/src/application/services/package-import-resolver.ts:76` — resolver filters category test
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts:3013` — entryCandidatePaths filters getFileId only
- Evidence (spec): `code-graph:indexer` — Test files are not entries (helper filters entries)

### [INFO] Garbled sentence in Resolution manifests rule

- Issue key: `spec:code-graph:go-language-adapter:resolution-manifests-duplicated-phrase`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:go-language-adapter`
- Batches: `code-graph:go-language-adapter/batch-001`
- Targets: `code-graph:go-language-adapter/requirement:modified:0002`
- Reason: Merged text reads Package identity and the package identity comes from the module path; intent is unambiguous editing artifact.
- Evidence (spec): `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports` — go-language-adapter Resolution manifests merged rule

## Counts

- Workers completed: 11
- Clean batches: 5
- Batches with issues: 11
- Blocked batches: 0
- Batch handoffs: 16
- Coherence reviews completed: 2
- Blocked coherence reviews: 0
- Unique issues: 26
- Finding occurrences: 35
