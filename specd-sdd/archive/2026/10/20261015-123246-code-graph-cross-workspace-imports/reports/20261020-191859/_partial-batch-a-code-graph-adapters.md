# Specd Compliance Audit — Partial Batch A: Code Graph Adapters

**Change:** `code-graph-cross-workspace-imports` (state: implementing)
**Change path:** `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports`
**Report dir:** `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/reports/20261020-191859`
**Output file:** `_partial-batch-a-code-graph-adapters.md`
**Audit type:** READ-ONLY (no code or spec files modified)
**Graph status:** Fresh (indexed 2026-10-20T17:18:19.939Z, content fresh: true)

---

## Assigned Specs (6)

| #   | Spec ID                                  | Dependencies                                                                                 |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | `code-graph:workspace-integration`       | `core:config`                                                                                |
| 2   | `code-graph:language-adapter`            | `code-graph:symbol-model`                                                                    |
| 3   | `code-graph:typescript-language-adapter` | `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration` |
| 4   | `code-graph:python-language-adapter`     | `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration` |
| 5   | `code-graph:go-language-adapter`         | `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration` |
| 6   | `code-graph:php-language-adapter`        | `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration` |

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

| Requirement                                      | Summary                                                                                                                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FileNode path and workspace semantics            | `{workspaceName}:{relativeToCodeRoot}` globally unique identity; `root:` namespace for project-global includePaths; `projectRelativePath` denormalized onto nodes |
| Drive letters are not workspace names            | `^[A-Za-z]:[/\\]` or `^[A-Za-z]:$` must not parse the pre-colon char as workspace                                                                                 |
| SymbolNode ID includes workspace                 | `{filePath}:{kind}:{name}:{line}:{column}`                                                                                                                        |
| SpecNode workspace field                         | `workspace: string`; Spec IDs use `{workspace}:{specPath}` format                                                                                                 |
| File discovery from codeRoot                     | Per-workspace discovery from `codeRoot`; `discoverFiles` is workspace-agnostic                                                                                    |
| Project-relative file lookup                     | `projectRelativePath` computed from project root; forward slashes; no leading `./`                                                                                |
| Spec resolution via SpecRepository               | `repo.list()`, `persistedStateHash()`, `artifact()`, `metadata()`, `readPersistedDependsOn()`, `readPersistedImplementation()`                                    |
| Cross-workspace import resolution                | Package name → workspace map; relative within workspace; package imports via entry surface; qualified names via exact map                                         |
| WorkspaceIndexTarget                             | `IndexOptions` with `workspaces`, `graphConfig`, `vcsRoot`; `specs` callback removed                                                                              |
| Per-workspace IndexResult breakdown              | `WorkspaceIndexBreakdown[]` on `IndexResult`                                                                                                                      |
| .gitignore handling for codeRoot                 | Hierarchical loading from vcsRoot; null vcsRoot = no probing; respectGitignore=false = no .gitignore                                                              |
| Canonical module and package resolution identity | Structured workspace/module/public-surface/symbol-space identity; fingerprint changes on resolution input changes                                                 |

### Implementation Status

