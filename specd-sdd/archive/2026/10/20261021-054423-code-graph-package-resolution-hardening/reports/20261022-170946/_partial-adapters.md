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
