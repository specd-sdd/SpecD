# Spec Compliance Audit — code-graph-package-resolution-hardening

- **Mode:** Specific Change (`--change code-graph-package-resolution-hardening`)
- **Timestamp:** 2026-10-23 10:33:39
- **Change state audited:** `verifying`
- **Change specs (10):**
  - `code-graph:language-adapter`
  - `code-graph:typescript-language-adapter`
  - `code-graph:go-language-adapter`
  - `code-graph:php-language-adapter`
  - `code-graph:python-language-adapter`
  - `code-graph:symbol-model`
  - `code-graph:sqlite-graph-store`
  - `code-graph:resolve-symbol-reference`
  - `code-graph:indexer`
  - `code-graph:index-project-graph`
- **Global specs (3):**
  - `default:_global/architecture`
  - `default:_global/testing`
  - `default:_global/conventions`
- **Code graph:** current, complete coverage, schema compatible

---

## Executive Summary

A comprehensive, parallel spec-compliance audit of the `code-graph-package-resolution-hardening` change was executed across three subagent audit batches in this session:

1. **Language Adapters**: `language-adapter`, `typescript-language-adapter`, `go-language-adapter`, `php-language-adapter`, `python-language-adapter`.
2. **Storage & Resolver**: `symbol-model`, `sqlite-graph-store`, `resolve-symbol-reference`.
3. **Indexer Orchestration**: `indexer`, `index-project-graph`, and monorepo global standards (`architecture`, `testing`, `conventions`).

The change is **100% conformant across all 10 specifications (104 requirements, ~380 verification scenarios)** with **0 discrepancies, 0 drift, and 0 regressions**.

### Test Suite Execution

- `@specd/code-graph`: 83 test files passed, **1,444 / 1,444 tests passed (100%)**, 0 failures.
- `@specd/sdk`: 13 test files passed, **122 / 122 tests passed (100%)**, 0 failures.
- Static Type Check (`tsc --noEmit` across all 16 workspaces): **0 errors**.
- ESLint: **0 errors**.
- Graph indexing: **0 errors**, 295 specs indexed cleanly.

---

## Findings Index

| ID      | Severity | Area                   | Status       | Summary                                                                                                                                  |
| ------- | -------- | ---------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| I-1     | High     | Indexer / Architecture | **RESOLVED** | Application use case `IndexCodeGraph` now consumes `WorkspaceAccessibilitySource` application port; direct `node:fs` probing eliminated. |
| ADP-001 | Medium   | Manifest Resolution    | **RESOLVED** | Terminal unreadable/nameless manifests reliably emit diagnostics via `report` without being lost.                                        |
| ADP-002 | Medium   | PHP Adapter            | **RESOLVED** | Composer manifests are parsed and read exactly once per candidate in `prepare`; Pass 2 performs 0 filesystem calls.                      |
| S-1     | Medium   | SQLite Store           | **RESOLVED** | Public store opening raises `GraphStorageRecoveryRequiredError` with `SCHEMA_INCOMPATIBLE`; schema version 16 verified.                  |
| D1      | Medium   | Symbol Resolver        | **RESOLVED** | Session-backed store completely removed `deriveQualifiedName` fallback; queries only stored `qualified_name`.                            |
| D2      | Low      | Testing                | **RESOLVED** | `IndexProjectGraph` test replaced partial-port cast with full `FakeCodeGraphHostProvider` double.                                        |
| T-1     | Low      | Testing                | **RESOLVED** | Core indexer package tests use `node:path`. Unit test `vcs-repository-root-source.spec.ts` uses portable paths and full test double.     |
| T-2     | Low      | Testing                | **RESOLVED** | Comprehensive outcome assertions verified for dual-identity, test symbol filtering, and inaccessible workspace external imports.         |

---

## Detailed Findings

---

# Compliance Audit Partial: Language Adapters

- **Change**: `code-graph-package-resolution-hardening`
- **Batch**: `language-adapters`
- **Assigned Specs**:
  - `code-graph:language-adapter`
  - `code-graph:typescript-language-adapter`
  - `code-graph:go-language-adapter`
  - `code-graph:php-language-adapter`
  - `code-graph:python-language-adapter`
- **Audit Timestamp**: `2026-10-23T10:38:00Z`
- **Auditor**: Spec-Compliance Auditor Subagent
- **Status**: **Fully Conformant (0 Discrepancies)**

---

## 1. Executive Summary

A comprehensive compliance audit was conducted for the **`language-adapters`** batch of the `code-graph-package-resolution-hardening` change, covering:

1. `code-graph:language-adapter` (34 requirements, 170 scenarios)
2. `code-graph:typescript-language-adapter` (12 requirements, 57 scenarios)
3. `code-graph:go-language-adapter` (12 requirements, 31 scenarios)
4. `code-graph:php-language-adapter` (11 requirements, 36 scenarios)
5. `code-graph:python-language-adapter` (11 requirements, 34 scenarios)
   **Total**: **80 requirements, 328 verification scenarios**.

The audit verified all requirements, deltas, and verification scenarios across domain interfaces, facets, adapter registry, bounded manifest search utilities, and tree-sitter implementations for TypeScript, Go, PHP, and Python within `packages/code-graph/`.

Independent verification evidence confirms full health and compliance:

- **Focused Tree-Sitter & Manifest Suite**: **10 test files passed, 566 tests passed** (`test/infrastructure/tree-sitter/`).
- **Use-Cases & Package Import Suite**: **4 test files passed, 59 tests passed** (`test/application/use-cases/index-code-graph.package-imports*`, `package-resolution.spec.ts`).
- **Full `@specd/code-graph` Suite**: **83 test files passed, 1444 tests passed, 0 failures**.
- **Static Type Check**: Passed cleanly with `pnpm --filter @specd/code-graph exec tsc --noEmit` (0 errors).
- **Code Graph Queries**: Symbol searches (`LanguageAdapter`), spec discovery (all 5 specs indexed and ranked), and impact analysis on `language-adapter-facets.ts` executed deterministically.
- **Prior Hardening Items**: ADP-001 (terminal invalid/unreadable manifests reporting diagnostics) and ADP-002 (PHP single-pass Composer parse/read in preparation) remain completely resolved and verified by regression test fixtures.

Zero spec drift, zero code bugs, and zero regressions were found.

---

## 2. Requirements & Verification Scenarios Traceability

### 2.1. `code-graph:language-adapter` (34 Requirements, 170 Scenarios)

#### Requirements Traceability

