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
- **Status:** **CONFORMANT WITH MINOR TEST DISCREPANCIES**

---

## Executive Summary

This partial audit covers the core indexing orchestration components for the `code-graph-package-resolution-hardening` change:

1. `code-graph:indexer` (use case, session hydration, cross-workspace package resolution, incremental equivalence, facet-driven language independence, package import incremental closure).
2. `code-graph:index-project-graph` (use case, options forwarding including `configuredWorkspaces`, forced logical reindex, lifecycle neutrality, composition factory).
3. Monorepo global standards (`default:_global/architecture`, `default:_global/testing`, `default:_global/conventions`).

### Key Audit Findings

- **I-1 Resolved:** The direct `node:fs` calls previously used in `IndexCodeGraph` for probing workspace code root accessibility have been eliminated. `IndexCodeGraph` now consumes the injected `WorkspaceAccessibilitySource` application port (`packages/code-graph/src/application/ports/workspace-accessibility-source.ts`), implemented in infrastructure by `NodeWorkspaceAccessibilitySource` (`packages/code-graph/src/infrastructure/fs/node-workspace-accessibility-source.ts`) and wired in composition (`create-code-graph-provider.ts`).
- **D2 Resolved:** In `packages/code-graph/test/application/use-cases/index-project-graph.spec.ts`, the partial-port cast `{ index: vi.fn() } as unknown as CodeGraphHostPort` has been replaced with `FakeCodeGraphHostProvider`, which fully implements all 10 methods of `CodeGraphHostPort` without type casting.
- **T-1 Partially Resolved:** `index-code-graph-package-resolution.spec.ts` was updated to construct repository root paths using `node:path` (`join(tempDir, ...)`), eliminating hardcoded POSIX root strings. However, `vcs-repository-root-source.spec.ts` still contains hardcoded POSIX paths (`'/path/to/repo'`, `'/path/to/repo/packages/core'`) and uses `stubAdapter as VcsAdapter`.
- **T-2 Partially Resolved (Low):** Outcome assertions for qualified names and test-symbol filtering are comprehensive in `package-resolution.spec.ts` and `in-memory-index-session.spec.ts`. In `index-code-graph-package-resolution.spec.ts`, "Every adapter is asked for an identity" asserts invocation of both adapters but does not resolve a package import through the second adapter's identity; similarly, "Inaccessible workspace is skipped" verifies diagnostic logging and execution continuation, but does not import a package declared by the inaccessible workspace to assert it increments `externalPackageImports`.
- **Partial Runs & Inaccessible Workspaces:** Both `configuredWorkspaces` and fallback to `workspaces` are honored for package mapping and preparation; inaccessible workspaces are diagnosed and skipped non-fatally without stopping other workspaces.
- **External Package Classification:** Package imports with reason `package-unknown` are accurately isolated into `IndexResult.importDiagnostics.externalPackageImports` and excluded from `total`, `byReason`, and `samples`.
- **Language Independence & Incremental Equivalence:** The indexer code contains no hardcoded language or manifest strings; incremental runs achieve clean-rebuild semantic snapshot equality across PHP, Python, and Go fixtures.

---

## Spec Verification Matrix

### 1. `code-graph:index-project-graph`

