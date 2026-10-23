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
