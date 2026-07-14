# Proposal: repository-cache-optimizations

## Motivation

High-concurrency environments (like a long-lived HTTP API with hundreds of clients polling every few seconds) suffer from severe CPU and file system I/O bottlenecks when executing SpecD bulk queries. Performing recursive directory walks and parsing markdown files recursively on every listing degrades performance, blocking the Node.js Event Loop.

## Current behaviour

Today, the filesystem repository implementations (`FsSpecRepository`, `FsArchiveRepository`, and `FsChangeRepository`) perform recursive directory scans and file lookups every time a bulk query is called:

- `list()` and `count()` in `FsSpecRepository` walk the entire `specs/` directory to discover specs and their artifact structures.
- `FsChangeRepository` walks directories to list active, draft, and discarded changes.
- `FsArchiveRepository` maintains its own custom, ad-hoc index caching implementation: it reads/writes `.specd-index.jsonl` and `.specd-index-meta.json` directly under the archive root, and runs a custom `_ensureIndex()` verification walk on every read to check freshness.
  This design leads to fragmented caching logic, high CPU/IO overhead, and code duplication across infrastructure adapters.

## Proposed solution

We will introduce a dedicated **Cache Store Port (`CacheStore`)** to encapsulate all caching, TTL-checks, serialization, and storage mechanics of SpecD.

- **Decoupled Caching:** Repositories are entirely free of caching logic. They do not maintain RAM state variables, track last check times, or handle TTLs. They delegate all caching operations to the `CacheStore`.
- **Two-Level Cache:** The filesystem implementation (`FsCacheStore`) manages L1 RAM variables (for sub-millisecond hot reads) and L2 disk files (meta JSON and index JSON Lines) under `.specd/tmp/`.
- **Unified Cache Helper (`getOrSet`):** Repositories query the cache via a single `getOrSet` call, passing the current disk fingerprint and a fallback loader. The `CacheStore` handles the L1 TTL check, L2 fingerprint comparison, loader execution, and atomic L2 persistence.
- **Structured Slot Data:** Caching is partitioned into slots/namespaces: specs are cached per workspace (e.g. `specs:${workspace}`), and working changes are cached per lifecycle phase (e.g. `changes`, `drafts`, `discarded`).
- **Obsoleting FsArchiveRepository Custom Code:** The custom index files and manual verification loop (`_ensureIndex()`) inside `FsArchiveRepository` are fully deprecated and removed. All archive caching, reading, and incremental appending is delegated to the unified `CacheStore` via the `archive:${workspace}` namespace.
- **Plug-and-Play Caching Registry:** The active `CacheStore` implementation will be configurable in `specd.yaml` and registered via the `KernelBuilder` registry. This allows developers to use the local filesystem cache (`FsCacheStore`) by default, and register/select other cache backends (such as Redis, Memcached, or PostgreSQL caches) in other environments.

## Specs affected

### New specs

None.

### Modified specs

- `core:list-changes`: Update the use case to query the cached changes index rather than scanning directories, and respect the configured TTL.
  - Depends on (added): none
  - Depends on (removed): none
- `core:list-drafts`: Update the use case to query the cached drafts index.
  - Depends on (added): none
  - Depends on (removed): none
- `core:list-discarded`: Update the use case to query the cached discarded index.
  - Depends on (added): none
  - Depends on (removed): none
- `core:list-specs`: Update the use case to query workspace-partitioned spec indices.
  - Depends on (added): none
  - Depends on (removed): none
