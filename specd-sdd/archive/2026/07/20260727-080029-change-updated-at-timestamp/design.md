# Design: change-updated-at-timestamp

## Overview

This design details the addition of `updatedAt` tracking across domain entities, file-system repositories, manifest schemas, and use cases in `@specd/core`, adapting the contract and implementation pattern proven in the `feat/user-interface` reference worktree directly into `main`.

## Architecture & Detailed Design Contracts

### 1. Domain Layer (`packages/core/src/domain/entities/change.ts`)

- **Interface `ChangeProps`**:
  - Add optional `readonly updatedAt?: Date` to `ChangeProps`.
- **Class `Change`**:
  - Internal state: `private _updatedAt: Date`.
  - Construction logic:
    ```typescript
    const updatedAt = props.updatedAt ?? props.createdAt
    if (updatedAt.getTime() < this._createdAt.getTime()) {
      throw new InvalidChangeError('updatedAt must not be before createdAt')
    }
    this._updatedAt = new Date(updatedAt.getTime())
    ```
  - Immutable Getter:
    ```typescript
    get updatedAt(): Date {
      return new Date(this._updatedAt.getTime())
    }
    ```
  - Mutator Method (optional parameter with default `new Date()`):
    ```typescript
    touchUpdatedAt(at: Date = new Date()): void {
      if (at.getTime() < this._createdAt.getTime()) {
        throw new InvalidChangeError('updatedAt must not be before createdAt')
      }
      this._updatedAt = new Date(at.getTime())
    }
    ```

### 2. Infrastructure Layer (`packages/core/src/infrastructure/fs/`)

- **Zod Manifest Schema (`manifest.ts`)**:
  - `changeManifestSchema`: add `updatedAt: z.string().optional()`.
  - `ChangeManifest` interface: add `readonly updatedAt?: string`.
- **Repository (`change-repository.ts`)**:
  - **Save Path**: In `FsChangeRepository.save(change)`:
    - Invoke `change.touchUpdatedAt()` (without arguments, using default `new Date()`) prior to serialization.
    - Write `updatedAt: change.updatedAt.toISOString()` into `manifest.json`.
  - **Load Path & Legacy Fallback Derivation**:
    - Add helper `deriveManifestUpdatedAt(manifest: ChangeManifest): Date`:
      ```typescript
      function deriveManifestUpdatedAt(manifest: ChangeManifest): Date {
        if (manifest.updatedAt !== undefined) {
          return new Date(manifest.updatedAt)
        }
        let max = new Date(manifest.createdAt).getTime()
        for (const event of manifest.history) {
          const at = new Date(event.at).getTime()
          if (at > max) max = at
        }
        return new Date(max)
      }
      ```
    - In `get(name)` when instantiating `Change`: pass `updatedAt: deriveManifestUpdatedAt(manifest)`.

### 3. Application Layer Use Cases (`packages/core/src/application/use-cases/`)

- **`SaveChangeArtifact` (`save-change-artifact.ts`)**:
  - Result DTO interface `SaveChangeArtifactResult`: add `readonly updatedAt: string`.
  - In `execute()`: after saving the artifact via repository, retrieve the updated `change` entity and include `updatedAt: change.updatedAt.toISOString()` in the returned payload.
- **`GetStatus` (`get-status.ts`)**:
  - Input DTO interface `GetStatusInput`: add `readonly ifModifiedSince?: string`.
  - Result DTO interface `GetStatusResult`: add `readonly unchanged?: boolean`.
  - In `execute(input)`, after loading an active change, apply an HTTP-304-style short-circuit:

    ```typescript
    if (input.ifModifiedSince !== undefined) {
      const clientRevision = Date.parse(input.ifModifiedSince)
      if (!Number.isNaN(clientRevision) && clientRevision >= change.updatedAt.getTime()) {
        return this._buildUnchangedResult(change)
      }
    }
    ```

  - `_buildUnchangedResult(change)` MUST:
    - set `unchanged: true`
    - return `artifactStatuses: []` (full projection intentionally omitted)
    - return empty `blockers` and a minimal review stub (`required: false`)
    - still include the loaded `change` and `specDependsOn`
    - MUST NOT call `RefreshImplementationTracking`
  - When `ifModifiedSince` is omitted, unparseable, or strictly older than `updatedAt`, continue the normal full evaluation path (including optional refresh).

## Technical Decisions & Tradeoffs

- **HTTP-304-style status short-circuit**: When `ifModifiedSince >= updatedAt`, return a stub (`unchanged: true`, empty `artifactStatuses`) instead of recomputing full status. Clients that care about freshness only need the flag; clients that need projection data must omit `ifModifiedSince` or send an older revision.
- **Explicit Contract Precision**: Full DTO property signatures and helper implementations are explicitly specified in this contract to ensure zero ambiguity during implementation.
- **Optional `touchUpdatedAt` Parameter**: `at` is optional in `touchUpdatedAt(at: Date = new Date())`. Calling `change.touchUpdatedAt()` without arguments sets `updatedAt` to `new Date()`, making caller usage straightforward while still allowing explicit timestamps in tests or specific use cases.
- **Immutable State Guards**: All getter methods instantiate new `Date` objects from internal milliseconds to guarantee encapsulation.
- **Automatic Persistence Touch**: Mutating `updatedAt` on `FsChangeRepository` persist paths ensures that any persistence event implicitly updates the manifest timestamp clock without relying on call sites to remember to touch state manually.

## Testing Plan

1. **Unit Tests (`change.spec.ts`)**:
   - Verify default `updatedAt` equals `createdAt`.
   - Verify `InvalidChangeError` is thrown when `updatedAt < createdAt`.
   - Verify `touchUpdatedAt()` without arguments sets `updatedAt` to current date/time.
   - Verify `touchUpdatedAt(explicitDate)` sets `updatedAt` to `explicitDate` and throws if earlier than `createdAt`.
2. **Manifest schema tests (`manifest` / change-repository schema path)**:
   - Verify `changeManifestSchema.safeParse` succeeds for a valid manifest that includes `updatedAt` as an ISO string (isolated schema coverage for “Valid manifest containing updatedAt”).
3. **Repository Integration Tests (`change-repository.spec.ts`)**:
   - Verify persist writes `updatedAt` to `manifest.json` and advances the timestamp.
   - Verify loading a legacy manifest without `updatedAt` calculates the max history timestamp via `deriveManifestUpdatedAt`.
4. **Use Case Tests (`save-change-artifact.spec.ts` & `get-status.spec.ts`)**:
   - Verify `SaveChangeArtifact` returns `updatedAt` ISO string.
   - Verify `GetStatus` short-circuits with `unchanged: true`, empty `artifactStatuses`, no refresh, loaded `change`/`specDependsOn`, empty `blockers`, and `review.required === false` when `ifModifiedSince` **matches** `updatedAt`.
   - Verify the same short-circuit when `ifModifiedSince` **exceeds** `updatedAt`.
   - Verify full evaluation when `ifModifiedSince` is older than `updatedAt`.
   - Verify full evaluation when `ifModifiedSince` is unparseable (`Date.parse` → `NaN`).
