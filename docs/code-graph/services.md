# Code-Graph Services and Helpers

This document details the core domain services, configuration builders, and locking utilities exported by the `@specd/code-graph` package.

---

## Domain Services

### analyzeFilesImpact

Calculates the aggregated blast radius (impact analysis) of changes to multiple files.

```typescript
import { analyzeFilesImpact } from '@specd/code-graph'

function analyzeFilesImpact(
  store: GraphStore,
  filePaths: string[],
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth?: number,
): Promise<FileImpactResult>
```

- **`store`** (`GraphStore`): Opened graph database instance.
- **`filePaths`** (`string[]`): Array of canonical file paths to analyze.
- **`direction`** (`'upstream' | 'downstream' | 'both'`): Direction of traversal.
- **`maxDepth`** (`number`): Optional maximum traversal depth (defaults to `3`).

**Returns:** `Promise<FileImpactResult>` - The combined impact results containing merged affected files/symbols and the overall maximum risk level.

---

### isGraphStale

Determines if the code graph is out-of-sync with the current repository VCS reference.

```typescript
import { isGraphStale } from '@specd/code-graph'

function isGraphStale(lastIndexedRef: string | null, currentRef: string | null): boolean | null
```

- **`lastIndexedRef`** (`string | null`): The VCS reference recorded at the last indexing run.
- **`currentRef`** (`string | null`): The current VCS reference of the repository.

**Returns:** `boolean | null` - `true` if they differ, `false` if identical, or `null` if reference information is unavailable.

---

## Mutex Lock Management

These utilities guard against concurrent graph indexing runs across multiple local processes (e.g. CLI, MCP servers, or editor integrations).

### assertGraphIndexUnlocked

Checks if the indexing lock file exists. Throws if locked.

```typescript
import { assertGraphIndexUnlocked } from '@specd/code-graph'

function assertGraphIndexUnlocked(config: SpecdConfig): void
```

**Throws:** `Error` containing a friendly error message if the indexing lock is currently held by another process.

---

### acquireGraphIndexLock

Creates an index lock file containing the current process PID and registers automatic cleanup hooks on process termination.

```typescript
import { acquireGraphIndexLock } from '@specd/code-graph'

function acquireGraphIndexLock(config: SpecdConfig): () => void
```

**Returns:** `() => void` - A release callback to clean up the lock file and unregister signal handlers manually.

**Throws:** `Error` if the lock file already exists.

---

## Configuration Helpers

### buildProjectGraphConfig

Assembles the project-level graph configuration by merging workspace allowed/exclude paths with runtime overrides.

```typescript
import { buildProjectGraphConfig, type GraphConfigOverrides } from '@specd/code-graph'

function buildProjectGraphConfig(
  config: SpecdConfig,
  overrides?: GraphConfigOverrides,
): ProjectGraphConfig
```

**Returns:** `ProjectGraphConfig` containing the merged rules.

---

### createBootstrapGraphConfig

Constructs a fallback configuration object for running in ad-hoc repository bootstrap mode when no `specd.yaml` config file exists.

```typescript
import { createBootstrapGraphConfig } from '@specd/code-graph'

function createBootstrapGraphConfig(params: {
  readonly projectRoot: string
  readonly vcsRoot: string
}): SpecdConfig
```

**Returns:** `SpecdConfig` with a synthetic single `default` workspace rooted at the repository root.
