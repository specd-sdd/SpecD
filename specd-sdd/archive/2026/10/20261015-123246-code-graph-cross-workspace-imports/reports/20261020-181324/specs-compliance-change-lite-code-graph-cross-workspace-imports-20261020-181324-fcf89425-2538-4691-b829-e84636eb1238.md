# Change compliance — code-graph-cross-workspace-imports

Session: `fcf89425-2538-4691-b829-e84636eb1238`

Checked targets: 199. Completed batches: 16. Workers: 16.

## Change violations

### [MEDIUM] Test entries discarded unconditionally

- Spec: `code-graph:indexer`
- Batch: `batch-004`
- Target: `scenario:added:0010`
- Reason: Spec says a test-classified entry candidate is discarded unless the specifier addresses it; resolver filters category test with no exception branch.
- Evidence (implementation): `packages/code-graph/src/application/services/package-import-resolver.ts` — entryFiles filter drops category test unconditionally
- Evidence (test): `packages/code-graph/test/application/services/package-import-resolver.spec.ts` — only the discard half is asserted

### [MEDIUM] PHP resolveToPath performs uncached filesystem I/O

- Spec: `code-graph:language-adapter`
- Batch: `batch-003`
- Target: `constraint:added:0003`
- Reason: qualifiedNameResolution.resolveToPath in the PHP adapter calls buildPsr4Map, which walks up and reads composer.json via findManifestField on every call. Only packageResolution.identity and prepare may perform I/O.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts` — resolveToPath -> resolveQualifiedNameToPath -> buildPsr4Map -> findManifestField
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/find-manifest-field.ts` — sync existsSync/readFileSync
- Recommended decision: Parse composer.json autoload metadata in packageResolution.prepare and have resolveToPath read session or codeRoot prepared state

### [MEDIUM] symbolReferenceSyntax.render signature differs from spec

- Spec: `code-graph:language-adapter`
- Batch: `batch-001`
- Target: `requirement:added:0005`
- Reason: Spec requires render(member: LogicalSymbol, options?: RenderSymbolReferenceOptions): RenderedSymbolReference; implementation declares render(symbol, ownerPath: readonly string[]) returning an inline {generic; native?} type. RenderSymbolReferenceOptions and RenderedSymbolReference types do not exist, and all adapters plus docs follow the divergent signature.
- Evidence (implementation): `packages/code-graph/src/domain/value-objects/language-adapter-facets.ts` — SymbolReferenceSyntaxFacet.render
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts` — render takes symbol and ownerPath
- Evidence (other): `docs/code-graph/language-adapters.md` — render takes symbol and ownerPath
- Recommended decision: Align the facet signature and add the named types, or amend the spec to the ownerPath form

### [MEDIUM] Python packageResolution.prepare is a no-op

- Spec: `code-graph:python-language-adapter`
- Batch: `batch-001`
- Target: `requirement:modified:0001`
- Reason: Spec requires prepare to read each workspace pyproject.toml once and entrySurface to use only that stored data plus the indexed file set; prepare is a no-op and entrySurface hardcodes src/ and workspace-root candidates without stored project name or code root.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts` — prepare returns undefined; entrySurface ignores prepared data

### [MEDIUM] Submodule import creates no namespace binding

- Spec: `code-graph:python-language-adapter`
- Batch: `batch-001`
- Target: `scenario:added:0004`
- Reason: from pkg import models adds the file dependency but the code only continues; no namespace binding of models to the module is created. No test covers this scenario.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts` — submodule branch near line 981
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/python-language-adapter.spec.ts` — no submodule-from-package test

### [LOW] Test-entry filter ignores explicit specifier

- Spec: `code-graph:indexer`
- Batch: `batch-001`
- Target: `requirement:modified:0003`
- Reason: Spec keeps test entries when the specifier addresses that file explicitly; resolver always drops test-category entries.
- Evidence (implementation): `packages/code-graph/src/application/services/package-import-resolver.ts` — entryFiles filter on getFileCategory

### [LOW] PHP resolveToPath does not use prepared autoloader metadata

- Spec: `code-graph:language-adapter`
- Batch: `batch-003`
- Target: `constraint:added:0005`
- Reason: The SHOULD to read parsed autoloader metadata prepared per codeRoot or session is not met: PHP resolveToPath re-reads and re-parses composer.json on each call, with no session or per-codeRoot cache.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts` — buildPsr4Map called from resolveQualifiedNameToPath without caching

### [LOW] Docs checklist steps 6-7 differ from spec steps

- Spec: `code-graph:language-adapter`
- Batch: `batch-001`
- Target: `requirement:added:0008`
- Reason: Spec requires the docs page to state the same rules. Spec step 6 is passing the cross-language conformance suite and facet scenarios; step 7 is writing the adapter spec and adding it to the built-in list. Docs step 6 lists ad hoc test items and step 7 omits the built-in list.
- Evidence (spec): `code-graph:language-adapter` — Adding a language adapter steps 6-7
- Evidence (other): `docs/code-graph/language-adapters.md` — Checklist for a new language steps 6-7
- Recommended decision: Align docs wording with spec

### [LOW] Manifest data not stored by prepare

- Spec: `code-graph:python-language-adapter`
- Batch: `batch-001`
- Target: `requirement:modified:0002`
- Reason: Spec says package identity and the data stored by packageResolution.prepare come from [project].name; prepare stores nothing, identity is read separately via getPackageIdentity.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts` — prepare no-op

