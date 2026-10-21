# Spec Compliance Audit — Final Report

**Change:** `code-graph-cross-workspace-imports` (state: implementing)
**Change path:** `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports`
**Report directory:** `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/reports/20261020-191859`
**Report file:** `specs-compliance-change-code-graph-cross-workspace-imports-20261020-191859.md`
**Audit mode:** Change (specific change audit)
**Timestamp:** 20261020-191859
**Audit type:** READ-ONLY — no code or spec files were modified

---

## Audit Configuration

| Item               | Value                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Config path        | `/Users/monki/Documents/Proyectos/specd/.specd/config`                                                                                          |
| Change path        | `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports`                                                                          |
| Graph freshness    | Fresh (indexed 2026-10-20T17:18:19.939Z; `stale: false`)                                                                                        |
| Project-wide specs | `default:*` (architecture, conventions, continuous-integration, docs, error-handling-conventions, eslint, logging, testing; `commits` excluded) |
| Change deps        | depth-1 dependencies resolved per change manifest                                                                                               |

---

## Resolved Scope

### Change specs (8) — all audited via `specd changes spec-preview`

| #   | Spec ID                                  | Depth-1 Dependencies                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `code-graph:workspace-integration`       | `core:config`                                                                                                                                                                                                                                                                      |
| 2   | `code-graph:language-adapter`            | `code-graph:symbol-model`                                                                                                                                                                                                                                                          |
| 3   | `code-graph:typescript-language-adapter` | `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration`                                                                                                                                                                                       |
| 4   | `code-graph:python-language-adapter`     | `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration`                                                                                                                                                                                       |
| 5   | `code-graph:go-language-adapter`         | `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration`                                                                                                                                                                                       |
| 6   | `code-graph:php-language-adapter`        | `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration`                                                                                                                                                                                       |
| 7   | `code-graph:resolve-symbol-reference`    | `code-graph:symbol-model`, `code-graph:graph-store`, `code-graph:language-adapter`, `code-graph:workspace-integration`                                                                                                                                                             |
| 8   | `code-graph:indexer`                     | `code-graph:graph-store`, `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration`, `core:config`, `core:spec-repository-port`, `core:list-workspaces`, `code-graph:document-model`, `core:get-spec-metadata`, `code-graph:sqlite-graph-store` |

### Project-wide/global specs (5 audited in batch C)

| #   | Spec ID                                      |
| --- | -------------------------------------------- |
| 1   | `default:_global/architecture`               |
| 2   | `default:_global/conventions`                |
| 3   | `default:_global/testing`                    |
| 4   | `default:_global/eslint`                     |
| 5   | `default:_global/error-handling-conventions` |

### Subagent batches

| Batch | Specs                                                                                  | Output file                               |
| ----- | -------------------------------------------------------------------------------------- | ----------------------------------------- |
| A     | 6 code-graph adapter specs (workspace-integration, language-adapter, TS/Python/Go/PHP) | `_partial-batch-a-code-graph-adapters.md` |
| B     | 2 code-graph core specs (resolve-symbol-reference, indexer) + 10 dependency specs read | `_partial-batch-b-code-graph-core.md`     |
| C     | 5 global specs                                                                         | `_partial-batch-c-global-specs.md`        |

---

## Aggregate Counts

| Metric                                      | Value                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------- |
| Total specs audited                         | 13 (8 change + 5 global)                                              |
| Dependency specs read                       | 10 (batch B read all resolve-symbol-reference + indexer dependencies) |
| Implementation files located via graph      | 5 primary + ~13 modified + 3 new                                      |
| Test files confirmed present                | ~25 across all specs                                                  |
| Discrepancies flagged                       | 6 (4 spec-might-be-wrong, 2 code-might-be-wrong/testing-convention)   |
| Contradictions with global/dependency specs | 1 (LanguageAdapter cross-spec)                                        |
| Code defects observed                       | 0 (testing convention violation noted, not a defect)                  |
| Partial report files                        | 3 (retained for traceability)                                         |

### Per-spec summary

| Spec                                         | Implementation         | Discrepancies                                                                                                                                         | Test Coverage                |
| -------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `code-graph:workspace-integration`           | Mostly implemented     | 3 (SpecRepository API mismatch; persistedStateHash/readPersistedDependsOn/readPersistedImplementation/metadata not called; documentsIndexed additive) | Good (8 test files)          |
| `code-graph:language-adapter`                | Implemented            | 1 (global spec still declares old optional methods removed by facet spec)                                                                             | Good (6+ test files)         |
| `code-graph:typescript-language-adapter`     | Implemented            | 0                                                                                                                                                     | Good                         |
| `code-graph:python-language-adapter`         | Implemented            | 0                                                                                                                                                     | Good                         |
| `code-graph:go-language-adapter`             | Implemented            | 0                                                                                                                                                     | Good                         |
| `code-graph:php-language-adapter`            | Implemented            | 0                                                                                                                                                     | Good                         |
| `code-graph:resolve-symbol-reference`        | Conforms (substantial) | 0 (freshness-capability wiring noted as spec-might-be-wrong)                                                                                          | Comprehensive                |
| `code-graph:indexer`                         | Conforms (substantial) | 0 (stale `getPackageIdentity` verify scenario noted, resolved by task 22.1)                                                                           | Comprehensive (8 test files) |
| `default:_global/architecture`               | Conforms               | 0 (pre-existing `node:fs` import at application layer not introduced by this change)                                                                  | —                            |
| `default:_global/conventions`                | Conforms               | 0                                                                                                                                                     | —                            |
| `default:_global/testing`                    | Partial                | 1 (partial mocks with `as unknown as` in `package-import-resolver.spec.ts`)                                                                           | —                            |
| `default:_global/eslint`                     | Conforms               | 0                                                                                                                                                     | —                            |
| `default:_global/error-handling-conventions` | Conforms               | 0                                                                                                                                                     | —                            |

---

## Critical Findings Summary

### 1. SpecRepository API mismatch (workspace-integration)

**Severity:** High
**Spec might be wrong:** The spec names `SpecRepository` methods (`persistedStateHash()`, `readPersistedDependsOn()`, `readPersistedImplementation()`, `metadata()`) that do not exist on the actual `SpecRepository` class. The implementation uses `readPersistedState()`, `readMetadataSnapshot()`, and a `getSpecMetadata` callback instead. The spec may describe an older/renamed API.
**Code might be wrong:** The indexer does not call `repo.persistedStateHash()` for freshness checking; it compares `persistedStateObservation?.indexedContentHash` vs `persisted?.originalHash`. It reads `dependsOn`/`implementation` from the persisted state snapshot directly, not via dedicated methods.
**Resolution needed:** Update the spec to match actual `SpecRepository` methods, or add the missing methods and update the indexer.

### 2. LanguageAdapter cross-spec contradiction (language-adapter + global spec)

**Severity:** High
**Spec might be wrong:** The change's new facet-based `code-graph:language-adapter` spec removes old optional methods (`getPackageIdentity?`, `resolvePackageFromSpecifier?`, `resolveQualifiedNameToPath?`, etc.) and replaces them with facets. The **global** `code-graph:language-adapter` spec (unchanged by this change) still declares the old optional methods. The implementation follows the new facet model, so the global spec is stale.
**Resolution needed:** Update the global `code-graph:language-adapter` spec to remove old optional methods and adopt the facet model, consistent with this change's spec and implementation.

### 3. WorkspaceIndexBreakdown additive field (workspace-integration)

**Severity:** Low
**Spec might be wrong:** The implementation adds `documentsIndexed` to `WorkspaceIndexBreakdown` not listed in the spec (additive, non-breaking).
**Resolution needed:** Either add `documentsIndexed` to the spec or document it as additive.

### 4. Freshness capability graceful degradation (resolve-symbol-reference)

**Severity:** Low/Medium
**Spec might be wrong:** The spec's freshness gate requires consuming `AssessIndexedResourceFreshness` for every addressed resource and declaration file. The implementation skips freshness entirely when `assessResources` is not provided (graceful degradation), relaxing the "SHALL consume" requirement when the capability is not wired. Not a code defect — a spec-implementation gap in optional-capability wiring.

### 5. Testing convention violation (package-import-resolver.spec.ts)

**Severity:** Medium
**Code might be wrong:** `fakeSession()` implements only 5 of 25 `IndexSession` methods and casts `as unknown as IndexSession`. Violates the global testing spec rule: "Port mocks implement the port interface fully. No partial mocks with `as unknown as Port`." Also `adapterWith()` returns `{ packageResolution } as unknown as LanguageAdapter`.
**Resolution needed:** Either implement all port methods (unused ones throwing `not implemented`) or narrow the resolver's dependency interface.

