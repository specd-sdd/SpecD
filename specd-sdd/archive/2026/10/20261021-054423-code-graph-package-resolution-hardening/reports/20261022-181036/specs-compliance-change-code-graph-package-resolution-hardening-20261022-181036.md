# Spec Compliance Audit — code-graph-package-resolution-hardening

- Mode: change-scoped full verification audit
- Timestamp: 2026-10-22 18:10:36 Europe/Madrid
- Change state audited: `verifying`
- Change specs: 10
- Code graph: current, complete coverage, schema compatible

## Executive Summary

The implementation is broadly covered and all change-owned focused tests pass, but the change is not fully compliant. The audit found **8 discrepancies**: **1 high**, **5 medium**, and **2 low**. The high-severity issue is direct `node:fs` access from the application-layer `IndexCodeGraph` use case, conflicting with the global architecture port boundary. Medium findings cover terminal manifest diagnostics, PHP duplicate Composer reads/parses, the SQLite public error-class contract, POSIX-only test paths, and derived qualified names in the session-backed resolver store. Low findings concern outcome-level assertion gaps and a forbidden partial-port cast in a unit test.

Batch-defined requirement accounting: **101 requirement groups reviewed**, **93 conformant**, **8 partial/nonconformant**. Independent compliance batches executed **888 passing targeted tests** with no targeted failures.

## Verification Evidence

- Affected-package build: passed.
- Repository-wide typecheck: passed.
- Repository-wide lint: passed.
- Change-owned code-graph tests: 18 files / 770 tests passed.
- SDK orchestration test: 1 file / 16 tests passed.
- Compliance-batch targeted tests: 888 passed.
- `git diff --check`: passed.
- Repository-wide test run: 1 unrelated persistent failure in `test/infrastructure/index-lock.spec.ts`; code-graph result was 1 failed / 1,432 passed. The isolated rerun reproduced the same lock-test failure. It is outside this change's files and scenarios but remains a repository gate failure.

## Findings Index

| ID      | Severity | Area                   | Summary                                                                                 |
| ------- | -------- | ---------------------- | --------------------------------------------------------------------------------------- |
| I-1     | High     | Indexer / architecture | Application use case performs direct filesystem I/O.                                    |
| ADP-001 | Medium   | Manifest resolution    | Terminal invalid/unreadable manifests lose the required diagnostic.                     |
| ADP-002 | Medium   | PHP adapter            | Composer preparation parses/reads the chosen manifest more than once.                   |
| S-1     | Medium   | SQLite                 | Version-15 open exposes a recovery wrapper rather than the exact specified error class. |
| T-1     | Medium   | Testing                | Repository-root test hardcodes POSIX absolute paths.                                    |
| D1      | Medium   | Resolver               | Session lookup derives an unstored qualified name, diverging from SQLite.               |
| T-2     | Low      | Testing                | Several scenarios assert invocation/shape rather than promised outcomes.                |
| D2      | Low      | Testing                | IndexProjectGraph test uses a forbidden partial-port cast.                              |

## Detailed Findings

# Compliance Audit Partial — Language Adapters

## Scope and Evidence

Change: `code-graph-package-resolution-hardening`

Merged change specs audited:

- `code-graph:language-adapter`
- `code-graph:typescript-language-adapter`
- `code-graph:go-language-adapter`
- `code-graph:php-language-adapter`
- `code-graph:python-language-adapter`

The audit used `changes spec-preview` for every spec and verification artifact, graph-first symbol discovery, direct inspection of implementation and tests, and the direct dependency/global-spec chain. The code graph was current (`stale: false`, complete coverage, schema compatible).

Independent execution evidence:

- Focused Vitest batch: **8 files passed, 542 tests passed**. The batch covered the four adapter suites plus `find-manifest-field`, adapter conformance, package-resolution, and package-import indexer suites.
- `@specd/code-graph` TypeScript check: **passed** with `tsc --noEmit`.

## Requirements Summary

| Spec                                     | Requirements | Verification scenarios | Implementation status                                                                                  |
| ---------------------------------------- | -----------: | ---------------------: | ------------------------------------------------------------------------------------------------------ |
| `code-graph:language-adapter`            |           34 |                    169 | 33 conformant; 1 partial (`Package resolution facet`)                                                  |
| `code-graph:typescript-language-adapter` |           12 |                     57 | 11 conformant; 1 partial (`Package and build-context boundary`, inherited terminal-diagnostic gap)     |
| `code-graph:go-language-adapter`         |           12 |                     31 | 11 conformant; 1 partial (`Package identity, exports, and imports`, inherited terminal-diagnostic gap) |
| `code-graph:php-language-adapter`        |           11 |                     35 | 10 conformant; 1 partial (`Namespaces, use aliases, and Composer resolution`)                          |
| `code-graph:python-language-adapter`     |           11 |                     34 | 10 conformant; 1 partial (`Imports and package resolution`, inherited terminal-diagnostic gap)         |
| **Total**                                |       **80** |                **326** | **75 conformant; 5 partial, caused by 2 distinct findings**                                            |

## Implementation Status

### `code-graph:language-adapter`

The required core and optional facet model are implemented in `language-adapter.ts` and `language-adapter-facets.ts`. The four built-in adapters expose the declared facets rather than loose resolution methods, session state is run-scoped, and package preparation is orchestrated before Pass 2. `index-code-graph.ts` resolves a repository root per accessible workspace, passes it as workspace data, invokes every applicable adapter identity facet, records callback diagnostics, and prepares all accessible workspaces. Package failures are isolated without disabling unrelated relative re-export behavior.

