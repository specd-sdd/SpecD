---
title: Code-Graph Use Cases
description: Primary use cases exported by the `@specd/code-graph` package.
sidebar_position: 2
---

# Code-Graph Use Cases

This document describes the primary use cases exported by the `@specd/code-graph` package.

---

## IndexCodeGraph

Performs two-pass indexing of workspace files and specifications, extracts symbols and relations using language-specific adapters, tracks VCS ref and derivation metadata, and persists the result to the `GraphStore`.

### Constructor

```typescript
new IndexCodeGraph(
  store: GraphStore,
  registry: AdapterRegistryPort,
  manifestSource: ResolutionManifestSource,
  repositoryRoots: RepositoryRootSource,
  workspaceAccessibility: WorkspaceAccessibilitySource,
)
```

- **`store`** (`GraphStore`): The underlying database/persistence layer.
- **`registry`** (`AdapterRegistryPort`): Registry of pluggable language adapters (e.g. tree-sitter language parsers) used to extract code semantics.
- **`manifestSource`** (`ResolutionManifestSource`): Application port abstracting manifest reading and presence checks.
- **`repositoryRoots`** (`RepositoryRootSource`): Application port providing the enclosing repository root boundary for code roots.
- **`workspaceAccessibility`** (`WorkspaceAccessibilitySource`): Application port probing directory accessibility for configured workspaces prior to indexing. Probe failures are non-fatal.

### Execution

```typescript
import { IndexCodeGraph } from '@specd/code-graph'

const indexer = new IndexCodeGraph(
  store,
  registry,
  manifestSource,
  repositoryRoots,
  workspaceAccessibility,
)
const result = await indexer.execute(options)
```

#### Input Parameters (`IndexOptions`)

| Field              | Type                          | Required | Description                                                                          |
| :----------------- | :---------------------------- | :------- | :----------------------------------------------------------------------------------- |
| `projectRoot`      | `string`                      | yes      | The absolute directory path of the project.                                          |
| `workspaces`       | `readonly ProjectWorkspace[]` | yes      | Workspace definitions including prefixes, ownership, and roots.                      |
| `graphConfig`      | `ProjectGraphConfig`          | yes      | Project-global graph exclude paths and workspace configuration overrides.            |
| `onProgress`       | `IndexProgressCallback`       | no       | Callback invoked periodically to report percentage (0-100) and phase description.    |
| `chunkBytes`       | `number`                      | no       | Sequential chunk processing budget in bytes (default 20MB).                          |
| `vcsRef`           | `string`                      | no       | Current VCS reference hash stored as metadata on completion.                         |
| `codeGraphVersion` | `string`                      | no       | Version string used in derivation fingerprinting.                                    |
| `onEvent`          | `IndexEventReceiver`          | no       | Optional receiver for typed indexing events (`file-activity`, `file-skipped`, etc.). |

#### Returns: `Promise<IndexResult>`

```typescript
interface IndexResult {
  readonly filesDiscovered: number
  readonly filesIndexed: number
  readonly documentsIndexed: number
  readonly filesRemoved: number
  readonly filesSkipped: number
  readonly filesSkippedForSize: number
  readonly largestSkippedForSize: readonly SizeSkippedFile[]
  readonly sizeExemptAnalysed: readonly SizeExemptFile[]
  readonly specsDiscovered: number
  readonly specsIndexed: number
  readonly errors: readonly IndexError[]
  readonly diagnostics: readonly IndexError[]
  readonly duration: number
  readonly workspaces: readonly WorkspaceIndexBreakdown[]
  readonly vcsRef: string | null
  readonly graphFingerprint: string
  readonly fullRebuild: boolean
  readonly fullRebuildReason: string | null
  readonly phaseMetrics: IndexPhaseMetrics
  readonly coverage: IndexRunCoverageSummary
  readonly coverageDiagnostics: readonly IndexCoverageDiagnostic[]
  readonly logicalDiagnostics: readonly LogicalDeclarationDiagnostic[]
  readonly importDiagnostics: ImportDiagnosticSummary
}
```

### Execution Lifecycle: Size Gate and Parser Epochs

