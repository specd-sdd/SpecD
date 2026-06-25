# Code-Graph Use Cases

This document describes the primary use cases exported by the `@specd/code-graph` package.

---

## IndexCodeGraph

Performs two-pass indexing of workspace files and specifications, extracts symbols and relations using language-specific adapters, tracks VCS ref and derivation metadata, and persists the result to the `GraphStore`.

### Constructor

`new IndexCodeGraph(store: GraphStore, registry: AdapterRegistryPort)`

- **`store`** (`GraphStore`): The underlying database/persistence layer.
- **`registry`** (`AdapterRegistryPort`): Registry of pluggable language adapters (e.g. tree-sitter language parsers) used to extract code semantics.

### Execution

```typescript
import { IndexCodeGraph } from '@specd/code-graph'

const indexer = new IndexCodeGraph(store, registry)
const result = await indexer.execute(options)
```

#### Input Parameters (`IndexOptions`)

| Field              | Type                          | Required | Description                                                                       |
| :----------------- | :---------------------------- | :------- | :-------------------------------------------------------------------------------- |
| `projectRoot`      | `string`                      | yes      | The absolute directory path of the project.                                       |
| `workspaces`       | `readonly ProjectWorkspace[]` | yes      | Workspace definitions including prefixes, ownership, and roots.                   |
| `graphConfig`      | `ProjectGraphConfig`          | yes      | Project-global graph exclude paths and workspace configuration overrides.         |
| `onProgress`       | `IndexProgressCallback`       | no       | Callback invoked periodically to report percentage (0-100) and phase description. |
| `chunkBytes`       | `number`                      | no       | Sequential chunk processing budget in bytes (default 20MB).                       |
| `vcsRef`           | `string`                      | no       | Current VCS reference hash stored as metadata on completion.                      |
| `codeGraphVersion` | `string`                      | no       | Version string used in derivation fingerprinting.                                 |

#### Returns: `Promise<IndexResult>`

```typescript
interface IndexResult {
  readonly filesDiscovered: number
  readonly filesIndexed: number
  readonly documentsIndexed: number
  readonly filesRemoved: number
  readonly filesSkipped: number
  readonly specsDiscovered: number
  readonly specsIndexed: number
  readonly errors: readonly IndexError[]
  readonly duration: number
  readonly workspaces: readonly WorkspaceIndexBreakdown[]
  readonly vcsRef: string | null
  readonly graphFingerprint: string | null
  readonly fullRebuildReason: string | null
}
```

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