The shared `findPackageManifest` helper correctly canonicalizes paths, refuses to walk outside the supplied repository root, inspects only the code root when no repository root exists, and returns the package root/content needed for identity and preparation to agree. One terminal-diagnostic behavior is incomplete; see ADP-001.

The remaining common requirements—single full-file analysis, parser-authoritative facts, stored-fact Pass 2, deterministic relations, registry/facet validation, logical ownership, ranges, hierarchy provenance, reference syntax, and cross-language conformance—have implementation and automated coverage in the adapter/conformance/indexer suites. No conflicting language-specific fallback was found in generic resolver code.

### `code-graph:typescript-language-adapter`

The adapter implements the four declared languages/extensions, compact one-pass analysis, parser-derived declarations/imports/calls/hierarchy, logical owners and overload groups, public/re-export bindings, type-space-aware import resolution, and deterministic relation construction.

Package resolution now uses the same bounded manifest search for identity and preparation. Prepared state retains only `name`, `main`, `exports`, and `codeRootOffset`; entry lookup performs no filesystem access. Published paths are constrained to the code root, `dist` and declaration targets map to supported indexed sources, other build directories are not guessed, runtime alternatives precede `types`, and ambiguity is preserved. Tests cover a code root below `package.json`, outside-root rejection, compact state, `.d.*` mapping, unsupported build directories, repeated entry lookup after manifest deletion, and workspace preparation. The only partial status is the shared terminal skipped-manifest diagnostic in ADP-001.

### `code-graph:go-language-adapter`

The adapter retains parser-authoritative Go declarations, receiver ownership, calls/types, imports, embedding/proven interface evidence, and explicit unsupported build-context boundaries. Package matching uses the longest module prefix and imports remain package/file dependencies rather than name guesses.

`readGoModulePath` supports unquoted, double-quoted, and backtick module paths. Preparation finds the module directory with the shared bounded search, stores only the module-to-code-root offset, and uses the indexed-file directory map in Pass 2. Package directories above or outside the code root are handled as specified, and `_test.go` files are excluded. Tests cover quoted modules, module root above code root, outside-root rejection, manifest deletion after preparation, and manifest declaration. The only partial status is the shared terminal skipped-manifest diagnostic in ADP-001.

### `code-graph:php-language-adapter`

The adapter implements parser-authoritative declarations/loaders/calls/hierarchy, namespace-qualified ownership, scoped aliases, exact qualified-name lookup, package and qualified-name facets, and run-scoped Composer/PSR-4 state. Prepared maps merge `autoload` before `autoload-dev`, sort by longest prefix, constrain candidates to indexed workspace-relative files, prohibit production imports from test/dev targets, support an own-workspace PSR-4 fallback without a Composer package name, and avoid Pass 2 filesystem access. No short-name cross-workspace search or public-binding invention was found.

The resulting metadata and resolution behavior are correct in the exercised cases, including named-manifest preference, but the preparation implementation parses a named Composer manifest twice and can read a nameless fallback twice. This directly conflicts with the merged PHP requirement; see ADP-002. ADP-001 also affects the identity diagnostic path.

### `code-graph:python-language-adapter`

The adapter implements parser-authoritative Python declarations/imports/calls/hierarchy, class/member ownership, source/stub preference, module surfaces, unresolved/ambiguous behavior, and explicit unsupported MRO/public-surface rules. Distribution matching applies PEP 503-style lowercasing and separator normalization and refuses equal normalized identities. Package entry lookup is session/index based and performs no filesystem I/O; unambiguous submodules work without `__init__.py`, while duplicate roots remain ambiguous. Tests cover these hardening cases and `[project].name` selection. The only partial status is the shared terminal skipped-manifest diagnostic in ADP-001.

## Discrepancies

### ADP-001 — MEDIUM — A terminal invalid or unreadable manifest is not reported

**Affected requirements:**

- `code-graph:language-adapter` — Package resolution facet
- TypeScript/Go/PHP/Python package identity requirements through the shared facet contract

**Spec expectation:** Every manifest encountered without the language identity field is skipped with a non-fatal diagnostic through `report`; the bounded walk then continues. The diagnostic is part of `IndexResult.errors` even though the run succeeds.

**Implementation evidence:**

- `findPackageManifest` accumulates invalid/unreadable candidates in `skipped` (`find-manifest-field.ts:79,98`).
- When the walk reaches its boundary without a later valid manifest, it returns `undefined` (`find-manifest-field.ts:102`) and discards the accumulated paths.
- Each adapter reports `match.skipped` only after a successful match. Go/PHP/Python return immediately when the match is `undefined` (`go-language-adapter.ts:1600`, `php-language-adapter.ts:2259`, `python-language-adapter.ts:2037`); TypeScript likewise reports only from a successful match (`typescript-language-adapter.ts:3189-3193`).
- The indexer supplies a callback that would correctly append the diagnostic to `IndexResult.errors` (`index-code-graph.ts:965-971`), but it is never called in this terminal case.

**Observed impact:** Package identity remains unresolved, which is safe, but the required actionable diagnostic is silently lost. This affects a workspace whose only bounded manifest is nameless/malformed/unreadable, not the already-tested case where a later valid manifest is found.

**Spec-versus-code possibilities:**

- **Implementation bug:** Preserve/return skipped diagnostics even when no usable manifest is found, or let the helper report each skipped candidate while walking.
- **Spec drift:** If diagnostics are intentionally required only when a later valid identity is found, narrow the common requirement and the callback contract. That interpretation is not supported by the current wording, which requires a diagnostic for the skipped manifest itself.
- **Both partial:** Keep terminal identity absence silent but distinguish unreadable/invalid/missing-identity outcomes explicitly in a revised result type; currently the helper conflates them.