| Requirement                                  | Status                 | Evidence                                                                                                                                                                                                                        |
| -------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| FileNode path/workspace semantics            | Implemented            | `file-node.ts:10` — `path`, `projectRelativePath`, `workspace` fields; `createFileNode` normalizes path                                                                                                                         |
| Drive letters not workspace names            | Implemented            | `split-workspace-identity.ts:9` `isDriveLetterPath` with `/^[A-Za-z]:(?:[/\\]                                                                                                                                                   | $)/`; `matches-exclude.ts:17`same regex;`compute-hotspots.ts:22`returns`''` for drive paths |
| SymbolNode ID includes workspace             | Implemented            | `symbol-node.ts:98` `computeSymbolId` = `${filePath}:${kind}:${name}:${line}:${column}`; `filePath` is workspace-prefixed                                                                                                       |
| SpecNode workspace field                     | Implemented            | `spec-node.ts:4` — `workspace: string` field; `createSpecNode` sets it                                                                                                                                                          |
| File discovery from codeRoot                 | Implemented            | `discover-files.ts:87` — workspace-agnostic, accepts root dir, returns root-relative paths                                                                                                                                      |
| Project-relative file lookup                 | Implemented            | `file-node.ts:55` — `projectRelativePath` denormalized, forward-slash normalized                                                                                                                                                |
| Spec resolution via SpecRepository           | PARTIAL                | Uses `ws.specRepo.list()`, `get()`, `artifact()`, `readPersistedState()`, `readMetadataSnapshot()` — but NOT `persistedStateHash()`, `readPersistedDependsOn()`, `readPersistedImplementation()`, `metadata()` as named in spec |
| Cross-workspace import resolution            | Implemented            | `package-import-resolver.ts` — `matchSpecifier`, `entrySurface`, `findPublicBindings`, `import:package` step, reasons `facet-absent`/`package-unknown`/`no-entry-surface`/`not-exported`/`ambiguous`                            |
| WorkspaceIndexTarget                         | Implemented            | `index-options.ts:14` `ProjectGraphConfig`; `index-options.ts:85` `IndexOptions` with `workspaces`, `graphConfig`, `vcsRoot`; `WorkspaceIndexTarget = ProjectWorkspace` alias at line 159                                       |
| Per-workspace IndexResult breakdown          | Implemented (additive) | `index-result.ts:16` `WorkspaceIndexBreakdown`; `index-result.ts:98` `IndexResult.workspaces` — implementation adds `documentsIndexed` not in spec                                                                              |
| .gitignore handling                          | Implemented            | `discover-files.ts:122-132` — loads from vcsRoot, then root, then subdirectories; null vcsRoot skips; respectGitignore=false skips all                                                                                          |
| Canonical module/package resolution identity | Implemented            | `language-adapter-facets.ts` facet types; `package-import-resolver.ts` generic resolution; fingerprint via `compute-graph-fingerprint.ts`                                                                                       |

### Discrepancies

**Spec might be wrong:**

- The spec names `SpecRepository` methods (`persistedStateHash`, `readPersistedDependsOn`, `readPersistedImplementation`, `metadata`) that do not exist on the actual `SpecRepository` class. The implementation uses `readPersistedState`, `readMetadataSnapshot`, and `getSpecMetadata` callback instead. The spec may describe an older/renamed API.

**Code might be wrong:**

- The indexer does not call `repo.persistedStateHash()` for freshness checking as the spec requires. It compares `persistedStateObservation?.indexedContentHash` vs `persisted?.originalHash` instead — a different mechanism.
- The indexer does not call `repo.readPersistedDependsOn()` or `repo.readPersistedImplementation()`. It reads `dependsOn` and `implementation` from the persisted state snapshot object directly.
- The indexer does not call `repo.metadata()`. It uses `readMetadataSnapshot()` and/or the `getSpecMetadata` callback.

### Test Coverage

| Test file                                                                               | Coverage                                    |
| --------------------------------------------------------------------------------------- | ------------------------------------------- |
| `test/application/use-cases/workspace-indexing.spec.ts` (34.6K)                         | Workspace indexing, per-workspace breakdown |
| `test/application/use-cases/discover-files.spec.ts` (5.7K)                              | `discoverFiles`, .gitignore, excludePaths   |
| `test/application/use-cases/index-code-graph.spec.ts` (5.9K)                            | IndexCodeGraph core                         |
| `test/application/use-cases/index-code-graph.package-imports.spec.ts` (24.7K)           | Cross-workspace package imports             |
| `test/application/use-cases/index-code-graph.package-imports.languages.spec.ts` (10.7K) | Multi-language package imports              |
| `test/application/use-cases/index-code-graph.language-independence.spec.ts` (6.5K)      | Language independence                       |
| `test/application/use-cases/index-project-graph.spec.ts` (3.8K)                         | Project graph indexing                      |
| `test/application/use-cases/index-project-graph-integration.spec.ts` (46.0K)            | Integration                                 |

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