| Requirement / Scenario                                             | Status         | Code & Test Evidence                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Requirement: Executes project indexing**                         | **CONFORMANT** | `IndexProjectGraph.execute` (`index-project-graph.ts:38-56`) forwards `projectRoot`, `workspaces`, `configuredWorkspaces`, `graphConfig`, `codeGraphVersion`, `vcsRoot`, `vcsRef`, `onProgress`, `derivationMismatch`, and `getSpecMetadata` to `provider.index()`. Returns `IndexResult` unchanged. |
| ↳ _Scenario: Incremental index_                                    | **CONFORMANT** | Tested in `index-project-graph.spec.ts:92-104`. `force: false` passed; `provider.index` called once; result passed through.                                                                                                                                                                          |
| ↳ _Scenario: Progress callback forwarded_                          | **CONFORMANT** | Tested in `index-project-graph.spec.ts:118-129`. `onProgress` passed to `provider.index`.                                                                                                                                                                                                            |
| **Requirement: Supports forced logical reindex**                   | **CONFORMANT** | `index-project-graph.ts:48` passes `{ force: true }` when requested. The use case never calls `provider.recreate()`.                                                                                                                                                                                 |
| ↳ _Scenario: Force intent reaches provider indexing_               | **CONFORMANT** | Tested in `index-project-graph.spec.ts:106-116`. Verifies `force: true` forwarded.                                                                                                                                                                                                                   |
| ↳ _Scenario: Force is forwarded as a logical full-reindex request_ | **CONFORMANT** | Tested in `index-project-graph-integration.spec.ts:257-306`. Verifies storage generation token is preserved, healthy store is not destroyed, and `provider.recreate()` is never called.                                                                                                              |
| **Requirement: Accepts open provider and prepared inputs**         | **CONFORMANT** | Input contract `IndexProjectGraphInput` accepts open provider; does not own lifecycle, lock, or spawn subprocesses.                                                                                                                                                                                  |
| ↳ _Scenario: Prepared inputs are forwarded unchanged_              | **CONFORMANT** | Tested in `index-project-graph.spec.ts:169-189`. `configuredWorkspaces` forwarded unchanged.                                                                                                                                                                                                         |
| ↳ _Scenario: Prepared provider lifecycle remains untouched_        | **CONFORMANT** | Tested in `index-project-graph.spec.ts:191-216`. Verifies `provider.open`, `close`, `clear`, and `recreate` are never called.                                                                                                                                                                        |
| **Requirement: Factory wires dependencies**                        | **CONFORMANT** | `createIndexProjectGraph()` in `packages/code-graph/src/composition/use-cases/index-project-graph.ts:8-10` returns a new stateless `IndexProjectGraph` instance. Tested in `composition/host-use-case-factories.spec.ts:24-27`.                                                                      |
| ↳ _Scenario: Factory returns stateless instance_                   | **CONFORMANT** | Verified by factory unit tests and barrel exports (`src/index.ts:78`, `src/public.ts:44`).                                                                                                                                                                                                           |

---

### 2. `code-graph:indexer`

