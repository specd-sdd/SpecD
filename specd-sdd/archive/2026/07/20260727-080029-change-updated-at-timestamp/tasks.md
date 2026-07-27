# Tasks: change-updated-at-timestamp

## 1. Domain Layer (`@specd/core`)

- [x] 1.1 Add `updatedAt` tracking and invariants to `Change` entity
      `packages/core/src/domain/entities/change.ts`: `Change` class
      Approach: Add `_updatedAt: Date` property, default `updatedAt` to `createdAt` if omitted, validate `updatedAt >= createdAt`, expose `get updatedAt(): Date`, and add `touchUpdatedAt(at: Date = new Date())`.
      (Req: Revision timestamp)

- [x] 1.2 Add unit tests for `Change` entity `updatedAt`
      `packages/core/test/domain/entities/change.spec.ts`: `Change` describe block
      Approach: Test default fallback to `createdAt`, rejection when `updatedAt < createdAt`, default zero-arg `touchUpdatedAt()`, and explicit timestamp mutation via `touchUpdatedAt(date)`.
      (Req: Revision timestamp)

## 2. Infrastructure Layer (`@specd/core`)

- [x] 2.1 Update Zod manifest schema for `updatedAt`
      `packages/core/src/infrastructure/fs/manifest.ts`: `ChangeManifest` schema
      Approach: Add `updatedAt: z.string().optional()` to Zod schema definition and `ChangeManifest` interface.
      (Req: Manifest structure)

- [x] 2.2 Add `updatedAt` serialization, `touchUpdatedAt()` call on save, and legacy fallback derivation
      `packages/core/src/infrastructure/fs/change-repository.ts`: `FsChangeRepository`
      Approach: Call `change.touchUpdatedAt()` and serialize `updatedAt: change.updatedAt.toISOString()` in `save()`. Implement `deriveManifestUpdatedAt(manifest)` calculating `max(at)` over `createdAt` and history events as fallback for legacy manifests.
      (Req: Revision timestamp serialization and backward compatibility)

- [x] 2.3 Add repository unit tests for `updatedAt` persistence & fallback
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`: `FsChangeRepository` tests
      Approach: Assert `manifest.json` persists `updatedAt` on `save()`, advances timestamp on update, and legacy manifest loading computes correct fallback `updatedAt`.
      (Req: Revision timestamp serialization and backward compatibility)

## 3. Application Use Cases (`@specd/core`)

- [x] 3.1 Update `save-change-artifact` return payload with `updatedAt`
      `packages/core/src/application/use-cases/save-change-artifact.ts`: `SaveChangeArtifact`
      Approach: Return `updatedAt: change.updatedAt.toISOString()` in `SaveChangeArtifactResult`.
      (Req: Revision timestamp)

- [x] 3.2 Update `GetStatus` use case for conditional status revision checks
      `packages/core/src/application/use-cases/get-status.ts`: `GetStatus`
      Approach: Add optional `ifModifiedSince?: string` to `GetStatusInput`, `unchanged?: boolean` to `GetStatusResult`, and compare client revision against `change.updatedAt.getTime()` to bypass full status computation when unchanged.
      (Req: Revision evaluation for conditional status queries)

- [x] 3.3 Add use case unit tests for `save-change-artifact` and `get-status`
      `packages/core/test/application/use-cases/save-change-artifact.spec.ts` & `packages/core/test/application/use-cases/get-status.spec.ts`
      Approach: Test ISO string return on save and early exit with `unchanged: true` when revision matches `updatedAt`.
      (Req: Revision evaluation for conditional status queries)

## 4. Compliance follow-up (304 contract + coverage gaps)

- [x] 4.1 Add isolated schema test for manifest `updatedAt`
      `packages/core/test/infrastructure/fs/change-repository.spec.ts` or adjacent manifest schema test
      Approach: `changeManifestSchema.safeParse` (or equivalent schema entry point used by the repository) with a valid manifest that includes `updatedAt` ISO string; assert success. Covers verify scenario “Valid manifest containing updatedAt” in isolation from persist/load.
      (Req: Manifest structure / Valid manifest containing updatedAt)

- [x] 4.2 Add `GetStatus` test when `ifModifiedSince` exceeds `updatedAt`
      `packages/core/test/application/use-cases/get-status.spec.ts`: `ifModifiedSince revision checks`
      Approach: Call `execute` with `ifModifiedSince` strictly later than `updatedAt`; assert `unchanged: true`, empty `artifactStatuses`, and refresh not invoked. Keep existing match + older cases.
      (Req: Revision evaluation — Revision exceeds updatedAt)

## 5. Compliance follow-up (stub asserts + unparseable path)

- [x] 5.1 Strengthen short-circuit assertions for match and exceeds
      `packages/core/test/application/use-cases/get-status.spec.ts`: `ifModifiedSince revision checks`
      Approach: On both match and exceeds cases, also assert result includes loaded `change` and `specDependsOn`, `blockers` is `[]`, and `review.required` is `false`.
      (Req: Revision evaluation — match/exceeds stub payload)

- [x] 5.2 Add `GetStatus` test for unparseable `ifModifiedSince`
      `packages/core/test/application/use-cases/get-status.spec.ts`: `ifModifiedSince revision checks`
      Approach: Call `execute` with a non-parseable `ifModifiedSince` string; assert `unchanged` is not `true` and full status evaluation runs (non-empty `artifactStatuses`).
      (Req: Revision evaluation — Unparseable ifModifiedSince evaluates full status)
