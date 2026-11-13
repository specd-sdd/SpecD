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
