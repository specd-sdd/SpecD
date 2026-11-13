# Spec compliance: code-graph-package-resolution-hardening

Mode: change, full verification. Scenario tests: 1429 pass, tsc clean, eslint clean.

## Summary

- adapters batch: 1 High, 4 Medium, ~15 Low
- indexer/store batch: 1 High, 3 Medium (+1 cross-spec Medium), 4 Low, 7 test gaps

## Detailed Findings

# Partial audit: adapter specs (change code-graph-package-resolution-hardening)

Scope: code-graph:language-adapter, typescript-language-adapter, go-language-adapter, php-language-adapter, python-language-adapter. Audited the delta-touched requirements (merged spec preview) and all added or modified scenarios against uncommitted code in packages/code-graph and its tests. Read-only. Tests (1429) reported passing by caller; not re-run.

Rule: neither spec nor code is assumed correct. Each discrepancy gives both readings.

## Summary counts

| Spec                        | Requirements audited | Implemented | Partial | Discrepancies (H/M/L) | Scenarios audited | Scenarios with no direct test |
| --------------------------- | -------------------- | ----------- | ------- | --------------------- | ----------------- | ----------------------------- |
| language-adapter            | 5                    | 4           | 1       | 0 / 3 / 4             | 23                | 5                             |
| typescript-language-adapter | 2                    | 2           | 0       | 0 / 0 / 4             | 8                 | 2                             |
| go-language-adapter         | 1                    | 1           | 0       | 0 / 0 / 1             | 4                 | 0                             |
| php-language-adapter        | 1                    | 0           | 1       | 1 / 1 / 3             | 6                 | 1                             |
| python-language-adapter     | 1                    | 1           | 0       | 0 / 0 / 3             | 5                 | 0                             |

Overall: 10 requirements audited, 8 implemented, 2 partial. 1 High, 4 Medium, about 15 Low discrepancies. The test suite does not detect the High finding.

---

## 1. code-graph:language-adapter

### Requirements summary and status

1. **Adapter facet model** (modified). Absent facet means no behaviour, no error, no heuristic fallback. A throwing facet is isolated. A `packageResolution` failure must not disable `reExportLinking` for relative routes. Status: implemented.
   - index-code-graph.ts keeps `disabledPackageResolution` and lists such adapters in `adaptersWithoutPackageResolution`.
   - The `link` call receives an empty `packageToWorkspace` for a disabled adapter, so relative barrels still link.
   - A `link` failure adds the adapter to the disabled set. This matches the modified scenario in the verify delta.
2. **Package resolution facet** (modified). Covers `identity`, `prepare`, `matchSpecifier`, `entrySurface`, the three roots, the repo-bounded search, and `resolutionManifests` consistency. Status: implemented, with a `PHP` caveat and an interface drift (see D-LA-1, D-PHP-1, D-PHP-2).
   - The shared search is `findPackageManifest` in find-manifest-field.ts. It canonicalizes the start with realpath and strips the trailing separator.
   - It is bounded by `repoRoot`. With no `repoRoot` it inspects only the code root. It never reaches the filesystem root because it stops at `boundary` or when the parent equals the directory.
   - Manifests without an identity are collected in `skipped` and reported through `report`.
   - `repoRoot` is resolved once per distinct code root through `VcsRepositoryRootSource(createVcsAdapter)`, which wraps `createVcsAdapter` and `rootDir()`. `NullVcsAdapter.rootDir()` throws, so no `repoRoot` is passed. VCS-agnostic, as specified.
   - `PackagePreparationContext` is now `{session, workspaces[{name, codeRoot, repoRoot?}], projectRoot}`. Matches the spec.
   - `resolutionManifests()` of the four adapters returns exactly the manifest each one reads. OK.
3. **Package identity extraction** (modified). Status: implemented.
   - The indexer asks every adapter for each configured accessible workspace. `configuredWorkspaces ?? workspaces` is used, so partial runs are covered.
   - The `claims` map gives ambiguity handling: `packageToWorkspace.delete(identity)` plus an error naming the workspaces. The same workspace claiming a name twice is not a conflict.
   - An inaccessible code root is skipped with an entry in `errors`.
   - Python `[project].name` only, with single and double quotes. OK.
4. **Package import resolution context** (modified). Status: implemented.
   - PackageImportResolver (unchanged in this change, already committed) ignores bindings without `targetId`.
   - It returns the reasons `facet-absent`, `package-unknown`, `no-entry-surface`, `not-exported`, `ambiguous`.
   - It discards non-indexed entries and entries categorized as test.
   - The indexer counts `package-unknown` in `externalPackageImports` and excludes it from `total`, `byReason` and `samples`. `facet-absent` is also excluded.
5. **Adapter registry** (modified). Status: implemented.
   - `validateAdapter` runs before any state change. It checks core members, `languages()`, `extensions()`, `resolutionManifests()` as exact basenames (no separator, no glob characters), and facet members.
   - Replacement is per language. `getAdapters()` derives unique adapters from the language map, so an adapter left without a language is dropped.
   - The error is `InvalidLanguageAdapterError`. Confirm its code is `INVALID_LANGUAGE_ADAPTER`. I did not open that class.

