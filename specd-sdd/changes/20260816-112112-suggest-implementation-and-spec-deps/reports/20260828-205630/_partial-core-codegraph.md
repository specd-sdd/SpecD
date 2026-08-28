# Compliance Audit Partial — Core and Code Graph

**Audited Change:** `suggest-implementation-and-spec-deps`  
**Batch Scope:** Core and Code Graph  
**Assigned Specs:**

- `code-graph:language-adapter`
- `code-graph:graph-store`
- `core:fs-spec-repository`
- `core:spec-repository-port`
- `core:create-change`
- `core:change-repository-port`
- `core:fs-change-repository`

**Audit Methodology:**

- Merged spec and verification preview inspection via `node packages/cli/dist/index.js changes spec-preview`
- Examination of exact spec deltas and verification scenario deltas
- Implementation code inspection in `packages/core` and `packages/code-graph`
- Full test suite execution and test fixture audit across `packages/core/test` and `packages/code-graph/test`
- Depth-1 dependency and project-wide architectural constraint checking

---

## 1. Requirements Summary

| Spec                          | Changed / Added Requirement                                       | Summary of Required Behavior                                                                                                                                                                                                                                                                                                                                                                                   | Compliance Status                                                                                               |
| :---------------------------- | :---------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------- | ------------- |
| `code-graph:language-adapter` | Built-in Adapter Registry Composition Factory & Keyword Discovery | Standalone composition factory `createBuiltinAdapterRegistry` exposed at `create-builtin-adapter-registry.ts` and re-exported from `src/composition/index.ts` and package entrypoints. Registers built-in adapters (TS, Python, Go, PHP) + custom adapters. Overloads return `AdapterRegistryPort`. `LanguageAdapter.keywords?()` and `AdapterRegistryPort.getReservedKeywords()` aggregate reserved keywords. | **COMPLIANT**                                                                                                   |
| `code-graph:graph-store`      | Symbol Query Workspace Scope                                      | Optional `SymbolQuery.workspace` property. `GraphStore.findSymbols(query)` scopes results to exact, case-sensitive `'<workspace>:'` prefix comparison (`s.filePath STARTS WITH '<workspace>:'`), matching `%` and `_` literally via parameterized SQL without `LIKE` wildcard behavior.                                                                                                                        | **COMPLIANT**                                                                                                   |
| `core:fs-spec-repository`     | Spec stamp population on get & Meta observations                  | `FsSpecRepository.get()` populates `SpecArtifactEntry.size` (byte length) from the same single `stat` call as `lastModified` without reading content. `artifactMeta()` returns `lastModified` and `size` from the same stat, keeping `hash` opt-in behind `includeHash: true`.                                                                                                                                 | **COMPLIANT**                                                                                                   |
| `core:spec-repository-port`   | Spec get & Aggregate persisted state observations                 | `SpecArtifactEntry.size` is optional on the port for adapters without cheap metadata. `ArtifactMeta.size` is required on physical observations. `get` does not load content or hashes. `artifactMeta` returns `lastModified` and `size` by default, hashing only when requested.                                                                                                                               | **COMPLIANT**                                                                                                   |
| `core:create-change`          | Optional initial exploration content                              | `CreateChangeInput` accepts optional `explorationContent?: string`. Non-empty content is passed as semantic creation data `{ explorationContent }` to `ChangeRepository.create`. First-create failure semantics: repository failure must fail creation and leave no partial change observable.                                                                                                                 | **COMPLIANT**                                                                                                   |
| `core:change-repository-port` | Optional exploration metadata and lazy content access             | `ChangeRepository.create(change, options?)` accepts optional `{ explorationContent?: string }`. `Change` exposes cheap `explorationMeta: { lastModified: string; size: number }                                                                                                                                                                                                                                | null`without reading content. Port exposes lazy`readExploration(change)`and`writeExploration(change, content)`. | **COMPLIANT** |
| `core:fs-change-repository`   | Filesystem exploration persistence                                | Implements exploration using adapter-private `.specd-exploration.md`. Non-empty content written on `create()`; if write fails, directory is deleted so no partial change remains. `get` stats `.specd-exploration.md` without reading content. `readExploration` and `writeExploration` operate lazily and atomically.                                                                                         | **COMPLIANT**                                                                                                   |

---

## 2. Detailed Implementation Verification

### 2.1. `code-graph:language-adapter`