### ADP-002 — MEDIUM — PHP preparation does not use a single parse and can read the chosen nameless manifest twice

**Affected requirement:** `code-graph:php-language-adapter` — Namespaces, use aliases, and Composer resolution (`prepare` must read the chosen `composer.json` at most once per call from a single parse).

**Spec expectation:** Composer package name and PSR-4 data are derived from one filesystem read and one JSON parse of the chosen manifest during preparation. Identity may separately read the same manifest.

**Implementation evidence:**

- `hasComposerName` parses the candidate with `JSON.parse` (`php-language-adapter.ts:475-479`).
- `readComposerManifest` first calls `findPackageManifest(..., hasComposerName, ...)` (`php-language-adapter.ts:2158`), then parses `match.content` again to extract name/autoload data (`php-language-adapter.ts:2179`). Thus a normal named chosen manifest is parsed twice.
- If no named manifest exists, the `?? findPackageManifest(..., () => true, ...)` fallback (`php-language-adapter.ts:2159`) walks and reads the nameless chosen manifest again. That path can perform two filesystem reads and an additional parse of the same chosen file.
- The scenario test named `Prepare parses composer.json once and autoload and autoload-dev share a prefix` deletes the file after preparation and checks prepared state/order, but it does not spy on filesystem reads or JSON parsing. It therefore does not verify the stated “once” condition.

**Observed impact:** Resolution results are correct in current tests, but preparation performs duplicate parsing and can duplicate I/O on the nameless-own-PSR-4 path. This breaks an explicit lifecycle/performance contract and makes the verification scenario a false assurance for read/parse count.

**Spec-versus-code possibilities:**

- **Implementation bug:** Read once, parse once into a small validated intermediate, then decide whether it is the named selection or nameless fallback without re-reading/re-parsing the chosen file.
- **Spec drift:** If “single parse” only meant one retained compact result rather than one actual JSON parse/read, relax the requirement and verification scenario. The current text explicitly says “read ... at most once ... from a single parse,” so this would materially weaken the contract.
- **Both partial:** A shared manifest-search API could return parsed selection metadata and terminal diagnostics, avoiding both duplicate PHP work and ADP-001’s lost diagnostic.

## Test Coverage

| Area                         | Primary evidence                                                                                                                                | Coverage assessment                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Common facet/search contract | `language-adapter-conformance.spec.ts`, `find-manifest-field.spec.ts`, `package-resolution.spec.ts`, `index-code-graph.package-imports.spec.ts` | Strong positive/boundary coverage; missing terminal-invalid diagnostic case                                                                       |
| TypeScript adapter           | `typescript-language-adapter.spec.ts`, package-resolution and package-import integration suites                                                 | Strong coverage of package-root offset, compact state, exports/main/subpaths, condition ambiguity, no-I/O entry lookup, ownership/parser behavior |
| Go adapter                   | `go-language-adapter.spec.ts`, `package-resolution.spec.ts`                                                                                     | Strong coverage of module-path forms, offset calculation, package entries, test exclusion, parser/owner/hierarchy behavior                        |
| PHP adapter                  | `php-language-adapter.spec.ts`, `package-resolution.spec.ts`                                                                                    | Strong resolution/output coverage; read/parse-count assertion is insufficient                                                                     |
| Python adapter               | `python-language-adapter.spec.ts`, `package-resolution.spec.ts`                                                                                 | Strong normalization, source/stub, submodule/ambiguity, identity-table, parser/owner/hierarchy coverage                                           |

The focused green run demonstrates no regressions in exercised behavior, but passing tests do not erase ADP-001 or ADP-002 because their missing assertions do not execute the nonconformant conditions.

## Missing Tests

1. **Terminal skipped-manifest diagnostic:** For each manifest family (or once against the shared helper plus adapter callback integration), place a nameless/malformed/unreadable manifest at the bounded repository root with no valid manifest above it. Assert identity remains `undefined` **and** the callback/`IndexResult.errors` receives the skipped-manifest diagnostic.
2. **PHP single-read/single-parse contract:** Spy on manifest reads and use a parse seam or parsed-helper abstraction. Assert one read and one parse for a normal named manifest during one `prepare` call.
3. **PHP nameless fallback read count:** Prepare a workspace with only a nameless `composer.json` containing PSR-4 metadata. Assert own-PSR-4 state is created with exactly one read/parse, then delete the file and prove `entrySurface`/own fallback remains I/O-free.

## Spec Dependency Chain

```text
default:_global/{architecture,conventions,testing,docs,eslint,error-handling-conventions}
                              |
code-graph:symbol-model ------+------ code-graph:workspace-integration
              \              |              /
               code-graph:language-adapter
                  |       |       |       |
                  v       v       v       v
          typescript     go      php    python language adapters
```

- **`code-graph:symbol-model`:** Adapter ownership, broad kinds, logical identities, ranges, relations, and hierarchy provenance use the shared vocabulary. No contradiction was found; the implementations map syntax ownership before member logical facts and keep unresolved evidence from becoming guessed relations.
- **`code-graph:workspace-integration`:** Workspace-prefixed file ids, configured/accessibly hydrated workspaces, per-workspace code roots, and repository/package-root boundaries are preserved. The code root is not confused with the project root in the adapter API. No dependency-spec contradiction was found.
- **Global architecture:** Filesystem access is confined to infrastructure adapters/helper and orchestrated through application/session contracts; domain files define types only. No inward infrastructure dependency or domain I/O was found.
- **Global conventions/eslint/docs:** Named exports, strict typed contracts, ESM imports, explicit returns, kebab-case files, and public JSDoc are present in the inspected surface. No `any`, default export, or raw-console regression was found.
- **Global testing:** The inspected tests use Vitest, unique `os.tmpdir()` directories, and cleanup. Cross-platform path canonicalization and Windows separators are handled in implementation and boundary tests. No snapshot testing was introduced.