- `core:list-archived`: Update the use case to query the optimized archive index.
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-project-summary`: Modify the requirements to allow direct orchestration of repository `count()` methods instead of delegating to full `List*` use cases. This prevents `GetProjectSummary` from parsing `.jsonl` lists, ensuring counts are resolved instantly ($<10\text{ms}$) via metadata JSON caches.
  - Depends on (added): none
  - Depends on (removed): `core:list-changes`, `core:list-drafts`, `core:list-discarded`, `core:list-archived`

## Impact

- **Repository Base (`Repository`):** Port gets `getLastModifiedFingerprint()`, `invalidateCache()`, and `cacheStore()`. The TTL configuration is removed from `Repository`.
- **New Port (`CacheStore`):** Added to `packages/core/src/application/ports/cache-store.ts` to define the caching and TTL contract.
- **New FileSystem Adapter (`FsCacheStore`):** Added to `packages/core/src/infrastructure/fs/cache-store.ts` to handle RAM L1, disk L2 files, and TTL gates.
- **FileSystem Repository Adapters (`Fs*Repository`):** Will consume the `CacheStore` to manage L2 caches.
- **Use Cases:** Write use cases (e.g. `ArchiveChange`, `CreateChange`, etc.) will trigger programmatic cache invalidations on the repositories.
- **Composition & Factories (`CompositionResolver`, `create*Repository`):** Updated to resolve and inject the `CacheStore` instance during repository construction.
- **Extensibility Registries (`KernelBuilder`, `KernelRegistryView`):** Updated to support `CacheStoreFactory` registration and configuration-driven caching backend resolution.

## Technical context

This section preserves the architectural decisions, contracts, and concrete design patterns agreed upon during discovery.

### 1. Elevated Repository Port Contracts (`Repository` base class)

We isolate caching mechanics behind the abstract `Repository` class. The `CacheStore` dependency is injected at construction time, but all TTL and internal cache state tracking is removed from the repository port:

```typescript
// packages/core/src/application/ports/repository.ts

import { CacheStore } from './cache-store.js'

export interface RepositoryConfig {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
  readonly configPath: string
  /** Injected cache store provider. */
  readonly cacheStore: CacheStore
}

export abstract class Repository {
  private readonly _workspace: string
  private readonly _ownership: 'owned' | 'shared' | 'readOnly'
  private readonly _isExternal: boolean
  private readonly _configPath: string
  private readonly _cacheStore: CacheStore

  constructor(config: RepositoryConfig) {
    this._workspace = config.workspace
    this._ownership = config.ownership
    this._isExternal = config.isExternal
    this._configPath = config.configPath
    this._cacheStore = config.cacheStore
  }

  cacheStore(): CacheStore {
    return this._cacheStore
  }

  /**
   * Returns a unique fingerprint representing the current disk state of the repository.
   * Compares the fingerprint to verify if the cache has drifted.
   */
  abstract getLastModifiedFingerprint(): Promise<string>

  /**
   * Programmatically invalidates both memory and disk caches for this repository.
   * Concrete cached adapters override this method.
   */
  invalidateCache(): void | Promise<void> {
    // Default: no-op
  }
}
```

---

### 2. Cache Store Port (`CacheStore`)

The `CacheStore` behaves as a generic key-value store that supports list-oriented operations (similar to Redis's native Strings and Lists). It exposes a unified `getOrSet` method alongside generic key-value and list stack operations:

```typescript
// packages/core/src/application/ports/cache-store.ts

export interface CacheMeta {
  readonly fingerprint: string
  readonly totalCount: number
  readonly createdAt: number
}

export interface GetOrSetOptions {
  /** Fingerprint representing current disk state. */
  readonly fingerprint: string
  /** Duration in milliseconds that the RAM L1 cache remains valid. */
  readonly ttlMs?: number
}

export abstract class CacheStore {
  /**
   * Retrieves the configured TTL for the store.
   */
  abstract ttl(): number

  /**
   * High-level method that resolves data from memory cache, falls back to
   * disk cache validation, executes the loader on drift, and persists results.
   */
  abstract getOrSet<T>(
    key: string,
    options: GetOrSetOptions,
    loader: () => Promise<T[]>,
  ): Promise<T[]>

  // --- Generic Key-Value Operations (used for CacheMeta configs, etc.) ---

  /** Retrieves a value stored under a generic key. */
  abstract get<T>(key: string): Promise<T | null>

  /** Saves a value under a generic key. */
  abstract set<T>(key: string, value: T): Promise<void>

  // --- List/Stack Operations (used for optimized JSONL data indexes) ---

  /** Retrieves the entire dataset array. */
  abstract getList<T>(key: string): Promise<T[]>

  /** Saves/overwrites the complete dataset array. */
  abstract setList<T>(key: string, values: T[]): Promise<void>