| Requirement / Scenario                                                            | Status                                                        | Code & Test Evidence                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Requirement: IndexCodeGraph use case**                                          | **CONFORMANT**                                                | `IndexCodeGraph.execute()` (`index-code-graph.ts:478-2063`) orchestrates file discovery, content hashing diff, extraction via adapter registry, spec metadata consumption via `GetSpecMetadata` and `SpecRepository`, persistence into `GraphStore`, and deleted resource cleanup.                                                |
| **Requirement: Incremental indexing**                                             | **CONFORMANT**                                                | Fingerprint comparison against effective version, workspaces hash, discovery config, and resolution manifests. Recreates or fails fast on mismatch. Content-hash based skips for clean incremental runs.                                                                                                                          |
| **Requirement: Deterministic implementation coverage projection**                 | **CONFORMANT**                                                | Consumes Core `GetSpecMetadata` and `SpecRepository` (`list`, `artifact`, `readPersistedState`) for coverage projection. Tested in `index-project-graph-integration.spec.ts:308-415`.                                                                                                                                             |
| **Requirement: Shared indexing session**                                          | **CONFORMANT**                                                | `InMemoryIndexSession` (`in-memory-index-session.ts:196-235`) hydrates file nodes with `namespace` and `namespaceSeparator` without re-extracting symbols. Populates `qualifiedNameSymbolMap` and `testQualifiedNameSymbolMap`.                                                                                                   |
| ↳ _Scenario: Hydrated files fill the qualified-name lookup_                       | **CONFORMANT**                                                | Tested in `in-memory-index-session.spec.ts:24-70`. Hydrated file contributes namespace + separator + symbol name.                                                                                                                                                                                                                 |
| ↳ _Scenario: Production importers never resolve to a test symbol_                 | **CONFORMANT**                                                | Tested in `in-memory-index-session.spec.ts:72-126` and `package-resolution.spec.ts:426-528`. Test symbols separated in `testQualifiedNameSymbolMap`.                                                                                                                                                                              |
| ↳ _Scenario: A test importer resolves to a test helper_                           | **CONFORMANT**                                                | Tested in `package-resolution.spec.ts:426-528`. Test file importing test helper resolves `IMPORTS` and `EXTENDS` relations; impact analysis reports test importer.                                                                                                                                                                |
| **Requirement: Cross-workspace package resolution**                               | **CONFORMANT**                                                | Pre-Pass 1: resolves repository root per code root via `RepositoryRootSource.resolve()`. Calls `packageResolution.identity(codeRoot, repoRoot)` on all registered adapters with the facet. Inaccessible workspaces probed via `WorkspaceAccessibilitySource`. Calls `packageResolution.prepare()` with all configured workspaces. |
| ↳ _Scenario: Every adapter is asked for an identity_                              | **PARTIAL (Invocation tested, dual-resolution not asserted)** | Tested in `index-code-graph-package-resolution.spec.ts:152-180`. Invocation recorded on all adapters and original TS import resolves, but second identity import is not verified.                                                                                                                                                 |
| ↳ _Scenario: Each code root gets the repository root of its own repository_       | **CONFORMANT**                                                | Tested in `index-code-graph-package-resolution.spec.ts:236-268`. Each code root receives its resolved `repoRoot`.                                                                                                                                                                                                                 |
| ↳ _Scenario: No detected VCS inspects only the code root_                         | **CONFORMANT**                                                | Tested in `index-code-graph-package-resolution.spec.ts:270-295`. `repoRoot` is `undefined` when VCS detection produces no root.                                                                                                                                                                                                   |
| ↳ _Scenario: VCS detection failure is not fatal_                                  | **CONFORMANT**                                                | Tested in `index-code-graph-package-resolution.spec.ts:297-306`. `RepositoryRootSource` throwing is caught and defaults to `undefined`.                                                                                                                                                                                           |
| ↳ _Scenario: Partial run maps and prepares every configured workspace_            | **CONFORMANT**                                                | Tested in `index-code-graph-package-resolution.spec.ts:309-346`. Partial run with `workspaces: [app]` and `configuredWorkspaces: [graph, app]` prepares `graph` and resolves `@fixture/graph`.                                                                                                                                    |
| ↳ _Scenario: Inaccessible workspace is skipped without failing the run_           | **PARTIAL (Outcome assertion incomplete)**                    | Tested in `index-code-graph-package-resolution.spec.ts:348-371`. Diagnostic emitted, run succeeds, but does not assert that an import of a package declared by the skipped workspace counts in `externalPackageImports`.                                                                                                          |
| ↳ _Scenario: Workspace accessibility is supplied through an application port_     | **CONFORMANT**                                                | `index-code-graph.ts:891-912` calls `this.workspaceAccessibility.isAccessibleDirectory(ws.codeRoot)`. Tested in `index-code-graph-package-resolution.spec.ts:373-397` with fake port.                                                                                                                                             |
| ↳ _Scenario: Accessibility probe failure is non-fatal_                            | **CONFORMANT**                                                | Tested in `index-code-graph-package-resolution.spec.ts:398-427`. Probe exception logged as diagnostic and execution continues.                                                                                                                                                                                                    |
| ↳ _Scenario: Adapter serving several languages is listed once_                    | **CONFORMANT**                                                | Tested in `index-code-graph-package-resolution.spec.ts:514-528`. Multi-language adapter without facet is listed once by first declared language (`['typescript']`).                                                                                                                                                               |
| ↳ _Scenario: A throwing identity does not stop the run_                           | **CONFORMANT**                                                | Tested in `index-code-graph-package-resolution.spec.ts:429-455` and `index-code-graph.package-imports.spec.ts:507-520`. Error recorded, adapter disabled for package resolution, relative barrel re-exports still linked.                                                                                                         |
| **Requirement: Identity-sensitive incremental equivalence**                       | **CONFORMANT**                                                | Incremental runs match clean full rebuilds across all mutation fixtures.                                                                                                                                                                                                                                                          |
| ↳ _Scenario: Name-addressed imports match a clean rebuild_                        | **CONFORMANT**                                                | Tested in `index-code-graph-incremental.spec.ts:120-236` for PHP, Python, and Go projects with namespace/qualified name addressing. Snapshot equality confirmed.                                                                                                                                                                  |
| **Requirement: Facet-driven language independence**                               | **CONFORMANT**                                                | `PackageImportResolver` (`package-import-resolver.ts`) delegates to `packageResolution` facet methods: `matchSpecifier`, `entrySurface`, and public bindings. Contains no language-specific logic.                                                                                                                                |
| ↳ _Scenario: Stub language resolves package imports without indexer change_       | **CONFORMANT**                                                | Tested in `index-code-graph.language-independence.spec.ts:73-105` with mock language `zig2`.                                                                                                                                                                                                                                      |
| ↳ _Scenario: Indexer source has no language branches for resolution_              | **CONFORMANT**                                                | Tested in `index-code-graph.language-independence.spec.ts:167-188`. Source code scanner verifies no mentions of built-in language names, extensions, or manifests.                                                                                                                                                                |
| ↳ _Scenario: Absent facet is skipped with a diagnostic_                           | **CONFORMANT**                                                | Tested in `index-code-graph.package-imports.spec.ts:418-443`. Missing facet listed in `adaptersWithoutPackageResolution` and not counted in failures.                                                                                                                                                                             |
| **Requirement: Package import incremental closure**                               | **CONFORMANT**                                                | `collectAffectedFileClosure` (`index-code-graph.ts:2096-2157`) uses persisted reverse steps and bindings without reading unaffected files.                                                                                                                                                                                        |
| ↳ _Scenario: Entry change re-resolves importers in other workspaces_              | **CONFORMANT**                                                | Tested in `index-code-graph.package-imports.spec.ts:326-340`.                                                                                                                                                                                                                                                                     |
| ↳ _Scenario: Barrel chain change reaches importers_                               | **CONFORMANT**                                                | Tested in `index-code-graph.package-imports.spec.ts:341-353`.                                                                                                                                                                                                                                                                     |
| ↳ _Scenario: Newly resolvable import is reconsidered_                             | **CONFORMANT**                                                | Tested in `index-code-graph.package-imports.spec.ts:611-625` and `index-project-graph-integration.spec.ts:608-661`.                                                                                                                                                                                                               |
| ↳ _Scenario: Added files still re-extract files with possibly unresolved imports_ | **CONFORMANT**                                                | Implemented at `index-code-graph.ts:811-816` (`addsCode` check). Tested in `index-code-graph-incremental.spec.ts:238-268` (document-only addition does not re-extract code files).                                                                                                                                                |