| Requirement                                     | Summary                                                                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LanguageAdapter interface                       | Required core (`languages`, `extensions`, `resolutionManifests`, `analyzeFile`, `resolveImports`, `buildRelations`) + optional facets; no former loose methods |
| Adapter facet model                             | Facet = object with all required members; presence is declaration; absent facet = no behavior, no error; partial facet = rejected; throwing facet = isolated   |
| Package resolution facet                        | `identity`, `prepare`, `matchSpecifier`, `entrySurface`; manifest basenames in `resolutionManifests()`                                                         |
| Relative import resolution facet                | `resolve(fromFile, specifier)` — pure, no I/O, no choosing                                                                                                     |
| Qualified-name resolution facet                 | `build(namespace, name)`, `resolveToPath(qualifiedName, codeRoot, session)` — no filesystem                                                                    |
| Symbol reference syntax facet                   | `parse(text)`, `render(symbol, ownerPath)` — pure                                                                                                              |
| Re-export linking facet                         | `link(context)` — runs after Pass 1, before Pass 2; no I/O                                                                                                     |
| Package import resolution context               | `packageEntryFiles(specifier)`, `resolvePackageExport(request)` helpers on `ImportResolutionContext`                                                           |
| Full-file analysis contract                     | Complete `FileAnalysisDraft` in one `analyzeFile` call; compact serializable state                                                                             |
| Parser-authoritative structural fact extraction | Parser nodes, not raw-source regex; no guessed relations                                                                                                       |
| Unified built-in adapter migration              | TS/JS, PHP, Python, Go all implement unified contract; no legacy path                                                                                          |
| Language detection                              | Extension-based via `extensions()`; unknown extensions silently skipped                                                                                        |
| Import declaration extraction                   | `ImportDeclaration` value object with `localName`, `originalName`, `specifier`, `isRelative`                                                                   |
| Call resolution                                 | `CALLS` from `analyzeFile` call facts via `buildRelations`; unresolvable dropped                                                                               |
| Semantic caller containment                     | Innermost enclosing executable; line+column half-open containment                                                                                              |
| Scoped binding fact extraction                  | Lexical scopes, typed params, properties, receivers, aliases, construction                                                                                     |
| Built-in multi-language dependency coverage     | TS, Python, Go, PHP adapter-specific specs are authoritative                                                                                                   |
| Detectable dependency boundary                  | Static/deterministic only; no runtime inference                                                                                                                |
| Hierarchy extraction                            | `EXTENDS`, `IMPLEMENTS`, `OVERRIDES`; unresolvable dropped                                                                                                     |
| Package identity extraction                     | `packageResolution.identity` per language manifest table                                                                                                       |
| Import specifier resolution                     | Shared `IndexSession` indexes; no per-import filesystem probes                                                                                                 |
| Tree-sitter query patterns                      | Internal, not public API                                                                                                                                       |
| Adapter registry                                | `register`, `getAdapter`, `getAdapterForFile`, `getLanguageForFile`, `getAdapters`; `INVALID_LANGUAGE_ADAPTER` validation                                      |
| Resolver capability declaration                 | Capability flags backed by emitted facts; distinct from facets                                                                                                 |
| Built-in adapter specialization                 | Specific spec defines complete behavior; general contract is shared                                                                                            |
| Logical declaring-owner facts                   | Logical owner before member identity; raw parser IDs not used                                                                                                  |
| Member semantics and declaration parent         | `MemberSemantics` (`kind`, `dispatch`, `accessor`, `nativeKind`); `parentId` per lexical hierarchy                                                             |
| Human reference parse and render                | Zero/one/many candidates; canonical not parsed as human text                                                                                                   |
| Re-export public bindings                       | Relative via `relativeImportResolution`; package via `packageResolution`; binding uses re-exporting file as surface                                            |
| Hierarchy evidence consistency                  | `hierarchy: true` only when facts emitted; consistent with persisted relations                                                                                 |
| Complete symbol source ranges                   | Construct range + selectionRange; half-open; contained                                                                                                         |
| Declaration classification policy               | Logical target / lexical binding / physical-only / unsupported                                                                                                 |
| Cross-language semantic conformance suite       | Reusable fixture matrix for all built-in adapters                                                                                                              |
| Adding a language adapter                       | 7 steps; no indexer/session/resolver/store changes                                                                                                             |

### Implementation Status

