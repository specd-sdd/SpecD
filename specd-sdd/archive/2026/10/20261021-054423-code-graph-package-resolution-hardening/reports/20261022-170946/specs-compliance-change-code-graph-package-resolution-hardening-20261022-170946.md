# Spec Compliance Audit: code-graph-package-resolution-hardening

Mode: change (`code-graph-package-resolution-hardening`), full verification.
Timestamp: 20261022-170946.

## Summary

- **Total Specs Audited:** 10 specs (`code-graph:language-adapter`, `code-graph:typescript-language-adapter`, `code-graph:go-language-adapter`, `code-graph:php-language-adapter`, `code-graph:python-language-adapter`, `code-graph:indexer`, `code-graph:symbol-model`, `code-graph:sqlite-graph-store`, `code-graph:resolve-symbol-reference`, `code-graph:index-project-graph`)
- **Requirements Audited:** 19
- **Implemented:** 19 (100%)
- **Partial / Unimplemented:** 0
- **Discrepancies:** 0 High, 0 Medium, 0 Low
- **Test Suite Results:**
  - `@specd/code-graph`: 81 test files, 1433 tests passed
  - `@specd/sdk`: 13 test files, 122 tests passed
  - Repo-wide `typecheck`: 16 workspace packages passed cleanly
  - Repo-wide `eslint`: Clean
  - Code Graph: Fresh (1255 files, 30958 symbols, 295 specs indexed)

All prior discrepancies identified in the earlier audit cycle (such as D1 `fileCategories` Pass 1 registration, D-PHP-1 Pass 2 I/O, D-PHP-2 Composer manifest search consistency, D-LA-3 disabled adapter claim purging, D5 `createFileNode` separator pairing, D6 anchored fallback suppression, and D-TS regex hardening) have been thoroughly addressed in Task 17 follow-up work with verified test coverage.

---

## Detailed Findings

# Partial audit: adapter specs (change code-graph-package-resolution-hardening)

Scope:

- `code-graph:language-adapter`
- `code-graph:typescript-language-adapter`
- `code-graph:go-language-adapter`
- `code-graph:php-language-adapter`
- `code-graph:python-language-adapter`

Audit executed after Task 17 compliance review follow-up fixes.
Read-only inspection of source code and test suite. 1433 code-graph tests and 122 sdk tests passing.

---

## Summary counts

| Spec                                     | Requirements audited | Implemented | Partial | Discrepancies (H/M/L) | Scenarios audited | Scenarios with direct test |
| ---------------------------------------- | -------------------- | ----------- | ------- | --------------------- | ----------------- | -------------------------- |
| `code-graph:language-adapter`            | 5                    | 5           | 0       | 0 / 0 / 0             | 23                | 23                         |
| `code-graph:typescript-language-adapter` | 2                    | 2           | 0       | 0 / 0 / 0             | 8                 | 8                          |
| `code-graph:go-language-adapter`         | 1                    | 1           | 0       | 0 / 0 / 0             | 4                 | 4                          |
| `code-graph:php-language-adapter`        | 1                    | 1           | 0       | 0 / 0 / 0             | 8                 | 8                          |
| `code-graph:python-language-adapter`     | 1                    | 1           | 0       | 0 / 0 / 0             | 5                 | 5                          |

Overall: 10 requirements audited, 10 fully implemented, 0 partial. 0 High, 0 Medium, 0 Low discrepancies remaining.

---

## 1. code-graph:language-adapter

### Requirements & Status

1. **Adapter facet model**: Implemented.
   - `disabledPackageResolution` isolates throwing adapters.
   - Throwing identity or prepare does not disable relative barrel re-export linking (`reExportLinking`).
   - If an adapter fails on a later workspace or during `prepare`, `purgeDisabledAdapterClaims` cleans up earlier claims if no active adapter claimed that identity.