---

## Global Specs Compliance

### 1. `default:_global/architecture`

- **Layered Structure & Dependency Inversion:**
  - Ports defined in `application/ports/`: `WorkspaceAccessibilitySource`, `RepositoryRootSource`, `ResolutionManifestSource`, `CodeGraphHostPort`.
  - Concrete infrastructure implementations reside in `infrastructure/fs/` (`NodeWorkspaceAccessibilitySource`) and `infrastructure/vcs/` (`VcsRepositoryRootSource`).
  - Composition layer (`packages/code-graph/src/composition/create-code-graph-provider.ts`) wires infrastructure adapters into application use case constructors.
  - **Status:** **CONFORMANT** with respect to the package resolution boundary.
  - _Architectural Note:_ `IndexCodeGraph` still imports `node:fs` functions (`statSync`, `readFileSync`, `writeFileSync`, `mkdirSync`, `rmSync`) for file staging chunks and file content hashing. This is an existing architectural concern belonging to the global filesystem decoupling migration (`fs-decouple-00`..`05`) and is not introduced by this change. For the scope of this change, workspace accessibility probing has been cleanly moved to the `WorkspaceAccessibilitySource` port.

### 2. `default:_global/testing`

- **Test Runner & Structure:** All tests use Vitest, reside in `test/`, and mirror `src/`. No Jest used.
- **No Snapshots:** All assertions are explicit; no snapshot tests.
- **Port Mock Typing (Finding D2 vs VCS test):**
  - `index-project-graph.spec.ts` fully resolved Finding D2: `FakeCodeGraphHostProvider` implements all 10 `CodeGraphHostPort` methods without partial casting.
  - `vcs-repository-root-source.spec.ts:7-10` uses `const stubAdapter: Partial<VcsAdapter> = { rootDir: () => '/path/to/repo' } as VcsAdapter`. This is a partial port mock that violates the typed port mock convention.