- **Location:** `packages/code-graph/src/composition/use-cases/create-builtin-adapter-registry.ts`
- **Port & Registry:**
  - `packages/code-graph/src/domain/ports/adapter-registry-port.ts`: declares `getReservedKeywords(): Set<string>`.
  - `packages/code-graph/src/domain/value-objects/language-adapter.ts`: declares `keywords?(): readonly string[]`.
  - `packages/code-graph/src/infrastructure/tree-sitter/adapter-registry.ts`: implements `getReservedKeywords()` by iterating over all unique registered adapters and collecting unique strings into a `Set<string>`.
- **Factory & Overloads:**
  - `createBuiltinAdapterRegistry(extraAdapters?: readonly LanguageAdapter[]): AdapterRegistryPort`
  - `createBuiltinAdapterRegistry(config: SpecdConfig): AdapterRegistryPort`
  - Implementation instantiates `TypeScriptLanguageAdapter`, `PythonLanguageAdapter`, `GoLanguageAdapter`, and `PhpLanguageAdapter`, registers additional adapters if provided, and returns `AdapterRegistryPort`.
- **Re-exports:**
  - Re-exported from `packages/code-graph/src/composition/index.ts`, `packages/code-graph/src/composition/create-code-graph-provider.ts`, `packages/code-graph/src/index.ts`, and `packages/code-graph/src/public.ts`.
- **Built-in Adapter Keywords:**
  - `TypeScriptLanguageAdapter`, `PythonLanguageAdapter`, `GoLanguageAdapter`, and `PhpLanguageAdapter` all implement `keywords()`, containing language keywords including `class`, `def`, `func`, `interface`, and `async`.

### 2.2. `code-graph:graph-store`

- **Value Object:** `packages/code-graph/src/domain/value-objects/symbol-query.ts` includes `readonly workspace?: string`.
- **SQLite Implementation:** `packages/code-graph/src/infrastructure/sqlite/sqlite-graph-database.ts` in `findSymbols()`:
  ```ts
  if (query.workspace !== undefined) {
    // Exact, case-sensitive prefix match (mirrors InMemoryGraphStore.startsWith):
    // avoids LIKE's ASCII case-folding and % / _ wildcard semantics.
    conditions.push('substr(file_path, 1, length(?)) = ?')
    params.push(`${query.workspace}:`, `${query.workspace}:`)
  }
  ```
  Uses parameterized `substr(file_path, 1, length(?)) = ?` which guarantees literal treatment of `%` and `_` and case-sensitive exact matching.
- **In-Memory Store:** `packages/code-graph/test/helpers/in-memory-graph-store.ts` in `findSymbols()` applies `s.filePath.startsWith(query.workspace + ':')`.

### 2.3. `core:fs-spec-repository`

- **Location:** `packages/core/src/infrastructure/fs/spec-repository.ts`
- **Single Stat Observation on `get`:**
  - `_buildSpec()` maps artifact filenames to `_observeArtifact(path.join(dir, filename), false)`.
  - `_observeArtifact(filePath, includeHash)` performs a single `await fs.stat(filePath)` returning `{ lastModified: stat.mtime.toISOString(), size: stat.size }`.
  - When `includeHash` is `false`, it returns immediately without calling `fs.readFile`.
- **`artifactMeta()`:**
  - Calls `_observeArtifact(filePath, options?.includeHash === true)`.
  - Returns `{ lastModified, size }` by default, appending `hash: sha256(content)` only when `includeHash: true`.

### 2.4. `core:spec-repository-port`

- **Location:** `packages/core/src/application/ports/spec-repository.ts` and `packages/core/src/domain/entities/spec.ts`
- **Type Signatures:**
  - `SpecArtifactEntry`: `readonly filename: string; readonly lastModified: string; readonly size?: number;` (optional on port).
  - `ArtifactMeta`: `readonly lastModified: string; readonly size: number; readonly hash?: string;` (size required on observation).
- **Behavioral Contract:**
  - `get()` remains metadata-only (no content or hash loading).
  - `artifactMeta()` specifies size from stat as a cheap pre-filter before hashing.

### 2.5. `core:create-change`

- **Location:** `packages/core/src/application/use-cases/create-change.ts`
- **Input Contract:** `CreateChangeInput` declares `readonly explorationContent?: string`.
- **Execution:**
  - If `input.explorationContent !== undefined && input.explorationContent.length > 0`, invokes `this._changes.create(change, { explorationContent: input.explorationContent })`.
  - Otherwise, invokes `this._changes.create(change)`.
  - The use case does not perform any filesystem operations or path resolutions for exploration content, delegating cleanly to `ChangeRepository`.