## Test coverage gaps

### [MEDIUM] No test asserts facet-only adapter shape

- Spec: `code-graph:language-adapter`
- Batch: `batch-004`
- Target: `scenario:added:0001`
- Reason: No test inspects the TypeScript adapter for facet objects and absence of loose getPackageIdentity/resolvePackageFromSpecifier/etc. methods (they are private class methods, never asserted absent from the public surface).
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts` — facets declared, loose methods private
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts` — no assertion on absent loose members

### [MEDIUM] No test for capability flags vs facets independence

- Spec: `code-graph:language-adapter`
- Batch: `batch-004`
- Target: `scenario:added:0002`
- Reason: No test sets capabilities().hierarchy true with no packageResolution and checks the indexer treats hierarchy as supported and package resolution as absent.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — packageResolution presence gating
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — only core-only adapter test, no capability flag combination

### [MEDIUM] Per-file facet throw not tested

- Spec: `code-graph:language-adapter`
- Batch: `batch-004`
- Target: `scenario:added:0006`
- Reason: Tests cover prepare throwing, but none covers a present facet throwing for a single file's import resolution with the error recorded and other files still indexed.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — try/catch around resolution passes
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — only prepare-throws case (line ~425)

### [MEDIUM] No test asserts composer.json read once per workspace

- Spec: `code-graph:php-language-adapter`
- Batch: `batch-001`
- Target: `scenario:added:0006`
- Reason: No test counts composer.json reads during packageResolution.prepare or asserts Pass 2 does no filesystem reads; prepare also reads each composer.json twice for identity and PSR-4 map.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts` — preparePackages calls buildPsr4Map and getPackageIdentity per workspace
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/package-resolution.spec.ts` — PHP prepared helper has no read-count assertion

### [MEDIUM] No test that prepare reads pyproject once

- Spec: `code-graph:python-language-adapter`
- Batch: `batch-001`
- Target: `scenario:added:0008`
- Reason: No test exercises Python packageResolution.prepare or asserts one read per pyproject.toml and no filesystem read in entrySurface; prepare does nothing.
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/package-resolution.spec.ts` — Python entry surface has no prepare test

### [MEDIUM] Provenance path not asserted

- Spec: `code-graph:resolve-symbol-reference`
- Batch: `batch-001`
- Target: `scenario:added:0001`
- Reason: The resolver test only checks status resolved and that the target id contains zlib; it does not assert the ordered path (local binding, import:package step, public binding, logical target).
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.language-independence.spec.ts` — resolved.target id contains zlib only; no path assertion
- Evidence (implementation): `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts` — tracePaths builds the path generically
- Recommended decision: Assert result path steps and kinds in the cross-workspace resolve test.

### [MEDIUM] No same-name symbol trap in unresolved test