- **Cross-Platform Path Portability (Finding T-1):**
  - `index-code-graph-package-resolution.spec.ts:238-268` resolved T-1 by using `join(tempDir, ...)` instead of hardcoded POSIX root strings.
  - `vcs-repository-root-source.spec.ts:8, 12, 24, 33` still contains hardcoded POSIX paths: `'/path/to/repo'`, `'/path/to/repo/packages/core'`, `'/non/vcs/dir'`, `'/any/dir'`.

### 3. `default:_global/conventions`

- **TypeScript Strict Mode:** Monorepo strict mode enforced.
- **ESM Only:** All imports and exports use ESM (`.js` specifiers).
- **Named Exports Only:** All use cases, ports, and factories use named exports (`export class IndexProjectGraph`, `export function createIndexProjectGraph`).
- **File Naming:** All files use `kebab-case.ts` and `*.spec.ts`.
- **Error Typing:** Indexing errors are collected in `IndexResult.errors` as typed `IndexError` records without unhandled generic `Error` leaks.

---

## Evaluation of Past Findings

| Past Finding                                           | Severity | Previous State                                                                                                                   | Current State & Verdict                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I-1: Application use case direct `node:fs` calls**   | HIGH     | `index-code-graph.ts` imported `existsSync`/`statSync` from `node:fs` to probe workspace code roots.                             | **RESOLVED.** An application port `WorkspaceAccessibilitySource` was created and injected. `NodeWorkspaceAccessibilitySource` implements the probe via `fs/promises`. `index-code-graph.ts` calls `this.workspaceAccessibility.isAccessibleDirectory(ws.codeRoot)`.                                                    |
| **D2: Partial-port cast in `IndexProjectGraph` test**  | MEDIUM   | `index-project-graph.spec.ts` used `{ index: vi.fn() } as unknown as CodeGraphHostPort`.                                         | **RESOLVED.** Replaced with `FakeCodeGraphHostProvider` implementing all 10 interface methods fully.                                                                                                                                                                                                                   |
| **T-1: Cross-platform hardcoded POSIX paths in tests** | MEDIUM   | `index-code-graph-package-resolution.spec.ts` asserted `/custom/repo/graph` and `/custom/repo/app`.                              | **PARTIALLY RESOLVED.** Resolved in `index-code-graph-package-resolution.spec.ts` using `join(tempDir, ...)`. Retained as a minor finding in `vcs-repository-root-source.spec.ts` (`/path/to/repo`).                                                                                                                   |
| **T-2: Outcome-level assertions**                      | LOW      | Assertions checked invocation rather than end-to-end resolution for second adapter identity and inaccessible workspace packages. | **PARTIALLY RESOLVED.** Name-addressed qualified names and test helpers have thorough outcome tests (`package-resolution.spec.ts`, `in-memory-index-session.spec.ts`). Dual-adapter identity import and inaccessible-workspace package import remain invocation-only in `index-code-graph-package-resolution.spec.ts`. |