  /** Retransmits list contents lazily one element at a time via async iterators. */
  abstract iterateList<T>(key: string): AsyncIterable<T>

  /** Appends an entry to the end of the cached list (Push). */
  abstract pushList<T>(key: string, value: T): Promise<void>

  /** Removes and returns the last entry in the cached list (Pop). */
  abstract popList<T>(key: string): Promise<T | null>

  // --- Life Cycle ---

  /** Deletes all cache entries/files associated with the given cache key. */
  abstract invalidate(key: string): Promise<void>
}
```

---

### 3. FileSystem Implementation (`FsCacheStore`)

The concrete implementation uses the local filesystem under `.specd/tmp/` and keeps L1 RAM state in memory.

- **RAM L1 State:** Stores `{ data: T[], fingerprint: string, lastCheckedAtMs: number }` for each key.
- `ttl()`: Returns the TTL (e.g., `5000` from FsCacheStoreConfig, `0` for CLI).
- `getOrSet(key, options, loader)`: Resolves the entire cache flow:
  1.  Checks if L1 is initialized and `(now - lastCheckedAtMs) <= (options.ttlMs ?? ttl())`. If true, returns RAM data ($O(0)$ I/O).
  2.  If expired/missing, reads `.specd/tmp/${key}.json` via `get<CacheMeta>()`. If exists and `meta.fingerprint === options.fingerprint`, streams `.jsonl` entries via `getList()`, updates RAM cache, and returns.
  3.  If mismatch, executes `loader()`, writes `.jsonl` and `.json` atomically via `setList()` and `set()`, updates RAM L1, and returns.
- `get(key)`: Reads and parses `.specd/tmp/${key}.json`.
- `set(key, value)`: Writes `.specd/tmp/${key}.json` atomically.
- `getList(key)`: Streams and reads `.specd/tmp/${key}.jsonl` line-by-line.
- `setList(key, values)`: Writes `values` to `.specd/tmp/${key}.jsonl` atomically, one JSON-stringified entry per line.
- `iterateList(key)`: Yields parsed entries one-by-one using Node.js `readline` over a file read stream.
- `pushList(key, value)`: Appends a single JSON line to the end of `.specd/tmp/${key}.jsonl`.
- `popList(key)`: Truncates and returns the last line of `.specd/tmp/${key}.jsonl` (forces L1 invalidation).
- `invalidate(key)`: Deletes RAM cache and clears all file representations under that key prefix on disk. In `FsCacheStore`, this deletes **both** the `.json` (metadata/generic) and `.jsonl` (list/index) files associated with the key to keep the cache clean and unified.

---

### 4. Cache Partitioning, Keys & Data Schemas

Each repository adapter has an assigned key prefix/slot. Keys are mapped deterministically to individual `.json` and `.jsonl` files in `FsCacheStore` by replacing colons with hyphens.

#### A. Specs (per workspace)

- **Key:** `specs:${workspace}` (e.g., `specs:core` maps to `specs-core.json`/`specs-core.jsonl`)
- **Metadata (`CacheMeta` in `.json`):**
  ```json
  {
    "fingerprint": "combined-sha1-hash-of-spec-file-mtimes",
    "totalCount": 42,
    "createdAt": 1783269600000
  }
  ```
- **Data Index (`.jsonl` lines):**
  ```jsonl
  {
    "path": "core/kernel",
    "title": "Kernel",
    "description": "Kernel use case wiring",
    "artifacts": [
      "spec.md",
      "verify.md"
    ],
    "dependsOn": [
      "core:change",
      "core:storage"
    ]
  }
  ```

#### B. Working Changes (per lifecycle phase)

- **Key:** `changes:${phase}` (where phase is `changes` (active), `drafts` (shelved), or `discarded`)
- **Metadata (`CacheMeta` in `.json`):**
  ```json
  {
    "fingerprint": "sha1-hash-of-phase-directory-mtime",
    "totalCount": 5,
    "createdAt": 1783269600000
  }
  ```
- **Data Index (`.jsonl` lines):** Caches global change parameters, omitting dynamic drift/validation checks:
  ```jsonl
  {
    "name": "repository-cache-optimizations",
    "state": "designing",
    "description": "Implement caching",
    "specIds": [
      "core:list-changes"
    ],
    "schemaName": "@specd/schema-std",
    "createdAt": 1783250000000
  }
  ```

#### C. Archive (per workspace)

- **Key:** `archive:${workspace}` (e.g., `archive:default` maps to `archive-default.json`/`archive-default.jsonl`)
- **Obsoletion of custom files:** The local files `.specd-index.jsonl` and `.specd-index-meta.json` are fully deprecated and replaced by the `archive:${workspace}` files in the `.specd/tmp/` cache root.
- **Metadata (`CacheMeta` in `.json`):**
  ```json
  {
    "fingerprint": "sha1-hash-of-archive-subdirectories-mtime",
    "totalCount": 154,
    "createdAt": 1783269600000
  }
  ```
- **Data Index (`.jsonl` lines):**
  ```jsonl
  {
    "name": "20260703-093131-implement-write-fix",
    "archiveDate": "2026-07-03T10:05:00Z",
    "path": "archive/20260703-0implement-write-fix",
    "derivedWorkspaces": [
      "core",
      "cli"
    ]
  }
  ```

---

### 5. Repository Read Resolution Algorithm

With `CacheStore.getOrSet`, the read methods of filesystem repositories become incredibly simple and clean:

```typescript
// Inside FsSpecRepository.list()
override async list(prefix?: SpecPath): Promise<Spec[]> {
  const cacheKey = `specs:${this.workspace()}`;
  const currentFingerprint = await this.getLastModifiedFingerprint();

  const specs = await this.cacheStore().getOrSet<Spec>(
    cacheKey,
    { fingerprint: currentFingerprint },
    () => this._performFullWalk() // Fallback recursive directory walk
  );

  return this._filterSpecs(specs, prefix);
}
```

---

### 6. Query Execution Mapping

| Repository Method               | Query Type | Caching Behavior                        | Rationale                                                                                                                                                                |
| :------------------------------ | :--------- | :-------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`list()`**                    | **Bulk**   | Uses `CacheStore.getOrSet`              | Scanning folders recursively is $O(N)$ and slow.                                                                                                                         |
| **`count()`**                   | **Bulk**   | Uses `CacheStore.get` (CacheMeta check) | Fetching `totalCount` from the metadata JSON file avoids parsing the `.jsonl` list. If expired/stale, falls back to `list()` to regenerate.                              |
| **`get(name)` / `getSpec(id)`** | **Point**  | **Direct Read** (Bypasses cache)        | Point queries are $O(1)$ and direct. Bypassing caches ensures absolute consistency and prevents race conditions or operations on stale states prior to writes/mutations. |

---

### 7. Dependency Injection & Kernel Composition Wiring

Moving `CacheStore` and its TTL configurations completely out of repositories requires updating the resolution layer:

#### A. Session-Scoped Global Cache Store

Inside [CompositionResolver](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/composition/composition-resolver.ts), a single `CacheStore` instance is lazily instantiated and shared across all repository instances resolved during the session.

```typescript
// Interface extension in composition-resolver.ts
export interface CompositionResolver {
  // ...
  getCacheStore(): CacheStore;
}

