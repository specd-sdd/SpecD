# Compliance Audit Partial — Language Adapters

## Scope and Evidence

**Change:** `code-graph-package-resolution-hardening`  
**Batch:** `language-adapters`  
**Report Directory:** `/Users/monki/Documents/Proyectos/specd/specd-sdd/changes/20261021-054423-code-graph-package-resolution-hardening/reports/20261023-093150`

Audited specifications (merged via `changes spec-preview code-graph-package-resolution-hardening <specId>`):

- `code-graph:language-adapter`
- `code-graph:typescript-language-adapter`
- `code-graph:go-language-adapter`
- `code-graph:php-language-adapter`
- `code-graph:python-language-adapter`

Independent verification evidence:

- **Focused Tree-Sitter & Manifest Suite:** **10 test files passed, 566 tests passed** (`test/infrastructure/tree-sitter/`).
- **Use-Cases & Package Import Suite:** **4 test files passed, 59 tests passed** (`test/application/use-cases/index-code-graph.package-imports*`, `package-resolution.spec.ts`).
- **Full `@specd/code-graph` Suite:** **83 test files passed, 1444 tests passed, 0 failures**.
- **Static Type Check:** `@specd/code-graph` passed cleanly with `pnpm --filter @specd/code-graph exec tsc --noEmit` (0 errors).

---

## Requirements Summary

| Spec                                     | Requirements | Verification Scenarios | Implementation Status                         |
| ---------------------------------------- | -----------: | ---------------------: | --------------------------------------------- |
| `code-graph:language-adapter`            |           34 |                    170 | 34 conformant, 0 partial, 0 nonconformant     |
| `code-graph:typescript-language-adapter` |           12 |                     57 | 12 conformant, 0 partial, 0 nonconformant     |
| `code-graph:go-language-adapter`         |           12 |                     31 | 12 conformant, 0 partial, 0 nonconformant     |
| `code-graph:php-language-adapter`        |           11 |                     36 | 11 conformant, 0 partial, 0 nonconformant     |
| `code-graph:python-language-adapter`     |           11 |                     34 | 11 conformant, 0 partial, 0 nonconformant     |
| **Total**                                |       **80** |                **328** | **80 conformant, 0 partial, 0 nonconformant** |

---

## Verification of Past Findings and Hardening Targets

### ADP-001 — Terminal invalid/unreadable manifests report diagnostic (RESOLVED)

- **Prior Issue:** When searching for package manifests up to the repository boundary without finding any usable manifest, candidates that were invalid JSON, unreadable, or lacked required package identity were accumulated in `skipped` but discarded upon returning `undefined`, causing terminal skipped manifests to never emit diagnostics via the `report` callback.
- **Current Verification:**
  - In `packages/code-graph/src/infrastructure/tree-sitter/find-manifest-field.ts`, `findPackageManifest` returns a `PackageManifestSearchResult` carrying `{ match: fallback, skipped }`. When the search terminates at the boundary without a match, `skipped` preserves all encountered invalid/unreadable/nameless candidates.
  - All four built-in language adapters (`typescript-language-adapter.ts:3202-3206`, `go-language-adapter.ts:1606-1608`, `php-language-adapter.ts:2284-2286`, `python-language-adapter.ts:2040-2042`) iterate `result.skipped` and report diagnostics via `report?.(\`Package manifest skipped (no identity): ${skipped}\`)`unconditionally, regardless of whether`result.match` is defined or undefined.
  - In `index-code-graph.ts:965-971`, the indexer registers the report callback to push non-fatal errors to `IndexResult.errors` (`filePath: \`${ws.name}:<manifest>\``).
  - Explicit test coverage added in `find-manifest-field.spec.ts` (`Scenario: Terminal skipped manifest still reports its diagnostic`) and adapter suites confirms terminal diagnostics are emitted and retained.
- **Status:** **CONFORMANT (Resolved)**.

### ADP-002 — PHP adapter: Composer preparation parses/reads the chosen manifest exactly once (RESOLVED)

