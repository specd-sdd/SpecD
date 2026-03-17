# Workspace Integration

## Purpose

`@specd/code-graph` must integrate with specd's multi-workspace system to index code and specs from each workspace individually, while storing everything in a single graph database. This enables cross-workspace impact analysis and ensures file paths are globally unique across workspaces.

## Requirements

### Requirement: FileNode path and workspace semantics

`FileNode.path` SHALL be globally unique by prefixing the workspace name to the code-root-relative path:

- **`path`** = `{workspaceName}:{relativeToCodeRoot}` (e.g. `core:src/index.ts`)
- **`workspace`** = workspace name string (e.g. `core`, `cli`, `default`)

This ensures that two workspaces with identical relative paths (e.g. both having `src/index.ts`) produce distinct `FileNode.path` values. The workspace name is the `SpecdWorkspaceConfig.name` from the specd configuration.

### Requirement: SymbolNode ID includes workspace

`SymbolNode.id` SHALL include the workspace-prefixed path:

- **`id`** = `{workspace}:{relativePath}:{kind}:{name}:{line}` (e.g. `core:src/index.ts:function:main:1`)

This follows naturally from `SymbolNode.filePath` being the `FileNode.path`.

### Requirement: SpecNode workspace field

`SpecNode` SHALL include a `workspace` field:

- **`workspace`** (`string`) — the workspace name this spec belongs to (e.g. `core`, `_global`)

Spec IDs use the format `{workspace}:{specPath}` (e.g. `core:core/change`, `default:_global/architecture`), matching the format produced by `SpecRepository`. The workspace name prefix in the specPath comes from the workspace's configured `prefix` in `specd.yaml`.

### Requirement: File discovery from codeRoot

For each workspace with a `codeRoot`, the indexer SHALL discover files starting from the workspace's `codeRoot` (an absolute path). The `codeRoot` is provided by `SpecdWorkspaceConfig.codeRoot` from the specd configuration.

Files are discovered per workspace and their paths are prefixed with the workspace name before being stored in the graph. The `discoverFiles` function itself has no workspace knowledge — it accepts a root directory and returns paths relative to that root.

### Requirement: Spec resolution via SpecRepository

Instead of brute-walking a `specs/` directory, each workspace provides a callback function that returns discovered specs:

```typescript
interface WorkspaceIndexTarget {
  readonly name: string
  readonly codeRoot: string
  readonly specs: () => Promise<DiscoveredSpec[]>
}
```

The `specs` callback is implemented by the CLI/MCP integration layer using `SpecRepository` from `@specd/core`:

1. Call `repo.list()` to get all `Spec` entities in the workspace
2. For each spec, load all artifacts via `repo.artifact(spec, filename)`
3. Concatenate artifact contents for hashing: `spec.md` first (if present), then the remaining artifacts in alphabetical order
4. Load `.specd-metadata.yaml` via `repo.artifact(spec, '.specd-metadata.yaml')` and parse it with `parseMetadata` to extract `title`, `description`, and `dependsOn`. If metadata is absent, `title` defaults to the `specId`, `description` to `''`, and `dependsOn` to `[]`. There is no fallback to parsing headings or sections from `spec.md`.
5. Build the `specId` as `{workspace}:{specPath}` (e.g. `core:core/change`), matching the format produced by `SpecRepository.resolveFromPath`

This decouples the indexer from spec storage and respects workspace prefixes, ownership, and locality as configured in `specd.yaml`.

The `DiscoveredSpec` type is re-exported from `@specd/code-graph` for use by integration layers.

### Requirement: Cross-workspace import resolution

During Pass 2 (import resolution), the indexer SHALL resolve imports across workspaces:

- **Relative imports** — resolved within the same workspace (same path prefix)
- **Package imports** — the `packageName → workspaceName` map (built from `LanguageAdapter.getPackageIdentity`) correlates package names with workspace names, allowing resolution across workspace boundaries. This works for both monorepo and multirepo setups.
- **PHP qualified names** — resolved globally across all workspaces