// Inside createCompositionResolver:
let cacheStore: CacheStore | undefined;

// resolver implementation:
getCacheStore(): CacheStore {
  if (cacheStore !== undefined) return cacheStore;

  // Resolve using the configured cacheStoreFactory from the registry.
  // Defaults to "fs" adapter if storage.cache configuration is omitted.
  const cacheConfig = config.storage.cacheAdapter ?? {
    adapter: 'fs',
    config: { ttlMs: 5000 } // Default L1 TTL configuration for long-lived servers
  };

  const factory = resolveCacheStoreFactory(
    config.configPath,
    'storage.cache',
    registry.cacheStores,
    cacheConfig.adapter
  );

  cacheStore = factory.create(config, cacheConfig.config);
  return cacheStore;
}
```

#### B. Repository Factory Updates

Repository constructors receive `cacheStore` through the shared `RepositoryConfig` object passed by `CompositionResolver`:

- `getSpecRepositories()` injects `cacheStore: resolver.getCacheStore()` into each created workspace repository.
- `getChangeRepository()` injects `cacheStore: resolver.getCacheStore()`.
- `getArchiveRepository()` injects `cacheStore: resolver.getCacheStore()`.

#### C. Clean Decoupling of Use Cases

The application layer (e.g. `ListChanges`, `ArchiveChange` use cases) **does not** depend on `CacheStore` or TTL configurations.

- Use cases consume repository ports exactly as they do today. Caching is treated as an infrastructure implementation detail.
- Mutating use cases trigger programmatic invalidation by calling `repository.invalidateCache()`. The repository implementation then maps this to a `cacheStore.invalidate(key)` call. No cache storage specifics leak into use cases.

#### D. Implications for Kernel Consumers & Delivery Hosts

- **Zero API Changes on Kernel:** The public interface of the `Kernel` class (`packages/core/src/composition/kernel.ts`) remains 100% unchanged. Delivery hosts (`@specd/cli`, `@specd/mcp`, `@specd/sdk`) do not require code updates to call use cases.
- **Transparent Performance Gains:** Calls to query methods (such as `listSpecs`, `listChanges`, `listDrafts`, `getProjectSummary`) execute with transparent speedup and minimal memory allocations.
- **Test Suite Isolation:** Testing suites can instantiate a separate `MemoryCacheStore` (or pass a no-op null provider) to guarantee that testing states do not pollute the filesystem with L2 cache files during verification.

#### E. Extension Registry Integration

To support pluggable caching backends, we integrate `CacheStore` with the kernel's extension registry.

```typescript
// packages/core/src/composition/cache-store-factory.ts
export interface CacheStoreFactory {
  create(config: SpecdConfig, options: Readonly<Record<string, unknown>>): CacheStore
}

