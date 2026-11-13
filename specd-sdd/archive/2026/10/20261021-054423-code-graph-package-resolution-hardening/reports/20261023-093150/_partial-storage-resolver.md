# Compliance Audit Partial: Storage and Resolver

Change: `code-graph-package-resolution-hardening`  
Scope: `code-graph:symbol-model`, `code-graph:sqlite-graph-store`, `code-graph:resolve-symbol-reference`  
Audit Batch: `storage-resolver`  
Mode: Specific Change (merged specs, verification scenarios, and codebase audit)  
Status: **Fully Conformant (0 discrepancies)**

---

## Executive Summary

A comprehensive compliance audit was conducted for the **`storage-resolver`** batch of the `code-graph-package-resolution-hardening` change, covering:

1. `code-graph:symbol-model`
2. `code-graph:sqlite-graph-store`
3. `code-graph:resolve-symbol-reference`

All merged requirements and verification scenarios are fully implemented, thoroughly tested, and adhere to global architectural, testing, and error-handling standards.

Specific attention was paid to past findings from prior audit iterations:

- **Finding S-1 (SQLite version-15 open error classification)**: **RESOLVED**. The merged specification and verification scenario for `code-graph:sqlite-graph-store` were updated to require the public `GraphStorageRecoveryRequiredError` with recovery reason `SCHEMA_INCOMPATIBLE`, retaining `GraphSchemaIncompatibleError` as internal diagnostic/cause evidence. The implementation in `sqlite-graph-database.ts`, worker serialization, and worker client deserialization fully match this contract and are verified by `sqlite-graph-store.spec.ts`.
- **Finding D1 (Session-backed qualified-name derivation fallback)**: **RESOLVED**. The `deriveQualifiedName` fallback was completely removed from `SessionReferenceStore`. Session-backed qualified-name lookup now queries only stored `qualifiedName`, matching the persisted SQLite store and the merged specification requirement that neither store may synthesize derived qualified names. A dedicated regression test in `session-reference-store.spec.ts` verifies identical behavior between session and SQLite stores.
- **File namespace roundtrip and FileNode equality**: **RESOLVED & VERIFIED**. `FileNode` carries paired `namespace` and `namespaceSeparator` (defaulting to `.` when omitted). Equality remains strictly defined by canonical `path`. SQLite schema v16 persists both columns in the `files` table, and all read, write, batch, and scan statements preserve them.

---

## Requirements Traceability & Status

### 1. `code-graph:symbol-model`