---

## Detailed Findings

The complete contents of all partial reports follow verbatim, as required by the audit protocol. Partial files are retained in `${REPORT_DIR}` for traceability.

---

## Partial Report A: Code Graph Adapters

_Complete contents of `_partial-batch-a-code-graph-adapters.md` below._

---

```
# Specd Compliance Audit — Partial Batch A: Code Graph Adapters

**Change:** `code-graph-cross-workspace-imports` (state: implementing)
**Change path:** `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports`
**Report dir:** `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/reports/20261020-191859`
**Output file:** `_partial-batch-a-code-graph-adapters.md`
**Audit type:** READ-ONLY (no code or spec files modified)
**Graph status:** Fresh (indexed 2026-10-20T17:18:19.939Z, content fresh: true)

---

## Assigned Specs (6)

| # | Spec ID | Dependencies |
|---|---------|-------------|
| 1 | `code-graph:workspace-integration` | `core:config` |
| 2 | `code-graph:language-adapter` | `code-graph:symbol-model` |
| 3 | `code-graph:typescript-language-adapter` | `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration` |
| 4 | `code-graph:python-language-adapter` | `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration` |
| 5 | `code-graph:go-language-adapter` | `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration` |
| 6 | `code-graph:php-language-adapter` | `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration` |

---

## Cross-Cutting Observations (apply to all specs)

### Spec version conflict on `code-graph:language-adapter`

The change introduces a **new facet-based** `code-graph:language-adapter` spec (via `specd changes spec-preview ... code-graph:language-adapter`) that:
- Removes the former loose methods `getPackageIdentity?`, `resolvePackageFromSpecifier?`, `resolveRelativeImportPath`, `buildQualifiedName`, `resolveQualifiedNameToPath`, `parseSymbolReference`, `renderSymbolReference`, `linkReExports`
- Replaces them with facets: `packageResolution`, `relativeImportResolution`, `qualifiedNameResolution`, `symbolReferenceSyntax`, `reExportLinking`
- Verification scenario explicitly states: "the `LanguageAdapter` interface declares none of the former loose methods ... which a type-level test checks"

However, the **global** `code-graph:language-adapter` spec (via `specd specs show code-graph:language-adapter`) still declares the old optional methods:
- `getPackageIdentity?(codeRoot, repoRoot?): string | undefined`
- `resolvePackageFromSpecifier?(specifier, knownPackages): string | undefined`
- `resolveQualifiedNameToPath?(qualifiedName, codeRoot, repoRoot?): string | undefined`

**Contradiction:** The new change spec and the global spec are mutually inconsistent on the `LanguageAdapter` interface shape. Either the global spec must be updated to the facet model, or the change's spec must not remove methods the global spec still requires. The implementation (`packages/code-graph/src/domain/value-objects/language-adapter.ts`) follows the new facet model — it has `packageResolution?`, `relativeImportResolution?`, `qualifiedNameResolution?`, `symbolReferenceSyntax?`, `reExportLinking?` and does NOT have the old optional methods. So the **code conforms to the new change spec**, but the **global spec is stale**.

### `SpecRepository` API mismatch (workspace-integration)

The workspace-integration spec requires the indexer to call:
- `repo.persistedStateHash()` (formerly `specHash`) for freshness
- `repo.readPersistedDependsOn()` for `dependsOn`
- `repo.readPersistedImplementation()` for coverage links
- `repo.metadata()` to extract `title`/`description`

The actual `SpecRepository` abstract class (`packages/core/src/application/ports/spec-repository.ts`) defines:
- `readPersistedState(spec)` — exists
- `readMetadataSnapshot(spec)` — exists
- `readPersistedDependsOn()` — does NOT exist
- `readPersistedImplementation()` — does NOT exist
- `persistedStateHash()` — does NOT exist
- `metadata()` — does NOT exist

The indexer (`index-code-graph.ts`) uses `ws.specRepo.readPersistedState()`, `ws.specRepo.readMetadataSnapshot()`, and `options.getSpecMetadata` — NOT the methods named in the spec. It extracts `dependsOn` from `persisted?.dependsOn` and `implementation` from `persisted?.implementation` (fields on the persisted state snapshot), not via dedicated methods.

**Discrepancy:** The spec describes a `SpecRepository` API that does not exist in the codebase. Either the spec is stale (describing methods that were renamed) or the implementation is missing methods the spec requires.

---

## Spec 1: `code-graph:workspace-integration`

### Requirements Summary

| Requirement | Summary |
|-------------|---------|
| FileNode path and workspace semantics | `{workspaceName}:{relativeToCodeRoot}` globally unique identity; `root:` namespace for project-global includePaths; `projectRelativePath` denormalized onto nodes |
| Drive letters are not workspace names | `^[A-Za-z]:[/\\]` or `^[A-Za-z]:$` must not parse the pre-colon char as workspace |
| SymbolNode ID includes workspace | `{filePath}:{kind}:{name}:{line}:{column}` |
| SpecNode workspace field | `workspace: string`; Spec IDs use `{workspace}:{specPath}` format |
| File discovery from codeRoot | Per-workspace discovery from `codeRoot`; `discoverFiles` is workspace-agnostic |
| Project-relative file lookup | `projectRelativePath` computed from project root; forward slashes; no leading `./` |
| Spec resolution via SpecRepository | `repo.list()`, `persistedStateHash()`, `artifact()`, `metadata()`, `readPersistedDependsOn()`, `readPersistedImplementation()` |
| Cross-workspace import resolution | Package name → workspace map; relative within workspace; package imports via entry surface; qualified names via exact map |
| WorkspaceIndexTarget | `IndexOptions` with `workspaces`, `graphConfig`, `vcsRoot`; `specs` callback removed |
| Per-workspace IndexResult breakdown | `WorkspaceIndexBreakdown[]` on `IndexResult` |
| .gitignore handling for codeRoot | Hierarchical loading from vcsRoot; null vcsRoot = no probing; respectGitignore=false = no .gitignore |
| Canonical module and package resolution identity | Structured workspace/module/public-surface/symbol-space identity; fingerprint changes on resolution input changes |

### Implementation Status

| Requirement | Status | Evidence |
|-------------|--------|----------|
| FileNode path/workspace semantics | Implemented | `file-node.ts:10` — `path`, `projectRelativePath`, `workspace` fields; `createFileNode` normalizes path |
| Drive letters not workspace names | Implemented | `split-workspace-identity.ts:9` `isDriveLetterPath` with `/^[A-Za-z]:(?:[/\\]|$)/`; `matches-exclude.ts:17` same regex; `compute-hotspots.ts:22` returns `''` for drive paths |
| SymbolNode ID includes workspace | Implemented | `symbol-node.ts:98` `computeSymbolId` = `${filePath}:${kind}:${name}:${line}:${column}`; `filePath` is workspace-prefixed |
| SpecNode workspace field | Implemented | `spec-node.ts:4` — `workspace: string` field; `createSpecNode` sets it |
| File discovery from codeRoot | Implemented | `discover-files.ts:87` — workspace-agnostic, accepts root dir, returns root-relative paths |
| Project-relative file lookup | Implemented | `file-node.ts:55` — `projectRelativePath` denormalized, forward-slash normalized |
| Spec resolution via SpecRepository | PARTIAL | Uses `ws.specRepo.list()`, `get()`, `artifact()`, `readPersistedState()`, `readMetadataSnapshot()` — but NOT `persistedStateHash()`, `readPersistedDependsOn()`, `readPersistedImplementation()`, `metadata()` as named in spec |
| Cross-workspace import resolution | Implemented | `package-import-resolver.ts` — `matchSpecifier`, `entrySurface`, `findPublicBindings`, `import:package` step, reasons `facet-absent`/`package-unknown`/`no-entry-surface`/`not-exported`/`ambiguous` |
| WorkspaceIndexTarget | Implemented | `index-options.ts:14` `ProjectGraphConfig`; `index-options.ts:85` `IndexOptions` with `workspaces`, `graphConfig`, `vcsRoot`; `WorkspaceIndexTarget = ProjectWorkspace` alias at line 159 |
| Per-workspace IndexResult breakdown | Implemented (additive) | `index-result.ts:16` `WorkspaceIndexBreakdown`; `index-result.ts:98` `IndexResult.workspaces` — implementation adds `documentsIndexed` not in spec |
| .gitignore handling | Implemented | `discover-files.ts:122-132` — loads from vcsRoot, then root, then subdirectories; null vcsRoot skips; respectGitignore=false skips all |
| Canonical module/package resolution identity | Implemented | `language-adapter-facets.ts` facet types; `package-import-resolver.ts` generic resolution; fingerprint via `compute-graph-fingerprint.ts` |

### Discrepancies

**Spec might be wrong:**
- The spec names `SpecRepository` methods (`persistedStateHash`, `readPersistedDependsOn`, `readPersistedImplementation`, `metadata`) that do not exist on the actual `SpecRepository` class. The implementation uses `readPersistedState`, `readMetadataSnapshot`, and `getSpecMetadata` callback instead. The spec may describe an older/renamed API.

**Code might be wrong:**
- The indexer does not call `repo.persistedStateHash()` for freshness checking as the spec requires. It compares `persistedStateObservation?.indexedContentHash` vs `persisted?.originalHash` instead — a different mechanism.
- The indexer does not call `repo.readPersistedDependsOn()` or `repo.readPersistedImplementation()`. It reads `dependsOn` and `implementation` from the persisted state snapshot object directly.
- The indexer does not call `repo.metadata()`. It uses `readMetadataSnapshot()` and/or the `getSpecMetadata` callback.

### Test Coverage

| Test file | Coverage |
|-----------|----------|
| `test/application/use-cases/workspace-indexing.spec.ts` (34.6K) | Workspace indexing, per-workspace breakdown |
| `test/application/use-cases/discover-files.spec.ts` (5.7K) | `discoverFiles`, .gitignore, excludePaths |
| `test/application/use-cases/index-code-graph.spec.ts` (5.9K) | IndexCodeGraph core |
| `test/application/use-cases/index-code-graph.package-imports.spec.ts` (24.7K) | Cross-workspace package imports |
| `test/application/use-cases/index-code-graph.package-imports.languages.spec.ts` (10.7K) | Multi-language package imports |
| `test/application/use-cases/index-code-graph.language-independence.spec.ts` (6.5K) | Language independence |
| `test/application/use-cases/index-project-graph.spec.ts` (3.8K) | Project graph indexing |
| `test/application/use-cases/index-project-graph-integration.spec.ts` (46.0K) | Integration |

### Missing Tests

- No explicit test found for drive-letter workspace exclusion in SQLite/hotspot classification (spec scenario: "Workspace C does not include a drive-letter path")
- No test for `root:` namespace identity conflict (same file under workspace codeRoot and `graph.includePaths`)
- No test verifying `persistedStateHash()` / `readPersistedDependsOn()` / `readPersistedImplementation()` / `metadata()` are called (these methods don't exist, so tests can't exist — spec/code mismatch)

### Spec Dependency Chain

`code-graph:workspace-integration` → `core:config` → (`default:_global/architecture`, `core:vcs-adapter-port`)

Counts: Requirements: ~12 | Implementation: Implemented | Discrepancies: 3 | Test files: 8

---

## Spec 2: `code-graph:language-adapter`

### Requirements Summary

| Requirement | Summary |
|-------------|---------|
| LanguageAdapter interface | Required core (`languages`, `extensions`, `resolutionManifests`, `analyzeFile`, `resolveImports`, `buildRelations`) + optional facets; no former loose methods |
| Adapter facet model | Facet = object with all required members; presence is declaration; absent facet = no behavior, no error; partial facet = rejected; throwing facet = isolated |
| Package resolution facet | `identity`, `prepare`, `matchSpecifier`, `entrySurface`; manifest basenames in `resolutionManifests()` |
| Relative import resolution facet | `resolve(fromFile, specifier)` — pure, no I/O, no choosing |
| Qualified-name resolution facet | `build(namespace, name)`, `resolveToPath(qualifiedName, codeRoot, session)` — no filesystem |
| Symbol reference syntax facet | `parse(text)`, `render(symbol, ownerPath)` — pure |
| Re-export linking facet | `link(context)` — runs after Pass 1, before Pass 2; no I/O |
| Package import resolution context | `packageEntryFiles(specifier)`, `resolvePackageExport(request)` helpers on `ImportResolutionContext` |
| Full-file analysis contract | Complete `FileAnalysisDraft` in one `analyzeFile` call; compact serializable state |
| Parser-authoritative structural fact extraction | Parser nodes, not raw-source regex; no guessed relations |
| Unified built-in adapter migration | TS/JS, PHP, Python, Go all implement unified contract; no legacy path |
| Language detection | Extension-based via `extensions()`; unknown extensions silently skipped |
| Import declaration extraction | `ImportDeclaration` value object with `localName`, `originalName`, `specifier`, `isRelative` |
| Call resolution | `CALLS` from `analyzeFile` call facts via `buildRelations`; unresolvable dropped |
| Semantic caller containment | Innermost enclosing executable; line+column half-open containment |
| Scoped binding fact extraction | Lexical scopes, typed params, properties, receivers, aliases, construction |
| Built-in multi-language dependency coverage | TS, Python, Go, PHP adapter-specific specs are authoritative |
| Detectable dependency boundary | Static/deterministic only; no runtime inference |
| Hierarchy extraction | `EXTENDS`, `IMPLEMENTS`, `OVERRIDES`; unresolvable dropped |
| Package identity extraction | `packageResolution.identity` per language manifest table |
| Import specifier resolution | Shared `IndexSession` indexes; no per-import filesystem probes |
| Tree-sitter query patterns | Internal, not public API |
| Adapter registry | `register`, `getAdapter`, `getAdapterForFile`, `getLanguageForFile`, `getAdapters`; `INVALID_LANGUAGE_ADAPTER` validation |
| Resolver capability declaration | Capability flags backed by emitted facts; distinct from facets |
| Built-in adapter specialization | Specific spec defines complete behavior; general contract is shared |
| Logical declaring-owner facts | Logical owner before member identity; raw parser IDs not used |
| Member semantics and declaration parent | `MemberSemantics` (`kind`, `dispatch`, `accessor`, `nativeKind`); `parentId` per lexical hierarchy |
| Human reference parse and render | Zero/one/many candidates; canonical not parsed as human text |
| Re-export public bindings | Relative via `relativeImportResolution`; package via `packageResolution`; binding uses re-exporting file as surface |
| Hierarchy evidence consistency | `hierarchy: true` only when facts emitted; consistent with persisted relations |
| Complete symbol source ranges | Construct range + selectionRange; half-open; contained |
| Declaration classification policy | Logical target / lexical binding / physical-only / unsupported |
| Cross-language semantic conformance suite | Reusable fixture matrix for all built-in adapters |
| Adding a language adapter | 7 steps; no indexer/session/resolver/store changes |

### Implementation Status

| Requirement | Status | Evidence |
|-------------|--------|----------|
| LanguageAdapter interface (facet model) | Implemented | `language-adapter.ts:100` — interface with 6 core methods + 5 optional facets; no old loose methods |
| Adapter facet model | Implemented | `adapter-registry.ts:20` `FACET_MEMBERS` maps each facet to required members; validation at lines 113-132 |
| Package resolution facet | Implemented | `language-adapter-facets.ts:62` `PackageResolutionFacet` with `identity`, `prepare`, `matchSpecifier`, `entrySurface` |
| Relative import resolution facet | Implemented | `language-adapter-facets.ts:104` `RelativeImportResolutionFacet` with `resolve` |
| Qualified-name resolution facet | Implemented | `language-adapter-facets.ts:119` `QualifiedNameResolutionFacet` with `build`, `resolveToPath` |
| Symbol reference syntax facet | Implemented | `language-adapter-facets.ts:142` `SymbolReferenceSyntaxFacet` with `parse`, `render` |
| Re-export linking facet | Implemented | `language-adapter-facets.ts:187` `ReExportLinkingFacet` with `link` |
| Package import resolution context | Implemented | `language-adapter.ts:48` `ImportResolutionContext` with `packageEntryFiles`, `resolvePackageExport`; `package-import-resolver.ts` implements helpers |
| Full-file analysis contract | Implemented | `language-adapter.ts:136` `analyzeFile` returns `FileAnalysisDraft` |
| Parser-authoritative structural extraction | Implemented (adapters) | Adapter source files derive from parser nodes |
| Unified built-in adapter migration | Implemented | All 4 adapters implement `analyzeFile`/`resolveImports`/`buildRelations` |
| Language detection | Implemented | `adapter-registry.ts:168` `getAdapterForFile` uses dynamic extMap |
| Import declaration extraction | Implemented | `language-adapter-facets.ts` + `import-declaration.ts` |
| Call resolution | Implemented | Adapters emit call facts; `buildRelations` produces `CALLS` |
| Semantic caller containment | Implemented | Shared policy via `AdapterDeclarationPolicy.callableContainerKinds` |
| Scoped binding fact extraction | Implemented | `scoped-binding-environment.ts` |
| Built-in multi-language dependency coverage | Implemented | All 4 adapters registered |
| Detectable dependency boundary | Implemented | Unresolved dropped; no guessed relations |
| Hierarchy extraction | Implemented | Adapters emit `EXTENDS`/`IMPLEMENTS`/`OVERRIDES` with provenance |
| Package identity extraction | Implemented | Each adapter's `packageResolution.identity` reads its manifest |
| Import specifier resolution | Implemented | `PackageImportResolver` uses session lookups, no filesystem I/O |
| Tree-sitter query patterns | Implemented | Internal to adapters |
| Adapter registry | Implemented | `adapter-registry.ts:35` `AdapterRegistry` class |
| Resolver capability declaration | Implemented | `AdapterCapabilities`; `getCapabilities` on registry |
| Built-in adapter specialization | Implemented | Each adapter has its own specific spec |
| Logical declaring-owner facts | Implemented | Adapters map owners to logical identities before member IDs |
| Member semantics and declaration parent | Implemented | `AdapterDeclarationPolicy`; `parentId` on declarations |
| Human reference parse and render | Implemented | `symbolReferenceSyntax` facet |
| Re-export public bindings | Implemented | `reExportLinking` facet; `ReExportLinkResult` |
| Hierarchy evidence consistency | Implemented | `hierarchy: true` capability flag backed by facts |
| Complete symbol source ranges | Implemented | `symbol-node.ts` `SourceRange`, `selectionRange` validation |
| Declaration classification policy | Implemented | `AdapterDeclarationPolicy` fields |
| Cross-language semantic conformance suite | Implemented | `language-adapter-conformance.spec.ts` |
| Adding a language adapter | Documented | `docs/code-graph/language-adapters.md`; `docs/adr/0030-language-adapter-facets.md` |

### Discrepancies

**Spec might be wrong:**
- None specific to this spec beyond the global `code-graph:language-adapter` conflict noted above.

**Code might be wrong:**
- **Cross-spec contradiction:** The change's new spec removes `getPackageIdentity?`, `resolvePackageFromSpecifier?`, `resolveQualifiedNameToPath?`, etc., but the global `code-graph:language-adapter` spec (unchanged by this change) still declares them. The implementation follows the new spec, so the global spec is stale and must be updated as part of this change or a dependent change.

### Test Coverage

| Test file | Coverage |
|-----------|----------|
| `test/infrastructure/tree-sitter/adapter-registry.spec.ts` (9.4K) | AdapterRegistry registration, validation, replacement |
| `test/infrastructure/tree-sitter/language-adapter-conformance.spec.ts` (42.4K) | Cross-language conformance suite |
| `test/domain/errors/invalid-language-adapter-error.spec.ts` | `INVALID_LANGUAGE_ADAPTER` validation |
| `test/helpers/stub-language-adapter.ts` | Stub adapter for tests |
| `test/helpers/import-resolution-context.ts` | Import resolution context helper |
| `test/application/services/package-import-resolver.spec.ts` | Package import resolution helpers |

### Missing Tests

- No test verifying the global `code-graph:language-adapter` spec and the change's new spec are consistent (they are not)
- No test that `docs/code-graph/language-adapters.md` states the same rules as the spec (spec requires this at "Adding a language adapter" step 7) — though `test/docs/language-adapters-docs.spec.ts` exists

### Spec Dependency Chain

`code-graph:language-adapter` → `code-graph:symbol-model` → (`default:_global/conventions`, `default:_global/error-handling-conventions`, `code-graph:document-model`)

Counts: Requirements: ~30 | Implementation: Implemented | Discrepancies: 1 (cross-spec) | Test files: 6+

---

## Specs 3-6: Language Adapters (TypeScript, Python, Go, PHP)

### 3. `code-graph:typescript-language-adapter`

**Implementation:** `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts` — class `TypeScriptLanguageAdapter` at line 623.

| Requirement | Status |
|-------------|--------|
| Supported languages `.ts`/`.tsx`/`.js`/`.jsx` | Implemented |
| Declaration extraction and ranges | Implemented |
| Object properties in array data records | Implemented |
| Logical identity and declaring owners | Implemented |
| TypeScript overload and declaration-group identity | Implemented |
| Imports, exports, and public bindings | Implemented (package.json, exports/main, entry surface, re-export linking) |
| Scoped bindings, calls, types, construction | Implemented |
| TypeScript caller and local-binding semantics | Implemented |
| TypeScript hierarchy and provenance evidence | Implemented (`hierarchy: true`) |
| Package and build-context boundary | Implemented (`buildContext: false`; `package.json` manifest) |
| Capability truthfulness | Implemented |
| Parser-authoritative structural extraction | Implemented |

**Test file:** `test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts` (83.9K)

### 4. `code-graph:python-language-adapter`

**Implementation:** `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts` — class `PythonLanguageAdapter` at line 372.

| Requirement | Status |
|-------------|--------|
| Supported files `.py`/`.pyi` | Implemented |
| Python parser-authoritative structural extraction | Implemented |
| Declaration extraction and ranges | Implemented |
| Python logical identity and declaring owners | Implemented |
| Imports and package resolution | Implemented (pyproject.toml `[project].name`, entry surface, no filesystem in Pass 2) |
| Resolution manifests | Implemented (exactly `['pyproject.toml']`) |
| Scoped bindings, calls, annotations, construction | Implemented |
| Python caller containment | Implemented |
| Python hierarchy and provenance evidence | Implemented |
| Public surface and stub behavior | Implemented |
| Capability truthfulness | Implemented |

**Test file:** `test/infrastructure/tree-sitter/python-language-adapter.spec.ts` (45.5K)

### 5. `code-graph:go-language-adapter`

**Implementation:** `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts` — class `GoLanguageAdapter` at line 269.

| Requirement | Status |
|-------------|--------|
| Supported files `.go` | Implemented |
| Go parser-authoritative structural extraction | Implemented |
| Declaration extraction and ranges | Implemented |
| Package identity, exports, and imports | Implemented (go.mod `module`, directory-based entry surface, no test files) |
| Resolution manifests | Implemented (exactly `['go.mod']`) |
| Go logical identity and declaring owners | Implemented (receiver type as owner) |
| Scoped bindings, selectors, construction, types | Implemented |
| Go caller containment | Implemented |
| Go embedding and hierarchy provenance | Implemented |
| Proven interface satisfaction | Implemented (`IMPLEMENTS` only when complete method set proven) |
| Build-context boundary | Implemented (`buildContext: false`) |
| Capability truthfulness | Implemented |

**Test file:** `test/infrastructure/tree-sitter/go-language-adapter.spec.ts` (41.2K)

### 6. `code-graph:php-language-adapter`

**Implementation:** `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts` — class `PhpLanguageAdapter` at line 462.

| Requirement | Status |
|-------------|--------|
| Supported files `.php` | Implemented |
| PHP parser-authoritative structural extraction | Implemented |
| Declaration extraction and ranges | Implemented |
| PHP logical identity and declaring owners | Implemented |
| Namespaces, use aliases, Composer resolution | Implemented (qualified-name map, PSR-4, `packageEntryFiles`, no `resolvePackageExport`) |
| Resolution manifests | Implemented (exactly `['composer.json']`) |
| Static and framework dependency facts | Implemented |
| Scoped bindings, calls, types, construction | Implemented |
| PHP caller containment | Implemented |
| PHP hierarchy and provenance evidence | Implemented |
| Public surface and capability truthfulness | Implemented |

**Test file:** `test/infrastructure/tree-sitter/php-language-adapter.spec.ts` (81.9K)

### Cross-Adapter Discrepancies

**Spec might be wrong:**
- None identified beyond the cross-spec `LanguageAdapter` contradiction.

**Code might be wrong:**
- None identified — all four adapters implement their respective specs. Each adapter's `resolutionManifests()` returns exactly the expected single manifest:
  - TypeScript: `['package.json']`
  - Python: `['pyproject.toml']`
  - Go: `['go.mod']`
  - PHP: `['composer.json']`

### Test Coverage (all four adapters)

| Test file | Adapter | Size |
|-----------|---------|------|
| `typescript-language-adapter.spec.ts` | TypeScript | 83.9K |
| `python-language-adapter.spec.ts` | Python | 45.5K |
| `go-language-adapter.spec.ts` | Go | 41.2K |
| `php-language-adapter.spec.ts` | PHP | 81.9K |
| `package-resolution.spec.ts` | Package resolution | 16.0K |
| `resolution-manifests.spec.ts` | Manifests | 3.0K |

Counts per adapter: Requirements: ~12-15 | Implementation: Implemented | Discrepancies: 0 | Test files: 1 each + shared

---

## Overall Summary

| Spec | Implementation | Discrepancies | Test Coverage |
|------|---------------|---------------|---------------|
| `code-graph:workspace-integration` | Mostly implemented | 3 (SpecRepository API mismatch; `persistedStateHash`/`readPersistedDependsOn`/`readPersistedImplementation`/`metadata` not called; `documentsIndexed` additive field) | Good (8 test files) |
| `code-graph:language-adapter` | Implemented | 1 (global spec still declares old optional methods removed by new facet spec) | Good (6+ test files) |
| `code-graph:typescript-language-adapter` | Implemented | 0 | Good |
| `code-graph:python-language-adapter` | Implemented | 0 | Good |
| `code-graph:go-language-adapter` | Implemented | 0 | Good |
| `code-graph:php-language-adapter` | Implemented | 0 | Good |

### Critical Recommendations

1. **Resolve `SpecRepository` API mismatch:** Either update the workspace-integration spec to match the actual `SpecRepository` methods (`readPersistedState`, `readMetadataSnapshot`, `getSpecMetadata` callback) or add the missing methods (`persistedStateHash`, `readPersistedDependsOn`, `readPersistedImplementation`, `metadata`) to `SpecRepository` and update the indexer to call them.

2. **Resolve `LanguageAdapter` cross-spec contradiction:** Update the global `code-graph:language-adapter` spec to remove the old optional methods (`getPackageIdentity?`, `resolvePackageFromSpecifier?`, etc.) and adopt the facet model, consistent with the change's new spec and the implementation.

3. **Clarify `WorkspaceIndexBreakdown`:** The spec lists 6 fields; the implementation has 7 (adds `documentsIndexed`). Either add `documentsIndexed` to the spec or remove it from the implementation.

(End of file - total 376 lines)
```