## Summary Counts

- Specs audited: **5**
- Requirements audited: **80**
- Verification scenarios reviewed: **326**
- Conformant requirement statuses: **75**
- Partial requirement statuses: **5** (from **2 distinct implementation findings**)
- Findings: **0 critical, 0 high, 2 medium, 0 low**
- Focused automated tests: **542 passed, 0 failed**
- Typecheck: **passed**
- Missing/insufficient tests: **3**
- Direct dependency/global-spec contradictions: **0**

---

# Compliance Audit Partial: Indexing and Storage

Change: `code-graph-package-resolution-hardening`  
Specs: `code-graph:indexer`, `code-graph:symbol-model`, `code-graph:sqlite-graph-store`  
Audit mode: merged change specs plus relevant depth-1 dependencies and global rules  
Graph state: current (`stale: false`, indexed ref `b0ef8587a`)

## Requirements Summary

### `code-graph:indexer`

The merged spec was reviewed in full, with detailed traceability for the four requirements changed by this change:

1. **Shared indexing session** — hydrated files must repopulate qualified-name lookup state from persisted namespace data; production importers must not see test symbols, while test importers may see test helpers.
2. **Cross-workspace package resolution** — resolve a repository root per configured code root; ask every adapter for identity; isolate identity/prepare failures; map and prepare every configured accessible workspace during partial runs; keep relative re-export linking; report disabled adapters once; treat inaccessible-workspace packages as external.
3. **Identity-sensitive incremental equivalence** — PHP, Python, and Go name-addressed imports must yield the same normalized semantic state after incremental indexing as after a clean rebuild.
4. **Package import incremental closure** — only newly added code files trigger the broad addition fallback; document/asset additions must not.

The unchanged merged requirements were also checked at their integration boundaries: two-pass ordering, adapter-facet independence, diagnostic summarization, persisted reference facts, deterministic package/public-binding resolution, and GraphStore persistence. No additional regression was found in those inherited contracts.

### `code-graph:symbol-model`

The changed **File node** requirement adds optional paired `namespace` and `namespaceSeparator` properties, excludes them from canonical identity/equality, and requires them to be absent together when no namespace is present. The surrounding immutable value-object and workspace-identity requirements remain compatible.

### `code-graph:sqlite-graph-store`

The two changed requirements are:

1. **Persisted node storage** — schema and all file read/write paths persist paired nullable `namespace` / `namespace_separator` values.
2. **Reference schema upgrade** — schema version 16 introduces those columns, rejects version 15 on ordinary open, requires destructive recreation rather than `ALTER TABLE`, rotates `storage.epoch`, and rebuilds search indexes.

## Implementation Status

| Spec / requirement                                               | Status                              | Evidence                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Indexer: hydrated qualified names and test isolation             | Implemented                         | `packages/code-graph/src/application/use-cases/index-code-graph.ts:885`, `:1766`; `in-memory-index-session.ts:196-236`, `:338-347`, `:519`, `:685`; focused unit and integration scenarios pass.                                                                                    |
| Indexer: per-code-root repository boundary                       | Implemented                         | `index-code-graph.ts:914-943` resolves each accessible code root through the injected `RepositoryRootSource`; composition supplies `VcsRepositoryRootSource(createVcsAdapter)` in `create-code-graph-provider.ts:73`; failure maps to no root.                                      |
| Indexer: every adapter identity, collision/failure isolation     | Implemented                         | `index-code-graph.ts:945-1002`; adapter claims are collected, cross-workspace collisions are removed, and a failed adapter's sole claims are purged. Relative re-export linking remains a separate pass at `:1318-1337`.                                                            |
| Indexer: configured-workspace partial runs and preparation       | Implemented with architecture issue | `index-code-graph.ts:893-913`, `:1303-1316`; every accessible configured workspace is passed to each enabled adapter once per run. Direct filesystem accessibility checks violate the global application-layer port rule (Finding I-1).                                             |
| Indexer: diagnostics                                             | Implemented                         | `index-code-graph.ts:1008-1043`, `:2057`; unknown packages are counted only as external and disabled adapters are deduplicated by first language and sorted.                                                                                                                        |
| Indexer: incremental equivalence and code-only addition fallback | Implemented                         | PHP/Python/Go normalized semantic-state comparisons in `index-code-graph-incremental.spec.ts:118-234`; positive target-appearance equivalence in `index-code-graph.package-imports.spec.ts:600-617`; document-only negative case at `index-code-graph-incremental.spec.ts:236-273`. |
| Symbol model: namespace pair                                     | Implemented                         | `packages/code-graph/src/domain/value-objects/file-node.ts:9-21`, `:49-75`; `createFileNode` emits neither property without namespace and defaults a present namespace's separator to `.`. Properties are readonly and do not alter canonical path identity.                        |
| SQLite: namespace schema and round-trip                          | Implemented                         | `schema.ts:1`, `:7-18`; write paths at `sqlite-graph-database.ts:2822-2880`; row mapping at `:3822-3851`; round-trip tests at `sqlite-graph-store.spec.ts:3121-3169`.                                                                                                               |
| SQLite: v15 rejection and v16 recreation                         | Partially conformant                | Version 16, column shape, no `ALTER TABLE`, recreation, and epoch rotation are implemented/tested (`sqlite-graph-store.spec.ts:1683-1756`, `:1863-1909`). The externally observed error class differs from the merged requirement (Finding S-1).                                    |

## Discrepancies

### I-1 — HIGH — Application use case performs direct filesystem I/O

