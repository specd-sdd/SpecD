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

## Isolated Graph Index Worker

Use `runIsolatedGraphIndex` when a trusted host must execute graph indexing without
blocking or risking the host process. Code Graph owns the single-writer lock, child
process supervision, scoped signal forwarding, and IPC validation; hosts provide the
storage root, an installed version-affine task module, JSON data, and optional
presentation-neutral progress handling.

```typescript
import { runIsolatedGraphIndex } from '@specd/code-graph'

const result = await runIsolatedGraphIndex({
  storageRoot: '/absolute/path/to/.specd/graph',
  taskModule: new URL('./graph-index-task.js', import.meta.url),
  taskInput: { force: false },
  onProgress: (progress) => {
    // Hosts decide whether and how to render progress.
    console.log(progress)
  },
})
```

The task module is a trusted programmatic choice, not user input. It must be an
absolute path or `file:` URL to an installed module that exports the asynchronous
`runGraphIndexTask(input, emitProgress)` entrypoint. Inputs, progress values, and the
result must conform to the JSON value model: null, booleans, finite numbers, strings,
arrays, and plain objects composed from those values. The runner returns the task
result unchanged and does not render output or exit the host process.

Concurrent work for the same storage root fails before a second child starts with the
existing graph-busy error. Other failures are typed Code Graph errors, including
`GraphIndexWorkerStartError`, `GraphIndexTaskContractError`,
`GraphIndexTaskExecutionError`, `GraphIndexWorkerProtocolError`,
`GraphIndexWorkerExitError`, `GraphIndexWorkerSignalError`, and
`GraphIndexProgressHandlerError`. Hosts can classify these errors without parsing
stderr or message text.

Lock paths, leases, handoff values, direct lock assertions, child bootstrap, process
adapters, and raw IPC envelopes are internal implementation details. They are not
part of the public Code Graph API; delivery hosts should generally import this
high-level API from `@specd/sdk`.

`--force` is a logical full rebuild: it reprocesses every selected graph input through
the existing open store rather than restarting SQLite as part of a healthy index run.
Physical storage recreation is deliberately closed-provider-only. SDK orchestration may
use it once after a typed `GraphStorageRecoveryRequiredError` from the initial open of a
transient forced index; normal reads, non-forced indexes, explicit providers, and every
other error propagate without deleting derived storage.

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
