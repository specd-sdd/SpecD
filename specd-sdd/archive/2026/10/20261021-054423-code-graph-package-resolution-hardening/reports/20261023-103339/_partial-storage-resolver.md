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
