# Design: spec-contention-detection

## Non-goals

- Integration with `EditChange` or `CreateChange` use cases in core — warnings are CLI presentation logic
- Warning/Error severity levels for sync scenarios (depend on #21 and #22)
- Including drafted or discarded changes in overlap checks

## Affected areas

### `packages/core/src/domain/services/index.ts`

Add re-export of the new `detectSpecOverlap` function.

### `packages/core/src/domain/value-objects/index.ts`

Add re-export of `OverlapReport`, `OverlapEntry`, and `OverlapChange` types.

### `packages/core/src/application/use-cases/index.ts`

Add type export of `DetectOverlap` and `DetectOverlapInput`.

### `packages/core/src/composition/kernel.ts`

- Add `detectOverlap: DetectOverlap` to the `Kernel['changes']` interface
- Import `DetectOverlap` from `../application/use-cases/detect-overlap.js`
- Wire `detectOverlap: new DetectOverlap(i.changes)` in `createKernel()`

### `packages/core/src/composition/use-cases/index.ts`

Add re-export of `createDetectOverlap` factory and its context/options types.

### `packages/core/src/application/use-cases/archive-change.ts`

- Add `allowOverlap?: boolean` to `ArchiveChangeInput`
- Import `detectSpecOverlap` from domain services
- After archivable guard + transition to `archiving`, before pre-archive hooks: if `!allowOverlap`, call `this._changes.list()`, exclude the current change, call `detectSpecOverlap`, filter to entries involving the current change, throw `SpecOverlapError` if overlap found

### `packages/core/src/domain/errors/` (or relevant error file)

Add `SpecOverlapError` extending `SpecdError`.

### `packages/cli/src/index.ts`

Import and register `registerChangeOverlap` on the `changeCmd` command group.

### `packages/cli/src/commands/change/create.ts`

After successful creation, call `kernel.changes.detectOverlap.execute({ name })` and print a warning if `hasOverlap` is true.

### `packages/cli/src/commands/change/edit.ts`

After successful edit (when specs changed), call `kernel.changes.detectOverlap.execute({ name })` and print a warning if `hasOverlap` is true.

### `packages/cli/src/commands/change/archive.ts`

Add `--allow-overlap` option that passes `allowOverlap: true` to the use case. Catch `SpecOverlapError` and display a user-friendly message suggesting the flag.

## New constructs

### `OverlapChange` — domain type

- **Location:** `packages/core/src/domain/value-objects/overlap-entry.ts`
- **Shape:**
  ```typescript
  interface OverlapChange {
    readonly name: string
    readonly state: ChangeState
  }
  ```
- **Responsibility:** Represents a change participating in an overlap. Plain interface.

### `OverlapEntry` — domain value object

- **Location:** `packages/core/src/domain/value-objects/overlap-entry.ts`
- **Shape:**

  ```typescript
  class OverlapEntry {
    constructor(props: { specId: string; changes: readonly OverlapChange[] })

    get specId(): string
    get changes(): readonly OverlapChange[]
  }
  ```

- **Responsibility:** Represents a single overlapping spec and the changes targeting it. Immutable value object.
- **Relationships:** Used by `OverlapReport`. Depends on `ChangeState`.

### `OverlapReport` — domain value object

- **Location:** `packages/core/src/domain/value-objects/overlap-report.ts`
- **Shape:**

  ```typescript
  class OverlapReport {
    constructor(entries: readonly OverlapEntry[])

    get entries(): readonly OverlapEntry[]
    get hasOverlap(): boolean
  }
  ```

- **Responsibility:** Aggregates all overlap entries. `hasOverlap` is derived (`entries.length > 0`). Immutable.
- **Relationships:** Contains `OverlapEntry` instances. Returned by `detectSpecOverlap` and `DetectOverlap.execute()`.

### `detectSpecOverlap` — domain service (pure function)

- **Location:** `packages/core/src/domain/services/detect-spec-overlap.ts`
- **Shape:**
  ```typescript
  /**
   * Detects specs targeted by multiple active changes.
   *
   * @param changes - Active changes to check for overlap
   * @returns An overlap report with entries for each overlapping spec
   */
  function detectSpecOverlap(changes: readonly Change[]): OverlapReport
  ```
- **Responsibility:** Pure computation — builds spec-to-changes index, filters to overlapping specs, sorts entries by specId and changes by name.
- **Relationships:** Depends on `Change` entity, `OverlapReport`, `OverlapEntry`. No ports.

### `DetectOverlap` — application use case

- **Location:** `packages/core/src/application/use-cases/detect-overlap.ts`
- **Shape:**

  ```typescript
  interface DetectOverlapInput {
    readonly name?: string
  }

  /**
   * Detects spec overlap across active changes.
   */
  class DetectOverlap {
    constructor(changes: ChangeRepository)

    /**
     * @param input - Optional filter by change name
     * @returns Overlap report, optionally filtered to the named change
     * @throws ChangeNotFoundError when `input.name` is provided but not found
     */
    async execute(input?: DetectOverlapInput): Promise<OverlapReport>
  }
  ```

- **Responsibility:** Loads changes from repository, calls domain service, applies optional name filter.
- **Relationships:** Depends on `ChangeRepository`. Uses `detectSpecOverlap`.

### `SpecOverlapError` — domain error

- **Location:** `packages/core/src/domain/errors/spec-overlap-error.ts`
- **Shape:**

  ```typescript
  class SpecOverlapError extends SpecdError {
    constructor(entries: readonly OverlapEntry[])

    get entries(): readonly OverlapEntry[]
  }
  ```

- **Responsibility:** Thrown by `ArchiveChange` when overlap is detected and `allowOverlap` is false. Contains the overlap entries for reporting.
- **Relationships:** Extends `SpecdError`. Used by `ArchiveChange`, caught by CLI.

### `createDetectOverlap` — composition factory

- **Location:** `packages/core/src/composition/use-cases/detect-overlap.ts`
- **Shape:**
  ```typescript
  function createDetectOverlap(config: SpecdConfig): DetectOverlap
  function createDetectOverlap(
    context: DetectOverlapContext,
    options: FsDetectOverlapOptions,
  ): DetectOverlap
  ```
- **Responsibility:** Wires `DetectOverlap` with a `ChangeRepository`.
- **Relationships:** Follows `createListChanges` dual-overload pattern.

### `registerChangeOverlap` — CLI command

- **Location:** `packages/cli/src/commands/change/overlap.ts`
- **Shape:**
  ```typescript
  function registerChangeOverlap(parent: Command): void
  ```
- **Responsibility:** Thin CLI adapter for `specd change overlap [<name>]`.

## Approach

1. **Domain value objects** — `OverlapEntry` and `OverlapReport` as immutable value objects. `OverlapChange` as a plain interface.

2. **Domain service** — `detectSpecOverlap` iterates changes, builds `Map<string, OverlapChange[]>`, filters to entries with >1 change, sorts, wraps in `OverlapReport`.

3. **Domain error** — `SpecOverlapError` for the archive gate.

4. **Use case** — `DetectOverlap` loads changes via `list()`, delegates to domain service, applies optional name filter.

5. **Archive gate** — In `ArchiveChange.execute()`, after `assertArchivable()` + transition to `archiving`, before pre-archive hooks:
   - If `allowOverlap` is true → skip check
   - Otherwise: list all active changes, exclude the one being archived, call `detectSpecOverlap` with remaining + current, filter to entries involving current change
   - If overlap found → throw `SpecOverlapError`
   - `ArchiveChange` already has `ChangeRepository` — no new constructor dependency

6. **Kernel wiring** — add `detectOverlap` entry, following `ListChanges` pattern.

7. **CLI command** — `specd change overlap [<name>]` with text/json/toon output.

8. **CLI inline warnings** — after `create` and `edit` succeed, call `detectOverlap` and print warning. After `archive` catches `SpecOverlapError`, suggest `--allow-overlap`.

## Key decisions

**Decision: `OverlapEntry` and `OverlapReport` as value objects, `OverlapChange` as plain interface** — Value objects enforce immutability and expose computed properties. `OverlapChange` is too simple to warrant a class. **Alternatives rejected:** All plain interfaces — would scatter `hasOverlap` logic across consumers.

**Decision: Filter at the use case level, not the domain service** — The domain service computes full overlap. The optional name filter is applied by the use case after detection. **Alternatives rejected:** Filter in domain service — unnecessary complexity for a pure function.

**Decision: Archive overlap gate in the use case, not CLI** — The gate is safety-critical: archiving with overlap can break other in-flight changes. Enforcing it in the use case ensures all consumers (CLI, MCP, API) are protected. **Alternatives rejected:** CLI-only gate — MCP users could bypass it.

**Decision: `allowOverlap` skips the check entirely** — When the flag is set, no overlap detection runs at all (no `list()` call, no `detectSpecOverlap`). This is simpler than running detection and ignoring the result. **Alternatives rejected:** Run detection and log — adds overhead for no benefit when the user explicitly opted in.

**Decision: CLI warnings in create/edit are presentation-only** — The core use cases don't change. The CLI calls `DetectOverlap` after the main operation and shows a warning. **Alternatives rejected:** Adding warnings to `CreateChange`/`EditChange` results — would couple these use cases to overlap detection unnecessarily.

## Trade-offs

**[Performance] Full scan on every archive** — The overlap check calls `list()` on every archive. For projects with many concurrent changes this adds a small overhead. **Mitigation:** `list()` is already used at the same scale by other features; archiving is infrequent.

**[UX] Archive failure requires re-run with flag** — Users who know about the overlap must re-run with `--allow-overlap`. **Mitigation:** The error message explicitly includes the flag name and the overlapping specs, so the fix is immediately clear.

## Testing

### Automated tests

#### Domain service tests

**File:** `packages/core/test/domain/services/detect-spec-overlap.spec.ts`

| Test                                | What it asserts                          |
| ----------------------------------- | ---------------------------------------- |
| Two changes share one spec          | Report has one entry with both changes   |
| Three changes share two specs       | Report has two entries, sorted by specId |
| No overlapping specs                | `hasOverlap` is false, entries empty     |
| Empty input                         | `hasOverlap` is false, entries empty     |
| Single change                       | `hasOverlap` is false, entries empty     |
| Entries sorted by specId            | Alphabetical ordering verified           |
| Changes within entry sorted by name | Alphabetical ordering verified           |

#### Use case tests

**File:** `packages/core/test/application/use-cases/detect-overlap.spec.ts`

| Test                                       | What it asserts                          |
| ------------------------------------------ | ---------------------------------------- |
| Delegates to repository and domain service | Calls `list()`, returns report           |
| Name filter narrows output                 | Only entries containing the named change |
| Named change has no overlap                | Empty report returned                    |
| Named change not found                     | `ChangeNotFoundError` thrown             |
| No name provided                           | Full report returned                     |

#### Archive overlap gate tests

**File:** `packages/core/test/application/use-cases/archive-change.spec.ts` (existing, add new describe block)

| Test                                       | What it asserts                     |
| ------------------------------------------ | ----------------------------------- |
| Overlap detected without flag              | `SpecOverlapError` thrown           |
| Overlap detected with `allowOverlap: true` | Archive proceeds                    |
| No overlap                                 | Archive proceeds without flag       |
| Current change excluded from overlap check | Self-overlap does not trigger error |

#### Kernel integration test

**File:** `packages/core/test/composition/kernel.spec.ts` (existing)

Add assertion that `kernel.changes.detectOverlap` is an instance of `DetectOverlap`.

#### CLI command test

**File:** `packages/cli/test/commands/change/overlap.spec.ts`

| Test                             | What it asserts                           |
| -------------------------------- | ----------------------------------------- |
| Text output with overlap         | Grouped format with spec headers          |
| JSON output with overlap         | Valid JSON matching `OverlapReport` shape |
| No overlap text                  | Prints `no overlap detected`              |
| No overlap JSON                  | `{"hasOverlap":false,"entries":[]}`       |
| Named change not found           | stderr error, exit code 1                 |
| Overlap present with exit code 0 | exit code 0                               |

#### CLI create/edit warning tests

**Files:** `packages/cli/test/commands/change/create.spec.ts`, `packages/cli/test/commands/change/edit.spec.ts` (existing, add tests)

| Test                                     | What it asserts                         |
| ---------------------------------------- | --------------------------------------- |
| Create with overlap shows warning        | Warning printed to stderr after success |
| Create without overlap shows no warning  | No warning printed                      |
| Edit add-spec with overlap shows warning | Warning printed after success           |

#### CLI archive --allow-overlap test

**File:** `packages/cli/test/commands/change/archive.spec.ts` (existing, add tests)

| Test                                | What it asserts                                     |
| ----------------------------------- | --------------------------------------------------- |
| Archive with overlap error          | Error message includes `--allow-overlap` suggestion |
| Archive with `--allow-overlap` flag | Passes `allowOverlap: true` to use case             |

### Manual / E2E verification

1. Create two changes targeting the same spec:
   ```bash
   specd change create test-a --specs core:core/config
   specd change create test-b --specs core:core/config
   ```
   Expected: second create shows overlap warning.
2. Run overlap check:
   ```bash
   specd change overlap
   ```
   Expected: shows `core:core/config` with `test-a` and `test-b`.
3. JSON format:
   ```bash
   specd change overlap --format json
   ```
   Expected: valid JSON with `hasOverlap: true`.
4. Non-existent change:
   ```bash
   specd change overlap nonexistent
   ```
   Expected: error, exit code 1.
5. Archive with overlap (once test changes reach `archivable`):
   ```bash
   specd change archive test-a
   ```
   Expected: `SpecOverlapError`, suggests `--allow-overlap`.
6. Archive with bypass:
   ```bash
   specd change archive test-a --allow-overlap
   ```
   Expected: archive succeeds.

### Linting and documentation

- All new files must pass `pnpm lint`
- JSDoc on all exported functions and classes per `default:_global/docs`
- No updates to `docs/` needed — CLI `--help` text is the primary documentation