// Added to KernelRegistryView (kernel-registries.ts):
export interface KernelRegistryView {
  // ...
  readonly cacheStores: ReadonlyMap<string, CacheStoreFactory>
}
```

- **Built-in registration:** The `"fs"` adapter is registered by default, returning `FsCacheStore` instances configured with `tmpPath` and `ttlMs` from `specd.yaml`.
- **Third-party plugins:** Plugins can register alternate cache adapters (like `"redis"`, `"memcached"`) under `cacheStores` during `KernelBuilder` phases.
- **Optional Configuration in `specd.yaml`:**
  If the configuration under `storage.cache` is omitted, the system falls back to the default `"fs"` adapter with a default configuration (e.g., `ttlMs: 5000` for HTTP server context or `0` for CLI runtimes):
  ```yaml
  storage:
    cache:
      adapter: fs
      config:
        ttlMs: 5000
  ```

---

### 8. Cache Revalidation and Invalidation Matrix

The `CacheStore` manages cache freshness internally. The revalidation process and invalidation triggers are structured as follows:

#### A. In-Memory and Disk Cache Revalidation (handled by `CacheStore.getOrSet`)

When checking the cache during reads:

1.  If the time since the last check is less than `cacheStore.ttl()`, serve from L1 RAM cache.
2.  If it exceeds `cacheStore.ttl()`, walk the directories to collect file names and `mtimes` to compute the current fingerprint hash.
3.  If the hash matches the cached fingerprint in the metadata `.json` file (`get<CacheMeta>()`), return cache data.
4.  If it does not match, run the full walk and parsing logic, and rewrite L2 files.

#### B. Programmatic Invalidation (Writes)

When a use case executes a write action, it explicitly calls `invalidateCache()` on the modified repository:

- `ArchiveChange`: Calls `invalidateCache()` on `ArchiveRepository`, and the `SpecRepository` of all workspaces that received deltas.
- `CreateChange`: Invalidates `ChangeRepository`'s `changes` cache.
- `EditChange` / `TransitionChange` / `DiscardChange` / `RestoreChange` / `DeleteChange`: Invalidate the caches of the affected phases.

## Open questions

None. The alternatives (e.g. SQL databases, storing individual file `mtimes` on disk) were evaluated and ruled out during exploration.