---

## Partial Report B: Code Graph Core

_Complete contents of `_partial-batch-b-code-graph-core.md` below._

---

```
# Specd Audit Report — Partial Batch B: code-graph core specs

**Change:** `code-graph-cross-workspace-imports` (state: implementing)
**Change path:** `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports`
**Report dir:** `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/reports/20261020-191859`
**Output file:** `_partial-batch-b-code-graph-core.md`
**Audit mode:** READ-ONLY — no code or spec files modified
**Graph:** fresh (indexed 2026-10-20T17:18:19.939Z; `stale: false` not reported by `graph stats`)

## Auditor scope

Assigned specs (all belong to the active change):

| # | Spec ID | Declared deps (per manifest) |
|---|---------|------------------------------|
| 1 | `code-graph:resolve-symbol-reference` | code-graph:symbol-model, code-graph:graph-store, code-graph:language-adapter, code-graph:workspace-integration |
| 2 | `code-graph:indexer` | code-graph:graph-store, code-graph:language-adapter, code-graph:symbol-model, code-graph:workspace-integration, core:config, core:spec-repository-port, core:list-workspaces, code-graph:document-model, core:get-spec-metadata, code-graph:sqlite-graph-store |

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
- The spec's freshness gate requires consuming `AssessIndexedResourceFreshness` for *every* explicitly addressed resource and *every* declaration file whose evidence contributes to a candidate. The implementation only assesses when `assessResources` is provided; when absent it skips freshness entirely rather than treating unknown as `unresolved`. This is a deliberate graceful-degradation design (the capability is optional in the constructor), but it relaxes the spec's "SHALL consume ... for every ... resource" when the capability is not wired. This is a spec-implementation gap in the optional-capability wiring, not a code defect per se.

**Code might be wrong:**
- None observed at the level of resolution semantics. The implementation is conservative and matches the precedence/ordering requirements. One minor point: in the exact-declaration lane, when `matches.length > 1` the code returns `ambiguous`/`AMBIGUOUS_DECLARATION`, but the spec's precedence rule 2 says equality on `qualified_name` returns *every* equal logical symbol and "One match resolves that member"; multiple exact physical declarations at the same file:line:column is an unusual state, so `ambiguous` is defensible.

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

| Spec | Test files | Coverage verdict |
|------|-----------|------------------|
| code-graph:resolve-symbol-reference | `resolve-symbol-reference.spec.ts` | Comprehensive |
| code-graph:indexer | `index-code-graph.spec.ts`, `index-code-graph.package-imports.spec.ts`, `index-code-graph.package-imports.languages.spec.ts`, `index-code-graph.language-independence.spec.ts`, `package-import-resolver.spec.ts`, `in-memory-index-session.package-lookups.spec.ts`, `package-resolution.spec.ts`, `compute-graph-fingerprint.spec.ts` | Comprehensive |

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

(End of file - total 211 lines)
```