- **Prior Issue:** `readComposerManifest` previously performed multiple passes (`findPackageManifest` with `hasComposerName` followed by a JSON parse of the matched content, plus a potential second search for nameless manifests), duplicating I/O and JSON parsing for both named and nameless composer manifests.
- **Current Verification:**
  - `inspectComposerManifest` in `php-language-adapter.ts:484-547` executes a single JSON parse (`JSON.parse(content)`) per file candidate, extracting the package name, normalized PSR-4 mappings (merging `autoload` before `autoload-dev`), and `autoloadDevDirs` in one pass.
  - Manifest inspection returns `{ kind: 'match', value: parsed }` for named manifests, and `{ kind: 'fallback', value: parsed }` for nameless manifests.
  - `findPackageManifest` runs `inspectComposerManifest` once per read candidate, selects the preferred named match or retains the nearest fallback, and returns the already-parsed `value`.
  - `readComposerManifest` (`php-language-adapter.ts:2209-2264`) calls `findPackageManifest` exactly once, reusing `result.match.value` directly into session-cached `ComposerManifestData` and `psr4ByCodeRoot` without any re-read or second JSON parse.
  - In Pass 2, `entrySurface` and `resolveQualifiedNameFromSession` execute purely against session-cached metadata; test `Scenario: entrySurface performs no filesystem access during Pass 2` asserts via `vi.spyOn(fs, 'realpathSync')` that zero filesystem calls occur.
- **Status:** **CONFORMANT (Resolved)**.

### Manifest Search Bounds (Code root repository, no walk up if no VCS) (RESOLVED)

- **Requirement:** Search starts at the canonical code root and walks upward bounded by `repoRoot`. If no VCS repository root is detected (`repoRoot === undefined`), only the code root itself is inspected and no upward walk occurs. If `codeRoot` lies outside `repoRoot`, the boundary collapses to `codeRoot` to prevent escaping into ancestor or filesystem root directories.
- **Current Verification:**
  - In `find-manifest-field.ts:79-87`, `canonical(codeRoot)` normalizes symlinks and strips trailing separators. `boundary` is set to `repoRoot === undefined ? start : canonical(repoRoot)`. If `relative(boundary, start)` is outside (`startsWith('..')` or absolute), `boundary = start`.
  - When `repoRoot` is undefined, `start === boundary`, inspecting only `start` and immediately terminating (`if (dir === boundary)`).
  - Tests in `find-manifest-field.spec.ts` verify:
    - `Manifest above the code root inside the repository is found`
    - `Search stops at the repository root`
    - `External code root uses its own repository boundary`
    - `No repoRoot inspects only the code root`
    - `Code root outside the supplied boundary collapses to the code root and never reaches filesystem root`
    - `Symlinked and trailing-separator code roots are canonicalized`
- **Status:** **CONFORMANT (Resolved)**.

### Read Once in Prepare, Link Performs No I/O (RESOLVED)

- **Requirement:** Workspaces are prepared once prior to Pass 2. `entrySurface`, `matchSpecifier`, and `reExportLinking.link` MUST NOT perform filesystem I/O.
- **Current Verification:**
  - TypeScript: `prepareWorkspaceManifest` caches compact `PackageEntryManifest` (`name`, `main`, `exports`, `codeRootOffset`). `linkReExports` operates strictly in memory over session logical symbols, declarations, public bindings, and indexed file paths.
  - Go: `prepare` builds package directory indices and computes module-to-code-root offsets once. `entrySurface` performs zero filesystem reads.
  - PHP: `preparePackages` records PSR-4 prefix mappings and workspace package owners in session state. `entrySurface` reads exclusively from cached session state.
  - Python: `prepare` is a no-op; entry surfaces resolve from session package maps and indexed file paths without manifest access.
  - Conformance suite `language-adapter-conformance.spec.ts` enforces `performs no filesystem metadata reads in per-file relation analysis after preparation` across all registered language adapters by mocking `node:fs` (`readFileSync`, `statSync`, `existsSync`, `readdirSync`) and verifying zero calls in Pass 2.
- **Status:** **CONFORMANT (Resolved)**.

---

## Detailed Status by Specification

### 1. `code-graph:language-adapter` (34 requirements, 170 scenarios)

- **Interface Core & Facets:** Implemented in `packages/code-graph/src/domain/value-objects/language-adapter.ts` and `language-adapter-facets.ts`.
  - Required methods (`languages`, `extensions`, `resolutionManifests`, `analyzeFile`, `resolveImports`, `buildRelations`) are stateless, synchronous, and deterministic.
  - `resolutionManifests()` returns exact basenames synchronously without I/O.
  - Facets (`packageResolution`, `relativeImportResolution`, `qualifiedNameResolution`, `symbolReferenceSyntax`, `reExportLinking`) are declared via presence on adapter instances.