| Requirement                                 | Status                 | Evidence                                                                                                                                             |
| ------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| LanguageAdapter interface (facet model)     | Implemented            | `language-adapter.ts:100` — interface with 6 core methods + 5 optional facets; no old loose methods                                                  |
| Adapter facet model                         | Implemented            | `adapter-registry.ts:20` `FACET_MEMBERS` maps each facet to required members; validation at lines 113-132                                            |
| Package resolution facet                    | Implemented            | `language-adapter-facets.ts:62` `PackageResolutionFacet` with `identity`, `prepare`, `matchSpecifier`, `entrySurface`                                |
| Relative import resolution facet            | Implemented            | `language-adapter-facets.ts:104` `RelativeImportResolutionFacet` with `resolve`                                                                      |
| Qualified-name resolution facet             | Implemented            | `language-adapter-facets.ts:119` `QualifiedNameResolutionFacet` with `build`, `resolveToPath`                                                        |
| Symbol reference syntax facet               | Implemented            | `language-adapter-facets.ts:142` `SymbolReferenceSyntaxFacet` with `parse`, `render`                                                                 |
| Re-export linking facet                     | Implemented            | `language-adapter-facets.ts:187` `ReExportLinkingFacet` with `link`                                                                                  |
| Package import resolution context           | Implemented            | `language-adapter.ts:48` `ImportResolutionContext` with `packageEntryFiles`, `resolvePackageExport`; `package-import-resolver.ts` implements helpers |
| Full-file analysis contract                 | Implemented            | `language-adapter.ts:136` `analyzeFile` returns `FileAnalysisDraft`                                                                                  |
| Parser-authoritative structural extraction  | Implemented (adapters) | Adapter source files derive from parser nodes                                                                                                        |
| Unified built-in adapter migration          | Implemented            | All 4 adapters implement `analyzeFile`/`resolveImports`/`buildRelations`                                                                             |
| Language detection                          | Implemented            | `adapter-registry.ts:168` `getAdapterForFile` uses dynamic extMap                                                                                    |
| Import declaration extraction               | Implemented            | `language-adapter-facets.ts` + `import-declaration.ts`                                                                                               |
| Call resolution                             | Implemented            | Adapters emit call facts; `buildRelations` produces `CALLS`                                                                                          |
| Semantic caller containment                 | Implemented            | Shared policy via `AdapterDeclarationPolicy.callableContainerKinds`                                                                                  |
| Scoped binding fact extraction              | Implemented            | `scoped-binding-environment.ts`                                                                                                                      |
| Built-in multi-language dependency coverage | Implemented            | All 4 adapters registered                                                                                                                            |
| Detectable dependency boundary              | Implemented            | Unresolved dropped; no guessed relations                                                                                                             |
| Hierarchy extraction                        | Implemented            | Adapters emit `EXTENDS`/`IMPLEMENTS`/`OVERRIDES` with provenance                                                                                     |
| Package identity extraction                 | Implemented            | Each adapter's `packageResolution.identity` reads its manifest                                                                                       |
| Import specifier resolution                 | Implemented            | `PackageImportResolver` uses session lookups, no filesystem I/O                                                                                      |
| Tree-sitter query patterns                  | Implemented            | Internal to adapters                                                                                                                                 |
| Adapter registry                            | Implemented            | `adapter-registry.ts:35` `AdapterRegistry` class                                                                                                     |
| Resolver capability declaration             | Implemented            | `AdapterCapabilities`; `getCapabilities` on registry                                                                                                 |
| Built-in adapter specialization             | Implemented            | Each adapter has its own specific spec                                                                                                               |
| Logical declaring-owner facts               | Implemented            | Adapters map owners to logical identities before member IDs                                                                                          |
| Member semantics and declaration parent     | Implemented            | `AdapterDeclarationPolicy`; `parentId` on declarations                                                                                               |
| Human reference parse and render            | Implemented            | `symbolReferenceSyntax` facet                                                                                                                        |
| Re-export public bindings                   | Implemented            | `reExportLinking` facet; `ReExportLinkResult`                                                                                                        |
| Hierarchy evidence consistency              | Implemented            | `hierarchy: true` capability flag backed by facts                                                                                                    |
| Complete symbol source ranges               | Implemented            | `symbol-node.ts` `SourceRange`, `selectionRange` validation                                                                                          |
| Declaration classification policy           | Implemented            | `AdapterDeclarationPolicy` fields                                                                                                                    |
| Cross-language semantic conformance suite   | Implemented            | `language-adapter-conformance.spec.ts`                                                                                                               |
| Adding a language adapter                   | Documented             | `docs/code-graph/language-adapters.md`; `docs/adr/0030-language-adapter-facets.md`                                                                   |