| Requirement / Scenario                              | Status   | Code Evidence                                                                                                                                                                                                                                                     | Test Evidence                                                                                                                                              |
| --------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **File node — canonical identity & properties**     | Conforms | `FileNode` interface in `domain/value-objects/file-node.ts:10-21` defines canonical `path`, `projectRelativePath`, `language`, `contentHash`, `workspace`, `category`, and optional `embedding`/`content`. Two `FileNode` instances are equal iff `path` matches. | `test/domain/value-objects/file-node.spec.ts:5-150` tests normalization, forward-slash preservation, and path equality when `projectRelativePath` differs. |
| **File node — paired namespace properties**         | Conforms | `FileNode` declares `readonly namespace?: string                                                                                                                                                                                                                  | undefined`and`readonly namespaceSeparator?: string                                                                                                         | undefined`. `createFileNode` (`file-node.ts:68-73`) pairs them: if `namespace !== undefined`, sets `namespace`and defaults`namespaceSeparator`to`.`when omitted; if`namespace === undefined`, neither property is set. Neither field participates in `FileNode` equality. | `test/domain/value-objects/file-node.spec.ts:162-219` covers absence of both, defaulting separator to `.`, explicit separator, ignoring separator without namespace, and asserting equality ignores namespace. |
| **Scenario: File namespace is optional and paired** | Conforms | Tested explicitly with PHP (`App\Services`, `\`) and non-namespaced files (`file-node.spec.ts:162-219`).                                                                                                                                                          | `file-node.spec.ts` passes (13/13 tests).                                                                                                                  |
| **Spec node & Symbol node**                         | Conforms | Unchanged core definitions for deterministic symbol ID, coordinates, parent, search text, and spec nodes remain intact.                                                                                                                                           | `test/domain/value-objects/symbol-node.spec.ts`, `symbol-reference.spec.ts`.                                                                               |
| **First-class binding model & Member semantics**    | Conforms | Value objects for `LogicalSymbol`, `PublicBinding`, `LocalBinding`, `ResolutionStep`, `SymbolSpace`, `MemberKind`, `MemberDispatch`, and `MemberAccessor` remain strongly typed and immutable.                                                                    | `test/domain/value-objects/symbol-reference.spec.ts:1-17` passes.                                                                                          |

---

### 2. `code-graph:sqlite-graph-store`

| Requirement / Scenario                                        | Status   | Code Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                      | Test Evidence                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SQLite-backed implementation & Worker isolation**           | Conforms | Dedicated Node worker (`node:worker_threads`), structured-cloneable DTOs, monotonic correlation IDs, FIFO queue, max pending operations limit (256), graceful shutdown with drain timeout (5000ms), and idempotent close.                                                                                                                                                                                                                          | `infrastructure/sqlite/sqlite-graph-store.ts`, `sqlite-worker.ts`, `sqlite-worker-client.ts`, `test/infrastructure/sqlite/sqlite-worker-protocol.spec.ts` (3/3 passed).                                                                                                                  |
| **Persisted node storage: `files` table schema v16**          | Conforms | `schema.ts:1-17` sets `SQLITE_SCHEMA_VERSION = 16` and includes `namespace TEXT` and `namespace_separator TEXT` in the `files` table DDL. Both are nullable.                                                                                                                                                                                                                                                                                       | `sqlite-graph-store.spec.ts:1907-1919` verifies columns exist in schema 16.                                                                                                                                                                                                              |
| **File namespace roundtrip across read/write paths**          | Conforms | `sqlite-graph-database.ts:460` (get by path), `:507` (get by projectRelativePath), `:715` (get by paths batch), `:1182` (getAllFiles), `:1993`, `:2033` (incremental hydration), `:2822` & `:2858` (file upsert), and `:3822-3852` (`mapFileRow`) handle `namespace` and `namespace_separator` consistently.                                                                                                                                       | `test/infrastructure/sqlite/sqlite-graph-store.spec.ts:3135-3183` tests single get, batch get, and scan roundtrips.                                                                                                                                                                      |
| **Scenario: Namespace round-trips through the files table**   | Conforms | Explicitly tests PHP file with `App\Services` and `\` separator alongside a TypeScript file without namespace; verifies both round-trip unchanged through `getFile`, `getFilesByPaths`, and `getAllFiles`.                                                                                                                                                                                                                                         | `test/infrastructure/sqlite/sqlite-graph-store.spec.ts:3135-3183` passes.                                                                                                                                                                                                                |
| **Reference schema upgrade: v15 rejection & v16 recreation**  | Conforms | `assertExistingSchemaCompatible` (`sqlite-graph-database.ts:2692-2705`) detects `schemaVersion !== 16` and raises `GraphSchemaIncompatibleError`. `open()` (`:376-382`) wraps it in `GraphStorageRecoveryRequiredError` with reason `SCHEMA_INCOMPATIBLE`. Worker protocol (`sqlite-worker.ts:50-52` and `sqlite-worker-client.ts:156-160`) deserializes it faithfully on the host. `recreate()` rotates storage generation and creates schema 16. | `test/infrastructure/sqlite/sqlite-graph-store.spec.ts:1870-1920` asserts opening v15 database throws `GraphStorageRecoveryRequiredError` with reason `SCHEMA_INCOMPATIBLE`, keeps generation token, and after `recreate()` updates to schema 16 with rotated token and columns present. |
| **Scenario: Version 15 database is rejected after the bump**  | Conforms | Fully verified in `test/infrastructure/sqlite/sqlite-graph-store.spec.ts:1870-1920`.                                                                                                                                                                                                                                                                                                                                                               | `sqlite-graph-store.spec.ts` passes (172/172 tests).                                                                                                                                                                                                                                     |
| **Persisted relation, bindings, coverage, & worker batching** | Conforms | Set-based worker RPCs chunked within SQLite parameter limits; indexed `qualified_name` on `logical_symbols`; `local_bindings` source coordinates; reverse coverage batching.                                                                                                                                                                                                                                                                       | `sqlite-graph-database.ts:2433-2447`, `test/infrastructure/sqlite/sqlite-graph-store.spec.ts`.                                                                                                                                                                                           |

---

### 3. `code-graph:resolve-symbol-reference`

| Requirement / Scenario                                                                   | Status   | Code Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Test Evidence                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Structured reference input & Stored-only equality**                                    | Conforms | `isExactLaneQuery` and `qualifiedLookupText` (`domain/services/exact-lane-query.ts:1-28`) recognize dotted and `::` spellings (normalizing `::` to `.`). `ResolveSymbolReference.executeBatch()` loads candidate symbols via `store.findLogicalSymbolsByQualifiedNames(qualifiedNames)`. In `resolveQualifiedMember` (`application/use-cases/resolve-symbol-reference.ts:1034-1042`), lookup strictly checks `target.qualifiedName === spelling` and visibility at anchor/workspace. Neither resolver nor stores synthesize derived qualified names. | `test/application/use-cases/resolve-symbol-reference.spec.ts:1573-1610` (`Scenario: Qualified name is not derived from owner and member`).                                                                           |
| **Session and persisted store parity (Finding D1 fix)**                                  | Conforms | `SessionReferenceStore.findLogicalSymbolsByQualifiedNames` (`application/services/session-reference-store.ts:59-68`) filters strictly on `symbol.qualifiedName !== undefined && names.has(symbol.qualifiedName)`. `deriveQualifiedName` was eliminated. SQLite store (`sqlite-graph-database.ts:2433-2447`) queries `WHERE qualified_name IN (...)`. Both reject unstored qualified spellings equally.                                                                                                                                               | Dedicated parity test in `test/application/services/session-reference-store.spec.ts:25-93` verifies session store and SQLite store yield identical results: matching stored spelling and rejecting derived spelling. |
| **Scenario: Session and persisted lookup reject an unstored qualified spelling equally** | Conforms | Verified via `test/application/services/session-reference-store.spec.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `session-reference-store.spec.ts` passes (1/1 test).                                                                                                                                                                 |
| **Scenario: Qualified name is not derived from owner and member**                        | Conforms | Verified in `test/application/use-cases/resolve-symbol-reference.spec.ts:1573-1610`: symbol with `qualifiedName: 'Custom.different'` does not match unanchored request for `Owner.member`.                                                                                                                                                                                                                                                                                                                                                           | `resolve-symbol-reference.spec.ts` passes.                                                                                                                                                                           |
| **Adapter selection from proven context & No generic fallback**                          | Conforms | `parseAnchoredReference` (`resolve-symbol-reference.ts:1094-1113`) selects an adapter only from: 1) explicit `request.language`, 2) anchored file extension (`request.filePath ?? request.publicSurface`). If no adapter matches, or the adapter lacks the `symbolReferenceSyntax` facet, it returns `{ candidates: [] }`, resulting in `REFERENCE_UNPROVEN`. No fallback to another adapter or generic delimiter parsing occurs.                                                                                                                    | `test/application/use-cases/resolve-symbol-reference.spec.ts:1526-1571` (`Scenario: Anchor without an adapter leaves human text unresolved`).                                                                        |
| **Scenario: Anchor without an adapter leaves human text unresolved**                     | Conforms | Request anchored to a Go file (`.go`) with owner-qualified text `Calculator.Add()` produces `unresolved` (`REFERENCE_UNPROVEN`) and spies prove neither TypeScript nor PHP adapters were invoked.                                                                                                                                                                                                                                                                                                                                                    | `resolve-symbol-reference.spec.ts:1526-1571` passes.                                                                                                                                                                 |
| **Canonical targets, evidence, & outcome discrimination**                                | Conforms | Returns discriminated target types (`logical-target`, `declaration`, `public-binding`) with complete declaration occurrences and provenance.                                                                                                                                                                                                                                                                                                                                                                                                         | `test/application/use-cases/resolve-symbol-reference.spec.ts:1330-1520`.                                                                                                                                             |
| **Batch freshness and coverage gate**                                                    | Conforms | Health evaluated once per batch; individual file content hashes and public surfaces evaluated; missing exports proven by fresh surface.                                                                                                                                                                                                                                                                                                                                                                                                              | `resolve-symbol-reference.spec.ts:100-200`.                                                                                                                                                                          |
| **Hierarchy-aware member resolution**                                                    | Conforms | Resolves inherited members under ancestor owners, detects overrides, and preserves equal-depth ties as ambiguous.                                                                                                                                                                                                                                                                                                                                                                                                                                    | `resolve-symbol-reference.spec.ts:220-300`.                                                                                                                                                                          |
| **Package import bindings**                                                              | Conforms | Language-neutral traversal of `import:package` steps with complete provenance trail.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `resolve-symbol-reference.spec.ts`, `index-code-graph.language-independence.spec.ts`.                                                                                                                                |

