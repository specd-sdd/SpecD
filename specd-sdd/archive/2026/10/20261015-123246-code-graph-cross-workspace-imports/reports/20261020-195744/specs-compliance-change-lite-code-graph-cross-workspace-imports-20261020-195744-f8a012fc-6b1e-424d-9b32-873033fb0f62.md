# Change compliance — code-graph-cross-workspace-imports

Session: `f8a012fc-6b1e-424d-9b32-873033fb0f62`

Checked targets: 207. Completed batches: 16. Workers: 11.

## Change violations

### [MEDIUM] identity() failure does not disable the packageResolution facet for the run

- Issue key: `la-coh-identity-throw-keeps-facet`
- Occurrences: 1
- Origins: coherence
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-001`
- Targets: `code-graph:language-adapter/requirement:added:0001`
- Coherence reviews: `review-language-adapter`
- Reason: Facet model requires that a failure inside identity, prepare, or link is recorded as an indexing error and the adapter is treated as if it did not provide the facet for the rest of the run. The indexer disables the adapter (disabledPackageResolution) on prepare and link failures, but the identity catch only records the error and continues to the next adapter for that workspace; the failing adapter still runs prepare and its matchSpecifier/entrySurface remain active in Pass 2, so the facet stays partially enabled contrary to the spec rule.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts:1205-1219` — prepare loop disables the adapter only when prepare itself throws
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts:888-896` — identity catch records error and continues without adding adapter to disabledPackageResolution
- Evidence (spec): `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/deltas/code-graph/language-adapter/spec.md.delta.yaml` — facet model: failure inside identity/prepare/link disables the facet for the rest of the run

### [LOW] Language adapter guide refers the reader to the specification

- Issue key: `w05-batch-005-0046`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-005`
- Targets: `code-graph:language-adapter/scenario:added:0046`
- Reason: Scenario requires docs/code-graph/language-adapters.md to state the same core, facets, members, invariants and steps without referring the reader to the spec, and tasks.md requires a self-contained guide with no reference to specs, but checklist step 6 points authors to the facet scenarios in the specification's verification while the page claims to be the complete contract.
- Evidence (documentation): `docs/code-graph/language-adapters.md:275` — checklist step 6 refers to the facet scenarios in the specification's verification
- Evidence (documentation): `docs/code-graph/language-adapters.md:9` — page claims no other document is needed
- Evidence (task): `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/tasks.md:344` — task 19.1 requires self-contained guide, no reference to specs

## Test coverage gaps

### [MEDIUM] Identity collision scenario has no test

- Issue key: `coverage:code-graph:indexer:identity-collision-reported`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-003`
- Targets: `code-graph:indexer/scenario:added:0006`
- Reason: The added scenario requires an error naming both workspaces when two workspaces claim one package identity; the collision path is implemented but no test in the change's package-import suites exercises two workspaces with the same manifest identity.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts:898` — collision branch pushes an error naming the existing workspace and the current workspace
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts:348` — identity and prepare ordering tests exist but no same-identity two-workspace case
- Recommended decision: Add an index test that configures two workspaces returning one package identity and asserts result.errors names both workspaces

### [LOW] No test covers the package-identity collision error

- Issue key: `coverage:code-graph:indexer:identity-collision-error`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:indexer`
- Batches: `code-graph:indexer/batch-001`
- Targets: `code-graph:indexer/requirement:modified:0003`
- Reason: The identity collision branch reports an error naming both workspaces but no spec test exercises two workspaces claiming one package identity, so the contract could regress unnoticed.
- Evidence (implementation): `packages/code-graph/src/application/use-cases/index-code-graph.ts:898` — collision branch pushes an error naming identity and both workspace names
- Evidence (test): `packages/code-graph/test/application/use-cases/index-code-graph.package-imports.spec.ts` — covers identity throw and first-adapter-wins but no identity collision
- Recommended decision: add-a-scenario

### [LOW] Type-level test for former loose methods missing