### Discrepancies

**D-LA-1 (Low, spec drift).** `identity` has a third parameter `report?: (message: string) => void` (language-adapter-facets.ts). The spec fixes the facet signature as `identity(codeRoot, repoRoot?)`, and says a facet's members, argument and result types are fixed by the spec.

- Reading A: the code is right and the spec must add the diagnostics callback. The "skipped with a diagnostic" scenarios need some channel.
- Reading B: the spec is right and diagnostics should travel another way, for example a return value, so that the public contract stays minimal.

**D-LA-2 (Medium, ambiguity).** Diagnostics for skipped manifests and for inaccessible workspaces are pushed into the run's `errors` list (index-code-graph.ts, `errors.push` in the accessibility loop and in the `report` callback). The spec says "diagnostic" for those cases and "indexing error" only for collisions and facet failures.

- Reading A (code right): `errors` is the only diagnostic channel, so this is the intended surface. Check that the CLI and MCP do not turn `errors.length > 0` into a failing exit. The spec requires that an inaccessible workspace "MUST NOT fail the run".
- Reading B (spec right): diagnostics should be a separate non-error list. A nameless `package.json` above a workspace then does not report an error on every run.
- Test: the "inaccessible workspace" test checks the run does not throw. It does not check how the CLI or exit code treats these entries.

**D-LA-3 (Medium).** Identities already mapped for an adapter stay in `packageToWorkspace` after that adapter is disabled on a later workspace (loop is workspace-outer, adapter-inner). The package resolver bypasses the disabled adapter's own helpers, but the stale names remain in the shared `knownPackages` list that other adapters' `matchSpecifier` see.

- Reading A (code acceptable): the spec only says the adapter "is treated as if it did not provide `packageResolution`". The map is language-neutral data.
- Reading B (spec stricter): "for the rest of the run, including the other workspaces" suggests the adapter's identities, in earlier workspaces too, should be dropped.
- Test: nothing covers an adapter that fails on the second workspace.

**D-LA-4 (Low).** `listDisabledAdapters` now lists only the first language id of an adapter, sorted (`langs[0]`). The previous code joined all languages. A test pins "listed once by first language". The spec says only that "the adapter" is listed. Check the indexer spec or the CLI contract for the expected format.

**D-LA-5 (Low).** Python `matchSpecifier` returns `undefined` for normalized-equal identities. The helper then reports `package-unknown`, and the indexer counts it as an external package import. The spec says "the import stays unresolved" and does not name a reason.

- Reading A: acceptable.
- Reading B: counting it as external hides a real ambiguity. A reason such as `ambiguous` would be more informative, but the facet contract only returns `string | undefined`.

**D-LA-6 (Low).** Registry: `declarationPolicy` validation failures throw a plain `Error`, not `SpecdError` / `INVALID_LANGUAGE_ADAPTER`. This is pre-existing and outside the spec text, which lists only four rules. Note only.

**D-LA-7 (Low).** `VcsRepositoryRootSource.resolve` does `return adapter.rootDir()` inside try/catch. `rootDir()` is synchronous, so the catch does work. OK. The indexer also wraps the call in `.catch`. No issue; recorded for completeness.

### Test coverage (language-adapter)

Covered:

- find-manifest-field.spec.ts: repo-root stop, external code root, no `repoRoot`, nameless skip, symlink and trailing separator canonicalization, boundary collapse.
- index-code-graph-package-resolution.spec.ts:
  - Every adapter is asked, collision, same workspace several adapters.
  - repo root per workspace, no VCS, rejecting source.
  - partial run, inaccessible workspace.
  - barrel linking survives identity failure and prepare failure.
  - `package-unknown` counted, bindings without target ignored.
- adapter-registry.spec.ts: three new registry scenarios.

Gaps:

1. No test for "link throws, adapter disabled and listed in `adaptersWithoutPackageResolution`". Only identity and prepare throws are tested.
2. "Prepare reads each manifest once" is not verified by counting reads. TS and Go delete the manifest after `prepare` and check `entrySurface`. That proves no read in `entrySurface`, not one read in `prepare`. The PHP test (php-language-adapter.spec.ts:2392) should be checked the same way.
3. "Identity and prepare use the same package root" is tested for TS only (code root below manifest). There is no test for Go or PHP with a nameless nearest manifest and a named one higher.
4. No test that stale identities of a later-disabled adapter are dropped (D-LA-3).
5. "Facet throws, other workspaces still indexed": not asserted. Only barrel linking is.

---

## 2. code-graph:typescript-language-adapter

### Requirements summary and status

1. **Imports, exports, and public bindings** (modified). Status: implemented.
   - Type-only is marked on the import (`import type` and inline `type`), and the lookup uses the type space only.
   - A type-only default binds only to a type-space default (`findDefaultExportDeclaration(..., allowedSpaces)`).
   - Package default and namespace imports add a file dependency on the entry files. Default binds when exactly one target exists.
   - Re-export dependencies: a relative re-export with exactly one indexed file, a package re-export with the entry files, several files adds none. All match.