1. **Size Gate Evaluation:** For every candidate file, `IndexCodeGraph` checks filesystem size before reading bytes. If the size strictly exceeds effective `maxFileBytes` (default: 256 KiB) and the file is not exempt in `largeFilePaths`, the file is marked skipped (`file-too-large`), counted in `filesSkippedForSize`, and excluded from analysis.
2. **Per-File Parser Epoch:** Each admitted source file is parsed inside an isolated `ParserResourceScope`. Adapters register their parser AST trees and disposal callbacks in `session.parserResources`.
3. **Deterministic Cleanup & Yield:** Once the file's symbols and facts are extracted (or if an error throws), `closeParserResourceEpoch` runs:
   - Disposes all registered resources in LIFO order.
   - Invokes `globalThis.gc()` if available to clean up native V8 handle wrappers.
   - Yields the event loop via `setImmediate` to allow libuv/V8 finalizers to run before the next file begins.

---

## discoverFiles

Pure utility function used to traverse directories recursively and discover textual files and documents to index, respecting `.gitignore` rules and explicit allowed or excluded paths.

### Signature

```typescript
import { discoverFiles } from '@specd/code-graph'

function discoverFiles(
  root: string,
  hasAdapter?: (filePath: string) => boolean,
  options?: DiscoverFilesOptions,
): string[]
```

#### Parameters

- **`root`** (`string`): Absolute starting path of the search.
- **`hasAdapter`** (`(filePath: string) => boolean`): Optional callback to check if a file has a co-located language adapter.
- **`options`** (`DiscoverFilesOptions`): Optional search controls.

#### Options (`DiscoverFilesOptions`)

| Field              | Type                | Required | Description                                                                   |
| :----------------- | :------------------ | :------- | :---------------------------------------------------------------------------- |
| `excludePaths`     | `readonly string[]` | no       | Gitignore-syntax exclusion rules replacing defaults entirely.                 |
| `respectGitignore` | `boolean`           | no       | Whether to load and respect local `.gitignore` files (defaults to `true`).    |
| `allowedPaths`     | `readonly string[]` | no       | Glob-syntax inclusion rules (when present, only matching paths are returned). |

#### Returns: `string[]`

An array of absolute paths to discovered files.

---

## Host orchestration use cases

Application-layer use cases for CLI, SDK, and Studio hosts. Each receives an **already-open** `CodeGraphProvider`; callers manage `open()` / `close()` lifecycle.

| Use case                | Factory                         | Purpose                                                              |
| ----------------------- | ------------------------------- | -------------------------------------------------------------------- |
| `GetGraphHealth`        | `createGetGraphHealth()`        | Statistics plus VCS staleness and derivation fingerprint diagnostics |
| `IndexProjectGraph`     | `createIndexProjectGraph()`     | Project index execution with optional logical `force` full rebuild   |
| `GetSpecCoverage`       | `createGetSpecCoverage()`       | Covered files/symbols for one spec                                   |
| `GetChangeSpecCoverage` | `createGetChangeSpecCoverage()` | Per-spec coverage for a change's `specIds`                           |

### GetGraphHealth

```typescript
import { createGetGraphHealth } from '@specd/code-graph'

const health = await createGetGraphHealth().execute({
  config,
  provider,
  codeGraphVersion,
  workspaces, // optional, for fingerprint comparison
})
```

Returns `GraphStatistics` fields plus `stale`, `currentRef`, and `fingerprintMismatch`.

**Consumers:** `specd graph stats`, `project status --graph`, SDK `buildProjectStatusSnapshot`.

### IndexProjectGraph

```typescript
import { createIndexProjectGraph } from '@specd/code-graph'

const result = await createIndexProjectGraph().execute({
  provider,
  projectRoot,
  workspaces,
  graphConfig,
  codeGraphVersion,
  vcsRef,
  force: false,
  onProgress,
})
```

**Consumers:** an SDK-composed task running inside Code Graph's isolated graph-index
worker. `runIndexProjectGraph` retains project orchestration (workspace assembly, VCS,
provider lifecycle, and repair handling); Code Graph owns the worker process and its
single-writer lock. The CLI selects its trusted packaged task and presents the returned
progress, result, or typed failure—it does not acquire the lock or supervise a
subprocess.

### GetSpecCoverage / GetChangeSpecCoverage

`GetSpecCoverage` queries `getCoveredFiles` and `getCoveredSymbols` for one `specId`.

`GetChangeSpecCoverage` loads a change via `ChangeRepository.get(name)` and delegates per `specId`; throws `ChangeNotFoundError` when absent.

**Consumers:** Studio change coverage views (future).
