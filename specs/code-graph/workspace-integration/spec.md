# Workspace Integration

## Purpose

`@specd/code-graph` must integrate with specd's multi-workspace system to index code and specs from each workspace individually, while storing everything in a single graph database. This enables cross-workspace impact analysis and ensures file paths are globally unique across workspaces.

## Requirements

### Requirement: FileNode path and workspace semantics

All node identities (Files and Documents) SHALL be globally unique by prefixing the owning workspace name to the relative path:

- **Workspace Identity**: `{workspaceName}:{relativeToCodeRoot}` (e.g. `core:src/index.ts`).
- **Root Identity**: `root:{projectRelativePath}` (e.g. `root:docs/adr/0001.md`).

`root` is a reserved namespace for files discovered via project-global `graph.includePaths` that are not owned by any specific workspace.

If a physical file falls under a configured workspace `codeRoot`, the workspace identity wins. The same file MUST NOT also be persisted under a `root:` identity.

`path` remains the canonical graph identity used by `SymbolNode.filePath`, symbol ids, and persisted relations.

Each node MUST also store its `configRelativePath` (relative to the directory containing the active `specd.yaml`) to enable user-facing lookups from project-relative path selectors.

This ensures that two workspaces with identical relative paths produce distinct `FileNode.path` values while still allowing CLI users to resolve file arguments using repository-style paths relative to the active config. The workspace name is the `SpecdWorkspaceConfig.name` from the specd configuration.

### Requirement: SymbolNode ID includes workspace

`SymbolNode.id` SHALL include the workspace-prefixed path:

- **`id`** = `{filePath}:{kind}:{name}:{line}:{column}` (e.g. `core:src/index.ts:function:main:1:0`)

This follows naturally from `SymbolNode.filePath` being the `FileNode.path`. The `column` component provides additional disambiguation for overloaded declarations on the same line.

### Requirement: SpecNode workspace field

`SpecNode` SHALL include a `workspace` field:

- **`workspace`** (`string`) — the workspace name this spec belongs to (e.g. `core`, `_global`)

Spec IDs use the format `{workspace}:{specPath}` (e.g. `core:change`, `default:_global/architecture`), matching the format produced by `SpecRepository`. The workspace name prefix in the specPath comes from the workspace's configured `prefix` in `specd.yaml`.

### Requirement: File discovery from codeRoot

For each workspace with a `codeRoot`, the indexer SHALL discover files starting from the workspace's `codeRoot` (an absolute path). The `codeRoot` is provided by `SpecdWorkspaceConfig.codeRoot` from the specd configuration.

Files are discovered per workspace and their paths are prefixed with the workspace name before being stored in the graph. The `discoverFiles` function itself has no workspace knowledge — it accepts a root directory and returns paths relative to that root.

### Requirement: Config-relative file lookup

The graph SHALL support resolving file selectors by a path relative to the directory containing the active `specd.yaml`.

For a configured project:

1. The indexer computes `configRelativePath` for every indexed file from the active config directory to the file on disk.
2. The value is normalized to forward slashes and MUST NOT include a leading `./`.
3. Files outside the config directory remain representable by a relative path containing `..` segments.
4. CLI commands that accept file selectors MAY use this field to resolve inputs that do not include a `{workspace}:` prefix.

This lookup is in addition to canonical workspace-prefixed graph identity; it does not replace it.

### Requirement: Spec resolution via SpecRepository

The indexer SHALL resolve specs by directly consuming the `SpecRepository` instance from each orchestrated workspace. For each spec:

1. Enumerate identities via `repo.list()`.
2. Check freshness via `repo.specHash()`.
3. Load content by concatenating artifacts from `repo.artifact()`. Artifact filenames come from `spec.filenames` and no longer include metadata files. Concatenate artifact contents for hashing: `spec.md` first (if present), then the remaining artifacts in alphabetical order.
4. Load metadata via `repo.metadata()` to extract `title` and `description`. If metadata is absent (`null`), `title` defaults to the `specId`, `description` to `''`, and `dependsOn` to `[]`. There is no fallback to parsing headings or sections from `spec.md`.
5. Load `dependsOn` via `repo.readPersistedDependsOn()`.
6. Load coverage links via `repo.readPersistedImplementation()`.

The indexer SHALL NOT rely on the CLI to precompute these semantics or provide callbacks. This decouples the indexer from spec storage and respects workspace prefixes, ownership, and locality as configured in `specd.yaml`.

### Requirement: Cross-workspace import resolution

During Pass 2 (import resolution), the indexer SHALL resolve imports across workspaces:

- **Relative imports** — resolved within the same workspace (same path prefix)
- **Package imports** — the `packageName → workspaceName` map (built from `LanguageAdapter.getPackageIdentity`) correlates package names with workspace names, allowing resolution across workspace boundaries. This works for both monorepo and multirepo setups.
- **PHP qualified names** — resolved globally across all workspaces

The in-memory `SymbolIndex` holds symbols from ALL workspaces before Pass 2 begins, enabling cross-workspace resolution.

### Requirement: WorkspaceIndexTarget

`IndexOptions` SHALL accept the orchestrated project structure and graph-specific configuration:

```ts
interface ProjectGraphConfig {
  readonly includePaths?: readonly string[]
  readonly excludePaths?: readonly string[]
  readonly workspaces?: ReadonlyMap<
    string,
    {
      readonly allowedPaths?: readonly string[]
      readonly excludePaths?: readonly string[]
      readonly respectGitignore?: boolean
    }
  >
}

interface IndexOptions {
  readonly projectRoot: string
  readonly workspaces: readonly ProjectWorkspace[]
  readonly graphConfig: ProjectGraphConfig
  readonly onProgress?: IndexProgressCallback
  readonly chunkBytes?: number
  readonly vcsRef?: string
}
```

The `specs` callback on `WorkspaceIndexTarget` is REMOVED. The indexer now pulls data from the `SpecRepository` carried by each `ProjectWorkspace`.

`ProjectGraphConfig` fields are populated by the CLI/MCP integration layer from `SpecdConfig.graph`.

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

When discovering files from a `codeRoot`, `.gitignore` handling is controlled by `WorkspaceIndexTarget.respectGitignore` (default `true`):

When `respectGitignore` is `true`:

1. Find the git root by walking up from `codeRoot` looking for `.git/`
2. Load `.gitignore` from the git root
3. Load any `.gitignore` files found in subdirectories during the walk
4. Apply rules relative to the directory containing each `.gitignore`
5. `.gitignore` exclusions have absolute priority — `excludePaths` cannot re-include gitignored files

When `respectGitignore` is `false`:

- `.gitignore` files are not loaded or applied
- Only `excludePaths` patterns govern file exclusion

## Constraints

- `@specd/code-graph` depends on `@specd/core` as a runtime dependency (types, domain services)
- Single `.specd/code-graph.lbug` file for the whole project
- The `discoverFiles` function remains workspace-agnostic — workspace prefixing and config-relative path derivation happen in the indexer
- Spec resolution uses `SpecRepository` exclusively — no filesystem fallback
- Existing graph stores are incompatible when file identity metadata changes (for example adding `configRelativePath`) — a full rebuild is required after upgrading

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
  specId: 'core:change',
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

- `core:config` — `SpecdWorkspaceConfig.graph` fields (`excludePaths`, `respectGitignore`) are the source for `WorkspaceIndexTarget` exclusion options