---

## Detailed Review of Past Findings

### Finding S-1 (SQLite version-15 open error classification): RESOLVED

- **Original discrepancy**: The previous spec version specified that opening a schema v15 database would fail with `GraphSchemaIncompatibleError`, while the implementation wrapped it in `GraphStorageRecoveryRequiredError` with reason `SCHEMA_INCOMPATIBLE`.
- **Resolution**: The spec and verify delta files (`deltas/code-graph/sqlite-graph-store/spec.md.delta.yaml` and `verify.md.delta.yaml`) were aligned to the public recovery wrapper contract:
  > "...a persisted version 15 database MUST make ordinary store opening fail with the public `GraphStorageRecoveryRequiredError` and recovery reason `SCHEMA_INCOMPATIBLE`; the low-level `GraphSchemaIncompatibleError` MAY be retained as internal cause or diagnostic evidence but MUST NOT replace the public recovery wrapper."
- **Verification**: In `sqlite-graph-database.ts:376-382`, any error classified by `getStorageRecoveryReason(error)` (which maps `GraphSchemaIncompatibleError` to `'SCHEMA_INCOMPATIBLE'`) is rethrown as `GraphStorageRecoveryRequiredError`. This error is passed across the worker thread boundary via serialization (`sqlite-worker.ts:50-52`) and reconstructed on the host (`sqlite-worker-client.ts:156-160`). The test `sqlite-graph-store.spec.ts:1870-1920` asserts that `open()` fails with `GraphStorageRecoveryRequiredError` and `{ reason: 'SCHEMA_INCOMPATIBLE' }`.