**Spec evidence:** `default:_global/architecture` requires application-layer external access to occur only through `application/ports/` and forbids application imports of infrastructure concerns. The changed indexer requirement also frames VCS detection as an injected boundary.

**Code evidence:** `packages/code-graph/src/application/use-cases/index-code-graph.ts:1` imports `existsSync` and `statSync` from `node:fs`; the new configured-workspace accessibility branch calls them directly at `:897`. This branch determines which workspaces participate in identity and preparation.

**Why it matters:** the new multirepo/partial-run behavior is now coupled to Node filesystem access inside the application use case, cannot be substituted through a port, and makes the use-case test suite rely on real filesystem setup. The graph marks this file CRITICAL with broad blast radius.

**Two possible resolutions:**

- If the architecture spec is authoritative, move accessibility/type probing behind an application port (or extend an existing manifest/workspace source) and inject the Node implementation from composition.
- If direct host filesystem orchestration is intentionally allowed in this application use case, revise the global architecture and indexer design/spec to state that exception explicitly. The present specs do not permit it.

### S-1 — MEDIUM — Schema-v15 open exposes a different error class than specified

**Spec evidence:** the merged `sqlite-graph-store` requirement and verification scenario explicitly say an ordinary open of a version-15 database fails with `GraphSchemaIncompatibleError` and recovery reason `SCHEMA_INCOMPATIBLE` (`spec.md.delta.yaml:28`; `verify.md.delta.yaml:18`).

**Code evidence:** the low-level schema check creates `GraphSchemaIncompatibleError` (`sqlite-graph-database.ts:2700-2704`), but `open()` catches it and throws `GraphStorageRecoveryRequiredError` at `:367-383`. The focused test deliberately asserts the wrapper at `sqlite-graph-store.spec.ts:1874-1879`.

**Why it matters:** callers observing the abstract SQLite store do not receive the exact public error contract named by the merged spec, even though the wrapper correctly exposes reason `SCHEMA_INCOMPATIBLE` and supports recreation.

**Two possible resolutions:**

- If exact type identity is required, propagate `GraphSchemaIncompatibleError` and add the recovery reason to that type (or preserve it as the public cause while meeting the scenario literally).
- If the provider-level recovery wrapper is the intended stable API, update the SQLite spec/scenario to require `GraphStorageRecoveryRequiredError` with reason `SCHEMA_INCOMPATIBLE`, noting that the internal cause is `GraphSchemaIncompatibleError`. This is consistent with the broader `code-graph:graph-store` dependency, which asks for a typed recoverable error without prescribing the concrete class.

### T-1 — MEDIUM — New repository-root test violates cross-platform path rules

**Spec evidence:** `default:_global/testing` forbids hardcoded POSIX absolute paths in tests and requires path construction/assertion through `node:path` so suites pass both POSIX and Windows path families.

**Test evidence:** `index-code-graph-package-resolution.spec.ts:226-227` returns `'/custom/repo/graph'` and `'/custom/repo/app'`, then asserts those literal POSIX paths at `:249-250`.

**Two possible resolutions:**

- If the global test rule is authoritative, build these values from the test temp root with `join()` (or use platform-neutral opaque repository-root tokens only if the port contract permits them).
- If these are intentionally opaque mock values rather than host paths, the testing spec would need to distinguish opaque identifiers from paths; the current port type and scenario call them repository roots, so that interpretation is weak.

### T-2 — LOW — Some scenario assertions prove invocation but not the full promised outcome

**Evidence:**

- “Every adapter is asked for an identity” records the second adapter calls but never resolves/imports either second identity (`index-code-graph-package-resolution.spec.ts:143-180`). It proves invocation, not that both identities were retained in the package map.
- “Inaccessible workspace is skipped” asserts only the diagnostic (`:331-355`); it does not import a package formerly associated with that workspace and assert `externalPackageImports` rises without increasing failures.
- “File namespace is optional and paired” proves construction shape, but its equality assertion compares only `path` values (`file-node.spec.ts:211-219`) rather than a shared equality operation. This is adequate only while path equality remains a conceptual contract with no equality helper.

**Two possible resolutions:**

- Add outcome-level tests that import through the second adapter identity, count an inaccessible package as external, and exercise the canonical FileNode equality mechanism if one exists.
- Alternatively, narrow the verification scenarios to invocation/shape claims. That would weaken the intended behavior and is not recommended.

## Test Coverage

Focused execution performed during this audit:

```text
7 files / 216 tests passed
  index-code-graph-package-resolution.spec.ts
  index-code-graph-incremental.spec.ts
  in-memory-index-session.spec.ts
  package-resolution.spec.ts
  file-node.spec.ts
  sqlite-graph-store.spec.ts
  vcs-repository-root-source.spec.ts

1 file / 26 tests passed
  index-code-graph.package-imports.spec.ts

Total: 8 files / 242 tests passed
```

Coverage is strong for the principal behavior:

- hydrated namespace lookup, production/test filtering, and test-helper impact;
- repository-root-per-code-root, null/failing VCS resolution, collisions, identity/prepare failure isolation, and relative barrel linking;
- partial-run preparation of all configured workspaces;
- external-package diagnostic separation and adapter deduplication;
- PHP/Python/Go incremental-vs-clean semantic equivalence;
- positive new-code target appearance and negative document-only addition fallback;
- FileNode optional-pair construction;
- SQLite v16 DDL, incompatible-version rejection, namespace round-trip through single/batch/all reads, destructive recreation, and epoch rotation.

No focused runtime test failed. Passing tests do not resolve Findings I-1, S-1, or T-1 because the existing expectations encode or omit those contracts.

## Missing Tests

