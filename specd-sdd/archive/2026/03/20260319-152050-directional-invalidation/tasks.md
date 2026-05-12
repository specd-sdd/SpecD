# Tasks: Directional artifact invalidation

## 1. Domain layer

- [x] 1.1 Add `_downstreamClosure()` private method to `Change`
      `packages/core/src/domain/entities/change.ts` —
      compute transitive downstream closure from a seed set using `requires`
      (Req: Artifacts — rollback is selective)

- [x] 1.2 Modify `invalidate()` to accept optional `driftedArtifactIds`
      `packages/core/src/domain/entities/change.ts`: `invalidate()` (line 406) —
      when provided, only reset artifacts in `_downstreamClosure(driftedArtifactIds)`;
      when not provided, reset all (backward compat)
      (Req: Artifacts — rollback is selective)

## 2. Infrastructure layer

- [x] 2.1 Collect drifted artifact IDs in auto-invalidation
      `packages/core/src/infrastructure/fs/change-repository.ts` (lines 672–699) —
      replace boolean `drifted` with `driftedIds: Set<string>`, collect type IDs,
      pass to `change.invalidate()` as third argument
      (Req: Auto-invalidation on get when artifact files drift)

## 3. Application layer

- [x] 3.1 Collect drifted artifact IDs in approval invalidation
      `packages/core/src/application/use-cases/validate-artifacts.ts` (lines 184–221) —
      collect type IDs with hash mismatches, pass to `change.invalidate()` as third argument
      (Req: Approval invalidation on content change)

## 4. Tests

- [x] 4.1 Add entity tests for selective invalidation
      `packages/core/test/domain/entities/change.spec.ts` —
      test downstream-only reset, upstream intact, backward compat fallback

- [x] 4.2 Update repository tests for drifted IDs
      `packages/core/test/infrastructure/fs/change-repository.spec.ts` —
      verify drifted IDs are passed and only downstream reset

- [x] 4.3 Update validate-artifacts tests for drifted IDs
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts` —
      verify drifted IDs are passed to `invalidate()`

## 5. Build and verify

- [x] 5.1 Build and run full core test suite
      `pnpm build && pnpm --filter @specd/core test`

## 6. Manual verification

- [x] 6.1 Verify selective invalidation via CLI
      Create a change, validate all, modify `tasks.md`, reload status — only `tasks`
      should be reset, upstream remains `complete`