---

## Test Coverage & Execution Summary

All relevant test suites in `@specd/code-graph` were executed and passed cleanly:

```text
✓ test/application/use-cases/index-project-graph.spec.ts (8 tests)
✓ test/application/use-cases/index-code-graph-package-resolution.spec.ts (17 tests)
✓ test/application/use-cases/index-code-graph-incremental.spec.ts (4 tests)
✓ test/infrastructure/fs/node-workspace-accessibility-source.spec.ts (3 tests)
✓ test/infrastructure/vcs/vcs-repository-root-source.spec.ts (3 tests)
✓ test/application/use-cases/index-code-graph.package-imports.spec.ts (26 tests)
✓ test/application/use-cases/index-code-graph.package-imports.languages.spec.ts (10 tests)
✓ test/application/use-cases/workspace-indexing.spec.ts (23 tests)
✓ test/application/use-cases/index-code-graph.language-independence.spec.ts (4 tests)
✓ test/application/use-cases/index-code-graph.spec.ts (2 tests)
✓ test/application/use-cases/package-resolution.spec.ts (6 tests)
✓ test/application/use-cases/in-memory-index-session.spec.ts (3 tests)
✓ test/application/use-cases/index-project-graph-integration.spec.ts (21 tests)

Total focused tests: 130 tests across 13 test files — ALL PASSED (0 failures)
```

---

## Discrepancies & Recommendations

### Discrepancy 1 (LOW) — Hardcoded POSIX paths and partial mock in `vcs-repository-root-source.spec.ts`

- **Spec Reference:** `default:_global/testing` (Requirement: "Tests are POSIX- and Windows-compatible", Requirement: "Port mocks are typed").
- **Evidence:** `packages/code-graph/test/infrastructure/vcs/vcs-repository-root-source.spec.ts:7-10` uses `const stubAdapter: Partial<VcsAdapter> = { rootDir: () => '/path/to/repo' } as VcsAdapter`, and lines 12, 24, 33 assert against `/path/to/repo/...`.
- **Recommendation:**
  1. Extend `NullVcsAdapter` or implement a typed `TestVcsAdapter extends VcsAdapter` instead of `Partial<VcsAdapter> as VcsAdapter`.
  2. Use `join(tmpdir(), 'path', 'to', 'repo')` (or `resolve(...)`) instead of hardcoded `/path/to/repo`.

### Discrepancy 2 (LOW) — Strengthen outcome-level assertions for dual identity and inaccessible workspace imports

- **Spec Reference:** `code-graph:indexer` (Scenario: "Every adapter is asked for an identity", Scenario: "Inaccessible workspace is skipped without failing the run").
- **Evidence:**
  1. In `index-code-graph-package-resolution.spec.ts:153-180`, the test verifies that both adapters were queried during identity discovery, but only resolves a TS package import. Adding a second import resolving through the second adapter's identity would prove that both identities were actually registered in the session package map and are resolvable.
  2. In `index-code-graph-package-resolution.spec.ts:348-371`, adding an importing file that attempts to import a package declared by the inaccessible workspace would prove that the import increments `externalPackageImports` without failing the run.

---

## Audit Conclusion

The indexer orchestration batch (`code-graph:indexer`, `code-graph:index-project-graph`, and associated ports) is **CONFORMANT** with all functional requirements and verification scenarios.

- The primary architectural defect (I-1) was cleanly resolved via the `WorkspaceAccessibilitySource` application port.
- The unit test typing defect (D2) was resolved with a complete typed double.
- All 130 focused tests pass, demonstrating robust cross-workspace package resolution, failure isolation, incremental closure equivalence, and lifecycle neutrality.
- The remaining items are two low-severity test-refinement recommendations (typed double & path normalization in `vcs-repository-root-source.spec.ts`, and two end-to-end assertion additions in `index-code-graph-package-resolution.spec.ts`).