1. Resolve a package import through the second identity supplied by a second adapter for the same workspace; assert both identities are usable, not merely that both adapters were called.
2. Configure an inaccessible workspace whose package is imported; assert the import increments `externalPackageImports` and does not increment `total`, `byReason`, or samples.
3. Make the repository-root scenario platform-neutral and run it with Windows-shaped roots or `path.win32` semantics in addition to host-path coverage.
4. If the SQLite spec retains the exact `GraphSchemaIncompatibleError` contract, add a public-store assertion for that exact class. If the spec changes to the recovery wrapper, assert the wrapper plus its cause/type provenance explicitly.

## Spec Dependency Chain

```text
default:_global/architecture
  -> code-graph:indexer
     -> code-graph:language-adapter
     -> code-graph:workspace-integration
     -> code-graph:graph-store
     -> core:config / core:list-workspaces

default:_global/conventions
  -> code-graph:symbol-model
     -> code-graph:indexer
     -> code-graph:sqlite-graph-store

default:_global/testing
  -> all verification scenarios and test implementations

code-graph:graph-store
  -> code-graph:sqlite-graph-store
  -> code-graph:indexer persistence/hydration

core:config + code-graph:workspace-integration
  -> configured workspace roots and canonical workspace-prefixed identities
  -> per-workspace repository detection and partial-run package preparation
```

Dependency consistency is otherwise sound: FileNode namespace fields remain backend-neutral; SQLite stores them without changing canonical identity; workspace-prefixed paths remain unchanged; package resolution uses adapter facets/public bindings rather than same-name searches; and schema recreation stays provider-owned and destructive only for derived storage.

## Summary Counts

| Category                                   | Count |
| ------------------------------------------ | ----: |
| Change-bearing merged requirements audited |     7 |
| Change verification scenarios traced       |    16 |
| Fully conformant requirement groups        |     5 |
| Partially conformant requirement groups    |     2 |
| High-severity discrepancies                |     1 |
| Medium-severity discrepancies              |     2 |
| Low-severity discrepancies                 |     1 |
| Focused test files passed                  |     8 |
| Focused tests passed                       |   242 |
| Focused tests failed                       |     0 |
| Missing/strengthening tests recommended    |     4 |

**Batch conclusion:** the core package-resolution, namespace hydration, and SQLite v16 behaviors are implemented and their focused tests pass. The batch is not fully compliant until the application-layer filesystem access and SQLite error-type contract are reconciled; the new repository-root test also needs platform-neutral paths.

---

# Compliance Audit Partial: Resolver and Index Orchestration

Change: `code-graph-package-resolution-hardening`  
Scope: `code-graph:resolve-symbol-reference`, `code-graph:index-project-graph`  
Mode: change-scoped, merged specs and verification artifacts  
Graph state: current (`knownStaleSinceLastIndex: false`, `contentFresh: true`, `coverageComplete: true`)

## Requirements Summary

### `code-graph:resolve-symbol-reference`

The merged spec contains ten requirement groups:

1. Structured reference input, including stored-only `qualified_name` equality, `::` normalization, adapter selection from proven context, and no generic/default parser fallback.
2. Logical canonical targets that unify declaration occurrences without collapsing competing logical symbols.
3. A discriminated logical/declaration/public-binding result model with complete declaration evidence.
4. Independently addressable public and local binding identities.
5. Deterministic precedence from canonical ID through hierarchy traversal.
6. Language-independent package-import binding traversal with ordered `import:package` provenance and no same-name guessing.
7. Exactly four conservative outcomes with stable reason codes and deterministic candidates/evidence.
8. Batch resource freshness and coverage gating without repository/filesystem logic in the resolver.
9. Hierarchy-aware member resolution with deterministic precedence and cycle safety.
10. Batch, indexed, backend-independent resolution.

### `code-graph:index-project-graph`

The merged spec contains four requirement groups:

1. Forward prepared project inputs to `provider.index()` once and return its `IndexResult` unchanged.
2. Forward `force` as a logical full-reindex request without calling `recreate()`.
3. Accept an already-open provider and avoid all provider/storage/lock/process lifecycle ownership.
4. Expose a stateless `createIndexProjectGraph()` composition factory.

## Implementation Status

### `code-graph:resolve-symbol-reference`