- Spec: `code-graph:resolve-symbol-reference`
- Batch: `batch-001`
- Target: `scenario:added:0002`
- Reason: The unresolved fixture imports Missing, which does not exist anywhere in zlib, so the test cannot prove a unique same-name symbol in the package workspace is not chosen.
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.language-independence.spec.ts` — Missing is not declared in zlib/src/lib.z2
- Recommended decision: Add a fixture where the package workspace declares the name once but does not export it, and assert unresolved.

### [LOW] No test asserts Pass 2 performs no filesystem I/O

- Spec: `code-graph:indexer`
- Batch: `batch-002`
- Target: `constraint:added:0004`
- Reason: Implementation shows no fs use in package-import-resolver or the Pass 2 import loop, but no test spies on or forbids filesystem access during Pass 2 import resolution.
- Evidence (implementation): `packages/code-graph/src/application/services/package-import-resolver.ts`
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — no fs-access assertion
- Recommended decision: Add a test that fails if fs is touched during Pass 2 import resolution

### [LOW] Package identity collision untested

- Spec: `code-graph:indexer`
- Batch: `batch-001`
- Target: `requirement:modified:0003`
- Reason: Collision error naming both workspaces is implemented but no test asserts it.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — lines 886-897
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — no collision scenario

### [LOW] No test for hydrated workspaces being prepared

- Spec: `code-graph:indexer`
- Batch: `batch-003`
- Target: `scenario:added:0002`
- Reason: Implementation passes all options.workspaces to prepare, but no test runs an incremental run and asserts prepare receives unchanged workspaces.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — packageWorkspaces built from options.workspaces and passed to prepare
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — only asserts prepare is called once

### [LOW] No test for package identity collision error

- Spec: `code-graph:indexer`
- Batch: `batch-003`
- Target: `scenario:added:0006`
- Reason: Collision error is produced naming both workspaces, but no test asserts it.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — Package identity collision error
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — no collision test

### [LOW] No package-import test for workspace added

- Spec: `code-graph:indexer`
- Batch: `batch-004`
- Target: `scenario:added:0022`
- Reason: No test covers an unresolved package import becoming resolved after the target workspace is added incrementally; newly resolvable integration cases use relative imports.
- Evidence (test): `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts` — newly resolvable case is relative import

### [LOW] Closure no-scan not asserted

- Spec: `code-graph:indexer`
- Batch: `batch-004`
- Target: `scenario:added:0023`
- Reason: No test asserts the closure uses only persisted steps and hydrated bindings and reads no unrelated files.
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — incremental tests assert only results

### [LOW] Go adapter lacks relative facet not asserted

- Spec: `code-graph:language-adapter`
- Batch: `batch-004`
- Target: `scenario:added:0016`
- Reason: No test asserts the Go adapter exposes no relativeImportResolution.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts` — facet not declared
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts` — no assertion

### [LOW] resolveToPath no-FS-access not asserted

- Spec: `code-graph:language-adapter`
- Batch: `batch-004`
- Target: `scenario:added:0018`
- Reason: Test only checks repeated results; it never verifies absence of filesystem access after prepared metadata.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts` — qualifiedNameResolution.resolveToPath
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/php-language-adapter.spec.ts` — caches PSR-4 map across calls (line 722)

### [LOW] Go adapter lacks qualified-name facet not asserted

- Spec: `code-graph:language-adapter`
- Batch: `batch-004`
- Target: `scenario:added:0019`
- Reason: No test asserts the Go adapter exposes no qualifiedNameResolution.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts` — facet not declared
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/go-language-adapter.spec.ts` — no assertion

### [LOW] Re-export link no-I/O not asserted

- Spec: `code-graph:language-adapter`
- Batch: `batch-004`
- Target: `scenario:added:0023`
- Reason: Link tests check outputs only; none verifies that link reads no file from disk.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts` — reExportLinking.link
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts` — link tests (line ~1172)

### [LOW] No test for facet vs capability flag independence

- Spec: `code-graph:language-adapter`
- Batch: `batch-005`
- Target: `scenario:added:0042`
- Reason: No test asserts that providing reExportLinking does not cause an adapter to advertise hierarchy capability; conformance tests only check advertised capabilities against fixtures.
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/language-adapter-conformance.spec.ts` — capabilities checked only against fixtures
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/adapter-registry.ts`

### [LOW] PHP package-unknown reason not asserted end to end

- Spec: `code-graph:php-language-adapter`
- Batch: `batch-001`
- Target: `scenario:added:0005`
- Reason: Tests assert matchSpecifier returns undefined for an unmapped name, but none asserts the PHP import yields no persisted result with reason package-unknown.
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/package-resolution.spec.ts` — Given a name no prefix matches

### [LOW] No Python test for name found elsewhere

- Spec: `code-graph:python-language-adapter`
- Batch: `batch-001`
- Target: `scenario:added:0007`
- Reason: No Python test asserts an imported name existing elsewhere in the target project stays unresolved.
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.languages.spec.ts` — only re-imported alias case covered

### [LOW] Type-only package import type-space lookup untested

- Spec: `code-graph:typescript-language-adapter`
- Batch: `batch-001`
- Target: `scenario:added:0002`
- Reason: Implementation passes spaces [Type] for typeOnly imports, but no test asserts a same-name value-space export is ignored for a type-only package import.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts` — resolvePackageImport spaces selection
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — only barrel-chain type import, no value-space competitor

### [LOW] Namespace package import entry dependency untested

- Spec: `code-graph:typescript-language-adapter`
- Batch: `batch-001`
- Target: `scenario:added:0003`
- Reason: No test covers namespace package import depending on the entry file and member access resolving only through published names.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts` — resolvePackageImport namespace branch
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — no namespace package import case

## Spec ambiguity or drift

### [LOW] facet-absent counted in import failure totals

- Spec: `code-graph:indexer`
- Batch: `batch-001`
- Target: `requirement:added:0001`
- Reason: Absent-facet diagnostic goes through recordImportDiagnostic, inflating total/byReason/samples which spec defines as unresolved package imports.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts` — lines 934-943

### [INFO] Go prepare does not store module path and code root

- Spec: `code-graph:go-language-adapter`
- Batch: `batch-001`
- Target: `requirement:modified:0001`
- Reason: Spec says prepare reads each workspace go.mod once and stores module path and code root; implementation prepare only builds the per-run Go directory index and entrySurface derives the directory from request.packageName/workspace. Behavior matches scenarios, wording diverges.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts` — packageResolutionFacet.prepare/entrySurface
- Recommended decision: Align spec wording with implementation or store module data in prepare

## Counts

- Workers completed: 16
- Clean batches: 3
- Batches with issues: 13
- Blocked batches: 0
- Findings: 33