---

## Partial Report C: Global Specs

_Complete contents of `_partial-batch-c-global-specs.md` below._

---

```
# Spec-Compliance Audit: Global Specs

**Change:** `code-graph-cross-workspace-imports` (state: implementing)
**Change path:** `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports`
**Report dir:** `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/reports/20261020-191859`
**Output file:** `_partial-batch-c-global-specs.md`
**Change specs audited:** `code-graph:workspace-integration`, `code-graph:language-adapter`, `code-graph:typescript-language-adapter`, `code-graph:python-language-adapter`, `code-graph:go-language-adapter`, `code-graph:php-language-adapter`, `code-graph:resolve-symbol-reference`, `code-graph:indexer`
**Global specs audited (batch C):**
1. `default:_global/architecture`
2. `default:_global/conventions`
3. `default:_global/testing`
4. `default:_global/eslint`
5. `default:_global/error-handling-conventions`

**Audit method:** READ-ONLY. Graph navigation via `specd graph` (graph is fresh: `state: current`). No code or spec files modified.

---

## Summary Table

| Global spec | Status | Key finding | Discrepancies |
|---|---|---|---|
| `default:_global/architecture` | Conforms | Hexagonal layers respected; domain pure; application uses ports; composition wires adapters | None in new code |
| `default:_global/conventions` | Conforms | kebab-case, named exports, no `any`, explicit return types, SpecdError chain | None in new source |
| `default:_global/testing` | Partial | Vitest, test/ mirroring, .spec.ts, no snapshots | Partial `IndexSession`/`LanguageAdapter` mocks with `as unknown as` (violates typed-port-mock rule) |
| `default:_global/eslint` | Conforms | JSDoc on exports, layer boundaries, no `any`/`default` exports | None in new source |
| `default:_global/error-handling-conventions` | Conforms | `SpecdError` → `SpecdCodeGraphError` → `InvalidLanguageAdapterError`; `INVALID_LANGUAGE_ADAPTER` UPPER_SNAKE_CASE | None |

**Overall:** The change conforms to all 5 global specs in its new source code. One testing-convention violation (partial mocks with `as unknown as`) found in `package-import-resolver.spec.ts`. No contradictions between the change's specs and the global specs.

---

## 1. default:_global/architecture

### Requirements Summary

Hexagonal Architecture (Ports & Adapters) + DDD tactical patterns. Applies to every package with business logic.

- **Layered structure:** `domain` → `application` → `infrastructure` → `composition`; inner layers never import outer layers.
- **Domain layer pure:** zero I/O (no `fs`, `net`, `child_process`, HTTP).
- **Application uses ports only:** interacts with outside world exclusively through `application/ports/` interfaces; never imports concrete infrastructure adapters directly.
- **Rich domain entities:** enforce invariants; invalid transitions throw typed domain errors.
- **Domain value objects expose behaviour, not structure.**
- **Ports with shared construction are `abstract class`**, not `interface`; all port methods are explicit methods.
- **Pure functions for stateless domain services** in `domain/services/`.
- **Manual dependency injection:** no IoC container; use cases receive ports via constructor.
- **Composition layer** above `infrastructure/`; only layer permitted to import `infrastructure/`; exposes `createKernel`, config loader/writer ports.
- **YAML inputs validated at infrastructure boundary** before reaching domain/application.
- **Adapter packages contain no business logic.**
- **No circular dependencies between packages:** `plugin-*` → `skills` → `core`; `cli`/`mcp` → `sdk`; `sdk` → `core`, `code-graph`.
- **Curated public entry points:** `"."` must not export concrete adapter classes; must export `createX` factories and domain types/errors.

### Implementation Status

| File | Layer | Conformance |
|---|---|---|
| `src/domain/value-objects/language-adapter-facets.ts` (new) | domain | ✓ Imports only domain types (`index-session`, `symbol-reference`). No application/infrastructure/composition imports. Pure value object. |
| `src/domain/errors/invalid-language-adapter-error.ts` (new) | domain | ✓ Imports only `specd-code-graph-error.ts` (domain). No I/O. |
| `src/domain/value-objects/language-adapter.ts` (modified) | domain | ✓ Facet properties added; loose methods removed. `capabilities()`/`declarationPolicy()` untouched. |
| `src/application/services/package-import-resolver.ts` (new) | application | ✓ Pure application service: no I/O, never calls `findSymbolsByName`, constructed with deps (manual DI). Imports only domain types (`IndexSession`, `LanguageAdapter`, facets, `symbol-reference`). |
| `src/application/use-cases/index-code-graph.ts` (modified) | application | ✓ Imports only domain/ports/services. Adapters arrive via `AdapterRegistryPort` (a port), not concrete infrastructure classes. `PackageImportResolver` constructed with deps. No new `node:fs` imports added by this change. |
| `src/application/use-cases/in-memory-index-session.ts` (modified) | application | ✓ Adds `findPublicBindings`, `getFileCategory`, `getPrimaryDeclarationSymbolId` to `IndexSession` implementation. Maintains public-binding index alongside `publicBindingsById`. |
| `src/domain/value-objects/index-session.ts` (modified) | domain | ✓ Declares the three new session methods on the `IndexSession` interface. |
| `src/domain/services/scoped-binding-environment.ts` (modified) | domain | ✓ `SymbolLookup.findById` optional; `buildScopedBindingEnvironment` builds scope-aware `importedTargets`. |
| `src/domain/value-objects/import-declaration.ts` (modified) | domain | ✓ Adds optional `typeOnly` flag. |
| `src/domain/value-objects/index-result.ts` (modified) | domain | ✓ Adds `importDiagnostics: ImportDiagnosticSummary` + `IMPORT_DIAGNOSTIC_SAMPLE_LIMIT` constant. |
| `src/infrastructure/tree-sitter/adapter-registry.ts` (modified) | infrastructure | ✓ `register` calls `validateAdapter` first; validation throws `InvalidLanguageAdapterError` before mutating state. Replacement semantics per language. |
| `src/infrastructure/tree-sitter/{typescript,python,go,php}-language-adapter.ts` (modified) | infrastructure | ✓ Facets exposed as readonly object fields; old methods made private. `prepare`/`entrySurface` per language. |
| `src/composition/create-code-graph-provider.ts` (composition) | composition | ✓ Composition layer imports infrastructure adapters (permitted). Wires `AdapterRegistry`, `IndexCodeGraph`, graph store manually. No IoC container. |
| `src/public.ts` (curated entry point) | public barrel | ✓ All new facet types + `InvalidLanguageAdapterError` exported. `PackageImportResolver` NOT exported (internal application service). Concrete adapters not exported from `"."`. |

**No circular dependencies:** code-graph depends on `core` only (via `@specd/core`). No new `workspace:*` deps introduced. Package direction `code-graph → core` preserved.

**Typed domain errors:** `InvalidLanguageAdapterError` extends `SpecdCodeGraphError` extends `SpecdError` — all typed, no generic `Error` for expected failures.

### Discrepancies

- **Code might be wrong:** `index-code-graph.ts` imports `node:fs` (`readFileSync`, `statSync`, `rmSync`, `existsSync`, `mkdirSync`, `writeFileSync`) directly at the application layer. The architecture spec says application interacts with the outside world exclusively through ports. However, this is **pre-existing** (not introduced by this change); the new `package-import-resolver.ts` performs no I/O. No new violation introduced.
- **Spec might be wrong:** None identified. The global architecture spec imposes no requirement that conflicts with the facet model.

### Test Coverage

- `test/application/services/package-import-resolver.spec.ts` — resolver unit tests (resolved, not-exported, ambiguous, package-unknown, facet-absent, no-entry-surface, test/unindexed entry filtering, duplicate-route lowest-binding-id, no `findSymbolsByName`).
- `test/domain/errors/invalid-language-adapter-error.spec.ts` — error code, message formats, `specd === true`.
- `test/infrastructure/tree-sitter/adapter-registry.spec.ts` — registration validation.
- `test/application/use-cases/in-memory-index-session.package-lookups.spec.ts` — session additions.
- `test/application/use-cases/resolve-symbol-reference.spec.ts` — symbol reference via facet.
- `test/composition/code-graph-provider.spec.ts` — provider composition.
- `test/infrastructure/tree-sitter/{typescript,python,go,php}-language-adapter.spec.ts` — adapter facet tests.
- `test/application/use-cases/index-code-graph.package-imports.spec.ts` — cross-workspace integration + closure + language independence.
- `test/domain/services/scoped-binding-environment.spec.ts` — scope-aware import resolution.
- `test/barrel.spec.ts` — public barrel exports.

### Missing Tests

None major. All requirements from design.md tasks 3.4–3.6, 4.6, 5.6, 6.4, 7.4, 9.2, 12.3, 13.2, 14.1–14.3, 15.3, 16.3, 17.3, 18.2–18.4, 21.1–21.3, 23.1–23.9 are tracked as resolved in the manifest.

### Spec Dependency Chain

`default:_global/architecture` — none (global constraint spec; no spec dependencies).

### Counts

- New source files: 3 (`language-adapter-facets.ts`, `package-import-resolver.ts`, `invalid-language-adapter-error.ts`)
- Modified source files: ~13 (`language-adapter.ts`, `index-session.ts`, `in-memory-index-session.ts`, `index-code-graph.ts`, `resolve-symbol-reference.ts`, `adapter-registry.ts`, 4 language adapters, `import-declaration.ts`, `index-result.ts`, `public.ts`, `scoped-binding-environment.ts`)
- New test files: ~9
- Modified test files: ~9
- Global specs audited: 1 (this section)

---

## 2. default:_global/conventions

### Requirements Summary

TypeScript conventions for the monorepo, applies to all packages unless overridden.

- **Strict mode:** `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true` via `tsconfig.base.json`.
- **ESM only:** `"type": "module"`, `NodeNext` resolution. No CommonJS.
- **Named exports only:** no `export default`.
- **File naming:** `kebab-case.ts` sources; `.spec.ts` tests in `test/` mirroring `src/`; no co-located tests; root `src/index.ts` barrel only.
- **No `any`:** use `unknown` at boundaries, narrow with type guards.
- **Explicit return types on public functions:** exported functions and class methods need explicit return types.
- **Error types:** all user-facing errors in `@specd/core` extend `SpecdError`; no generic `Error` for expected failures; machine-readable `code`; actionable messaging (cross-ref `error-handling-conventions`).
- **Private backing fields:** underscore prefix (`_name` for `get name()`).
- **Lazy loading — metadata before content:** `list()`/`search()` return metadata only; full content via explicit `get`/`load`.
- **Immutability preference:** `readonly` arrays/properties on value objects/entities; `as const` for literal config.

### Implementation Status

| Convention | New-code status |
|---|---|
| kebab-case filenames | ✓ `language-adapter-facets.ts`, `package-import-resolver.ts`, `invalid-language-adapter-error.ts` |
| Named exports only, no default exports | ✓ Verified: no `export default` in new source |
| No `any` | ✓ Verified: no `: any` or `as any` in new source files |
| Explicit return types on public API | ✓ `forAdapter(adapter): PackageImportHelpers`, `get code(): string`, `get specd(): true`, facet method signatures all typed |
| Errors extend SpecdError | ✓ `InvalidLanguageAdapterError` → `SpecdCodeGraphError` → `SpecdError` |
| Private backing fields underscore | N/A (no backing fields in new code) |
| Lazy loading / no speculative content | ✓ `package-import-resolver.ts` performs no I/O; `entrySurface` reads only prepared session data (no filesystem probing) |
| Immutability preference | ✓ Facet interfaces use `readonly` throughout; `PackageWorkspace`, `PackageEntry`, etc. all `readonly` |

**ESM / NodeNext:** The monorepo uses ESM; new files use `.js` extension in import specifiers (e.g. `./index-session.js`), consistent with NodeNext.

### Discrepancies

- **Code might be wrong:** None found in new source files. All conventions verified by direct read.
- **Spec might be wrong:** None identified. The facet model and `PackageImportResolver` introduce no convention conflict.

### Test Coverage

Conventions are enforced by `pnpm build`, `pnpm typecheck`, and `pnpm lint` (tasks 8.1–8.3, all green per manifest). The eslint spec (batch item 4) enforces `no any`, named exports, explicit return types, kebab-case, JSDoc via type-aware rules.

### Missing Tests

None — conventions are verified at build/lint time, not via dedicated test files.

### Spec Dependency Chain

`default:_global/conventions` → `default:_global/error-handling-conventions` (conventions depends on error-handling for error-type rules).

### Counts

- New source files: 3; Modified source files: ~13; New test files: 0 dedicated; Global specs audited: 1 (this section)

---

## 3. default:_global/testing

### Requirements Summary

Testing strategy for the monorepo.

- **Test runner:** Vitest only (no Jest).
- **Test location:** `test/` directory at package root, mirroring `src/` structure; `.spec.ts` suffix; never co-located with source.
- **Unit tests for domain/application:** every use case and domain entity invariant has ≥1 unit test; ports mocked (no real fs/network in unit tests).
- **Port mocks are typed:** mocks implement the port interface fully; no `as unknown as Port`; unused methods throw `new Error('not implemented')`.
- **Integration tests for infrastructure adapters:** real temporary directory (`os.tmpdir()` + unique subfolder), cleaned up after each test.
- **POSIX- and Windows-compatible:** `node:path` for path construction/assertions; no hardcoded `/tmp` or `/var/www`; `path.win32` for Windows rules on non-Windows hosts; CRLF/CR treated as LF for logical identity; no `chmod 0o000` on Windows.
- **Test naming:** descriptions `"given <state>, when <action>, then <outcome>"`; helpers `setup<Thing>`/`cleanup<Thing>`.
- **No snapshot tests:** `toMatchSnapshot`/`toMatchInlineSnapshot` forbidden.

### Implementation Status

| Requirement | Status |
|---|---|
| Vitest (not Jest) | ✓ All new test files import from `vitest` |
| Test files in `test/` mirroring `src/`, `.spec.ts` | ✓ `test/application/services/package-import-resolver.spec.ts`, `test/domain/errors/invalid-language-adapter-error.spec.ts`, etc. |
| Unit tests for domain/application with mocked ports | ✓ Resolver unit tests with mocked `IndexSession`; error unit tests |
| Integration tests with temp dirs + cleanup | ✓ Cross-workspace package-import integration tests use tmp dirs (per design tasks 14.3, 18.2, 18.3) |
| No snapshot tests | ✓ Verified: zero matches for `toMatchSnapshot`/`toMatchInlineSnapshot` in `packages/code-graph/test/` |
| POSIX/Windows compatible | ✓ New unit tests use workspace-prefixed paths (`code-graph:src/public.ts`), not host absolute paths; no hardcoded `/tmp` |

### Discrepancies (Testing Convention Violations)

1. **`package-import-resolver.spec.ts` — `fakeSession()` partial mock with `as unknown as IndexSession` (CODE MIGHT BE WRONG / CONVENTION VIOLATION).**
   - `IndexSession` declares 25 methods (`registerFile`, `registerAnalysis`, `getFileId`, `getAnalysis`, `getAllFilePaths`, `findSymbolsByFile`, `findSymbolsByName`, `findSymbolById`, `findSymbolByQualifiedName`, `findSpecsBySymbol`, `findSymbolsBySpec`, `registerDocument`, `registerSpec`, `addRelations`, `getRelations`, `getAdapterState`, `setAdapterState`, `getQualifiedNames`, `getDeclarationsByLogicalId`, `getLogicalSymbols`, `getLogicalDiagnostics`, `getPublicBindings`, `getLocalBindings`, `findPublicBindings`, `getFileCategory`, `getPrimaryDeclarationSymbolId`, `getResolutionSteps`, `addReferenceFacts`).
   - `fakeSession` implements only 5 (`getFileId`, `getFileCategory`, `findPublicBindings`, `getPrimaryDeclarationSymbolId`, `findSymbolsByName`) and casts `as unknown as IndexSession`.
   - This directly violates: "Port mocks implement the port interface fully. No partial mocks with `as unknown as Port`. If a port has 5 methods, the mock implements all 5 — unused ones throw `new Error('not implemented')`."
   - *Spec might be wrong:* If `IndexSession` is considered a domain value object rather than a "port" (ports live in `application/ports/`), the rule may not strictly apply. However, the spirit of typed, complete mocks is clearly violated.
   - *Code might be wrong:* The mock should either implement all 25 methods (unused ones throwing `not implemented`) or the resolver should depend on a narrower port interface.

2. **`package-import-resolver.spec.ts` — `adapterWith()` returns `{ packageResolution } as unknown as LanguageAdapter` (CONVENTION VIOLATION).**
   - Partial mock of `LanguageAdapter` interface with `as unknown as` cast. Same rule applies.

3. **`invalid-language-adapter-error.spec.ts:37` — `(error as unknown as { specd: boolean }).specd` (MINOR).**
   - `as unknown as` cast in a test assertion (not a port mock). Lower severity but still a type cast.

4. **Test description casing (MINOR).**
   - Descriptions use `"Given ..., when ..., then ..."` (capital G/W/T). Convention specifies lowercase `"given <state>, when <action>, then <outcome>"`.

5. **Helper naming (MINOR).**
   - Helpers named `fakeSession`, `binding`, `adapterWith` — not `setup<Thing>`/`cleanup<Thing>`. These are not setup/teardown helpers, so this is a soft deviation.

### Test Coverage

**Covered (resolved in manifest):**
- Resolver: resolved target+step, not-exported (no name search), ambiguous (different targets), ambiguous (value+type spaces), duplicate routes → lowest binding id, package-unknown, facet-absent, no-entry-surface (test + unindexed entries filtered), orphan target → not-exported, same-name decoy in another workspace not used. (9 scenarios)
- Error: code=`INVALID_LANGUAGE_ADAPTER`, message with languages, message with member, message with unknown languages, `specd === true`. (4 scenarios)
- Registry validation: missing core member, facet is string, facet missing member, extension for undeclared language, later registration replaces, per-language replacement, shadowed adapter drops out, idempotent same-instance, core-only adapter, registry unchanged after failure, message names language/rule/member. (10 scenarios)
- Session additions: `findPublicBindings` after registration/hydration/addReferenceFacts; `getFileCategory` for source/test/unknown; `getPrimaryDeclarationSymbolId` determinism.
- Symbol reference: facet-absent → unresolved, no other adapter consulted.
- Package imports (integration): cross-workspace, entry change re-resolves importers, barrel intermediate, unrelated files not read, newly resolvable import = clean rebuild, fingerprint on manifest changes.
- Language independence: stub `zig2` adapter resolves cross-workspace import with unmodified indexer; core-only adapter with facet-absence diagnostic; facet throw in `prepare` completes with error.
- Scoped binding environment: scope-aware `importedTargets`.
- Docs: `FACET_MEMBERS` members appear in `docs/code-graph/language-adapters.md`.

### Missing Tests

None identified from the manifest (all tasks 3.4–3.6, 4.6, 5.6, 6.4, 7.4, 7.5, 9.2, 12.3, 13.2, 13.3, 14.1–14.3, 15.3, 16.3, 17.3, 18.2–18.4, 21.1–21.3, 23.1–23.9, 22.5 are `resolved`). The partial-mock convention violation is a style/typing issue, not missing coverage.

### Spec Dependency Chain

`default:_global/testing` → `default:_global/architecture` (layer boundaries determine unit vs integration) → `default:_global/conventions` (ESM-only is why Vitest over Jest).

### Counts

- New source files: 3; Modified source files: ~13; New test files: ~9; Modified test files: ~9; Global specs audited: 1 (this section)
- Convention violations found: 3 (2 significant partial mocks, 1 minor cast)

---

## 4. default:_global/eslint

### Requirements Summary

ESLint enforces conventions + architectural layer boundaries, configured in `eslint.config.js` at monorepo root, type-aware for `.ts` files.

- **No `any` type:** reject explicit `any` annotations.
- **Named exports only:** reject default exports.
- **Explicit return types on public API:** exported functions/methods need explicit return types; internal functions may infer.
- **Kebab-case filenames:** all `src/` files `kebab-case`.
- **JSDoc on all functions and classes:** description, `@param` for all params, `@returns` (omit for `void`), `@throws` for each error type. Includes internal helpers.
- **Layer boundary enforcement** via `no-restricted-imports`:
  - `domain/` must not import `application/`, `infrastructure/`, `composition/`
  - `application/` must not import `infrastructure/`, `composition/`
  - `infrastructure/` must not import `composition/`
- **Type-aware lint rules** for all `.ts` files.
- Test files (`test/**/*.spec.ts`) exempt from JSDoc; `dist/` and `node_modules/` excluded.

### Implementation Status

| Rule | New-code status |
|---|---|
| No `any` | ✓ Verified: no `: any`/`as any` in new source |
| Named exports only | ✓ No `export default` in new source |
| Explicit return types on public API | ✓ All public methods on `PackageImportResolver`, `InvalidLanguageAdapterError`, facet interfaces have explicit types |
| Kebab-case filenames | ✓ All new files `kebab-case.ts` |
| JSDoc on all functions/classes | ✓ `package-import-resolver.ts` (class, constructor, `forAdapter`, `entryFiles`, `resolveExport`), `invalid-language-adapter-error.ts` (class, `code` getter, constructor), `language-adapter-facets.ts` (per design: full JSDoc on every exported symbol) |
| Layer boundary enforcement | ✓ `language-adapter-facets.ts` (domain) imports only domain; `package-import-resolver.ts` (application) imports only domain; `index-code-graph.ts` (application) imports domain/ports/services only, no concrete infrastructure adapters; `create-code-graph-provider.ts` (composition) imports infrastructure (permitted) |
| Type-aware lint | ✓ Per eslint spec configuration |

### Discrepancies

- **Code might be wrong:** None found in new source files. JSDoc, explicit return types, no `any`, named exports, kebab-case all verified.
- **Spec might be wrong:** None identified.

### Test Coverage

ESLint compliance is verified by `pnpm lint` (task 8.3, expected no errors per manifest). Test files are exempt from JSDoc requirements, so the partial-mock test files are not flagged for JSDoc (but the `as unknown as` casts are a TypeScript/testing-convention concern, not ESLint).

### Missing Tests

None — eslint rules are enforced at lint time.

### Spec Dependency Chain

`default:_global/eslint` → `default:_global/conventions` (the rules being enforced).

### Counts

- New source files: 3; Modified source files: ~13; New test files: 0 dedicated; Global specs audited: 1 (this section)
- ESLint violations found: 0

---

## 5. default:_global/error-handling-conventions

### Requirements Summary

Error handling standards across the specd ecosystem.

- **Specd Error Contract:** error (1) inherits from `Error`, (2) has `readonly specd = true` discriminator, (3) has `readonly code: string` machine-readable ID, (4) has descriptive human-readable `message`.
- **core mandate:** `@specd/core` defines canonical `SpecdError` base class; every domain/application error in core extends `SpecdError`.
- **Monorepo package mandate:** every package depending on `@specd/core` extends `SpecdError` for its domain/application errors; each package SHOULD define its own package-level base error (e.g. `SpecdCodeGraphError`).
- **Error code naming:** `UPPER_SNAKE_CASE`, unique within package, stable across versions.
- **Actionable messaging:** descriptive, tells user how to fix; no internal implementation details in user-facing messages.
- **Metadata extraction:** MAY include `specId`, `filePath`, `expected`; documented in JSDoc.
- **JSDoc documentation:** all error classes document what they represent, the `code`, metadata properties; use cases document thrown errors with `@throws`.
- System errors/unexpected bugs MAY remain generic `Error`; domain logic MUST NOT use generic `Error` for expected failures.

### Implementation Status

| Error class | File | Contract conformance |
|---|---|---|
| `SpecdError` | `packages/core/src/domain/errors/specd-error.ts` | ✓ `abstract class extends Error`, `get specd(): true` (getter → `true`), `abstract get code(): string`, `constructor(message)` with JSDoc |
| `SpecdCodeGraphError` | `packages/code-graph/src/domain/errors/specd-code-graph-error.ts` | ✓ `abstract class extends SpecdError`, `abstract override get code(): string`, JSDoc |
| `InvalidLanguageAdapterError` | `packages/code-graph/src/domain/errors/invalid-language-adapter-error.ts` | ✓ `extends SpecdCodeGraphError`, `get code(): string` → `'INVALID_LANGUAGE_ADAPTER'`, `constructor(languageIds, rule, member?)` builds descriptive message, JSDoc documents purpose + code |

**Specd Error Contract verification for `InvalidLanguageAdapterError`:**
1. Inherits from `Error` ✓ (via `SpecdCodeGraphError` → `SpecdError` → `Error`)
2. `readonly specd = true` ✓ (inherited getter from `SpecdError`, returns `true`, no setter)
3. `readonly code: string` ✓ (getter `get code(): string`, no setter)
4. Descriptive human-readable `message` ✓ (constructor builds `"Invalid language adapter [<ids>]: <rule> (member "<member>")"`)

**Error code naming:** `INVALID_LANGUAGE_ADAPTER` is `UPPER_SNAKE_CASE` ✓, unique within code-graph ✓ (verified via graph search: only one occurrence).

**Monorepo package mandate:** code-graph depends on `@specd/core` (imports `SpecdError` from `@specd/core` in `specd-code-graph-error.ts`) and defines `SpecdCodeGraphError` as its package-level base ✓.

**Actionable messaging:** messages name the language(s), rule, and offending member ✓.

**JSDoc:** all three error classes have JSDoc ✓; `code` getter documents the code value ✓; `specd` getter documented on `SpecdError` ✓.

### Discrepancies

- **Code might be wrong:** None found. The error chain fully conforms to the Specd Error Contract.
- **Spec might be wrong:** None identified. The facet-model registration error (`InvalidLanguageAdapterError`) is a natural fit for the error-handling spec.

### Test Coverage

`test/domain/errors/invalid-language-adapter-error.spec.ts`:
- code = `'INVALID_LANGUAGE_ADAPTER'` ✓
- message with languages + rule ✓
- message with member suffix ✓
- message with `unknown` for no languages ✓
- `specd === true` ✓ (via cast assertion)

### Missing Tests

None identified (task 3.5 `resolved`).

### Spec Dependency Chain

`default:_global/error-handling-conventions` → `default:_global/conventions` (conventions depends on error-handling for error-type rules).

### Counts

- New source files: 1 (`invalid-language-adapter-error.ts`); Modified source files: 1 (`specd-code-graph-error.ts` pre-existing); New test files: 1; Global specs audited: 1 (this section)

---

## Cross-Spec Contradictions

No contradictions found between the change's specs (`code-graph:language-adapter`, `code-graph:indexer`, `code-graph:workspace-integration`, `code-graph:resolve-symbol-reference`, and the four language-adapter specs) and any of the 5 global specs in batch C. The facet model, `PackageImportResolver`, and `InvalidLanguageAdapterError` are consistent with:
- Hexagonal layering (architecture)
- Naming/ESM/no-`any`/explicit-return-types/JSDoc (conventions)
- Typed error contract + `SpecdError` chain (error-handling-conventions)
- ESLint-enforced layer boundaries (eslint)

The only audit finding requiring action is the **testing-convention violation** (partial mocks with `as unknown as`) in `package-import-resolver.spec.ts`, which is a code-level concern under `default:_global/testing`, not a conflict between specs.

## Auditor Note

This is a READ-ONLY partial audit (batch C of global specs). No code or spec files were modified. Findings are limited to the 5 assigned global specs and the 8 change specs listed above. Implementation conformance was verified via `specd graph` (graph impact / graph search) and direct file reads; build/lint/test execution status is taken from the change manifest (all tracked tasks `resolved`).

(End of file - total 373 lines)
```

