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