### Discrepancies

**Spec might be wrong:**

- None specific to this spec beyond the global `code-graph:language-adapter` conflict noted above.

**Code might be wrong:**

- **Cross-spec contradiction:** The change's new spec removes `getPackageIdentity?`, `resolvePackageFromSpecifier?`, `resolveQualifiedNameToPath?`, etc., but the global `code-graph:language-adapter` spec (unchanged by this change) still declares them. The implementation follows the new spec, so the global spec is stale and must be updated as part of this change or a dependent change.

### Test Coverage

| Test file                                                                      | Coverage                                              |
| ------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `test/infrastructure/tree-sitter/adapter-registry.spec.ts` (9.4K)              | AdapterRegistry registration, validation, replacement |
| `test/infrastructure/tree-sitter/language-adapter-conformance.spec.ts` (42.4K) | Cross-language conformance suite                      |
| `test/domain/errors/invalid-language-adapter-error.spec.ts`                    | `INVALID_LANGUAGE_ADAPTER` validation                 |
| `test/helpers/stub-language-adapter.ts`                                        | Stub adapter for tests                                |
| `test/helpers/import-resolution-context.ts`                                    | Import resolution context helper                      |
| `test/application/services/package-import-resolver.spec.ts`                    | Package import resolution helpers                     |

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

| Requirement                                        | Status                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| Supported languages `.ts`/`.tsx`/`.js`/`.jsx`      | Implemented                                                                |
| Declaration extraction and ranges                  | Implemented                                                                |
| Object properties in array data records            | Implemented                                                                |
| Logical identity and declaring owners              | Implemented                                                                |
| TypeScript overload and declaration-group identity | Implemented                                                                |
| Imports, exports, and public bindings              | Implemented (package.json, exports/main, entry surface, re-export linking) |
| Scoped bindings, calls, types, construction        | Implemented                                                                |
| TypeScript caller and local-binding semantics      | Implemented                                                                |
| TypeScript hierarchy and provenance evidence       | Implemented (`hierarchy: true`)                                            |
| Package and build-context boundary                 | Implemented (`buildContext: false`; `package.json` manifest)               |
| Capability truthfulness                            | Implemented                                                                |
| Parser-authoritative structural extraction         | Implemented                                                                |

**Test file:** `test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts` (83.9K)

### 4. `code-graph:python-language-adapter`

**Implementation:** `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts` — class `PythonLanguageAdapter` at line 372.

| Requirement                                       | Status                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Supported files `.py`/`.pyi`                      | Implemented                                                                           |
| Python parser-authoritative structural extraction | Implemented                                                                           |
| Declaration extraction and ranges                 | Implemented                                                                           |
| Python logical identity and declaring owners      | Implemented                                                                           |
| Imports and package resolution                    | Implemented (pyproject.toml `[project].name`, entry surface, no filesystem in Pass 2) |
| Resolution manifests                              | Implemented (exactly `['pyproject.toml']`)                                            |
| Scoped bindings, calls, annotations, construction | Implemented                                                                           |
| Python caller containment                         | Implemented                                                                           |
| Python hierarchy and provenance evidence          | Implemented                                                                           |
| Public surface and stub behavior                  | Implemented                                                                           |
| Capability truthfulness                           | Implemented                                                                           |

**Test file:** `test/infrastructure/tree-sitter/python-language-adapter.spec.ts` (45.5K)

### 5. `code-graph:go-language-adapter`

**Implementation:** `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts` — class `GoLanguageAdapter` at line 269.