- Issue key: `la-b4-0001-type-level-absence`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-004`
- Targets: `code-graph:language-adapter/scenario:added:0001`
- Reason: Scenario requires a type-level test checking that LanguageAdapter declares none of getPackageIdentity, resolvePackageFromSpecifier, resolveRelativeImportPath, buildQualifiedName, resolveQualifiedNameToPath, parseSymbolReference, renderSymbolReference, linkReExports; no such absence test exists (barrel.spec.ts only asserts presence of analyzeFile and resolveImports)
- Evidence (implementation): `packages/code-graph/src/domain/value-objects/language-adapter.ts` — LanguageAdapter
- Evidence (spec): `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/deltas/code-graph/language-adapter/spec.md.delta.yaml`
- Evidence (test): `packages/code-graph/test/barrel.spec.ts` — exports language adapter and model vocabulary types
- Recommended decision: Add expectTypeOf<LanguageAdapter>().not.toHaveProperty(...) assertions for the eight former loose methods

### [LOW] No test inspects Go adapter for absent relativeImportResolution

- Issue key: `la-b4-0017-go-no-relative-facet-test`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-004`
- Targets: `code-graph:language-adapter/scenario:added:0017`
- Reason: Scenario requires that inspecting the Go adapter shows no relativeImportResolution facet; the implementation omits it (only packageResolution and symbolReferenceSyntax getters exist) but no test asserts the absence (TypeScript's analogous absence is type-tested in package-resolution.spec.ts)
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts` — get packageResolution
- Evidence (spec): `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/deltas/code-graph/language-adapter/spec.md.delta.yaml`
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/package-resolution.spec.ts` — facet shape
- Recommended decision: Add a type-level or runtime assertion that GoLanguageAdapter exposes no relativeImportResolution

### [LOW] No test inspects Go adapter for absent qualifiedNameResolution

- Issue key: `la-b4-0020-go-no-qualified-facet-test`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-004`
- Targets: `code-graph:language-adapter/scenario:added:0020`
- Reason: Scenario requires that inspecting the Go adapter shows no qualifiedNameResolution facet; the implementation omits it but no test asserts the absence for Go (only TypeScript is checked in package-resolution.spec.ts)
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts` — get packageResolution
- Evidence (spec): `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/deltas/code-graph/language-adapter/spec.md.delta.yaml`
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/package-resolution.spec.ts` — facet shape
- Recommended decision: Add a type-level or runtime assertion that GoLanguageAdapter exposes no qualifiedNameResolution

### [LOW] symbolReferenceSyntax.render has no test coverage

- Issue key: `la-b4-0021-render-untested`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-004`
- Targets: `code-graph:language-adapter/scenario:added:0021`
- Reason: Scenario requires a consumer to both parse and render through the symbolReferenceSyntax facet; parse is covered (typescript/php adapter specs, resolve-symbol-reference and provider specs) but no test anywhere calls the facet's render member, which all four adapters implement
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts` — renderSymbolReference
- Evidence (spec): `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/deltas/code-graph/language-adapter/spec.md.delta.yaml`
- Evidence (test): `packages/code-graph/test/application/use-cases/resolve-symbol-reference.spec.ts` — never borrows the syntax of another adapter
- Recommended decision: Add tests exercising symbolReferenceSyntax.render (generic and native spellings) and a consumer that parses then renders through the same facet

### [LOW] No test asserts facet and capability flag independence

- Issue key: `w05-batch-005-0043`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-005`
- Targets: `code-graph:language-adapter/scenario:added:0043`
- Reason: Implementation keeps capabilities() separate from facets (registry getCapabilities reads only capabilities(); no code derives hierarchy from reExportLinking), so the scenario holds structurally, but no test asserts that an adapter providing reExportLinking without hierarchy provenance cannot advertise the hierarchy capability; the conformance suite only checks that advertised capabilities have matching output.
- Evidence (implementation): `packages/code-graph/src/infrastructure/tree-sitter/adapter-registry.ts:150` — getCapabilities consults only adapter.capabilities(), never facets
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/language-adapter-conformance.spec.ts:714` — only verifies advertised capabilities against fixtures, never facet-to-capability independence

## Baseline debt

### [LOW] Corpus test depends on sibling ../core repo

- Issue key: `code-graph-cross-workspace-imports`
- Occurrences: 1
- Origins: batch
- Specs: `code-graph:language-adapter`
- Batches: `code-graph:language-adapter/batch-006`
- Targets: `code-graph:language-adapter/scenario:modified:0016`
- Reason: typescript-language-adapter.spec.ts archive-change corpus test reads files from ../core outside this workspace; ENOENT failure is environmental and unrelated to the facet API renames. 385 other targeted tests pass.
- Affected contract: default:\_global/testing
- Evidence (test): `packages/code-graph/test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts:1860` — reads ../core corpus via process.cwd()

## Counts

- Workers completed: 11
- Clean batches: 11
- Batches with issues: 5
- Blocked batches: 0
- Batch handoffs: 16
- Coherence reviews completed: 2
- Blocked coherence reviews: 0
- Unique issues: 10
- Finding occurrences: 10
