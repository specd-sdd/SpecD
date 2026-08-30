# Design: start-implementation-tracking

## 1. Context & Motivation

Implementation tracking in specd was previously tied implicitly to the lifecycle transition into `implementing`. There was no explicit CLI command to activate tracking on demand, and tracking state was inferred by inspecting history events rather than checking an explicit persisted field in the change manifest (`manifest.json`).

This change introduces:

1. The explicit `specd changes implementation start <name>` CLI subcommand.
2. The `_implementationTrackingStartedAt` timestamp field on the `Change` domain entity and in `manifest.json`.
3. An explicit mutation action `'start'` in `UpdateImplementationTracking` that routes through the existing mutation engine.
4. Backward compatibility guarantees by automatically setting the tracking flag when transitioning to `implementing` for the first time if not already started.
5. Updates to `RefreshImplementationTracking` and `VcsImplementationDetector` to guard and compute baselines against the explicit tracking timestamp.

All state mutations continue to flow strictly through existing mutation primitives (`UpdateImplementationTracking` and `ChangeRepository.mutate()`), preserving hexagonal architecture and DDD invariants.

---

## 2. Architectural Invariants & Mutation Strategy

- **Hexagonal Architecture (DDD)**:
  - **Domain**: Pure business logic and invariants in `Change` without I/O or external dependencies.
  - **Application**: Orchestration via `UpdateImplementationTracking`, `TransitionChange`, and `RefreshImplementationTracking`.
  - **Infrastructure**: Manifest persistence in `FsChangeRepository`, schema validation in `manifest.ts`, and VCS detection in `VcsImplementationDetector`.
  - **Delivery**: Command registration and formatting in `packages/cli/src/commands/change/implementation.ts`.
- **Unified Mutation Pipeline**: No alternative or bypass mutation pathways. Every mutation to implementation tracking state is executed within a `ChangeRepository.mutate(name, async (change) => { ... })` transactional block.
- **Idempotency**: Activating tracking on a change that is already tracking is a safe no-op that retains the original starting timestamp.
- **Zero Breaking Changes / Backward Compatibility**: Existing changes and legacy manifests without `implementationTrackingStartedAt` will automatically fallback during hydration to the change's historical implementing timestamp if available, or remain inactive until explicitly started or transitioned to `implementing`.

---

## 3. Domain Model Specifications (`@specd/core`)

### 3.1 `packages/core/src/domain/entities/change.ts`

#### `ChangeProps` Interface

Extend `ChangeProps` with:

```typescript
export interface ChangeProps {
  // ... existing fields
  /** Timestamp when implementation tracking commenced, or null/undefined if inactive. */
  readonly implementationTrackingStartedAt?: Date | null
}
```

#### `Change` Class Members

- **Private Field**:
  ```typescript
  private _implementationTrackingStartedAt: Date | null
  ```
- **Constructor Hydration**:
  ```typescript
  if (props.implementationTrackingStartedAt !== undefined) {
    this._implementationTrackingStartedAt =
      props.implementationTrackingStartedAt !== null
        ? new Date(props.implementationTrackingStartedAt.getTime())
        : null
  } else {
    // Backward compatibility: fallback to historical implementing timestamp if present
    this._implementationTrackingStartedAt = this.getHistoricalImplementationAt()
  }
  ```
- **Getters**:

  ```typescript
  /** Timestamp when implementation tracking started, or null if inactive. */
  get implementationTrackingStartedAt(): Date | null {
    return this._implementationTrackingStartedAt !== null
      ? new Date(this._implementationTrackingStartedAt.getTime())
      : null
  }

  /** Whether implementation tracking is currently active for this change. */
  get isImplementationTrackingActive(): boolean {
    return this._implementationTrackingStartedAt !== null
  }
  ```

- **Domain Mutation Method**:
  ```typescript
  /**
   * Activates implementation tracking for this change.
   *
   * If tracking is already active, this call is idempotent and preserves the
   * existing `implementationTrackingStartedAt` timestamp.
   *
   * @param at - The timestamp to record as the start baseline (defaults to now)
   */
  startImplementationTracking(at: Date = new Date()): void {
    if (this._implementationTrackingStartedAt === null) {
      this._implementationTrackingStartedAt = new Date(at.getTime())
      this._touch()
    }
  }
  ```

---