2. **Package and build-context boundary** (modified). Status: implemented.
   - `identity` and `prepare` use the same `findPackageManifest(..., hasPackageName, repoRoot)`.
   - Compact data is `{name, main?, exports?, codeRootOffset}`.
   - Candidates outside the code root are dropped, and inside ones are made relative.
   - `import`, then `default`, then `types` only when no runtime target is indexed.
   - Ambiguous alternatives are all returned.
   - Only a first segment `dist` maps to `src`. `.d.ts`, `.d.mts`, `.d.cts` and `.js`, `.mjs`, `.cjs`, `.jsx` are mapped. TypeScript sources come first, then JavaScript.
   - `main` is used only when `exports` is absent.

### Discrepancies (all Low)

**D-TS-1.** `sourceCandidates` only recognises the `dist/` prefix, not a bare `dist` path (a published directory named `./dist`). Spec: "its `index` file when the path names a directory" and "first segment is `dist`".

- Reading A: code right, a published bare directory is unusual.
- Reading B: spec requires `./dist` to map to `src/index.*`.

**D-TS-2.** `exports: null` is treated as absent, so `main` is used (publishedTargets). The spec says `main` applies only when `exports` is absent, and "a defined `exports`" blocks `main`. This is an edge case.

**D-TS-3.** Import marker detection uses regexes on text: `/^import\s+type\b/` and `/^type\s/`.

- `import type from './x'` (a default import named `type`) is marked type-only, and so is `import type, { A } from` (not valid TS in newer versions).
- `import { type as x }` is also marked type-only.
- `import type * as ns` is not marked on the namespace branch. It binds no declaration, so there is no behavioural effect.
- Reading A: acceptable parser heuristics. Reading B: the spec says "imports declared type-only SHALL be marked", which points to using the tree-sitter node structure instead of text.

**D-TS-4.** `analyzeFile` also calls `prepareWorkspaceManifest` in Pass 1 (typescript-language-adapter.ts around line 832). It reads the manifest through the same cache before the facet's `prepare` runs. There are two entry points that fill one cache, with a drift risk. The spec only constrains `prepare`. Reading A: intentional, so that `analyzeFile` works without a run. Reading B: spec wants a single read point (`prepare`), so the Pass 1 call should go.

### Test coverage (TypeScript)

Covered: type-only default, code root below `package.json`, outside candidate dropped, nameless `package.json` skipped, compact data, declaration file mapping, `build/` not mapped, `entrySurface` does no read after the manifest is deleted. A `types` plus `import` conditions test exists near typescript-language-adapter.spec.ts:1222.

Gaps:

1. No named scenario "Workspace not indexed in this run is still prepared" at adapter level. It is covered at indexer level only (index-code-graph-package-resolution.spec.ts:293).
2. Inline `import { type X }` goes only into the type space: a test for the inline form exists at typescript-language-adapter.spec.ts:2396, but nothing asserts the value space is not searched for it.
3. No test for a bare `./dist` directory target (D-TS-1) or `exports: null` (D-TS-2).

---

## 3. code-graph:go-language-adapter

### Requirement summary and status

**Package identity, exports, and imports** (modified). Status: implemented.

- `readGoModulePath` unquotes double-quoted and backtick-quoted paths.
- `prepare` builds the directory index once and stores per-workspace `go.mod` offsets under `go:module-offsets`.
- `entrySurface` uses only session data: it maps `import path minus module prefix` to a directory, then to a directory relative to the code root. It returns `[]` when the directory is outside the code root. A path equal to the module path maps to the module directory.
- `_test.go` files are excluded in the directory index. The helper also drops test-category files.

### Discrepancies