| Requirement                                    | Implementation Status | Code Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Test Evidence                                                                                                                                                                                                 |
| ---------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LanguageAdapter interface core & facets**    | **Conforms**          | `packages/code-graph/src/domain/value-objects/language-adapter.ts:103-165` defines required core methods (`languages`, `extensions`, `resolutionManifests`, `analyzeFile`, `resolveImports`, `buildRelations`) and optional readonly facets (`packageResolution`, `relativeImportResolution`, `qualifiedNameResolution`, `symbolReferenceSyntax`, `reExportLinking`). All methods are synchronous, deterministic, and pure.                                              | `test/infrastructure/tree-sitter/language-adapter-conformance.spec.ts`, `adapter-registry.spec.ts:148-185`.                                                                                                   |
| **Adapter facet model & failure isolation**    | **Conforms**          | `packages/code-graph/src/domain/value-objects/language-adapter-facets.ts:1-210` defines strict facet contracts. In `index-code-graph.ts:983-1025`, if an adapter throws during `identity`, `prepare`, or `link`, the error is recorded, package identities claimed solely by that adapter are dropped, and `packageResolution` is disabled without failing the indexing run. Relative barrel re-export linking remains active via `reExportLinking`.                     | `test/application/use-cases/index-code-graph.package-imports.spec.ts` (`Package resolution failure keeps relative barrel linking`, `Facet that throws in identity, prepare, or link does not stop the run`).  |
| **Package resolution facet contract**          | **Conforms**          | `language-adapter-facets.ts:10-52` defines `identity`, `prepare`, `matchSpecifier`, and `entrySurface`. Manifest searches are bounded by `repoRoot`. `prepare` runs once per run for all configured workspaces and stores compact immutable data. `entrySurface` and `matchSpecifier` perform zero filesystem I/O.                                                                                                                                                       | `test/infrastructure/tree-sitter/package-resolution.spec.ts`, `find-manifest-field.spec.ts`.                                                                                                                  |
| **Package import resolution helpers**          | **Conforms**          | Generic helpers `packageEntryFiles` and `resolvePackageExport` in `package-import-resolver.ts:1-190`. `resolvePackageExport` resolves a name only when every binding found in requested spaces leads to the same logical target; bindings without a target are ignored by the ambiguity check. `package-unknown` increments `externalPackageImports` and is excluded from error totals.                                                                                  | `test/infrastructure/tree-sitter/package-resolution.spec.ts` (`Bindings without a target are ignored by the ambiguity check`, `Package-unknown is counted, never a failure`).                                 |
| **Package identity extraction**                | **Conforms**          | `index-code-graph.ts:940-1010` queries every registered adapter with `packageResolution` for workspace package identity. Conflicting identities across workspaces emit diagnostics and resolve to neither. Multi-adapter identity for a single workspace is supported. Inaccessible workspace directories report diagnostics and count as external without failing.                                                                                                      | `test/application/use-cases/index-code-graph.package-imports.spec.ts` (`Every adapter is asked for an identity`, `Two workspaces claiming one name resolve to neither`, `Inaccessible workspace is skipped`). |
| **Adapter registry & registration validation** | **Conforms**          | `packages/code-graph/src/infrastructure/tree-sitter/adapter-registry.ts:60-150` validates adapters upon `register()`. Throws `InvalidLanguageAdapterError` (`INVALID_LANGUAGE_ADAPTER`) if core methods are missing, `languages()` does not return a non-empty array of strings, `extensions()` is not a valid map, `resolutionManifests()` entries contain path separators (`/`, `\`) or glob wildcards (`*`, `?`), or a present facet lacks required function members. | `test/infrastructure/tree-sitter/adapter-registry.spec.ts:186-270` (`Malformed languages result is rejected`, `Malformed extensions result is rejected`, `Invalid resolution manifest value is rejected`).    |
| **Cross-language semantic conformance suite**  | **Conforms**          | `test/infrastructure/tree-sitter/language-adapter-conformance.spec.ts:1-550` runs a shared matrix fixture across TypeScript, Python, Go, and PHP adapters enforcing caller containment, scope isolation, ownership hierarchy, physical-only declarations, logical resolution, and zero Pass 2 I/O.                                                                                                                                                                       | All 88 matrix test cases pass.                                                                                                                                                                                |

#### Verification Scenarios Highlights

- **Scenario: Package resolution failure keeps relative barrel linking**: Verified in `index-code-graph.package-imports.spec.ts`. When an adapter's `identity` throws on one workspace, relative barrel re-exports in other workspaces continue linking successfully.
- **Scenario: Bindings without a target are ignored by the ambiguity check**: Verified in `package-resolution.spec.ts`. If an entry exports a name with a resolved target alongside a re-export with no target, the resolved target is returned.
- **Scenario: Package-unknown is counted, never a failure**: Verified in `index-code-graph.package-imports.spec.ts`. External package imports increment `externalPackageImports` and are not classified as errors in `total`, `byReason`, or `samples`.
- **Scenario: Malformed languages / extensions / resolutionManifests rejected**: Verified in `adapter-registry.spec.ts`. Registrations with globs, path separators, or malformed structures are rejected with `INVALID_LANGUAGE_ADAPTER`.

---

### 2.2. `code-graph:typescript-language-adapter` (12 Requirements, 57 Scenarios)

#### Requirements Traceability

| Requirement                                      | Implementation Status | Code Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Test Evidence                                                                                                        |
| ------------------------------------------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Supported languages & deterministic analysis** | **Conforms**          | `typescript-language-adapter.ts:3160-3180` handles `.ts`, `.tsx`, `.js`, `.jsx` as `typescript`, `tsx`, `javascript`, and `jsx`. Parser AST nodes are discarded from `FileAnalysisDraft` after Pass 1.                                                                                                                                                                                                                                                                                        | `test/infrastructure/tree-sitter/typescript-language-adapter.spec.ts`.                                               |
| **Declaration extraction and complete ranges**   | **Conforms**          | Extracts functions, callable variables, classes, methods, fields, namespaces, destructuring, exported variables, type aliases, interfaces, and enums. Preserves parser construct ranges and identifier `selectionRange`.                                                                                                                                                                                                                                                                      | `typescript-language-adapter.spec.ts:1-124`.                                                                         |
| **Object properties in array data records**      | **Conforms**          | `typescript-language-adapter.ts:460-520` filters out non-callable object properties when the enclosing object is anonymous and an array boundary is encountered before a named declaration. Preserves properties in named declarations wrapped in `as const` / `satisfies`.                                                                                                                                                                                                                   | `typescript-language-adapter.spec.ts:420-510`.                                                                       |
| **Logical identity and declaring owners**        | **Conforms**          | Methods and properties use their syntactically declaring class/interface logical identity as owner. Overload sets retain distinct occurrences under one logical identity.                                                                                                                                                                                                                                                                                                                     | `typescript-language-adapter.spec.ts:600-750`.                                                                       |
| **Imports, exports, and public bindings**        | **Conforms**          | `resolveImports` and `linkReExports` handle named, default, namespace, and side-effect imports. Type-only default import (`import type X from 'pkg'`) binds only when default export is in type space; binds no value declaration. Star re-exports skip default export.                                                                                                                                                                                                                       | `typescript-language-adapter.spec.ts:1820-1940`.                                                                     |
| **Package and build-context boundary**           | **Conforms**          | `packageResolution` facet: `resolutionManifests() === ['package.json']`. `identity` and `prepare` use bounded `findPackageManifest`. Compact prepared data (`name`, `main`, `exports`, `codeRootOffset`). Bounded manifest search handles code roots below `package.json` (`src/`). Drops candidates outside code root. Declaration files (`.d.ts`) map to indexed `.ts` sources; `dist/` maps to `src/`; unknown build dirs (`build/`) rejected without guessing. `buildContext` is `false`. | `test/infrastructure/tree-sitter/package-resolution.spec.ts:1-150`, `typescript-language-adapter.spec.ts:3180-3330`. |

#### Verification Scenarios Highlights

- **Scenario: Type-only default import binds no value**: Verified in `typescript-language-adapter.spec.ts`. `import type X from 'pkg'` does not bind to value export.
- **Scenario: Code root below package.json keeps identity and entry surface**: Verified in `package-resolution.spec.ts`. Workspace at `<root>/src` with manifest at `<root>/package.json` resolves identity and entry surface relative to `src`.
- **Scenario: Dist and declaration files map to source**: Verified in `package-resolution.spec.ts`. `exports["."]` pointing to `./dist/index.js` or `./dist/index.d.ts` maps to indexed `src/index.ts`.
- **Scenario: Candidate outside code root dropped**: Verified in `package-resolution.spec.ts`. Candidates outside `codeRoot` yield no entries.

---

### 2.3. `code-graph:go-language-adapter` (12 Requirements, 31 Scenarios)

#### Requirements Traceability

| Requirement                                      | Implementation Status | Code Evidence                                                                                                                                                                                                                                                                                                                               | Test Evidence                                                      |
| ------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Supported files & deterministic analysis**     | **Conforms**          | `go-language-adapter.ts:1-1611` handles `.go` as `go`. Parses content once without invoking the Go toolchain. AST nodes are discarded after Pass 1.                                                                                                                                                                                         | `test/infrastructure/tree-sitter/go-language-adapter.spec.ts`.     |
| **Parser-authoritative structural extraction**   | **Conforms**          | AST receiver parameter node extracts receiver type and pointer semantics. Struct fields own struct as logical owner and parentId. Calls and composite literals use AST nodes rather than regexes.                                                                                                                                           | `go-language-adapter.spec.ts:1-64`.                                |
| **Package identity, exports, and imports**       | **Conforms**          | Uppercase identifiers yield public bindings; lowercase declarations remain non-exported. `resolutionManifests() === ['go.mod']`. `identity` extracts module path unquoting string literals (`module "example.com/mod"` -> `example.com/mod`). `matchSpecifier` matches by longest module prefix.                                            | `go-language-adapter.ts:1590-1611`, `go-language-adapter.spec.ts`. |
| **Module directory & entry surface preparation** | **Conforms**          | `prepare` locates module directories using bounded `findPackageManifest` once and indexes non-test `.go` files per directory. Module directory above code root is supported (`<module>/internal`). Entry surface excludes `_test.go` and drops directories outside the code root. In Pass 2, `entrySurface` performs zero filesystem reads. | `go-language-adapter.ts:1540-1589`, `go-language-adapter.spec.ts`. |
| **Embedding and hierarchy provenance**           | **Conforms**          | Local interface embeddings retain embedding path and query member under embedded owner. Struct promotion remains unsupported. Complete same-file method set is required for `IMPLEMENTS`.                                                                                                                                                   | `go-language-adapter.spec.ts:300-450`.                             |

#### Verification Scenarios Highlights

- **Scenario: go.mod above the code root**: Verified in `go-language-adapter.spec.ts`. Workspace code root at `<module>/internal` resolves imports relative to module root.
- **Scenario: Quoted module path is unquoted**: Verified in `go-language-adapter.spec.ts`. `module "example.com/mod"` yields `example.com/mod`.
- **Scenario: Package directory outside the code root yields no entries**: Verified in `go-language-adapter.spec.ts`. Subpackages outside `codeRoot` return empty candidates.
- **Scenario: Module directory is located once in prepare**: Verified in `go-language-adapter.spec.ts`. Pass 2 runs without filesystem reads.

---

### 2.4. `code-graph:php-language-adapter` (11 Requirements, 36 Scenarios)

#### Requirements Traceability

| Requirement                                          | Implementation Status | Code Evidence                                                                                                                                                                                                                                                                                                                     | Test Evidence                                                                                                                                                            |
| ---------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Supported files & deterministic analysis**         | **Conforms**          | `php-language-adapter.ts:1-2936` handles `.php` as `php`. Parses once without executing PHP or autoloading. AST nodes are discarded after Pass 1.                                                                                                                                                                                 | `test/infrastructure/tree-sitter/php-language-adapter.spec.ts`.                                                                                                          |
| **Parser-authoritative structural extraction**       | **Conforms**          | Types, traits, properties, methods, namespace uses, require/include, calls, hierarchy clauses extracted directly from AST. Properties, class constants, enum cases extracted as `SymbolKind.Property`.                                                                                                                            | `php-language-adapter.spec.ts:1-129`.                                                                                                                                    |
| **Namespaces, use aliases, and Composer resolution** | **Conforms**          | `resolutionManifests() === ['composer.json']`. `identity` reads Composer `name` using bounded search, skipping nameless manifests with diagnostics. `preparePackages` prefers named `composer.json` over nearest nameless `composer.json`.                                                                                        | `php-language-adapter.ts:2270-2290`, `php-language-adapter.spec.ts`.                                                                                                     |
| **Single-read / single-parse Composer preparation**  | **Conforms**          | `inspectComposerManifest` (`php-language-adapter.ts:484-547`) parses `JSON.parse(content)` once per candidate, extracting package name, normalized PSR-4 mappings, and `autoloadDevDirs`. `readComposerManifest` (`:2209-2264`) reuses `result.match.value` directly into session state. Zero redundant I/O or second JSON parse. | `php-language-adapter.spec.ts` (`Prepare parses composer.json once`, `Nameless Composer fallback is also read and parsed once`).                                         |
| **PSR-4 mapping order & dev directory isolation**    | **Conforms**          | PSR-4 map merges `autoload` before `autoload-dev`, preserves shared prefix order, and sorts longest prefix first. Own-workspace PSR-4 fallback resolves without a Composer name and never leaks test/dev files to production importers.                                                                                           | `php-language-adapter.spec.ts` (`autoload and autoload-dev share a prefix`, `Candidates follow the longest prefix first`, `Own PSR-4 fallback without a Composer name`). |
| **Pass 2 I/O purity**                                | **Conforms**          | `entrySurface` and `resolveToPath` operate purely against session-cached metadata. `realpathSync` spy confirmed 0 calls.                                                                                                                                                                                                          | `php-language-adapter.spec.ts` (`Scenario: entrySurface performs no filesystem access during Pass 2`).                                                                   |

#### Verification Scenarios Highlights

- **Scenario: Prepare parses composer.json once**: Verified in `php-language-adapter.spec.ts`. `inspectComposerManifest` executes a single JSON parse per file candidate.
- **Scenario: Autoload and autoload-dev share a prefix**: Verified in `php-language-adapter.spec.ts`. Merging `autoload` and `autoload-dev` retains both `src/` and `tests/` directories without loss.
- **Scenario: Candidates follow longest prefix first**: Verified in `php-language-adapter.spec.ts`. `App\Http\` candidate is checked before `App\`.
- **Scenario: Own PSR-4 fallback never returns test file for production code**: Verified in `php-language-adapter.spec.ts`. Production importers do not resolve classes in `autoloadDevDirs`.

---

### 2.5. `code-graph:python-language-adapter` (11 Requirements, 34 Scenarios)

#### Requirements Traceability

| Requirement                                      | Implementation Status | Code Evidence                                                                                                                                                                                                                                                    | Test Evidence                                                                                                             |
| ------------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Supported files & deterministic analysis**     | **Conforms**          | `python-language-adapter.ts:1-2076` handles `.py` and `.pyi` as `python`. Parses once without importing or executing analyzed modules. AST nodes discarded after Pass 1.                                                                                         | `test/infrastructure/tree-sitter/python-language-adapter.spec.ts`.                                                        |
| **Declaration extraction & logical identity**    | **Conforms**          | Extracts functions, classes, methods, module/class assignments, dataclass fields, Protocol annotations. Properties extracted as `SymbolKind.Property`. Methods owned by enclosing class; nested functions remain unsupported.                                    | `python-language-adapter.spec.ts:1-69`.                                                                                   |
| **Package resolution facet & manifest identity** | **Conforms**          | `resolutionManifests() === ['pyproject.toml']`. `identity` extracts `[project].name`, ignoring earlier tables like `[tool.poetry]`. Nameless manifests skipped with diagnostic.                                                                                  | `python-language-adapter.ts:2020-2045`, `python-language-adapter.spec.ts`.                                                |
| **PEP 503 normalization & specifier matching**   | **Conforms**          | `normalizePythonDistName` in `python-language-adapter.ts:2048-2053` normalizes distribution names per PEP 503 (lowercasing, replacing runs of `_`, `.`, `-` with a single `-`). Matches only unambiguous single targets; equal normalized names stay unresolved. | `python-language-adapter.spec.ts` (`Dots and case normalize`, `Equal normalized names stay unresolved`).                  |
| **Submodule resolution & entry surface purity**  | **Conforms**          | Submodule imports without `__init__.py` resolve when unique; submodules indexed under two roots stay unresolved. `entrySurface` resolves from session indexed files without filesystem reads.                                                                    | `python-language-adapter.spec.ts` (`Submodule import without an init file`, `Entry surface performs no filesystem read`). |

#### Verification Scenarios Highlights

- **Scenario: Dots and case normalize**: Verified in `python-language-adapter.spec.ts`. `Acme.Auth` and `acme_auth` match correctly under PEP 503 normalization.
- **Scenario: Equal normalized names stay unresolved**: Verified in `python-language-adapter.spec.ts`. Competing packages `acme-auth` and `acme_auth` produce ambiguity and stay unresolved.
- **Scenario: Submodule import without init file**: Verified in `python-language-adapter.spec.ts`. `from acme_auth import models` depends on `models.py` when `__init__.py` is absent.
- **Scenario: Python identity ignores earlier table name**: Verified in `python-language-adapter.spec.ts`. Manifest with `[tool.poetry]` before `[project]` extracts `[project].name`.

---

## 3. Verification of Past Findings and Hardening Targets

### ADP-001 — Terminal invalid/unreadable manifests report diagnostic (RESOLVED)

- **Prior Issue**: When searching for package manifests up to the repository boundary without finding any usable manifest, candidates that were invalid JSON, unreadable, or lacked required package identity were accumulated in `skipped` but discarded upon returning `undefined`, causing terminal skipped manifests to never emit diagnostics via the `report` callback.
- **Current Verification**:
  - In `packages/code-graph/src/infrastructure/tree-sitter/find-manifest-field.ts`, `findPackageManifest` returns a `PackageManifestSearchResult` carrying `{ match: fallback, skipped }`. When the search terminates at the boundary without a match, `skipped` preserves all encountered invalid/unreadable/nameless candidates.
  - All four built-in language adapters (`typescript-language-adapter.ts:3203-3207`, `go-language-adapter.ts:1606-1608`, `php-language-adapter.ts:2284-2286`, `python-language-adapter.ts:2040-2042`) iterate `result.skipped` and report diagnostics via `report?.(\`Package manifest skipped (no identity): ${skipped}\`)`unconditionally, regardless of whether`result.match` is defined or undefined.
  - In `index-code-graph.ts:965-971`, the indexer registers the report callback to push non-fatal errors to `IndexResult.errors` (`filePath: \`${ws.name}:<manifest>\``).
  - Explicit test coverage in `test/infrastructure/tree-sitter/find-manifest-field.spec.ts` (`Scenario: Terminal skipped manifest still reports its diagnostic`) and adapter suites confirms terminal diagnostics are emitted and retained.
- **Status**: **CONFORMANT (Resolved)**.

### ADP-002 — PHP adapter: Composer preparation parses/reads the chosen manifest exactly once (RESOLVED)

- **Prior Issue**: `readComposerManifest` previously performed multiple passes (`findPackageManifest` followed by a JSON parse of the matched content, plus a potential second search for nameless manifests), duplicating I/O and JSON parsing for both named and nameless composer manifests.
- **Current Verification**:
  - `inspectComposerManifest` in `php-language-adapter.ts:484-547` executes a single JSON parse (`JSON.parse(content)`) per file candidate, extracting the package name, normalized PSR-4 mappings (merging `autoload` before `autoload-dev`), and `autoloadDevDirs` in one pass.
  - Manifest inspection returns `{ kind: 'match', value: parsed }` for named manifests, and `{ kind: 'fallback', value: parsed }` for nameless manifests.
  - `findPackageManifest` runs `inspectComposerManifest` once per read candidate, selects the preferred named match or retains the nearest fallback, and returns the already-parsed `value`.
  - `readComposerManifest` (`php-language-adapter.ts:2209-2264`) calls `findPackageManifest` exactly once, reusing `result.match.value` directly into session-cached `ComposerManifestData` and `psr4ByCodeRoot` without any re-read or second JSON parse.
  - In Pass 2, `entrySurface` and `resolveToPath` execute purely against session-cached metadata; test `Scenario: entrySurface performs no filesystem access during Pass 2` asserts via `vi.spyOn(fs, 'realpathSync')` that zero filesystem calls occur.
- **Status**: **CONFORMANT (Resolved)**.

### Manifest Search Bounds (Code root repository, no walk up if no VCS) (RESOLVED)

- **Requirement**: Search starts at the canonical code root and walks upward bounded by `repoRoot`. If no VCS repository root is detected (`repoRoot === undefined`), only the code root itself is inspected and no upward walk occurs. If `codeRoot` lies outside `repoRoot`, the boundary collapses to `codeRoot` to prevent escaping into ancestor or filesystem root directories.
- **Current Verification**:
  - In `find-manifest-field.ts:79-87`, `canonical(codeRoot)` normalizes symlinks and strips trailing separators. `boundary` is set to `repoRoot === undefined ? start : canonical(repoRoot)`. If `relative(boundary, start)` is outside (`startsWith('..')` or absolute), `boundary = start`.
  - When `repoRoot` is undefined, `start === boundary`, inspecting only `start` and immediately terminating (`if (dir === boundary)`).
  - Tests in `find-manifest-field.spec.ts` verify:
    - `Manifest above the code root inside the repository is found`
    - `Search stops at the repository root`
    - `External code root uses its own repository boundary`
    - `No repoRoot inspects only the code root`
    - `Code root outside the supplied boundary collapses to the code root and never reaches filesystem root`
    - `Symlinked and trailing-separator code roots are canonicalized`
- **Status**: **CONFORMANT (Resolved)**.

### Read Once in Prepare, Link Performs No I/O (RESOLVED)

- **Requirement**: Workspaces are prepared once prior to Pass 2. `entrySurface`, `matchSpecifier`, and `reExportLinking.link` MUST NOT perform filesystem I/O.
- **Current Verification**:
  - TypeScript: `prepareWorkspaceManifest` caches compact `PackageEntryManifest` (`name`, `main`, `exports`, `codeRootOffset`). `linkReExports` operates strictly in memory over session logical symbols, declarations, public bindings, and indexed file paths.
  - Go: `prepare` builds package directory indices and computes module-to-code-root offsets once. `entrySurface` performs zero filesystem reads.
  - PHP: `preparePackages` records PSR-4 prefix mappings and workspace package owners in session state. `entrySurface` reads exclusively from cached session state.
  - Python: `prepare` is a no-op; entry surfaces resolve from session package maps and indexed file paths without manifest access.
  - Matrix suite `language-adapter-conformance.spec.ts` enforces `performs no filesystem metadata reads in per-file relation analysis after preparation` across all registered language adapters by mocking `node:fs` (`readFileSync`, `statSync`, `existsSync`, `readdirSync`) and verifying zero calls in Pass 2.
- **Status**: **CONFORMANT (Resolved)**.

---

## 4. Cross-Cutting & Global Consistency

1. **Architecture & Purity**:
   - Language adapters are stateless and synchronous; they receive content as strings in Pass 1 and interact with cross-file context only through `IndexSession` in Pass 2.
   - AST nodes are strictly discarded from `FileAnalysisDraft` after Pass 1, avoiding long-lived memory pressure.
   - File-level `IMPORTS` edges are synthesized by the indexer from `resolveImports()` outputs rather than emitted directly by adapters.

2. **Graph Model Alignment**:
   - Symbols, logical declarations, and public bindings adhere strictly to `SymbolModel` contracts.
   - `SymbolKind.Property` is used consistently across TypeScript (interface properties, class fields, enum members), Go (struct fields), PHP (properties, class constants, enum cases), and Python (class assignments, dataclass fields, Protocol annotations).

3. **Error Isolation & Diagnostic Transparency**:
   - Manifest skips emit informative diagnostics through `report` callbacks.
   - Adapter registration errors throw standard `InvalidLanguageAdapterError` (`INVALID_LANGUAGE_ADAPTER`) with detailed explanations of the failing rule.
   - External package imports (`package-unknown`) increment `externalPackageImports` without contaminating failure metrics.

---

## 5. Discrepancies, Regressions & Gaps

| Severity     | Count | Details |
| ------------ | ----: | ------- |
| **Critical** |     0 | None.   |
| **High**     |     0 | None.   |
| **Medium**   |     0 | None.   |
| **Low**      |     0 | None.   |

All 80 requirements and 328 verification scenarios across the 5 language adapter specs are fully implemented and verified. Past review findings remain resolved with regression tests in place.

---

## 6. Conclusion & Recommendation

The **`language-adapters`** batch of `code-graph-package-resolution-hardening` is **100% compliant and production-ready**. All unit tests, integration tests, contract conformance suites, and TypeScript static type checks pass cleanly without regressions. No further implementation or specification adjustments are required for this batch.

---

# Compliance Audit Partial: Storage and Resolver

- **Change**: `code-graph-package-resolution-hardening`
- **Batch**: `storage-resolver`
- **Assigned Specs**:
  - `code-graph:symbol-model`
  - `code-graph:sqlite-graph-store`
  - `code-graph:resolve-symbol-reference`
- **Audit Timestamp**: `2026-10-23T10:36:00Z`
- **Auditor**: Spec-Compliance Auditor Subagent
- **Status**: **Fully Conformant (0 Discrepancies)**

---

## 1. Executive Summary

A comprehensive compliance audit was conducted for the **`storage-resolver`** batch of the `code-graph-package-resolution-hardening` change, covering:

1. `code-graph:symbol-model`
2. `code-graph:sqlite-graph-store`
3. `code-graph:resolve-symbol-reference`

The audit verified all requirements, deltas, and verification scenarios across domain value objects, application use cases/services, and infrastructure SQLite components within `packages/code-graph/`.

All 257 unit and integration tests across 6 targeted test suites executed cleanly and passed in ~33 seconds. Past findings from earlier review cycles (S-1 on SQLite error classification and D1 on session-backed qualified name derivation fallback) remain completely resolved with dedicated regression tests in place.

No spec drift, code bugs, or regressions were detected. The implementation strictly adheres to all architectural boundaries, error handling conventions, and test standards.

---

## 2. Requirements & Verification Scenarios Traceability

### 2.1. `code-graph:symbol-model`

#### Requirements Traceability

| Requirement                                      | Implementation Status | Code Evidence                                                                                                                                                                                                                                                                                                                                                                               | Test Evidence                                                                                                                                                                                                   |
| ------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **File node — canonical identity & properties**  | **Conforms**          | `FileNode` in `domain/value-objects/file-node.ts:10-21` defines canonical `path`, `projectRelativePath`, `language`, `contentHash`, `workspace`, `category`, and optional `embedding`/`content`. Path equality is strictly enforced.                                                                                                                                                        | `test/domain/value-objects/file-node.spec.ts:5-150` covers forward-slash normalization and path-based identity.                                                                                                 |
| **File node — paired namespace fields**          | **Conforms**          | `FileNode` declares `readonly namespace?: string \| undefined` and `readonly namespaceSeparator?: string \| undefined`. `createFileNode` (`file-node.ts:68-73`) pairs them: if `namespace !== undefined`, sets `namespace` and defaults `namespaceSeparator` to `.` when omitted; if `namespace === undefined`, neither property is set. Neither field participates in `FileNode` equality. | `test/domain/value-objects/file-node.spec.ts:162-219` covers omission of both, defaulting separator to `.`, explicit separator, ignoring separator without namespace, and asserting equality ignores namespace. |
| **Spec node & Symbol node**                      | **Conforms**          | Deterministic symbol ID computed from `filePath + kind + name + line + column`, project-relative path denormalization, selection coordinates, search text, and spec nodes remain intact.                                                                                                                                                                                                    | `test/domain/value-objects/symbol-node.spec.ts`, `symbol-reference.spec.ts`.                                                                                                                                    |
| **First-class binding model & Member semantics** | **Conforms**          | Immutable value objects for `LogicalSymbol`, `PublicBinding`, `LocalBinding`, `ResolutionStep`, `SymbolSpace`, `MemberKind`, `MemberDispatch`, and `MemberAccessor`. Local binding source ranges (`startLine`, `startColumn`, `endLine`, `endColumn`) are fully represented.                                                                                                                | `test/domain/value-objects/symbol-reference.spec.ts:1-17`.                                                                                                                                                      |

#### Verification Scenarios Audit

- **Scenario: File namespace is optional and paired**
  - _Spec Requirement_: A PHP file declaring `namespace App\Models;` and a Go file declaring no namespace produce file nodes where PHP node has `namespace: App\Models` and `namespaceSeparator: \`, Go node has neither field, and namespace data does not affect `FileNode` equality.
  - _Audit_: Verified in `test/domain/value-objects/file-node.spec.ts:162-219`. All pairing conditions, defaulting to `.`, omitting `namespaceSeparator` when `namespace` is undefined, and identity preservation are tested and passing.

---

### 2.2. `code-graph:sqlite-graph-store`

#### Requirements Traceability

| Requirement                                                   | Implementation Status | Code Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Test Evidence                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SQLite-backed implementation & Worker isolation**           | **Conforms**          | Dedicated persistent Node.js worker (`node:worker_threads`), structured-cloneable DTOs, monotonic correlation IDs, FIFO queue, max pending operations limit (256), drain timeout (5000ms), and idempotent close.                                                                                                                                                                                                                                                                        | `infrastructure/sqlite/sqlite-graph-store.ts`, `sqlite-worker.ts`, `sqlite-worker-client.ts`, `test/infrastructure/sqlite/sqlite-worker-protocol.spec.ts` (3/3 passed).                                                                                                                  |
| **Persisted node storage: `files` table schema v16**          | **Conforms**          | `schema.ts:1-17` sets `SQLITE_SCHEMA_VERSION = 16` and includes `namespace TEXT` and `namespace_separator TEXT` in the `files` table DDL. Both columns are nullable.                                                                                                                                                                                                                                                                                                                    | `sqlite-graph-store.spec.ts:1907-1919` verifies columns exist in schema 16.                                                                                                                                                                                                              |
| **File namespace roundtrip across read/write paths**          | **Conforms**          | `sqlite-graph-database.ts:460` (get by path), `:507` (get by projectRelativePath), `:715` (get by paths batch), `:1182` (getAllFiles), `:1993`, `:2033` (incremental hydration), `:2822` & `:2858` (file upsert), and `:3822-3852` (`mapFileRow`) handle `namespace` and `namespace_separator` consistently.                                                                                                                                                                            | `test/infrastructure/sqlite/sqlite-graph-store.spec.ts:3135-3183` tests single get, batch get, and scan roundtrips.                                                                                                                                                                      |
| **Reference schema upgrade: v15 rejection & v16 recreation**  | **Conforms**          | `assertExistingSchemaCompatible` (`sqlite-graph-database.ts:2692-2705`) detects `schemaVersion !== 16` and raises `GraphSchemaIncompatibleError`. `open()` (`:376-382`) maps it via `getStorageRecoveryReason(error)` to `GraphStorageRecoveryRequiredError` with reason `SCHEMA_INCOMPATIBLE`. Worker protocol (`sqlite-worker.ts:50-52` and `sqlite-worker-client.ts:156-160`) deserializes it faithfully on the host. `recreate()` rotates storage generation and creates schema 16. | `test/infrastructure/sqlite/sqlite-graph-store.spec.ts:1870-1920` asserts opening v15 database throws `GraphStorageRecoveryRequiredError` with reason `SCHEMA_INCOMPATIBLE`, keeps generation token, and after `recreate()` updates to schema 16 with rotated token and columns present. |
| **Persisted relation, bindings, coverage, & worker batching** | **Conforms**          | Set-based worker RPCs chunked within SQLite parameter limits; indexed `qualified_name` on `logical_symbols`; `local_bindings` source coordinates; reverse coverage batching.                                                                                                                                                                                                                                                                                                            | `sqlite-graph-database.ts:2433-2447`, `test/infrastructure/sqlite/sqlite-graph-store.spec.ts`.                                                                                                                                                                                           |

#### Verification Scenarios Audit

- **Scenario: Namespace round-trips through the files table**
  - _Spec Requirement_: A file upserted with `namespace` `App\Models` and `namespaceSeparator` `\` reads back with both unchanged; a file upserted without namespace reads back with neither.
  - _Audit_: Verified in `test/infrastructure/sqlite/sqlite-graph-store.spec.ts:3135-3183`. Tests single file retrieval (`getFile`), batch retrieval (`getFilesByPaths`), and full scan (`getAllFiles`). Passes cleanly.
- **Scenario: Version 15 database is rejected after the bump**
  - _Spec Requirement_: Persisted version 15 database opened for ordinary read fails with `GraphStorageRecoveryRequiredError` and recovery reason `SCHEMA_INCOMPATIBLE`. `graph index` / `recreate` recreates derived storage as version 16 and rotates `storage.epoch`.
  - _Audit_: Verified in `test/infrastructure/sqlite/sqlite-graph-store.spec.ts:1870-1920`. Passes cleanly.

---

### 2.3. `code-graph:resolve-symbol-reference`

#### Requirements Traceability

| Requirement                                                     | Implementation Status | Code Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Test Evidence                                                                                                                                                                                                        |
| --------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Structured reference input & Stored-only equality**           | **Conforms**          | `isExactLaneQuery` and `qualifiedLookupText` (`domain/services/exact-lane-query.ts:1-28`) recognize dotted and `::` spellings (normalizing `::` to `.`). `ResolveSymbolReference.executeBatch()` loads candidate symbols via `store.findLogicalSymbolsByQualifiedNames(qualifiedNames)`. In `resolveQualifiedMember` (`application/use-cases/resolve-symbol-reference.ts:1034-1042`), lookup strictly checks `target.qualifiedName === spelling` and visibility at anchor/workspace. Neither resolver nor stores synthesize derived qualified names. | `test/application/use-cases/resolve-symbol-reference.spec.ts:1573-1610` (`Scenario: Qualified name is not derived from owner and member`).                                                                           |
| **Session and persisted store parity (Finding D1 fix)**         | **Conforms**          | `SessionReferenceStore.findLogicalSymbolsByQualifiedNames` (`application/services/session-reference-store.ts:59-68`) filters strictly on `symbol.qualifiedName !== undefined && names.has(symbol.qualifiedName)`. `deriveQualifiedName` was eliminated. SQLite store (`sqlite-graph-database.ts:2433-2447`) queries `WHERE qualified_name IN (...)`. Both reject unstored qualified spellings equally.                                                                                                                                               | Dedicated parity test in `test/application/services/session-reference-store.spec.ts:25-88` verifies session store and SQLite store yield identical results: matching stored spelling and rejecting derived spelling. |
| **Adapter selection from proven context & No generic fallback** | **Conforms**          | `parseAnchoredReference` (`resolve-symbol-reference.ts:1094-1113`) selects an adapter only from: 1) explicit `request.language`, 2) anchored file extension (`request.filePath ?? request.publicSurface`). If no adapter matches, or the adapter lacks the `symbolReferenceSyntax` facet, it returns `{ candidates: [] }`, resulting in `REFERENCE_UNPROVEN`. No fallback to another adapter or generic delimiter parsing occurs.                                                                                                                    | `test/application/use-cases/resolve-symbol-reference.spec.ts:1526-1571` (`Scenario: Anchor without an adapter leaves human text unresolved`).                                                                        |
| **Canonical targets, evidence, & outcome discrimination**       | **Conforms**          | Returns discriminated target types (`logical-target`, `declaration`, `public-binding`) with complete declaration occurrences and provenance.                                                                                                                                                                                                                                                                                                                                                                                                         | `test/application/use-cases/resolve-symbol-reference.spec.ts:1330-1520`.                                                                                                                                             |
| **Batch freshness and coverage gate**                           | **Conforms**          | Health evaluated once per batch; individual file content hashes and public surfaces evaluated; missing exports proven by fresh surface.                                                                                                                                                                                                                                                                                                                                                                                                              | `test/application/use-cases/resolve-symbol-reference.spec.ts:100-200`.                                                                                                                                               |
| **Hierarchy-aware member resolution**                           | **Conforms**          | Resolves inherited members under ancestor owners, detects overrides, and preserves equal-depth ties as ambiguous.                                                                                                                                                                                                                                                                                                                                                                                                                                    | `test/application/use-cases/resolve-symbol-reference.spec.ts:220-300`.                                                                                                                                               |
| **Package import bindings**                                     | **Conforms**          | Language-neutral traversal of `import:package` steps with complete provenance trail.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `test/application/use-cases/resolve-symbol-reference.spec.ts`, `index-code-graph.language-independence.spec.ts`.                                                                                                     |

#### Verification Scenarios Audit

- **Scenario: Anchor without an adapter leaves human text unresolved**
  - _Spec Requirement_: Request anchored to a Go package surface whose language has no `symbolReferenceSyntax` facet with an owner-qualified text that is not a stored `qualified_name` yields `unresolved`, without running generic delimiter parsers or consulting other language adapters.
  - _Audit_: Verified in `test/application/use-cases/resolve-symbol-reference.spec.ts:1526-1571`. Spies on TypeScript and PHP adapters confirm neither was invoked; outcome is `unresolved`.
- **Scenario: Qualified name is not derived from owner and member**
  - _Spec Requirement_: A member whose stored `qualified_name` differs from the spelling `Owner.member` does not match unanchored text `Owner.member`.
  - _Audit_: Verified in `test/application/use-cases/resolve-symbol-reference.spec.ts:1573-1610`. The lookup strictly compares stored `qualified_name` and returns `unresolved` for the derived spelling, while successfully resolving the stored spelling (`Custom.different`).
- **Scenario: Session and persisted lookup reject an unstored qualified spelling equally**
  - _Spec Requirement_: A logical member with an owner and name but no stored `qualified_name` yields identical candidate sets (empty) when queried from the in-memory session store and the persisted SQLite store.
  - _Audit_: Verified in `test/application/services/session-reference-store.spec.ts:25-88`. Both stores return identical results for stored and unstored/derived spellings.

---

## 3. Detailed Review of Past Findings & Invariants

### 3.1. Finding S-1 (SQLite version-15 open error classification): RESOLVED

- **Context**: In an earlier iteration, the spec delta for `code-graph:sqlite-graph-store` required `GraphSchemaIncompatibleError` upon opening a v15 database, whereas `SQLiteGraphStore` wrapped internal recovery conditions in `GraphStorageRecoveryRequiredError(reason: 'SCHEMA_INCOMPATIBLE')`.
- **Alignment**: The spec and verify deltas were aligned to the public recovery wrapper contract:
  > "...a persisted version 15 database MUST make ordinary store opening fail with the public `GraphStorageRecoveryRequiredError` and recovery reason `SCHEMA_INCOMPATIBLE`; the low-level `GraphSchemaIncompatibleError` MAY be retained as internal cause or diagnostic evidence but MUST NOT replace the public recovery wrapper."
- **Verification**: In `sqlite-graph-database.ts:376-382`, any error classified by `getStorageRecoveryReason(error)` (which maps `GraphSchemaIncompatibleError` to `'SCHEMA_INCOMPATIBLE'`) is rethrown as `GraphStorageRecoveryRequiredError`. This error is passed across the worker thread boundary via serialization (`sqlite-worker.ts:50-52`) and reconstructed on the host (`sqlite-worker-client.ts:156-160`). The test `sqlite-graph-store.spec.ts:1870-1920` asserts that `open()` fails with `GraphStorageRecoveryRequiredError` and `{ reason: 'SCHEMA_INCOMPATIBLE' }`.

### 3.2. Finding D1 (Session-backed qualified-name lookup deriving unstored names): RESOLVED

- **Context**: `SessionReferenceStore.findLogicalSymbolsByQualifiedNames` previously fell back to `deriveQualifiedName(symbol, byId)`, synthesizing an unstored dotted spelling. This caused the session store to resolve queries that the persisted SQLite store would reject, violating backend parity.
- **Alignment**: `deriveQualifiedName` was completely eliminated from `session-reference-store.ts`. Lookup now strictly evaluates:
  ```ts
  this.session
    .getLogicalSymbols()
    .filter((symbol) => symbol.qualifiedName !== undefined && names.has(symbol.qualifiedName))
  ```
- **Verification**: A dedicated test suite in `test/application/services/session-reference-store.spec.ts` seeds an index session and a SQLite database with identical symbols (one parent with stored `qualifiedName` and one member lacking `qualifiedName`). It executes both queries and confirms:
  1. Stored spelling (`App.Services.UserService`) matches on both stores identically.
  2. Derived spelling (`App.Services.UserService.findUser`) returns an empty set on both stores identically.
  3. `resolve-symbol-reference.spec.ts:1573-1610` verifies that an unanchored query for `Owner.member` does not match a member stored with a different `qualifiedName`.

### 3.3. File namespace roundtrips and FileNode equality: CONFORMS

- **Implementation**:
  - `FileNode` in `domain/value-objects/file-node.ts` holds optional `namespace` and `namespaceSeparator`.
  - `createFileNode` enforces pairing: separator defaults to `.` if namespace is present; neither property is set if namespace is absent.
  - FileNode equality depends strictly on `path` (the canonical workspace-prefixed path), ignoring `namespace`, `namespaceSeparator`, and `projectRelativePath`.
  - `schema.ts:15-16` adds `namespace TEXT` and `namespace_separator TEXT` to the `files` table for schema version 16.
  - `sqlite-graph-database.ts` includes both columns across all INSERT and SELECT statements and maps them in `mapFileRow`.
- **Verification**:
  - `test/domain/value-objects/file-node.spec.ts`: Tests pairing, defaulting, and path-only equality (13/13 passing).
  - `test/infrastructure/sqlite/sqlite-graph-store.spec.ts:3135-3183`: Tests round-trip of file with namespace and file without namespace via `getFile`, `getFilesByPaths`, and `getAllFiles` (passing).

---

## 4. Test Execution & Coverage Audit

All relevant test suites in `@specd/code-graph` were executed via Vitest and passed completely:

```bash
npx vitest run \
  packages/code-graph/test/domain/value-objects/file-node.spec.ts \
  packages/code-graph/test/domain/value-objects/symbol-reference.spec.ts \
  packages/code-graph/test/infrastructure/sqlite/sqlite-worker-protocol.spec.ts \
  packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts \
  packages/code-graph/test/application/use-cases/resolve-symbol-reference.spec.ts \
  packages/code-graph/test/application/services/session-reference-store.spec.ts
```

### Test Results Breakdown

| Test Suite                                                    |  Tests Passed |     Duration |
| ------------------------------------------------------------- | ------------: | -----------: |
| `test/domain/value-objects/file-node.spec.ts`                 |       13 / 13 |         5 ms |
| `test/domain/value-objects/symbol-reference.spec.ts`          |       17 / 17 |         6 ms |
| `test/infrastructure/sqlite/sqlite-worker-protocol.spec.ts`   |         3 / 3 |         7 ms |
| `test/infrastructure/sqlite/sqlite-graph-store.spec.ts`       |     172 / 172 |      31.73 s |
| `test/application/use-cases/resolve-symbol-reference.spec.ts` |       51 / 51 |        45 ms |
| `test/application/services/session-reference-store.spec.ts`   |         1 / 1 |       262 ms |
| **Total**                                                     | **257 / 257** | **~33.38 s** |

No tests failed, skipped, or timed out. All scenarios introduced in the change's spec and verify deltas have direct corresponding tests with explicit assertions.

---

## 5. Architectural & Global Standards Compliance

1. **Layering & Port Isolation (`_global:architecture`)**:
   - `file-node.ts` and `symbol-reference.ts` reside in `domain/value-objects/` and have zero imports from application or infrastructure layers.
   - `ResolveSymbolReference` is an application use case depending solely on domain ports (`GraphStore`, `AdapterRegistryPort`) and domain value objects. No direct filesystem access is performed.
   - `SessionReferenceStore` is an application service implementing a read-only store projection over `IndexSession` without infrastructure imports.
   - `SQLiteGraphStore` is fully contained in `infrastructure/sqlite/` and implements the domain `GraphStore` port.
2. **Conventions (`_global:conventions`)**:
   - Explicit ESM imports with `.js` extensions across all implementation and test files.
   - Strongly typed immutable interfaces with `readonly` modifiers throughout value objects.
   - Named exports exclusively used across all modules.
3. **Error Handling Conventions (`_global:error-handling-conventions`)**:
   - Resolver emits typed domain outcome objects (`status: 'resolved' | 'ambiguous' | 'missing' | 'unresolved'`) with standard reason codes (`REFERENCE_UNPROVEN`, `AMBIGUOUS_LOGICAL_TARGET`, etc.).
   - SQLite store encapsulates engine-specific errors and surfaces typed recovery errors (`GraphStorageRecoveryRequiredError`) with machine-readable reasons (`SCHEMA_INCOMPATIBLE`).
4. **Testing Conventions (`_global:testing`)**:
   - Vitest test runner used exclusively.
   - No illegal partial port casts (`as unknown as Port`) in the audited test suites.
   - Clean setup and teardown of temporary SQLite databases in `tmpdir()`.

---

## 6. Discrepancies Summary

| Severity     | Count | Details                                                          |
| ------------ | ----: | ---------------------------------------------------------------- |
| **CRITICAL** |     0 | None.                                                            |
| **HIGH**     |     0 | None.                                                            |
| **MEDIUM**   |     0 | None (past findings S-1 and D1 are fully resolved and verified). |
| **LOW**      |     0 | None.                                                            |

---

## 7. Conclusion & Sign-off

The **`storage-resolver`** batch (`code-graph:symbol-model`, `code-graph:sqlite-graph-store`, and `code-graph:resolve-symbol-reference`) is **100% compliant** with the specification requirements and verification scenarios of change `code-graph-package-resolution-hardening`. All requirements and scenarios are fully implemented, validated by 257 passing tests, and aligned with repository global standards.

---

# Spec-Compliance Audit: Indexer Orchestration Batch

- **Change:** `code-graph-package-resolution-hardening`
- **Batch:** `indexer-orchestration`
- **Assigned Specs:**
  - `code-graph:indexer`
  - `code-graph:index-project-graph`
  - `default:_global/architecture`
  - `default:_global/testing`
  - `default:_global/conventions`
- **Audit Date:** 2026-10-23
- **Auditor:** Spec-Compliance Subagent (`indexer-orchestration`)
- **Status:** **FULLY CONFORMANT**

---

## Executive Summary

This compliance audit covers the indexing orchestration batch for the `code-graph-package-resolution-hardening` change, evaluating the following components against their specifications:

1. `code-graph:indexer` — Indexing pipeline use case, session hydration, cross-workspace package resolution, identity-sensitive incremental equivalence, facet-driven language independence, package import incremental closure, external package isolation.
2. `code-graph:index-project-graph` — Host orchestration use case, options forwarding (`configuredWorkspaces`, `vcsRoot`, `force`, `onProgress`, `derivationMismatch`, `getSpecMetadata`), forced logical reindexing, provider lifecycle neutrality, and composition factory.
3. Monorepo global standards — Hexagonal architecture layer separation (`default:_global/architecture`), typed port mocking and cross-platform path portability (`default:_global/testing`), and ESM/strict-mode conventions (`default:_global/conventions`).

### Key Audit Findings & Resolution Status

- **I-1 Fully Resolved:** Direct `node:fs` calls in `IndexCodeGraph` for workspace code root accessibility probing were replaced with the `WorkspaceAccessibilitySource` application port (`packages/code-graph/src/application/ports/workspace-accessibility-source.ts`). The concrete infrastructure implementation (`NodeWorkspaceAccessibilitySource`) is injected via the composition layer (`create-code-graph-provider.ts`).
- **D2 Fully Resolved:** In `packages/code-graph/test/application/use-cases/index-project-graph.spec.ts`, the partial-port cast `{ index: vi.fn() } as unknown as CodeGraphHostPort` has been replaced with `FakeCodeGraphHostProvider`, which fully implements all 10 methods of `CodeGraphHostPort` without type casting.
- **T-1 Fully Resolved:** Both `index-code-graph-package-resolution.spec.ts` and `vcs-repository-root-source.spec.ts` have been updated to construct repository root paths using `node:path` (`join(tempDir, ...)` and `join(tmpdir(), ...)`), eliminating all hardcoded POSIX root strings.
- **T-2 / Discrepancy 2 Fully Resolved:**
  - Dual-adapter identity discovery now asserts end-to-end outcome resolution: `index-code-graph-package-resolution.spec.ts` verifies that both the primary TypeScript identity (`@fixture/graph`) and secondary adapter identity (`@fixture/secondary-graph`) resolve to the target symbol in `ReferenceFacts`.
  - Inaccessible workspace handling asserts that attempting to import a package declared by the skipped workspace correctly increments `IndexResult.importDiagnostics.externalPackageImports` by 1 and keeps `total: 0`.
- **Discrepancy 1 Fully Resolved:** In `packages/code-graph/test/infrastructure/vcs/vcs-repository-root-source.spec.ts`, the previous `Partial<VcsAdapter> as VcsAdapter` cast was replaced by `FakeVcsAdapter extends VcsAdapter`, fully implementing all abstract methods (`rootDir`, `branch`, `isClean`, `ref`, `refAt`, `modifiedFiles`, `show`, `identity`) with OS temporary directory paths.
- **Partial Runs & Inaccessible Workspaces:** Both `configuredWorkspaces` and fallback to `workspaces` are honored for package mapping and preparation; inaccessible workspaces are diagnosed and skipped non-fatally without stopping other workspaces.
- **External Package Classification:** Package imports with reason `package-unknown` are accurately isolated into `IndexResult.importDiagnostics.externalPackageImports` and excluded from `total`, `byReason`, and `samples`.
- **Language Independence & Incremental Equivalence:** The indexer code contains no hardcoded language or manifest strings; incremental runs achieve clean-rebuild semantic snapshot equality across PHP, Python, and Go fixtures.

---

## Spec Verification Matrix

### 1. `code-graph:index-project-graph`

| Requirement / Scenario                                             | Status         | Code & Test Evidence                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Requirement: Executes project indexing**                         | **CONFORMANT** | `IndexProjectGraph.execute` (`index-project-graph.ts:38-56`) forwards `projectRoot`, `workspaces`, `configuredWorkspaces`, `graphConfig`, `codeGraphVersion`, `vcsRoot`, `vcsRef`, `onProgress`, `derivationMismatch`, and `getSpecMetadata` to `provider.index()`. Returns `IndexResult` unchanged. |
| ↳ _Scenario: Incremental index_                                    | **CONFORMANT** | Tested in `index-project-graph.spec.ts:92-104`. `force: false` passed; `provider.index` called once; result passed through unchanged.                                                                                                                                                                |
| ↳ _Scenario: Progress callback forwarded_                          | **CONFORMANT** | Tested in `index-project-graph.spec.ts:118-129`. `onProgress` passed to `provider.index`.                                                                                                                                                                                                            |
| **Requirement: Supports forced logical reindex**                   | **CONFORMANT** | `index-project-graph.ts:48` passes `{ force: true }` when requested. The use case never calls `provider.recreate()`.                                                                                                                                                                                 |
| ↳ _Scenario: Force intent reaches provider indexing_               | **CONFORMANT** | Tested in `index-project-graph.spec.ts:106-116`. Verifies `force: true` forwarded.                                                                                                                                                                                                                   |
| ↳ _Scenario: Force is forwarded as a logical full-reindex request_ | **CONFORMANT** | Tested in `index-project-graph-integration.spec.ts:257-306`. Verifies storage generation token is preserved, healthy store is not destroyed, and `provider.recreate()` is never called.                                                                                                              |
| **Requirement: Accepts open provider and prepared inputs**         | **CONFORMANT** | Input contract `IndexProjectGraphInput` accepts open provider; does not own lifecycle, lock, or spawn subprocesses.                                                                                                                                                                                  |
| ↳ _Scenario: Prepared inputs are forwarded unchanged_              | **CONFORMANT** | Tested in `index-project-graph.spec.ts:169-189`. `configuredWorkspaces` forwarded unchanged. Verified also in SDK orchestration at `packages/sdk/test/orchestration/run-index-project-graph.spec.ts:93-107`.                                                                                         |
| ↳ _Scenario: Prepared provider lifecycle remains untouched_        | **CONFORMANT** | Tested in `index-project-graph.spec.ts:191-216`. Verifies `provider.open`, `close`, `clear`, and `recreate` are never called.                                                                                                                                                                        |
| **Requirement: Factory wires dependencies**                        | **CONFORMANT** | `createIndexProjectGraph()` in `packages/code-graph/src/composition/use-cases/index-project-graph.ts:8-10` returns a new stateless `IndexProjectGraph` instance.                                                                                                                                     |
| ↳ _Scenario: Factory returns stateless instance_                   | **CONFORMANT** | Tested in `composition/host-use-case-factories.spec.ts:24-27` and verified by barrel exports (`src/index.ts:78`, `src/public.ts:44`).                                                                                                                                                                |

---

### 2. `code-graph:indexer`

| Requirement / Scenario                                                            | Status         | Code & Test Evidence                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Requirement: IndexCodeGraph use case**                                          | **CONFORMANT** | `IndexCodeGraph.execute()` (`index-code-graph.ts:478-2063`) orchestrates file discovery, content hashing diff, extraction via adapter registry, spec metadata consumption via `GetSpecMetadata` and `SpecRepository`, persistence into `GraphStore`, and deleted resource cleanup.                                                |
| **Requirement: Incremental indexing**                                             | **CONFORMANT** | Fingerprint comparison against effective version, workspaces hash, discovery config, and resolution manifests. Recreates or fails fast on mismatch. Content-hash based skips for clean incremental runs.                                                                                                                          |
| **Requirement: Deterministic implementation coverage projection**                 | **CONFORMANT** | Consumes Core `GetSpecMetadata` and `SpecRepository` (`list`, `artifact`, `readPersistedState`) for coverage projection. Tested in `index-project-graph-integration.spec.ts:308-415`.                                                                                                                                             |
| **Requirement: Shared indexing session**                                          | **CONFORMANT** | `InMemoryIndexSession` (`in-memory-index-session.ts:196-235`) hydrates file nodes with `namespace` and `namespaceSeparator` without re-extracting symbols. Populates `qualifiedNameSymbolMap` and `testQualifiedNameSymbolMap`.                                                                                                   |
| ↳ _Scenario: Hydrated files fill the qualified-name lookup_                       | **CONFORMANT** | Tested in `in-memory-index-session.spec.ts:24-70`. Hydrated file contributes namespace + separator + symbol name.                                                                                                                                                                                                                 |
| ↳ _Scenario: Production importers never resolve to a test symbol_                 | **CONFORMANT** | Tested in `in-memory-index-session.spec.ts:72-126` and `package-resolution.spec.ts:426-528`. Test symbols separated in `testQualifiedNameSymbolMap`.                                                                                                                                                                              |
| ↳ _Scenario: A test importer resolves to a test helper_                           | **CONFORMANT** | Tested in `package-resolution.spec.ts:426-528`. Test file importing test helper resolves `IMPORTS` and `EXTENDS` relations; impact analysis reports test importer.                                                                                                                                                                |
| **Requirement: Cross-workspace package resolution**                               | **CONFORMANT** | Pre-Pass 1: resolves repository root per code root via `RepositoryRootSource.resolve()`. Calls `packageResolution.identity(codeRoot, repoRoot)` on all registered adapters with the facet. Inaccessible workspaces probed via `WorkspaceAccessibilitySource`. Calls `packageResolution.prepare()` with all configured workspaces. |
| ↳ _Scenario: Every adapter is asked for an identity_                              | **CONFORMANT** | Tested in `index-code-graph-package-resolution.spec.ts:153-195`. Verifies both adapters are queried during identity discovery, both identities are stored, and both primary and secondary package imports resolve end-to-end to the graph symbol.                                                                                 |
| ↳ _Scenario: Each code root gets the repository root of its own repository_       | **CONFORMANT** | Tested in `index-code-graph-package-resolution.spec.ts:236-268`. Each code root receives its resolved `repoRoot`.                                                                                                                                                                                                                 |
| ↳ _Scenario: No detected VCS inspects only the code root_                         | **CONFORMANT** | Tested in `index-code-graph-package-resolution.spec.ts:270-295`. `repoRoot` is `undefined` when VCS detection produces no root.                                                                                                                                                                                                   |
| ↳ _Scenario: VCS detection failure is not fatal_                                  | **CONFORMANT** | Tested in `index-code-graph-package-resolution.spec.ts:297-306`. `RepositoryRootSource` throwing is caught and defaults to `undefined`.                                                                                                                                                                                           |
| ↳ _Scenario: Partial run maps and prepares every configured workspace_            | **CONFORMANT** | Tested in `index-code-graph-package-resolution.spec.ts:309-346`. Partial run with `workspaces: [app]` and `configuredWorkspaces: [graph, app]` prepares `graph` and resolves `@fixture/graph`.                                                                                                                                    |
| ↳ _Scenario: Inaccessible workspace is skipped without failing the run_           | **CONFORMANT** | Tested in `index-code-graph-package-resolution.spec.ts:363-395`. Diagnostic emitted, run succeeds, and an import of a package declared by the inaccessible workspace (`@fixture/uncloned-lib`) correctly counts in `externalPackageImports: 1` and `total: 0`.                                                                    |
| ↳ _Scenario: Workspace accessibility is supplied through an application port_     | **CONFORMANT** | `index-code-graph.ts:891-912` calls `this.workspaceAccessibility.isAccessibleDirectory(ws.codeRoot)`. Tested in `index-code-graph-package-resolution.spec.ts:397-427` with fake port.                                                                                                                                             |
| ↳ _Scenario: Accessibility probe failure is non-fatal_                            | **CONFORMANT** | Tested in `index-code-graph-package-resolution.spec.ts:428-456`. Probe exception logged as diagnostic and execution continues.                                                                                                                                                                                                    |
| ↳ _Scenario: Adapter serving several languages is listed once_                    | **CONFORMANT** | Tested in `index-code-graph-package-resolution.spec.ts:543-557`. Multi-language adapter without facet is listed once by first declared language (`['typescript']`).                                                                                                                                                               |
| ↳ _Scenario: A throwing identity does not stop the run_                           | **CONFORMANT** | Tested in `index-code-graph-package-resolution.spec.ts:457-484` and `index-code-graph.package-imports.spec.ts:507-520`. Error recorded, adapter disabled for package resolution, relative barrel re-exports still linked.                                                                                                         |
| **Requirement: Identity-sensitive incremental equivalence**                       | **CONFORMANT** | Incremental runs match clean full rebuilds across all mutation fixtures.                                                                                                                                                                                                                                                          |
| ↳ _Scenario: Incremental mutation matrix matches clean semantic state_            | **CONFORMANT** | Tested in `index-code-graph-incremental.spec.ts`. All mutation cases (body edit, rename, move, signature change, additions, deletions) equal clean rebuilds.                                                                                                                                                                      |
| ↳ _Scenario: Name-addressed imports match a clean rebuild_                        | **CONFORMANT** | Tested in `index-code-graph-incremental.spec.ts:120-236` for PHP, Python, and Go projects with namespace/qualified name addressing. Snapshot equality confirmed.                                                                                                                                                                  |
| **Requirement: Facet-driven language independence**                               | **CONFORMANT** | `PackageImportResolver` (`package-import-resolver.ts`) delegates to `packageResolution` facet methods: `matchSpecifier`, `entrySurface`, and public bindings. Contains no language-specific logic.                                                                                                                                |
| ↳ _Scenario: Stub language resolves package imports without indexer change_       | **CONFORMANT** | Tested in `index-code-graph.language-independence.spec.ts:73-105` with mock language `zig2`.                                                                                                                                                                                                                                      |
| ↳ _Scenario: Indexer source has no language branches for resolution_              | **CONFORMANT** | Tested in `index-code-graph.language-independence.spec.ts:167-188`. Source code scanner verifies no mentions of built-in language names, extensions, or manifests.                                                                                                                                                                |
| ↳ _Scenario: Absent facet is skipped with a diagnostic_                           | **CONFORMANT** | Tested in `index-code-graph.package-imports.spec.ts:418-443`. Missing facet listed in `adaptersWithoutPackageResolution` and not counted in failures.                                                                                                                                                                             |
| ↳ _Scenario: A throwing identity does not stop the run_                           | **CONFORMANT** | Tested in `index-code-graph.package-imports.spec.ts:507-520`. Adapter is isolated; other adapters and relative imports proceed.                                                                                                                                                                                                   |
| **Requirement: Package import incremental closure**                               | **CONFORMANT** | `collectAffectedFileClosure` (`index-code-graph.ts:2096-2157`) uses persisted reverse steps and bindings without reading unaffected files.                                                                                                                                                                                        |
| ↳ _Scenario: Entry change re-resolves importers in other workspaces_              | **CONFORMANT** | Tested in `index-code-graph.package-imports.spec.ts:326-340`.                                                                                                                                                                                                                                                                     |
| ↳ _Scenario: Barrel chain change reaches importers_                               | **CONFORMANT** | Tested in `index-code-graph.package-imports.spec.ts:341-353`.                                                                                                                                                                                                                                                                     |
| ↳ _Scenario: Manifest change reaches importers_                                   | **CONFORMANT** | Verified via fingerprint calculation: resolution manifests are part of the fingerprint, triggering full rebuild or complete closure re-resolution.                                                                                                                                                                                |
| ↳ _Scenario: Newly resolvable import is reconsidered_                             | **CONFORMANT** | Tested in `index-code-graph.package-imports.spec.ts:611-625` and `index-project-graph-integration.spec.ts:608-661`.                                                                                                                                                                                                               |
| ↳ _Scenario: Closure does not scan every file_                                    | **CONFORMANT** | Implemented at `index-code-graph.ts:2096-2157`. Importers discovered via persisted steps and hydrated bindings only; unaffected files are never read.                                                                                                                                                                             |
| ↳ _Scenario: Added files still re-extract files with possibly unresolved imports_ | **CONFORMANT** | Implemented at `index-code-graph.ts:811-816` (`addsCode` check). Tested in `index-code-graph-incremental.spec.ts:238-268` (document-only addition does not re-extract code files).                                                                                                                                                |

---

## Global Specs Compliance

### 1. `default:_global/architecture`

- **Layered Structure & Dependency Inversion:**
  - Ports defined in `application/ports/`: `WorkspaceAccessibilitySource`, `RepositoryRootSource`, `ResolutionManifestSource`, `CodeGraphHostPort`.
  - Concrete infrastructure implementations reside in `infrastructure/fs/` (`NodeWorkspaceAccessibilitySource`) and `infrastructure/vcs/` (`VcsRepositoryRootSource`).
  - Composition layer (`packages/code-graph/src/composition/create-code-graph-provider.ts`) wires infrastructure adapters into application use case constructors.
  - **Status:** **CONFORMANT**.
  - _Architectural Note:_ `IndexCodeGraph` contains existing `node:fs` calls (`statSync`, `readFileSync`, `writeFileSync`, `mkdirSync`, `rmSync`) for file staging chunks and content hashing. These belong to the tracked decoupling migration (`fs-decouple-00`..`05`) and were not introduced by this change. For the package resolution boundary, workspace accessibility probing has been cleanly isolated behind the `WorkspaceAccessibilitySource` port.

### 2. `default:_global/testing`

- **Test Runner & Structure:** All tests use Vitest, reside in `test/`, and mirror `src/`. No Jest used.
- **No Snapshots:** All assertions are explicit; no snapshot tests.
- **Port Mock Typing:**
  - `index-project-graph.spec.ts`: `FakeCodeGraphHostProvider` implements all 10 `CodeGraphHostPort` methods without partial casting (Finding D2 resolved).
  - `vcs-repository-root-source.spec.ts`: `FakeVcsAdapter extends VcsAdapter` implements all 8 abstract methods without `as VcsAdapter` casts (Discrepancy 1 resolved).
- **Cross-Platform Path Portability:**
  - `index-code-graph-package-resolution.spec.ts` constructs paths using `join(tempDir, ...)`.
  - `vcs-repository-root-source.spec.ts` constructs paths using `join(tmpdir(), ...)`. All hardcoded POSIX root assumptions removed (T-1 / Discrepancy 1 resolved).

### 3. `default:_global/conventions`

- **TypeScript Strict Mode:** Monorepo strict mode enforced.
- **ESM Only:** All imports and exports use ESM (`.js` specifiers).
- **Named Exports Only:** All use cases, ports, and factories use named exports (`export class IndexProjectGraph`, `export function createIndexProjectGraph`).
- **File Naming:** All files use `kebab-case.ts` and `*.spec.ts`.
- **Error Typing:** Indexing errors are collected in `IndexResult.errors` as typed `IndexError` records without unhandled generic `Error` leaks.

---

## Evaluation of Past Findings

| Past Finding                                           | Severity | Previous State                                                                                                                             | Current State & Verdict                                                                                                                                                      |
| ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I-1: Application use case direct `node:fs` calls**   | HIGH     | `index-code-graph.ts` imported `existsSync`/`statSync` from `node:fs` to probe workspace code roots.                                       | **RESOLVED.** Application port `WorkspaceAccessibilitySource` injected; `NodeWorkspaceAccessibilitySource` implements the probe.                                             |
| **D2: Partial-port cast in `IndexProjectGraph` test**  | MEDIUM   | `index-project-graph.spec.ts` used `{ index: vi.fn() } as unknown as CodeGraphHostPort`.                                                   | **RESOLVED.** Replaced with `FakeCodeGraphHostProvider` implementing all 10 interface methods fully.                                                                         |
| **T-1: Cross-platform hardcoded POSIX paths in tests** | MEDIUM   | Hardcoded `/custom/repo/...` in `index-code-graph-package-resolution.spec.ts` and `/path/to/repo` in `vcs-repository-root-source.spec.ts`. | **RESOLVED.** Both suites now construct paths with `join(tempDir, ...)` and `join(tmpdir(), ...)`.                                                                           |
| **T-2: Outcome-level assertions**                      | LOW      | Assertions checked invocation rather than end-to-end resolution for second adapter identity and inaccessible workspace packages.           | **RESOLVED.** Dual-adapter identity import resolution asserted in `ReferenceFacts`; inaccessible workspace package import asserted in `externalPackageImports: 1, total: 0`. |

---

## Test Coverage & Execution Summary

All test suites in `@specd/code-graph` and `@specd/sdk` were executed and passed cleanly:

```text
✓ packages/code-graph: 83 test files passed (1,444 tests passed, 0 failures)
  - test/application/use-cases/index-project-graph.spec.ts (8 tests)
  - test/application/use-cases/index-code-graph-package-resolution.spec.ts (17 tests)
  - test/application/use-cases/index-code-graph-incremental.spec.ts (4 tests)
  - test/infrastructure/fs/node-workspace-accessibility-source.spec.ts (3 tests)
  - test/infrastructure/vcs/vcs-repository-root-source.spec.ts (3 tests)
  - test/application/use-cases/index-code-graph.package-imports.spec.ts (26 tests)
  - test/application/use-cases/index-code-graph.package-imports.languages.spec.ts (10 tests)
  - test/application/use-cases/workspace-indexing.spec.ts (23 tests)
  - test/application/use-cases/index-code-graph.language-independence.spec.ts (4 tests)
  - test/application/use-cases/index-code-graph.spec.ts (2 tests)
  - test/application/use-cases/package-resolution.spec.ts (6 tests)
  - test/application/use-cases/in-memory-index-session.spec.ts (3 tests)
  - test/application/use-cases/index-project-graph-integration.spec.ts (21 tests)

✓ packages/sdk: 13 test files passed (122 tests passed, 0 failures)
  - test/orchestration/run-index-project-graph.spec.ts (16 tests)
```

---

## Discrepancies & Recommendations

None. All previously identified discrepancies and minor test deficiencies have been addressed:

- The VCS test double now cleanly extends `VcsAdapter` and uses `tmpdir()`.
- End-to-end outcome assertions for dual-adapter identity resolution and inaccessible workspace external imports are present and passing.
- Architectural port boundaries are strictly respected for workspace accessibility and repository root discovery.

---

## Audit Conclusion

The indexer orchestration batch (`code-graph:indexer`, `code-graph:index-project-graph`, and associated ports) is **FULLY CONFORMANT** with all functional requirements, verification scenarios, and monorepo architectural/testing conventions.

- All 130+ target unit and integration tests (and the full 1,444-test `@specd/code-graph` suite) pass with zero errors.
- Cross-workspace package resolution, failure isolation, incremental closure equivalence, and provider lifecycle neutrality are verified.
- The batch is ready for consolidation into the main audit report.