## 4. Manifest Persistence (`manifest.json` & `@specd/core`)

### 4.1 `packages/core/src/infrastructure/fs/manifest.ts`

- **`ChangeManifest` Interface**:
  ```typescript
  export interface ChangeManifest {
    readonly name: string
    readonly createdAt: string
    readonly updatedAt?: string
    readonly schema: { readonly name: string; readonly version: number }
    readonly specIds: readonly string[]
    readonly invalidationPolicy?: InvalidationPolicy
    /** ISO 8601 timestamp when implementation tracking started. */
    readonly implementationTrackingStartedAt?: string | null
    readonly trackedImplementationFiles?: readonly ManifestTrackedImplementationFile[]
    readonly implementationLinks?: readonly ManifestImplementationLink[]
    readonly specDependsOn?: Record<string, readonly string[]>
    readonly artifacts: readonly ManifestArtifact[]
    readonly history: readonly ManifestEvent[]
  }
  ```
- **`changeManifestSchema` (Zod validation)**:
  ```typescript
  export const changeManifestSchema = z.object({
    // ... existing fields
    implementationTrackingStartedAt: z.string().datetime().optional().nullable(),
    // ...
  })
  ```

### 4.2 `packages/core/src/infrastructure/fs/change-repository.ts`

- **`changeToManifest(change: Change): ChangeManifest`**:
  ```typescript
  implementationTrackingStartedAt:
    change.implementationTrackingStartedAt !== null
      ? change.implementationTrackingStartedAt.toISOString()
      : undefined,
  ```
- **`_manifestToChange(manifest: ChangeManifest, dir: string)`**:
  Pass `implementationTrackingStartedAt` to `ChangeProps`:
  ```typescript
  implementationTrackingStartedAt:
    manifest.implementationTrackingStartedAt !== undefined &&
    manifest.implementationTrackingStartedAt !== null
      ? new Date(manifest.implementationTrackingStartedAt)
      : undefined,
  ```

---

## 5. Application Layer Contracts & Use Cases (`@specd/core`)

### 5.1 `packages/core/src/application/use-cases/update-implementation-tracking.ts`

- **Action Type**:
  ```typescript
  export type UpdateImplementationTrackingAction =
    | 'add'
    | 'remove'
    | 'ignore'
    | 'resolve'
    | 'unresolve'
    | 'start'
  ```
- **Input Contract**:
  ```typescript
  export interface UpdateImplementationTrackingInput {
    readonly name: string
    readonly action: UpdateImplementationTrackingAction
    /** Raw project-relative file path. Required for file-based actions; optional for 'start'. */
    readonly file?: string
    readonly files?: readonly string[]
    readonly specId?: string
    readonly symbols?: readonly string[]
  }
  ```
- **Execution Flow in `execute(input)`**:

  ```typescript
  async execute(input: UpdateImplementationTrackingInput): Promise<UpdateImplementationTrackingResult> {
    const { result } = await this._changes.mutate(input.name, async (change) => {
      if (input.action === 'start') {
        change.startImplementationTracking()
        return { implementationTracking: projectImplementationTracking(change) }
      }

      // Existing validation for file-based mutations:
      const rawFiles = input.files === undefined
        ? (input.file !== undefined ? [input.file] : [])
        : [...new Set(input.files)]

      if (rawFiles.length === 0) {
        throw new ImplementationFileNotFoundError('', 'File path required for this action')
      }

      await Promise.all(rawFiles.map(async (file) => this._validateMutation(change, input, file)))

      switch (input.action) {
        case 'add':
          this._applyAdd(change, input)
          break
        case 'remove':
          this._applyRemove(change, input)
          break
        case 'ignore':
          for (const file of rawFiles) this._applyIgnore(change, file)
          break
        case 'resolve':
          for (const file of rawFiles) this._applyResolve(change, file)
          break
        case 'unresolve':
          for (const file of rawFiles) this._applyUnresolve(change, file)
          break
      }

      return { implementationTracking: projectImplementationTracking(change) }
    })

    return result
  }
  ```

### 5.2 `packages/core/src/application/use-cases/transition-change.ts`

In `TransitionChange.execute()`, inside the `_changes.mutate` block where the transition occurs:

```typescript
if (effectiveTarget === 'implementing' && !change.isImplementationTrackingActive) {
  change.startImplementationTracking(new Date())
}
```