- **Session & Purity:** Adapters interact with cross-file context only through `IndexSession`. AST nodes are discarded from `FileAnalysisDraft` after Pass 1. File-level `IMPORTS` edges are synthesized by the indexer, not emitted directly by language adapters.
- **Cross-Language Semantic Conformance:** Matrix suite `language-adapter-conformance.spec.ts` executes caller containment, scope isolation, ownership hierarchy, physical-only classifications, logical resolution, and Pass 2 I/O purity for all registered adapters.
- **Status:** **CONFORMANT**.

### 2. `code-graph:typescript-language-adapter` (12 requirements, 57 scenarios)

- **Language & Range Handling:** Supports `.ts`, `.tsx`, `.js`, `.jsx`. Parser nodes provide half-open construct ranges and identifier selection ranges.
- **Symbols & Ownership:** Classes, interfaces, methods, functions, variables, and properties extract logical owners before member IDs. Overload sets retain distinct occurrences under one logical identity.
- **Package Resolution & Re-exports:**
  - `packageResolution`: Reads nearest `package.json` bounded by `repoRoot`; stores compact entry data (`name`, `main`, `exports`, `codeRootOffset`). Bounded manifest search handles code roots below `package.json` and drops outside candidates.
  - Dist-to-source mapping (`dist/` -> `src/`, `.d.ts` -> `.ts`) is deterministic; unknown build directories are rejected without guessing.
  - Ambiguous runtime exports (e.g. conflicting `import` vs `default`) preserve ambiguity without guessing.
  - `reExportLinking`: Resolves named and star re-exports across files and workspaces purely from session state without I/O.
- **Status:** **CONFORMANT**.

### 3. `code-graph:go-language-adapter` (12 requirements, 31 scenarios)

- **Language & Manifests:** Handles `.go` files; reports `resolutionManifests() === ['go.mod']`.
- **Module & Package Resolution:** `readGoModulePath` extracts unquoted, double-quoted, and backtick-quoted module paths.
- **Package Preparation & Entries:**
  - `prepare` locates module directories using bounded `findPackageManifest` and stores code-root offsets.
  - `entrySurface` maps module paths to workspace-relative package directories; excludes `_test.go` files and drops package directories outside the code root.
  - `matchSpecifier` selects packages by longest known module prefix.
- **Parser-Authoritative AST:** Extracts receivers, struct fields, interface embeddings, and calls directly from AST parameter nodes rather than regexes.
- **Status:** **CONFORMANT**.

### 4. `code-graph:php-language-adapter` (11 requirements, 36 scenarios)

- **Language & Manifests:** Handles `.php` files; reports `resolutionManifests() === ['composer.json']`.
- **Namespaces & PSR-4 Preparation:**
  - `inspectComposerManifest` reads and parses `composer.json` once per file candidate, extracting namespace mappings and test directories.
  - `preparePackages` sorts PSR-4 prefixes longest-prefix first, canonicalizes code roots, and records owners. Prefers named `composer.json` over nearest nameless `composer.json`.
  - Fallback own-workspace PSR-4 resolution works for nameless workspaces without leaking to other workspaces. Production importers never receive test/dev files.
- **Pass 2 Purity:** `entrySurface` and `resolveToPath` operate without filesystem I/O (`fs.realpathSync` spy confirmed 0 calls).
- **Status:** **CONFORMANT**.

### 5. `code-graph:python-language-adapter` (11 requirements, 34 scenarios)

- **Language & Manifests:** Handles `.py` and `.pyi` files; reports `resolutionManifests() === ['pyproject.toml']`.
- **Identity & PEP 503 Normalization:**
  - `readPythonProjectName` extracts `[project].name`, ignoring unrelated table names (e.g. `[tool.poetry]`).
  - `matchSpecifier` normalizes package distributions according to PEP 503 (`normalizePythonDistName`) and requires an unambiguous single match.
- **Submodules & Entry Surface:**
  - `entrySurface` derives module entries from session indexed files without filesystem access.
  - Handles submodules without `__init__.py` when unique; ambiguous duplicate roots remain unresolved.
- **Status:** **CONFORMANT**.

---

## Discrepancies and Regressions

**None detected.**

- Zero critical, high, medium, or low severity issues.
- All 80 requirements across the 5 language adapter specifications are fully implemented and verified.
- Past findings ADP-001 and ADP-002 have been completely resolved and have dedicated regression tests.

---

## Conclusion

The `language-adapters` batch is **100% conformant** with all spec requirements and verification scenarios under change `code-graph-package-resolution-hardening`.