| Requirement                                     | Status                | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structured reference input                      | **Partial**           | `ResolveSymbolReference.executeBatch()` batches structured logical/public/local/qualified lookups and `resolveQualifiedMember()` compares `target.qualifiedName` directly. Adapter selection is explicit language, then anchored extension, with no adapter borrowing. However, `SessionReferenceStore.findLogicalSymbolsByQualifiedNames()` synthesizes a missing value from `ownerId` and `name`, contradicting the merged stored-only lookup rule. |
| Logical canonical targets                       | Implemented           | Resolution operates on `LogicalSymbol`, groups deterministic declaration occurrences, and emits ambiguity only across distinct target IDs. Tests cover multiple declarations on one logical target and competing logical targets.                                                                                                                                                                                                                     |
| Resolution target kind and declaration evidence | Implemented           | `ResolvedSymbolTarget` is a discriminated union of `logical-target`, `declaration`, and `public-binding`; exact symbol/position selectors retain physical identity and mapped logical identity. Tests cover logical, public-binding, mapped declaration, and physical-only declaration results.                                                                                                                                                       |
| Public and local binding identity               | Implemented           | Binding IDs include public slot/target or local scope/range. Resolver loads public/local bindings separately and follows stored resolution steps. Tests cover competing export routes and scoped local aliases.                                                                                                                                                                                                                                       |
| Deterministic resolution precedence             | Implemented           | Canonical IDs are normalized before semantic lookup; qualified-name resolution precedes exact/public/local/hierarchy lanes; owner paths are resolved before members; file-only requests do not select public bindings. Tests cover canonical and legacy IDs, owner-first lookup, value/type ambiguity, file-vs-surface selection, and no same-name guessing.                                                                                          |
| Package import bindings                         | Implemented           | The shared step traversal is language-neutral and treats persisted `import:package` steps as graph provenance. `index-code-graph.language-independence.spec.ts` verifies a cross-workspace target and verifies an unresolved import does not guess.                                                                                                                                                                                                   |
| Resolution outcomes                             | Implemented           | Results use the four declared statuses, null target on non-resolved outcomes, deterministic sorting, and stable upper-snake reason codes.                                                                                                                                                                                                                                                                                                             |
| Freshness and coverage gate                     | Implemented           | One health read is shared per batch; addressed resources and candidate declaration files are deduplicated and assessed in one batch. Exact resource freshness/coverage gates resolution and missing outcomes. Tests cover dirty, stale, unknown, partial, and current public-surface absence.                                                                                                                                                         |
| Hierarchy-aware members                         | Implemented           | Bounded/cycle-safe path tracing resolves the member under reached ancestors, applies nearest-depth and adapter precedence, and preserves equal-depth ambiguity. Tests cover ancestor-member selection and ambiguity.                                                                                                                                                                                                                                  |
| Batch/backend independence                      | **Partial assurance** | Batching, bounded traversal, one shared health read, and deterministic ordering are implemented. The session-store qualified-name fallback creates observable backend divergence from persisted SQLite lookup for symbols lacking stored `qualifiedName`; no parity test compares full resolver outcomes across those stores.                                                                                                                         |

### `code-graph:index-project-graph`

| Requirement                           | Status      | Evidence                                                                                                                                                                                                                                                                          |
| ------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Executes project indexing             | Implemented | `IndexProjectGraph.execute()` calls only `input.provider.index(...)` and returns the promise/result directly. Required fields, VCS fields, progress, and configured workspaces are forwarded. Unit tests assert one call and identity preservation of the returned `IndexResult`. |
| Supports forced logical reindex       | Implemented | `force: true` is forwarded to `provider.index`; no `recreate()` call exists in the use case. The integration test verifies `fullRebuild: true` while storage generation remains unchanged and compares incremental/forced semantic snapshots.                                     |
| Accepts open provider/prepared inputs | Implemented | The input type requires the provider and prepared fields; execution contains no open, close, clear, recreate, lock, or process operation. `vcsRoot`, optional `vcsRef`, callbacks, and configured workspaces are forwarded.                                                       |
| Factory wires dependencies            | Implemented | `createIndexProjectGraph()` returns a new parameterless `IndexProjectGraph`; the factory test asserts new stateless instances.                                                                                                                                                    |

Overall implementation status: **13 of 14 requirement groups conform; 1 is partial due to one backend/session fallback.**

## Discrepancies

### D1 — Session-backed qualified-name lookup derives an unstored name

- Severity: **MEDIUM**
- Classification: implementation/spec discrepancy; also undermines backend-independent behavior.
- Spec evidence: the merged `Structured reference input` requirement states that dotted/`::` equality uses only the graph's stored `qualified_name` and explicitly says the resolver **MUST NOT derive** a qualified name from owner/member fields to extend equality.
- Code evidence: `packages/code-graph/src/application/services/session-reference-store.ts:55-71` documents “stored or derived qualified spelling” and evaluates:

  ```ts
  const spelling = symbol.qualifiedName ?? deriveQualifiedName(symbol, byId)
  ```

  It may then return a copied symbol with the synthesized `qualifiedName`.

- Flow evidence: graph impact shows `SessionReferenceStore` is directly constructed by `IndexCodeGraph.execute()` and adapted to `GraphStore`, so this is an exercised implementation path, not dead utility code.
- Contrasting conformant path: `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts:1034-1039` itself compares only `target.qualifiedName`; persisted SQLite lookup likewise filters stored `qualified_name`. The discrepancy is introduced by the session-backed store before the resolver receives candidates.
- Behavioral risk: an internal/session resolution can resolve `Owner.member` even when that spelling was never stored, while the persisted store returns unresolved. This violates both the explicit stored-only rule and equivalent-backend outcome requirement.
- Test evidence: `resolve-symbol-reference.spec.ts:1573-1609` verifies a **different stored** name (`Custom.different`) is not replaced by a derived one, but does not cover an absent `qualifiedName` through `SessionReferenceStore`. All targeted tests therefore pass without detecting this path.
- Spec-correct/code-wrong possibility: remove the `deriveQualifiedName` fallback from the session lookup and compare only `symbol.qualifiedName`, making session behavior match SQLite and the merged change intent.
- Code-correct/spec-wrong possibility: if the session view intentionally represents pre-persistence facts where `qualifiedName` has not yet been materialized, the spec would need to explicitly allow derivation for that lifecycle phase and define why backend parity is not required there. That would weaken the newly added hardening language and is not supported by the current merged dependency contract, which describes `qualified_name` as persisted/indexed identity evidence.

### D2 — Relevant unit test uses the globally forbidden partial-port cast pattern

- Severity: **LOW**
- Classification: global testing-spec compliance issue, not a product behavior failure.
- Global rule: `default:_global/testing` requires full typed port mocks and expressly forbids partial mocks cast with `as unknown as Port`.
- Code evidence: `packages/code-graph/test/application/use-cases/index-project-graph.spec.ts:53-56` returns only `{ index: vi.fn() } as unknown as CodeGraphHostPort`.
- Risk: this makes the “does not open, close, clear, recreate, lock, or spawn” scenario impossible to assert through the mock interface and allows future port additions to evade test compilation.
- Spec-correct/code-wrong possibility: implement the full `CodeGraphHostPort` test double with unused methods that throw and spies for lifecycle methods relevant to the negative assertion.
- Code-correct/spec-wrong possibility: the narrow cast keeps the forwarding test concise and the use case statically calls only `index`; if this pattern is considered acceptable for focused orchestration tests, the global testing spec would need a documented exception. No such exception currently exists.