### 5.3 `packages/core/src/application/use-cases/refresh-implementation-tracking.ts`

In `RefreshImplementationTracking.execute()`:

```typescript
const { result } = await this._changes.mutate(input.name, async (freshChange) => {
  if (freshChange.isImplementationTrackingActive) {
    const excludePaths = this._collectExclusions()
    const detected = await this._implementationDetector.detectModifiedFiles(freshChange, {
      excludePaths,
    })
    this._mergeCandidates(freshChange, detected)
    await this._existenceSweep(freshChange)
  }
  return { implementationTracking: projectImplementationTracking(freshChange) }
})
```

### 5.4 `packages/core/src/infrastructure/vcs/vcs-implementation-detector.ts`

In `VcsImplementationDetector.detectModifiedFiles(change, options)`:

```typescript
const startedAt = change.implementationTrackingStartedAt
if (startedAt === null) {
  Logger.debug('Skipping implementation detection when tracking is inactive', {
    change: change.name,
  })
  return []
}

const vcs = await this._resolveVcs()
const baseRef = await this._resolveBaseRef(vcs, startedAt)
```

---

## 6. CLI Delivery Layer (`@specd/cli`)

### 6.1 `packages/cli/src/commands/change/implementation.ts`

#### Command Registration

```typescript
command
  .command('start <name>')
  .description('Explicitly activate implementation tracking for a change.')
  .option('--format <fmt>', 'output format: text|json|toon', 'text')
  .option('--config <path>', 'path to specd.yaml')
  .action(async (name: string, opts: { format: string; config?: string }) => {
    await mutateImplementationTracking(name, {
      action: 'start',
      format: opts.format,
      ...(opts.config !== undefined ? { config: opts.config } : {}),
    })
  })
```

#### Output Formatting

In `mutateImplementationTracking()`:

- **`--format text`**:
  ```text
  ✓ Implementation tracking is active for '<name>' (started at <ISO-string>).
  ```
- **`--format toon`**:
  ```toon
  result: ok
  name: <name>
  trackingActive: true
  startedAt: <ISO-string>
  ```
- **`--format json`**:
  ```json
  {
    "result": "ok",
    "name": "start-implementation-tracking",
    "trackingActive": true,
    "startedAt": "2026-08-26T22:00:00.000Z"
  }
  ```

---

## 7. Comprehensive Testing Strategy

### 7.1 Domain Tests (`packages/core/test/domain/entities/change.spec.ts`)

- `isImplementationTrackingActive` is `false` on a newly created `Change`.
- Calling `startImplementationTracking()` sets `isImplementationTrackingActive` to `true` and records `implementationTrackingStartedAt`.
- Subsequent calls to `startImplementationTracking()` retain the original timestamp (idempotency).
- Constructing `Change` without `implementationTrackingStartedAt` but with historical `implementing` transitions sets `implementationTrackingStartedAt` from the historical event.
- Constructing `Change` with explicit `implementationTrackingStartedAt: null` keeps it inactive.

### 7.2 Persistence Tests (`packages/core/test/infrastructure/fs/change-repository.spec.ts`)

- Save and reload a change with active tracking; verify `implementationTrackingStartedAt` is preserved.
- Load a legacy manifest missing `implementationTrackingStartedAt` and verify fallback logic.

### 7.3 Use Case Tests

- `packages/core/test/application/use-cases/update-implementation-tracking.spec.ts`:
  - Execute with `action: 'start'` activates tracking and returns updated projection.
  - Calling `start` on already-started change returns successful result without throwing.
- `packages/core/test/application/use-cases/transition-change.spec.ts`:
  - Transitioning to `implementing` sets `isImplementationTrackingActive = true` when previously `false`.
  - Transitioning to `implementing` preserves existing timestamp when tracking was already started earlier.
- `packages/core/test/application/use-cases/refresh-implementation-tracking.spec.ts`:
  - When `isImplementationTrackingActive = false`, detector is skipped.
  - When `isImplementationTrackingActive = true`, detector runs and merges files.

### 7.4 CLI Tests (`packages/cli/test/commands/change/implementation.spec.ts`)

- Execute `specd changes implementation start <name>` in text and toon formats.
- Verify status reflects active tracking.

---

## 8. Documentation Updates

- Update `docs/cli/cli-reference.md` under `specd changes implementation` to document `start <name>`.