### 2.6. `core:change-repository-port`

- **Location:** `packages/core/src/application/ports/change-repository.ts` and `packages/core/src/domain/entities/change.ts`
- **Domain & Port Definitions:**
  - `ExplorationMeta`: `{ readonly lastModified: string; readonly size: number }`.
  - `Change`: exposes `get explorationMeta(): ExplorationMeta | null` returning an immutable snapshot `{ ...this._explorationMeta }` (or `null`).
  - `ChangeRepository`:
    - `abstract create(change: Change, options?: CreateChangeStorageOptions): Promise<void>`
    - `abstract readExploration(change: Change): Promise<string | null>`
    - `abstract writeExploration(change: Change, content: string): Promise<void>`
  - Exploration content is never eagerly loaded during `get()` or `list*()`.

### 2.7. `core:fs-change-repository`

- **Location:** `packages/core/src/infrastructure/fs/change-repository.ts`
- **Private Storage:** `const EXPLORATION_FILENAME = '.specd-exploration.md'`.
- **Creation & Rollback Semantics:**
  - In `create(change, options)`: persists manifest, and if `options?.explorationContent` is non-empty, calls `await this.writeExploration(change, options.explorationContent)`.
  - If `writeExploration` throws, it catches the error, calls `await this.delete(change)`, and rethrows, preventing partial changes from remaining observable.
- **Lazy Read / Write & Cheap Stat:**
  - `_explorationMeta(dir)` executes `fs.stat(path.join(dir, EXPLORATION_FILENAME))` returning `{ lastModified, size }` or `null` on ENOENT, without reading file content.
  - `readExploration(change)` reads `.specd-exploration.md` on demand and returns `null` if missing.
  - `writeExploration(change, content)` atomically writes via `writeFileAtomic(path.join(dir, EXPLORATION_FILENAME), content)`.

---

## 3. Verification Scenarios Audit

### Code Graph Scenarios

1. **`code-graph:language-adapter` — Built-in adapter registry factory creation and extension/keyword lookup:**
   - **Verification:** `packages/code-graph/test/composition/create-builtin-adapter-registry.spec.ts` verifies `createBuiltinAdapterRegistry()` returns `AdapterRegistryPort`, supports `.ts`, `.py`, `.go`, `.php`, registers custom adapters, and returns aggregated keywords (`class`, `function`, `interface`, `async`, `def`, `func`).
   - **Status:** **PASS**

2. **`code-graph:language-adapter` — Factory is available from composition:**
   - **Verification:** Exported from `src/composition/index.ts`, `src/index.ts`, and `src/public.ts`.
   - **Status:** **PASS**

3. **`code-graph:graph-store` — Querying symbols scoped by workspace:**
   - **Verification:** `packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts` lines 912–1000 verifies exact casing (`core` vs `CORE` vs `Core`), literal `%` (`a%b` vs `ab` / `a%%b`), and literal `_` (`my_ws` vs `mysws`).
   - **Status:** **PASS**

### Core Scenarios

4. **`core:fs-spec-repository` — get stamps include byte-size from the same stat:**
   - **Verification:** `packages/core/test/infrastructure/fs/spec-repository.spec.ts` lines 180–202 checks `result.artifacts[0].size === Buffer.byteLength('# Login spec', 'utf8')`.
   - **Status:** **PASS**

5. **`core:fs-spec-repository` — artifactMeta exposes size from stat without hashing:**
   - **Verification:** `packages/core/test/infrastructure/fs/spec-repository.spec.ts` lines 1235–1248 checks `artifactMeta()` returns `{ lastModified, size }` without `hash`.
   - **Status:** **PASS**

6. **`core:fs-spec-repository` — artifactMeta reuses the existing stat/hash path:**
   - **Verification:** `packages/core/test/infrastructure/fs/spec-repository.spec.ts` lines 1250–1266 checks `artifactMeta(..., { includeHash: true })` returns `{ hash, lastModified, size }`.
   - **Status:** **PASS**

7. **`core:spec-repository-port` — SpecArtifactEntry carries byte-size from the adapter stat:**
   - **Verification:** `SpecArtifactEntry.size` is optional on the interface and populated on FS repository get.
   - **Status:** **PASS**

8. **`core:spec-repository-port` — artifactMeta exposes size without hashing & returns lastModified without hash by default:**
   - **Verification:** Verified by port contract and FS repository tests.
   - **Status:** **PASS**