The in-memory `SymbolIndex` holds symbols from ALL workspaces before Pass 2 begins, enabling cross-workspace resolution.

### Requirement: WorkspaceIndexTarget

`IndexOptions` SHALL accept an array of `WorkspaceIndexTarget` objects instead of a single `workspacePath`:

```typescript
interface IndexOptions {
  readonly workspaces: readonly WorkspaceIndexTarget[]
  readonly projectRoot: string
  readonly onProgress?: IndexProgressCallback
  readonly chunkBytes?: number
}
```

- **`workspaces`** — one entry per workspace to index
- **`projectRoot`** — absolute path to the monorepo/project root (for monorepo package resolution)

### Requirement: Per-workspace IndexResult breakdown

`IndexResult` SHALL include a per-workspace breakdown:

```typescript
interface WorkspaceIndexBreakdown {
  readonly name: string
  readonly filesDiscovered: number
  readonly filesIndexed: number
  readonly filesSkipped: number
  readonly filesRemoved: number
  readonly specsDiscovered: number
  readonly specsIndexed: number
}

interface IndexResult {
  // ... existing aggregate fields ...
  readonly workspaces: readonly WorkspaceIndexBreakdown[]
}
```

### Requirement: .gitignore handling for codeRoot

When discovering files from a `codeRoot`, `.gitignore` rules SHALL be loaded hierarchically:

1. Find the git root by walking up from `codeRoot` looking for `.git/`
2. Load `.gitignore` from the git root
3. Load any `.gitignore` files found in subdirectories during the walk
4. Apply rules relative to the directory containing each `.gitignore`

This handles the case where `codeRoot` is a subdirectory of a git repo (e.g. `packages/core/` within a monorepo).

## Constraints

- `@specd/code-graph` depends on `@specd/core` as a runtime dependency (types, domain services)
- Single `.specd/code-graph.lbug` file for the whole project
- The `discoverFiles` function remains workspace-agnostic — workspace prefixing happens in the indexer
- Spec resolution uses `SpecRepository` exclusively — no filesystem fallback
- Existing `.specd/code-graph.lbug` files are incompatible with the new path format — `--force` re-index is required after upgrading

## Examples

```typescript
// WorkspaceIndexTarget for the 'core' workspace
const coreTarget: WorkspaceIndexTarget = {
  name: 'core',
  codeRoot: '/project/packages/core',
  specs: async () => {
    const specs = await kernel.specs.repos.get('core')!.list()
    return specs.map(specToDiscoveredSpec)
  },
}

// FileNode with workspace-qualified path
const file: FileNode = {
  path: 'core:src/domain/entities/change.ts',
  language: 'typescript',
  contentHash: 'sha256:abc123...',
  workspace: 'core',
  embedding: undefined,
}

// SymbolNode with workspace in ID
const symbol: SymbolNode = {
  id: 'core:src/domain/entities/change.ts:function:createChange:42',
  name: 'createChange',
  kind: 'function',
  filePath: 'core:src/domain/entities/change.ts',
  line: 42,
  column: 0,
  comment: undefined,
}

// SpecNode with workspace
const spec: SpecNode = {
  specId: 'core:core/change',
  path: 'specs/core/change',
  title: 'Change',
  description: 'Defines the Change entity and its lifecycle transitions',
  contentHash: 'sha256:def456...',
  content: '# Change\n\n## Purpose\n...',
  dependsOn: [],
  workspace: 'core',
}
```

## Spec Dependencies

- [`specs/code-graph/symbol-model/spec.md`](../symbol-model/spec.md) — FileNode, SymbolNode, SpecNode definitions
- [`specs/code-graph/indexer/spec.md`](../indexer/spec.md) — IndexCodeGraph pipeline, IndexOptions, IndexResult
- [`specs/code-graph/composition/spec.md`](../composition/spec.md) — factory function, CodeGraphProvider