**D-GO-1 (Low).** `readGoModulePath` uses `/^module\s+(?:"([^"]+)"|`([^`]+)`|(\S+))/m`. A `module` directive written inside a block form, or a trailing `// comment` glued to the path without a space, is not handled in a special way. The spec only requires the quoted-string unquote. Reading A: sufficient. Reading B: the spec's wording "written as a quoted string" does not address backticks, which the code accepts. Harmless extension.

### Test coverage (Go)

All four scenarios have tests: `go.mod` above the code root, outside the code root, quoted module path, module located once. Gap: "located once" is shown by deleting `go.mod` after `prepare` and calling `entrySurface`. It does not count reads of `go.mod` during `prepare`.

---

## 4. code-graph:php-language-adapter

### Requirement summary and status

**Namespaces, use aliases, and Composer resolution** (modified). Status: partial.

Implemented:

- `identity` uses `hasComposerName` with the shared search.
- The `autoload` and `autoload-dev` PSR-4 maps merge per prefix, with `autoload` directories first and none lost.
- Entries are ordered longest prefix first, and directories of one prefix in map order.
- `resolveImports` tries the exact qualified-name map first, then the `packageEntryFiles` first entry, then the own-PSR-4 fallback. It never calls `resolvePackageExport` and returns no steps.
- The own fallback only returns indexed files by workspace-relative id, and excludes test or autoload-dev targets unless the importer is a test.
- `matchSpecifier` takes the longest prefix across the prepared maps.

### Discrepancies

**D-PHP-1 (High). `entrySurface` and `resolveToPath` perform filesystem I/O.**

- `qualifiedNameEntries` and `resolveQualifiedNameFromSession` call `canonical()` (find-manifest-field.ts), which calls `realpathSync`, for the code root and each candidate on every call, so on every Pass 2 import.
- The spec states `entrySurface` "MUST NOT perform I/O", "Repeated Pass 2 resolution SHALL use the prepared compact metadata and perform no filesystem read", and `resolveToPath` "SHALL read the PSR-4 map prepared in the session, not the filesystem".
- Reading A (spec right): `realpathSync` is a filesystem access, and this violates the no-I/O rule. Fix: canonicalize the code root and PSR-4 directories once in `prepare`, and compute the relative path lexically afterwards.
- Reading B (code right): the intent is "no manifest reads". The spec could say "no manifest or file content read" and allow path normalization.
- Tests do not detect it. They delete the manifest only.
- Go and TypeScript `entrySurface` do not call `canonical`, so they are clean.

**D-PHP-2 (Medium). Prepare search differs from identity search.**

- `readComposerManifest` calls `findPackageManifest(codeRoot, 'composer.json', () => true, repoRoot)`, so it takes the nearest `composer.json` even without `name`. `identity` skips a nameless one and continues upward.
- Result: with a nameless nearest and a named higher manifest, the workspace has an identity from the higher manifest, but `prepare` stores the nameless manifest, so `data.name` is undefined and no owner is registered. The package then yields `no-entry-surface`.
- This is the exact case the scenario "Identity and prepare use the same package root" forbids ("an identity followed by `no-entry-surface`").
- Reading A (spec right): `prepare` must use the same search as `identity`. The own-PSR-4 fallback for a nameless workspace then has to come from some other source.
- Reading B (spec's two rules conflict, code is a deliberate compromise): the spec also demands that a workspace whose `composer.json` has no `name` still resolves its own namespaces from its own PSR-4 map. That requires `prepare` to read the nameless manifest. The spec should state the precedence: a nameless nearest manifest keeps its PSR-4 map for the own fallback, while identity and the owner come from the named higher manifest.
- Test: "composer.json without a name is skipped for identity" covers identity only. No test combines nameless nearest, named higher, and `entrySurface`.

**D-PHP-3 (Low). Dead code.** `resolvePackageFromSpecifier` (php-language-adapter.ts:577) is private, always returns `undefined`, and is unused. `resolveQualifiedNameWithMap` and `buildPsr4Map` appear to be unused too (verify with `graph impact`). Reading A: leftover to delete. Reading B: kept for the legacy path. Not spec-relevant.

**D-PHP-4 (Low). Reason mapping.** When `packageEntryFiles` resolved but the first entry is a test file and the importer is not a test, the code falls through and finally reports `not-exported` (resolveImports). The spec says unresolved imports return "the reason reported by the helper". The helper reported `resolved`, so no helper reason exists. Reading A: fine. Reading B: a dedicated or existing reason should be used.

**D-PHP-5 (Low). Autoload-dev flag.** A directory listed in both `autoload` and `autoload-dev` is added to `autoloadDevDirs`, so a production importer is blocked from that directory by the own-fallback rule even though `autoload` lists it. Edge case. The spec classifies "a file in an autoload-dev directory" as test-only without covering this overlap.

Also noted: an empty PSR-4 prefix (`"": "src/"`) matches every qualified name in `matchQualifiedNameToPackage`. This can attribute unrelated vendor names to a package. Edge case.

### Test coverage (PHP)

Covered: prepare once plus autoload/autoload-dev merge (combined test), longest prefix first, own fallback without name, no test file for production code, nameless composer skipped for identity.

Gaps:

1. Scenario "Own PSR-4 fallback never uses an absolute path": no test.
2. "Import depends only on the first candidate that is an indexed file": only partly covered by the longest-prefix test.
3. No no-I/O test for `entrySurface` / `resolveToPath` that would have caught D-PHP-1. The "once" test is not verified by read counting.
4. No test for D-PHP-2.

---

## 5. code-graph:python-language-adapter

### Requirement summary and status

**Imports and package resolution** (modified). Status: implemented.

- `identity` uses `findPackageManifest` with `readPythonProjectName` (`[project].name`, single or double quotes, other tables ignored).
- `matchSpecifier` normalizes per PEP 503 (`toLowerCase`, runs of `-_.` become `-`). It returns `undefined` unless exactly one distinct known identity matches.
- `prepare` is a no-op, as the spec allows.
- `entrySurface` uses no filesystem read. It searches `src/<pkg>` and `<pkg>` under the workspace, with `.py`, `.pyi`, `/__init__.py`, `/__init__.pyi`. A source file hides its stub.
- Submodule import: for reasons `not-exported` and `no-entry-surface`, `packageEntryFiles('pkg.X')` adds a file dependency and creates no binding. More than one entry gives a diagnostic `ambiguous`. Re-imported names stay unresolved.

### Discrepancies (all Low)

**D-PY-1.** See D-LA-5: ambiguous normalized names surface as `package-unknown` and are counted as external.

**D-PY-2.** `readPythonProjectName` is a line scanner. `[[project]]` array-of-tables, a dotted key `project.name = "x"` at top level, a quoted key `"name"`, and multi-line strings are not handled. Reading A: the spec limits identity to the `[project]` table and the scanner is enough for real files. Reading B: a TOML parser would be exact, but the package has no TOML dependency.

**D-PY-3.** Candidate order is `src/<pkg>` first, then `<pkg>`. The spec says "searched under the package's code root and its `src/` directory" and does not fix an order. When both roots hold the module, the result is ambiguous only for the submodule path. For `from pkg import X` with `X` in both, `resolvePackageExport` gives `ambiguous` if the targets differ. Fine.

### Test coverage (Python)

Covered: normalization (dots, case, underscore), submodule without `__init__`, two roots ambiguous, `pyproject.toml` without a project name skipped. Gap: "Equal normalized names stay unresolved" (`acme-auth` and `acme_auth`) appears to be exercised only if the PEP 503 test includes it. I did not confirm; check the test body. No test for `.pyi` plus `.py` pairing in `entrySurface`.

---

## 6. Consistency with default:\_global specs and direct deps

- I did not open the default:\_global spec text. Checks done against the code instead:
  - Layering: `index-code-graph.ts` (application layer) imports `node:fs` (`existsSync`, `statSync`) directly for the workspace accessibility check. Pre-existing imports from `node:fs` exist in that file, so this is not new, but the check could go behind a port as `RepositoryRootSource` does. Low.
  - The VCS dependency is correctly behind `RepositoryRootSource` (port, adapter in infrastructure/vcs, wiring in composition). `@specd/core` is a declared dependency of code-graph. OK.
  - `PackageEntry`, `PackageWorkspace`, `PackagePreparationContext` are exported through `index.ts`. I did not verify that every new public type is exported.
- Public contract change: `PackagePreparationContext.repoRoot` was replaced by `projectRoot`, and `identity` gained `report`. These are breaking for third-party adapters. Check that the code-graph spec for the public API and the changelog or ADR notes cover it.

## 7. Top issues

1. D-PHP-1 (High): PHP `entrySurface` and `resolveToPath` call `realpathSync` through `canonical()` on every Pass 2 import. The spec forbids I/O there. Tests miss it.
2. D-PHP-2 (Medium): PHP `prepare` and `identity` use different manifest searches. This is the scenario the spec forbids, though the spec also requires the nameless own-fallback. Clarify the spec, then align code and tests.
3. D-LA-2 (Medium): diagnostics for skipped manifests and inaccessible workspaces go into `errors`. Confirm they do not fail the run in the CLI or MCP.
4. D-LA-3 (Medium): stale identities of an adapter disabled partway through the workspace loop.
5. Test gaps: no `link`-throws test, "read once" is never counted, no PHP absolute-path scenario, and no cross-adapter same-root test beyond TS.

---

# Partial compliance audit: indexer, symbol-model, sqlite-graph-store, resolve-symbol-reference

Change: code-graph-package-resolution-hardening. Scope: delta requirements and verify scenarios of the four specs, checked against the uncommitted working tree in packages/code-graph (+ sdk wiring) and tests. Read-only; no code/spec modified. Method: delta files read in full, merged specs skimmed, code read with git diff + targeted reads. Tests not re-run (reported passing: 1429).

Neither spec nor code is assumed correct; each discrepancy lists both readings.

## Counts

| Spec                                       | Reqs audited                                                                                    | Implemented       | Discrepancies            | Test gaps |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------- | ------------------------ | --------- |
| code-graph:indexer                         | 4 (Shared session, Cross-workspace resolution, Incremental equivalence, Package import closure) | 3 full, 1 partial | 4 (1 HIGH, 2 MED, 1 LOW) | 5         |
| code-graph:symbol-model                    | 1 (File node namespace)                                                                         | yes               | 1 (LOW)                  | 0         |
| code-graph:sqlite-graph-store              | 2 (Persisted node storage, schema v16)                                                          | yes               | 0                        | 1 (minor) |
| code-graph:resolve-symbol-reference        | 1 (Structured reference input)                                                                  | yes, 1 nuance     | 2 (LOW)                  | 1         |
| Cross-spec (index-project-graph, \_global) | -                                                                                               | -                 | 1 (MED)                  | -         |

Totals: 8 discrepancies (1 HIGH, 3 MED, 4 LOW), 7 test gaps (2 HIGH-value).

---

## 1. code-graph:indexer

### 1.1 Shared indexing session (qualified-name lookup, hydrated files, test exclusion)

Implementation:

- `InMemoryIndexSession.hydratePersistedFile` fills `qualifiedNameSymbolMap` / new `testQualifiedNameSymbolMap` from persisted `namespace`+`namespaceSeparator` (default `.` if separator missing). `registerAnalysis` does the same for analysed files. `findSymbolByQualifiedName` / `getQualifiedNames` take `{includeTests}` and return merged map (production wins on duplicate). OK.
- Indexer passes `includeTests: fileCategories.get(prefixedPath) === 'test'` (index-code-graph.ts ~1369).

#### D1 (HIGH) `fileCategories` is never updated for new/changed files, so the importer-is-test decision is wrong

- Evidence: `fileCategories` is built once from `existingFiles` (index-code-graph.ts:1032) and has no `.set` anywhere (greps: lines 1032, 1258, 1369 only; `fileLanguages` does get `.set` at 1197, categories do not). In Pass 2 the `includeTests` flag uses that stale map.
- Effect: in a clean run (empty `existingFiles`) every importer is treated as non-test, so a new test file importing a test helper by qualified name gets no local binding via `qualifiedNames`. Same for a file that changed category (stale old category). Violates "An importing file that is itself a test SHALL see test symbols" and verify scenario "A test importer resolves to a test helper".
- Why tests pass: the end-to-end PHP test (package-resolution.spec.ts:387) only asserts the file-level `IMPORTS` relation and impact on files; PHP adapter falls back to `packageEntryFiles` (PSR-4) at php-language-adapter.ts:996-1005 which allows test importer to test target. The symbol-level path (`importMap` through `qualifiedNames`) is masked. The only direct test of `includeTests` is the session unit test (in-memory-index-session.spec.ts), which does not exercise the indexer decision.
- Possibility A (code wrong): use `session.getFileCategory(prefixedPath)` (already registered with the fresh category during Pass 1) instead of `fileCategories`. Likely the intended behaviour.
- Possibility B (spec wrong/too strong): none plausible; spec text and scenario both require test importers to see test symbols.

#### D2 (LOW) Hydration only on one path

- `hydratePersistedFile` runs only when `persistedReferenceFacts !== undefined` (semanticRefreshRequired: coverage exists and files changed). The separate "unchanged files" loop (index-code-graph.ts ~1246-1272) registers analyses with no `namespace`, so unchanged files would contribute no qualified names when hydration did not run (e.g. existing files but zero coverage rows). Edge case; the spec says "filled identically ... for files hydrated from the persisted store".
- A (code): pass `namespace`/`namespaceSeparator` from `existingFiles` in that loop. B (spec): acceptable if that path cannot coexist with reprocessing; then state the precondition in the spec.

### 1.2 Cross-workspace package resolution

Implemented and matching spec:

- Per-workspace repo root via `RepositoryRootSource` (VcsRepositoryRootSource -> `createVcsAdapter(codeRoot).rootDir()`; throw (NullVcsAdapter) or rejection -> `undefined`; deduped per codeRoot; never rejects). Project root no longer used as boundary (`projectRoot` separate field in `PackagePrepareContext`; `repoRoot` per workspace in analyze/resolve/relation contexts).
- Every adapter asked for identity per workspace; identity throw -> error recorded, adapter added to `disabledPackageResolution`, `reExportLinking.link` still called (with empty `packageToWorkspace`). `prepare` throw -> same.
- Collision: claims map, identity removed from map (resolves to no workspace), error names all claimants; same workspace through several adapters is not a conflict.
- Map and `prepare` cover `configuredWorkspaces ?? workspaces`, filtered by accessibility. SDK passes `configuredWorkspaces: listed` (sdk/src/orchestration/run-index-project-graph.ts:94).
- `PackageImportResolver` is generic (no language/manifest branching; verified by grep), filters entries to indexed non-test, resolves only when all hits share the target, reason codes `facet-absent` / `package-unknown` / `no-entry-surface` / `not-exported` / `ambiguous`.
- `externalPackageImports` counts `package-unknown` only; `facet-absent` excluded; `adaptersWithoutPackageResolution` = distinct adapter instances by first declared language, sorted.

#### D3 (MED) Partial-run correctness is only guaranteed for the first run, not for incremental partial runs

- Fingerprints (`computeWorkspaceFingerprint(..., options.workspaces, ...)`) and the incremental closure use only the selected workspaces. If workspace B (configured but not selected) changes its manifest/entry or is newly added, importers in selected workspace A are not re-resolved in a partial run (A's files are unchanged so nothing is reprocessed; addition-only fallback considers only new files in the selected set).
- Spec text: "so the result for an indexed workspace does not depend on which subset was requested" and "a change to ... a package manifest ... or to the set of workspaces SHALL re-extract the importing files in other workspaces".
- A (code gap): include `configuredWorkspaces` (names + manifest facts) in the fingerprint / closure inputs. B (spec): narrow the claim to "map and prepare data", and state that stale importers outside the selected set are repaired by the next full run.
- Related: the scenario "A imports a package declared by B" only resolves if B is already indexed in the store (entry must be `session.getFileId`-registered). That is true in the test but the spec does not state the precondition.

#### D4 (LOW) Inaccessible workspace is reported through `IndexResult.errors`

- Spec: "skipped with a diagnostic ... MUST NOT fail the run". Code pushes `{filePath: "<ws>:<manifest>", message: "... skipped for package resolution ..."}` to `errors`. The CLI prints `errors: N` but does not fail on it (cli/src/commands/graph/index-graph.ts:163,205), so behaviour is acceptable, but the same channel is used for real failures; `result.errors` is not empty for a healthy run with an uncloned repo.
- A (code): acceptable; maybe use a distinct warning channel. B (spec): state that the diagnostic is carried as an indexing error entry.
- Also: only checks existence of directory, not whether the selected `options.workspaces` entry is accessible (a selected, missing root fails elsewhere in discovery).

### 1.3 Identity-sensitive incremental equivalence

- Implemented via hydration (D1/D2 caveats). Tests exist for PHP, Python, Go (index-code-graph-incremental.spec.ts) comparing `semanticState` of incremental vs clean.

### 1.4 Package import incremental closure (addition-only fallback)

- `addsCode = newFiles.some(p => registry.getAdapterForFile(relativeIdentityPath(p)) !== undefined)`; `additionCandidates` only if true. Matches spec ("files an adapter analyzes"). A new TypeScript-adapter-claimed file counts; documents/assets do not.
- Reverse `import:package` closure and manifest-driven re-extraction are unchanged by this change (not re-audited beyond existing test at package-resolution.spec.ts:169).

### Indexer test coverage gaps

- G1 (HIGH value) "Partial run maps and prepares every configured workspace" (index-code-graph-package-resolution.spec.ts:293) is vacuous: the first run already persists the `import:package` step; the second (partial) run reprocesses nothing (no file changed), then asserts a step exists. It never asserts equality with a both-workspace run and never forces re-resolution in the partial run (e.g. touch an importing file, or a fresh store seeded with B). Would still pass if `configuredWorkspaces` were ignored.
- G2 (HIGH value) No indexer-level test of "test importer sees test symbols" on the qualified-name path (masks D1). Needs a Python/Go/PHP case where the only route is `qualifiedNames`, in a clean run AND an incremental run, asserting `importMap`/local binding or symbol-level dependency, not just file `IMPORTS`.
- G3 Inaccessible-workspace test (index-code-graph-package-resolution.spec.ts:320) asserts only the diagnostic; not "imports of its packages count as external" (externalPackageImports) nor "other workspaces indexed normally".
- G4 No positive test for the addition-only fallback ("adds a new code file -> existing files re-extracted and a previously unresolved import resolves, equals clean rebuild"); only the negative (non-code file) exists (index-code-graph-incremental.spec.ts:236). Title says "still re-extract" but asserts the opposite.
- G5 Incremental equivalence tests use a single mutation (edit one consumer), PHP fallback (PSR-4 file import) can mask a missing hydrated lookup; no assertion that the hydrated lookup itself was used, no mutation types listed in the spec (rename/move/delete/add).
- Covered scenarios (present): every adapter asked, collision, same-ws multi-adapter, per-repo roots, no-VCS, VCS throw, identity-throw keeps barrel linking, adapter-once listing, package-unknown external. Verify scenario "The first adapter to return an identity wins" / "Identity is searched within the project" were removed by delta; no residual tests asserting them were found.

---

## 2. code-graph:symbol-model

Requirement: FileNode optional `namespace`, `namespaceSeparator`, separator present iff namespace present, not part of equality.

- Implemented: `FileNode` fields, `createFileNode` omits both when namespace undefined (separator-only input dropped). Not part of equality (no equality function includes them).

#### D5 (LOW) "present if and only if" is not enforced

- `createFileNode({namespace:'X'})` without separator yields a node with namespace only (test file-node.spec.ts:162 explicitly asserts this). Hydration defaults to `.`. Spec says separator present iff namespace present.
- A (code): throw/default the separator when namespace is set (e.g. default '.' or reject). B (spec): relax to "separator is optional; consumers default to `.`", matching the session's behaviour and the test.
- Test coverage: scenario "File namespace is optional and paired" covered (file-node.spec.ts:162), but the test encodes the relaxed behaviour (see D5). The scenario's PHP `App\Models` / Go example is not literally tested via the PHP/Go adapters.

---

## 3. code-graph:sqlite-graph-store

- `SQLITE_SCHEMA_VERSION = 16`; DDL adds nullable `namespace`, `namespace_separator` to `files` (REQUIRED_COLUMNS derived from DDL, so a missing column is rejected). All `files` SELECT/INSERT/UPSERT paths (single, bulk, getFilesByPaths, getAllFiles, by project path, file-content search joins) updated; `mapFileRow` maps nulls to absent. Worker payload carries whole `FileNode`, no separate row shape to change. Version 15 (and <15, >16) rejected by existing equality check (`Number(current.value) !== SQLITE_SCHEMA_VERSION`), recovery reason `SCHEMA_INCOMPATIBLE`; test sqlite-graph-store.spec.ts:1723 (`it.each` incl. '15','17') and :1872 (15 -> rebuild as 16, epoch rotation).
- No ALTER TABLE migration. Compliant. No discrepancies.
- Both columns null or both set is not enforced by DDL (no CHECK); store writes whatever FileNode carries (see D5). Spec says "are both null or both set". LOW; tied to D5 (A: add CHECK or normalise on write; B: relax spec).
- Test gaps: "Namespace round-trips through the files table" covered (single, batch, all-files). Not covered: round-trip through the bulk/worker path (`bulkLoad` / indexer-run commit) and file-content search results that now select the namespace columns.

---

## 4. code-graph:resolve-symbol-reference

- `deriveQualifiedName` removed from the resolver's `resolveQualifiedMember`; equality is only on stored `target.qualifiedName`. `parseDottedMemberReference` fallback removed from `parseAnchoredReference`; adapter chosen by explicit `language`, else `registry.getAdapterForFile(anchored)`; adapter without `symbolReferenceSyntax` -> `{candidates: []}`.
- Both new verify scenarios have tests (resolve-symbol-reference.spec.ts:1526, 1573).

#### D6 (LOW) Zero parsed candidates returns `undefined`, not an explicit unresolved

- Spec: when no adapter/facet, the text "MUST resolve as unresolved". `resolveQualifiedMember` returns `undefined` when `parsed.candidates.length === 0`, so control falls to later lanes (generic name lookup of the whole text). Result is still unresolved for the covered scenarios, but another lane could in principle match the full spelling by name equality.
- A (code): return `unresolved(prepared, 'REFERENCE_UNPROVEN')` when an adapter was required but absent. B (spec): fine as-is if later lanes can never match owner-qualified text.

#### D7 (LOW) Adapter selection by "indexed public-surface metadata" is just extension matching

- Spec order: explicit language, language of anchored indexed file, indexed public-surface metadata. Code calls `getAdapterForFile(filePath ?? publicSurface)`, i.e. path extension; it does not check the file is indexed nor read public-surface metadata (language of surface). Go package surface does end up with no adapter (matches the scenario).
- A (code): resolve language from the indexed file/surface record in the store. B (spec): reword to "language inferred from the anchor's path extension".

Cosmetic: `deriveQualifiedName` is still exported and used by `session-reference-store.ts:68` at index time to materialise the stored `qualified_name`; consistent with spec (derivation at write time, not at lookup). Doc comment of `resolveQualifiedMember` fine.

---

## 5. Cross-spec consistency (\_global, workspace-integration, graph-store, index-project-graph)

#### D8 (MED) `index-project-graph` spec not updated for `configuredWorkspaces`

- specs/code-graph/index-project-graph/spec.md:37-39 enumerates `IndexProjectGraphInput` fields (`provider, projectRoot, workspaces, graphConfig, codeGraphVersion, vcsRoot, vcsRef, force, onProgress`). Code adds optional `configuredWorkspaces` (index-project-graph.ts:15, forwarded), and `IndexOptions.configuredWorkspaces`. No delta for `code-graph:index-project-graph` exists in this change (deltas dir: go/indexer/language-adapter/php/python/resolve-symbol-reference/sqlite-graph-store/symbol-model/typescript).
- A (spec gap): add a delta for index-project-graph (and, if applicable, `ProjectGraphConfig.projectRoot` doc change "never a boundary for package resolution" in workspace-integration/composition). B (code): none; the SDK needs to pass configured workspaces.
- Also `graph-store` spec lists FileNode data needed; it does not mention `namespace`/`namespaceSeparator` explicitly (spec mentions "FileNode data needed by indexing" generically), so a store implementer reading only graph-store would not know to persist them; consider a graph-store note or contract-suite test (`graph-store.contract.ts` has no namespace round-trip test, so alternate stores such as the in-memory one are unchecked). LOW.
- `workspace-integration` (cross-workspace resolution requirement, spec.md:181) does not state the repository-bounded identity model; no contradiction found.
- `_global` conventions/architecture/testing/eslint: not exhaustively re-checked. Observed: application layer already imported `node:fs` before this change (new `existsSync/statSync` use is consistent with existing code); new port `RepositoryRootSource` lives in application/ports with infra implementation in infrastructure/vcs (layering respected); new files carry JSDoc. Not verified: lint run, test-title conventions.

---

## Top issues (ranked)

1. D1 + G2: stale `fileCategories` makes test importers fail to see test symbols on the qualified-name path (new files and category changes). Masked by file-level PSR-4 fallback in PHP test.
2. G1/D3: partial-run scenario test is vacuous; incremental partial runs can leave importers stale when an unselected workspace changes (fingerprint/closure use only selected workspaces).
3. D8: `index-project-graph` spec (and possibly workspace-integration) not updated for `configuredWorkspaces` / repo-bounded identity.
4. G4: no positive addition-fallback test; G3/G5 weak assertions.
5. D5: namespace/separator pairing is not enforced (code, test, and DB agree on "optional"; spec says iff).