9. **`core:create-change` — Initial exploration is delegated to the repository:**
   - **Verification:** `packages/core/test/application/use-cases/create-change.spec.ts` lines 63–80 verifies `createSpy` is called with `{ explorationContent: '# Exploration' }`.
   - **Status:** **PASS**

10. **`core:create-change` — Exploration remains optional:**
    - **Verification:** `packages/core/test/application/use-cases/create-change.spec.ts` verifies creation without `explorationContent` calls `create(change)` without options.
    - **Status:** **PASS**

11. **`core:change-repository-port` — Get exposes metadata without reading content:**
    - **Verification:** `packages/core/test/infrastructure/fs/change-repository.spec.ts` lines 140–148 checks `loaded.explorationMeta` contains `size` and no `explorationContent` property on `Change`.
    - **Status:** **PASS**

12. **`core:change-repository-port` — Exploration content is read explicitly:**
    - **Verification:** `packages/core/test/infrastructure/fs/change-repository.spec.ts` line 147 verifies `readExploration(change)` returns `# Discovery`.
    - **Status:** **PASS**

13. **`core:fs-change-repository` — Repository materializes optional initial exploration:**
    - **Verification:** `packages/core/test/infrastructure/fs/change-repository.spec.ts` line 142 verifies `.specd-exploration.md` is persisted and read back.
    - **Status:** **PASS**

14. **`core:fs-change-repository` — Exploration failure leaves no partial change:**
    - **Verification:** `packages/core/test/infrastructure/fs/change-repository.spec.ts` lines 161–169 mocks `writeExploration` failure, verifies rejection and verifies `get(name)` returns `null`.
    - **Status:** **PASS**

---

## 4. Test Suite Execution & Coverage

Full test runs executed:

- `@specd/code-graph`: **59 test files passed, 715 tests passed (100% success rate)**
- `@specd/core`: **195 test files passed, 2385 tests passed (100% success rate)**
- **Total:** **254 test files passed, 3100 tests passed**

---

## 5. Non-Blocking Test Hardening Opportunities

The implementation is fully compliant with zero blocking defects. The following non-blocking improvements are noted:

1. **`createBuiltinAdapterRegistry(config: SpecdConfig)` direct overload test:** The overload is typed and implemented, but adding an explicit unit test calling the factory with a `SpecdConfig` object would further guard compatibility.
2. **I/O count spy for single-stat observation in `FsSpecRepository`:** The code directly derives `lastModified` and `size` from a single `stat` call; adding a spy asserting `fs.stat` call count equals 1 per artifact would guard against regression.
3. **No-read assertion on `get` for exploration file:** The tests verify `Change` does not have `explorationContent`, and code inspection confirms `_explorationMeta` only calls `fs.stat`. A spy on `fs.readFile` asserting zero reads for `.specd-exploration.md` during `get()` would provide strict black-box assurance.

---

## 6. Dependency & Architectural Consistency

- **Hexagonal Architecture:** Domain entities (`Spec`, `Change`) remain pure and decoupled from filesystem operations. Ports (`SpecRepository`, `ChangeRepository`, `AdapterRegistryPort`, `GraphStore`) define abstract contracts. Infrastructure classes (`FsSpecRepository`, `FsChangeRepository`, `SQLiteGraphStore`) encapsulate I/O details.
- **Composition Layer:** Factories (`createBuiltinAdapterRegistry`, `createCreateChange`) reside in the composition layer and return domain ports.
- **Storage Independence:** Filenames such as `spec-lock.json` and `.specd-exploration.md` remain private implementation details within FS adapters and are not leaked into domain entities or use cases.

---

## 7. Summary Counts

| Metric                                  |  Count   |
| :-------------------------------------- | :------: |
| Specs Audited                           |  **7**   |
| Changed Requirements Audited            |  **7**   |
| Verification Scenarios Audited          |  **14**  |
| Fully Implemented Requirements          |  **7**   |
| Actionable Discrepancies                |  **0**   |
| Critical / High / Medium / Low Defects  |  **0**   |
| Package Test Files Passed               | **254**  |
| Package Total Tests Passed              | **3100** |
| Non-Blocking Test Hardening Suggestions |  **3**   |

**Audit Conclusion:** All 7 assigned Core and Code Graph specifications are **FULLY COMPLIANT**. All requirements and verification scenarios are properly implemented and covered by passing tests.