No contradiction was found between the merged change specs and `default:_global/architecture`, `default:_global/conventions`, or `default:_global/error-handling-conventions`: the resolver remains application orchestration over ports, contains no infrastructure I/O, uses named exports and explicit types, and returns domain outcomes rather than throwing expected generic errors. The `IndexProjectGraph` factory remains in composition and the use case owns no infrastructure lifecycle.

## Test Coverage

Executed independently:

```text
pnpm --filter @specd/code-graph exec vitest run \
  test/application/use-cases/resolve-symbol-reference.spec.ts \
  test/application/use-cases/index-project-graph.spec.ts \
  test/application/use-cases/index-project-graph-integration.spec.ts \
  test/application/use-cases/index-code-graph.language-independence.spec.ts \
  test/domain/value-objects/symbol-reference.spec.ts

Test Files  5 passed (5)
Tests      100 passed (100)
```

Also executed:

```text
pnpm --filter @specd/code-graph exec vitest run \
  test/composition/host-use-case-factories.spec.ts

Test Files  1 passed (1)
Tests      4 passed (4)
```

Coverage is strong for:

- direct/public/local/hierarchy/canonical/exact selector lanes;
- typed logical, declaration, and public-binding targets;
- deterministic ambiguity and absence outcomes;
- resource freshness and coverage gating;
- qualified-name and adapter-selection happy/negative paths on the persisted test store;
- language-independent package provenance;
- forced logical reindex without storage recreation;
- factory statelessness.

## Missing Tests

1. **Session store stored-only regression test (high priority):** create an `IndexSession` logical member with `ownerId` but no `qualifiedName`, query `SessionReferenceStore.findLogicalSymbolsByQualifiedNames(['Owner.member'])`, and assert no match. This would currently fail and directly expose D1.
2. **Resolver backend parity test (high priority):** seed equivalent session-backed and SQLite facts, including a missing stored `qualifiedName`, and assert identical status, reason, candidates, and evidence order.
3. **Positive anchored duplicate filter:** seed two targets with the same stored qualified name in different files, anchor one file, and assert exactly that target resolves. Current tests cover all-equal unanchored ambiguity and an anchor with no visible target, but not the exact positive merged scenario.
4. **Provider lifecycle negative test:** use a complete typed `CodeGraphHostPort` mock with `open`/`close`/`recreate`-equivalent lifecycle spies (as exposed by the actual port), execute `IndexProjectGraph`, and assert only `index` is called. The implementation is visibly compliant, but the merged negative scenario is only indirectly covered.
5. **Resolver-level case test:** resolve two identifiers differing only by case under an addressed adapter and assert no lowercase normalization. Domain identity tests cover case preservation, but the complete resolver scenario is not isolated.

## Spec Dependency Chain

### `code-graph:resolve-symbol-reference`

- `code-graph:symbol-model`: supplies logical IDs, declarations, public/local bindings, member semantics, provenance steps, stored `qualified_name`, and immutability. The implementation's discriminated target model and stable IDs conform. D1 conflicts with the dependency's stored/indexed qualified-name semantics.
- `code-graph:graph-store`: supplies backend-neutral batch queries, index coverage, declarations, bindings, and resolution steps. SQLite implements stored qualified-name equality; the session adapter does not currently preserve parity.
- `code-graph:language-adapter`: supplies capability/facet-based parsing and language precedence. The resolver selects one proven adapter and does not borrow another parser.
- `code-graph:workspace-integration`: defines workspace-prefixed paths and package boundaries. Cross-workspace package targets are followed only through persisted binding/provenance facts.
- Relevant globals: architecture (application over ports, no I/O), conventions (strict ESM/named exports/readonly inputs), testing (Vitest, mirrored tests, typed full mocks), and error handling (stable machine-readable result reasons; infrastructure failures remain errors).

### `code-graph:index-project-graph`

- `code-graph:composition`: supplies the open host/provider port and stateless factory boundary.
- `code-graph:indexer`: owns incremental/forced indexing semantics behind `provider.index()`.
- `code-graph:graph-store`: owns physical persistence/recreate semantics; `IndexProjectGraph` correctly avoids them.
- `core:config`: supplies prepared workspace and project configuration types; the use case forwards prepared values rather than resolving config itself.
- Relevant globals: architecture requires composition to wire infrastructure and application use cases to depend on ports; conventions require explicit/named ESM APIs; testing requires complete typed mocks, which is the basis of D2.

## Summary Counts

| Category                                | Count |
| --------------------------------------- | ----: |
| Specs audited                           |     2 |
| Requirement groups audited              |    14 |
| Fully conformant requirement groups     |    13 |
| Partially conformant requirement groups |     1 |
| Critical discrepancies                  |     0 |
| High discrepancies                      |     0 |
| Medium discrepancies                    |     1 |
| Low discrepancies                       |     1 |
| Missing/insufficient targeted tests     |     5 |
| Targeted test files passed              |     6 |
| Targeted tests passed                   |   104 |

**Batch conclusion:** `code-graph:index-project-graph` conforms to its merged spec. `code-graph:resolve-symbol-reference` is broadly implemented and tested, but full compliance is blocked by the session-backed qualified-name derivation fallback; the passing suite does not exercise the failing backend/session case.