| Requirement                                     | Status                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------- |
| Supported files `.go`                           | Implemented                                                                 |
| Go parser-authoritative structural extraction   | Implemented                                                                 |
| Declaration extraction and ranges               | Implemented                                                                 |
| Package identity, exports, and imports          | Implemented (go.mod `module`, directory-based entry surface, no test files) |
| Resolution manifests                            | Implemented (exactly `['go.mod']`)                                          |
| Go logical identity and declaring owners        | Implemented (receiver type as owner)                                        |
| Scoped bindings, selectors, construction, types | Implemented                                                                 |
| Go caller containment                           | Implemented                                                                 |
| Go embedding and hierarchy provenance           | Implemented                                                                 |
| Proven interface satisfaction                   | Implemented (`IMPLEMENTS` only when complete method set proven)             |
| Build-context boundary                          | Implemented (`buildContext: false`)                                         |
| Capability truthfulness                         | Implemented                                                                 |

**Test file:** `test/infrastructure/tree-sitter/go-language-adapter.spec.ts` (41.2K)

### 6. `code-graph:php-language-adapter`

**Implementation:** `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts` — class `PhpLanguageAdapter` at line 462.

| Requirement                                    | Status                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| Supported files `.php`                         | Implemented                                                                             |
| PHP parser-authoritative structural extraction | Implemented                                                                             |
| Declaration extraction and ranges              | Implemented                                                                             |
| PHP logical identity and declaring owners      | Implemented                                                                             |
| Namespaces, use aliases, Composer resolution   | Implemented (qualified-name map, PSR-4, `packageEntryFiles`, no `resolvePackageExport`) |
| Resolution manifests                           | Implemented (exactly `['composer.json']`)                                               |
| Static and framework dependency facts          | Implemented                                                                             |
| Scoped bindings, calls, types, construction    | Implemented                                                                             |
| PHP caller containment                         | Implemented                                                                             |
| PHP hierarchy and provenance evidence          | Implemented                                                                             |
| Public surface and capability truthfulness     | Implemented                                                                             |

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

| Test file                             | Adapter            | Size  |
| ------------------------------------- | ------------------ | ----- |
| `typescript-language-adapter.spec.ts` | TypeScript         | 83.9K |
| `python-language-adapter.spec.ts`     | Python             | 45.5K |
| `go-language-adapter.spec.ts`         | Go                 | 41.2K |
| `php-language-adapter.spec.ts`        | PHP                | 81.9K |
| `package-resolution.spec.ts`          | Package resolution | 16.0K |
| `resolution-manifests.spec.ts`        | Manifests          | 3.0K  |

Counts per adapter: Requirements: ~12-15 | Implementation: Implemented | Discrepancies: 0 | Test files: 1 each + shared

---

## Overall Summary

| Spec                                     | Implementation     | Discrepancies                                                                                                                                                         | Test Coverage        |
| ---------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `code-graph:workspace-integration`       | Mostly implemented | 3 (SpecRepository API mismatch; `persistedStateHash`/`readPersistedDependsOn`/`readPersistedImplementation`/`metadata` not called; `documentsIndexed` additive field) | Good (8 test files)  |
| `code-graph:language-adapter`            | Implemented        | 1 (global spec still declares old optional methods removed by new facet spec)                                                                                         | Good (6+ test files) |
| `code-graph:typescript-language-adapter` | Implemented        | 0                                                                                                                                                                     | Good                 |
| `code-graph:python-language-adapter`     | Implemented        | 0                                                                                                                                                                     | Good                 |
| `code-graph:go-language-adapter`         | Implemented        | 0                                                                                                                                                                     | Good                 |
| `code-graph:php-language-adapter`        | Implemented        | 0                                                                                                                                                                     | Good                 |

### Critical Recommendations

1. **Resolve `SpecRepository` API mismatch:** Either update the workspace-integration spec to match the actual `SpecRepository` methods (`readPersistedState`, `readMetadataSnapshot`, `getSpecMetadata` callback) or add the missing methods (`persistedStateHash`, `readPersistedDependsOn`, `readPersistedImplementation`, `metadata`) to `SpecRepository` and update the indexer to call them.

2. **Resolve `LanguageAdapter` cross-spec contradiction:** Update the global `code-graph:language-adapter` spec to remove the old optional methods (`getPackageIdentity?`, `resolvePackageFromSpecifier?`, etc.) and adopt the facet model, consistent with the change's new spec and the implementation.

3. **Clarify `WorkspaceIndexBreakdown`:** The spec lists 6 fields; the implementation has 7 (adds `documentsIndexed`). Either add `documentsIndexed` to the spec or remove it from the implementation.