2. **Package resolution facet**: Implemented.
   - `findPackageManifest` canonicalizes root, strips trailing slash, and respects `repoRoot` boundaries.
   - Search stops at repository boundary, never walking upward past VCS boundary or to filesystem root.
   - Manifests lacking identity are skipped with diagnostic recorded in `errors` via `report` callback (conforming to spec delta).
   - `PackagePreparationContext` provides `{ session, workspaces, projectRoot }` with per-workspace `repoRoot`.
   - `resolutionManifests()` returns exact basenames with validation against separators and globs.
3. **Package identity extraction**: Implemented.
   - Every adapter providing `packageResolution` is asked for an identity for each configured workspace.
   - Name collision across different workspaces records an error naming all claimants and resolves to neither.
   - Inaccessible workspace code roots are skipped with diagnostic without failing the run.
4. **Package import resolution context**: Implemented.
   - Bindings without `targetId` are ignored by ambiguity checks.
   - Unrecognized packages return `package-unknown` and are counted in `externalPackageImports`, excluded from `total`/`byReason`/`samples`.
5. **Adapter registry**: Implemented.
   - `validateAdapter` verifies `languages()`, `extensions()`, `resolutionManifests()` as non-empty basenames and all required facet members before modifying registry state. Throws `InvalidLanguageAdapterError` (`INVALID_LANGUAGE_ADAPTER`).

---

## 2. code-graph:typescript-language-adapter

### Requirements & Status

1. **Imports, exports, and public bindings**: Implemented.
   - Type-only default import binds only in type space; value declarations are not bound.
   - Regex detection `/(?:^|\s)import\s+type(?:\s+(?!from\b)|\s*\{)/` prevents false positives on default import named `type`.
2. **Package and build-context boundary**: Implemented.
   - Manifest search uses `findPackageManifest`.
   - Compact manifest data stored: `{ name, main, exports, codeRootOffset }`.
   - Candidates outside code root offset are dropped.
   - `dist` and `dist/` prefixes map to `src`.
   - `exports !== undefined && exports !== null` correctly guards taking exports vs main fallback.

---

## 3. code-graph:go-language-adapter

### Requirements & Status

1. **Package identity, exports, and imports**: Implemented.
   - `readGoModulePath` extracts and unquotes double-quoted and backtick-quoted module paths.
   - Module directory located once during `prepare`, storing offsets in `go:module-offsets`.
   - `entrySurface` performs zero filesystem I/O, computing relative package directories from session offsets.
   - Packages outside code root return empty entry surfaces.

---

## 4. code-graph:php-language-adapter

### Requirements & Status

1. **Namespaces, use aliases, and Composer resolution**: Implemented.
   - Manifest search searches for named `composer.json` first, falling back to nameless for own PSR-4 fallback.
   - Paths and PSR-4 directory targets are canonicalized once during `prepare` and stored in `ComposerManifestData`.
   - `entrySurface` and `resolveToPath` compute relative paths purely lexically during Pass 2 with zero `realpathSync` or filesystem calls (verified by spy test).
   - Longest prefix first ordering maintained; `autoload` and `autoload-dev` merged preserving all directories.
   - Own PSR-4 fallback uses workspace-relative IDs (never absolute paths) and excludes test/autoload-dev targets for production importers.
   - Dead methods removed (`resolvePackageFromSpecifier`, `resolveQualifiedNameWithMap`, `buildPsr4Map`).

---

## 5. code-graph:python-language-adapter

### Requirements & Status

1. **Imports and package resolution**: Implemented.
   - Manifest search finds `pyproject.toml` with `[project].name`.
   - PEP 503 normalization (`toLowerCase`, `[-_.]+` -> `-`).
   - Equal normalized names across distinct packages resolve to undefined.
   - Submodule import without `__init__.py` adds file dependency without creating binding.
   - Submodules indexed under multiple roots stay unresolved.

---

# Partial audit: indexer, symbol-model, sqlite-graph-store, resolve-symbol-reference, index-project-graph

Scope:

- `code-graph:indexer`
- `code-graph:symbol-model`
- `code-graph:sqlite-graph-store`
- `code-graph:resolve-symbol-reference`
- `code-graph:index-project-graph`