### Finding D1 (Session-backed qualified-name lookup deriving unstored names): RESOLVED

- **Original discrepancy**: In `SessionReferenceStore.findLogicalSymbolsByQualifiedNames`, if a symbol lacked `qualifiedName`, the code fell back to `deriveQualifiedName(symbol, byId)`, synthesizing an unstored dotted spelling. This caused the in-memory session store to resolve queries that the persisted SQLite store would reject, violating the requirement of backend parity and the rule forbidding derived qualified names.
- **Resolution**: `deriveQualifiedName` was removed entirely from `session-reference-store.ts`. The lookup now strictly evaluates:
  ```ts
  this.session
    .getLogicalSymbols()
    .filter((symbol) => symbol.qualifiedName !== undefined && names.has(symbol.qualifiedName))
  ```
- **Verification**: A new test suite `test/application/services/session-reference-store.spec.ts` was added. It seeds an index session and a SQLite database with identical symbols (one parent with stored `qualifiedName` and one member lacking `qualifiedName`). It executes both queries and confirms:
  1. Stored spelling (`App.Services.UserService`) matches on both stores identically.
  2. Derived spelling (`App.Services.UserService.findUser`) returns an empty set on both stores identically.
  3. `resolve-symbol-reference.spec.ts:1573-1610` verifies that an unanchored query for `Owner.member` does not match a member stored with a different `qualifiedName`.