---

## Consolidated Recommendations

| #   | Recommendation                                                                                                                                                                                                              | Severity | Owner decision needed                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------- |
| 1   | Resolve `SpecRepository` API mismatch — update workspace-integration spec to actual methods (`readPersistedState`, `readMetadataSnapshot`, `getSpecMetadata`) OR add missing methods to `SpecRepository` and update indexer | High     | Spec vs code — either could be right                      |
| 2   | Resolve `LanguageAdapter` cross-spec contradiction — update global `code-graph:language-adapter` spec to facet model, removing old optional methods                                                                         | High     | Global spec is stale vs new change spec + implementation  |
| 3   | Clarify `WorkspaceIndexBreakdown` — add `documentsIndexed` field to spec or remove from implementation                                                                                                                      | Low      | Additive field, non-breaking                              |
| 4   | Fix testing convention violation — implement all 25 `IndexSession` methods in `fakeSession()` mock (unused throw `not implemented`) or narrow resolver's dependency interface; same for `LanguageAdapter` partial mock      | Medium   | Code convention violation under `default:_global/testing` |

---

## Traceability

Partial report files retained in `${REPORT_DIR}`:

- `_partial-batch-a-code-graph-adapters.md`
- `_partial-batch-b-code-graph-core.md`
- `_partial-batch-c-global-specs.md`

**No code or spec files were modified during this audit.**

---