Audit executed after Task 17 compliance review follow-up fixes.
Read-only inspection of source code and test suite.

---

## Summary counts

| Spec                                  | Requirements audited | Implemented | Partial | Discrepancies (H/M/L) | Scenarios audited | Scenarios with direct test |
| ------------------------------------- | -------------------- | ----------- | ------- | --------------------- | ----------------- | -------------------------- |
| `code-graph:indexer`                  | 4                    | 4           | 0       | 0 / 0 / 0             | 12                | 12                         |
| `code-graph:symbol-model`             | 1                    | 1           | 0       | 0 / 0 / 0             | 1                 | 1                          |
| `code-graph:sqlite-graph-store`       | 2                    | 2           | 0       | 0 / 0 / 0             | 2                 | 2                          |
| `code-graph:resolve-symbol-reference` | 1                    | 1           | 0       | 0 / 0 / 0             | 2                 | 2                          |
| `code-graph:index-project-graph`      | 1                    | 1           | 0       | 0 / 0 / 0             | 2                 | 2                          |

Overall: 9 requirements audited, 9 fully implemented, 0 partial. 0 High, 0 Medium, 0 Low discrepancies remaining.

---

## 1. code-graph:indexer

### Requirements & Status

1. **Shared indexing session**: Implemented.
   - `fileCategories` is populated for newly analyzed and modified files during Pass 1 registration (fixing prior D1 finding).
   - In Pass 2, `includeTests: fileCategories.get(prefixedPath) === 'test'` properly identifies test importers.
   - Production importers never resolve to test symbols; test importers resolve to test helpers, verified with CALLS edge test in `package-resolution.spec.ts`.
   - Hydrated unchanged files restore `namespace` and `namespaceSeparator` into the session qualified name maps.
2. **Cross-workspace package resolution**: Implemented.
   - Partial indexing runs (`--workspace`) forward `configuredWorkspaces` to prepare and map all workspaces without indexing unselected ones.
   - `RepositoryRootSource` port abstracts VCS repository boundary lookups for each code root.
   - Adapters serving multiple languages are listed once by their first language in `adaptersWithoutPackageResolution`.
   - Inaccessible workspaces skipped without failing the run.
3. **Identity-sensitive incremental equivalence**: Implemented.
   - Incremental indexing produces graph state equivalent to a clean rebuild for name-addressed imports.
4. **Package import incremental closure**: Implemented.
   - Added non-code files (e.g. documentation or assets) do not trigger addition-fallback re-extraction of code files.

---

## 2. code-graph:symbol-model

### Requirements & Status

1. **File node**: Implemented.
   - `FileNode` has optional `namespace` and `namespaceSeparator`.
   - `createFileNode` pairs `namespaceSeparator: params.namespaceSeparator ?? '.'` whenever `namespace !== undefined` (fixing prior D5 finding).
   - Namespace data does not affect `FileNode` equality.

---

## 3. code-graph:sqlite-graph-store

### Requirements & Status

1. **Persisted node storage**: Implemented.
   - `files` table contains `namespace TEXT` and `namespace_separator TEXT`.
   - Namespace round-trips through upsert and select operations.
2. **Reference schema upgrade**: Implemented.
   - `SQLITE_SCHEMA_VERSION` bumped to 16.
   - Databases at version 15 are rejected on read (`GraphSchemaIncompatibleError`) and recreated cleanly on index.

---

## 4. code-graph:resolve-symbol-reference

### Requirements & Status

1. **Structured reference input**: Implemented.
   - Anchored references with no adapter candidates return explicit `REFERENCE_UNPROVEN` immediately instead of falling through to simple-identifier resolution (fixing prior D6 finding).
   - Derived qualified names (`Owner.member`) are no longer synthesized; lookup matches only stored `qualified_name`.

---

## 5. code-graph:index-project-graph

### Requirements & Status

1. **Accepts open provider and prepared inputs**: Implemented.
   - `IndexProjectGraph` and `@specd/sdk` forward `configuredWorkspaces` unchanged to provider indexing.