### File namespace roundtrips and FileNode equality: RESOLVED & VERIFIED

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

## Test Execution Summary

All relevant test suites in `@specd/code-graph` were executed and passed completely:

| Test Suite                                                    |  Tests Passed |  Duration |
| ------------------------------------------------------------- | ------------: | --------: |
| `test/domain/value-objects/file-node.spec.ts`                 |       13 / 13 |    195 ms |
| `test/domain/value-objects/symbol-reference.spec.ts`          |       17 / 17 |    302 ms |
| `test/infrastructure/sqlite/sqlite-worker-protocol.spec.ts`   |         3 / 3 |    1.08 s |
| `test/infrastructure/sqlite/sqlite-graph-store.spec.ts`       |     172 / 172 |   32.89 s |
| `test/application/use-cases/resolve-symbol-reference.spec.ts` |       51 / 51 |    1.18 s |
| `test/application/services/session-reference-store.spec.ts`   |         1 / 1 |    1.56 s |
| **Total**                                                     | **257 / 257** | **~37 s** |

No tests failed, and all targeted scenarios from the spec deltas are directly exercised and covered by assertions.

---

## Architectural & Global Standards Compliance

1. **Layering & Ports/Adapters (`default:_global/architecture`)**:
   - `file-node.ts` and `symbol-reference.ts` reside in `domain/value-objects/` and have zero dependencies on application or infrastructure code.
   - `ResolveSymbolReference` is an application use case depending solely on domain ports (`GraphStore`, `AdapterRegistryPort`) and domain value objects. It performs zero direct filesystem I/O.
   - `SessionReferenceStore` is an application service implementing a read-only store projection over `IndexSession` without infrastructure imports.
   - `SQLiteGraphStore` is fully contained in `infrastructure/sqlite/` and implements the domain `GraphStore` port.
2. **Conventions (`default:_global/conventions`)**:
   - Explicit ESM imports with `.js` extensions.
   - Strongly typed immutable interfaces with `readonly` modifiers.
   - Named exports throughout.
3. **Error Handling (`default:_global/error-handling-conventions`)**:
   - Resolver emits typed domain outcome objects (`status: 'resolved' | 'ambiguous' | 'missing' | 'unresolved'`) with standard reason codes (`REFERENCE_UNPROVEN`, `AMBIGUOUS_LOGICAL_TARGET`, etc.).
   - SQLite store encapsulates engine-specific errors and surfaces typed recovery errors (`GraphStorageRecoveryRequiredError`) with machine-readable reasons (`SCHEMA_INCOMPATIBLE`).
4. **Testing (`default:_global/testing`)**:
   - Vitest test runner used exclusively.
   - No illegal partial port casts (`as unknown as Port`) in the audited test suites.
   - Clean setup and teardown of temporary SQLite databases in `tmpdir()`.

---

## Discrepancies Summary

| Severity     | Count | Details                                                          |
| ------------ | ----: | ---------------------------------------------------------------- |
| **CRITICAL** |     0 | None.                                                            |
| **HIGH**     |     0 | None.                                                            |
| **MEDIUM**   |     0 | None (past findings S-1 and D1 are fully resolved and verified). |
| **LOW**      |     0 | None.                                                            |

---

## Conclusion

The **`storage-resolver`** batch (`code-graph:symbol-model`, `code-graph:sqlite-graph-store`, and `code-graph:resolve-symbol-reference`) is **100% compliant** with the specification requirements and verification scenarios of change `code-graph-package-resolution-hardening`. All past findings (S-1 and D1) have been cleanly resolved and backed by dedicated regression test coverage.
