# Tasks: normalize-pre-hash-whitespace

## 1. Domain & Application Implementation

- [x] 1.1 Implement universal whitespace normalization in `applyPreHashCleanup`
      `packages/core/src/domain/services/pre-hash-cleanup.ts`: `applyPreHashCleanup` — execute schema cleanups and return `result.replace(/\s+/g, ' ').trim()`
      Approach: apply regex cleanups first in order, then collapse all consecutive whitespace characters (`\s+`) to `' '` and trim leading/trailing whitespace
      (Req: core:validate-artifacts/Hash computation and markComplete)
- [x] 1.2 Unconditionally invoke `applyPreHashCleanup` in `computeArtifactHash`
      `packages/core/src/application/use-cases/_shared/compute-artifact-hash.ts`: `computeArtifactHash` — remove `cleanups.length > 0` condition
      Approach: always call `applyPreHashCleanup(content, cleanups)` so all artifacts receive whitespace normalization regardless of declared cleanups
      (Req: core:validate-artifacts/Hash computation and markComplete)

## 2. Automated Tests & Fixtures

- [x] 2.1 Unit tests for regex ordering, multiline, CRLF, tabs, and mixed whitespace normalization
      `packages/core/test/domain/services/pre-hash-cleanup.spec.ts`: `describe('applyPreHashCleanup')` — add comprehensive test suite
      Approach: test multiline anchor regex matching, CRLF/LF/CR conversions, tabs, multiple spaces, and trimming
      (Req: core:validate-artifacts/Hash computation and markComplete)
- [x] 2.2 Align test fixtures and validatedHash expectations across use case and repository tests
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`: `sha256` helper — update to use `applyPreHashCleanup`
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`: update mock change fixtures to use `artifactHash` helper
      Approach: ensure test fixtures compute `validatedHash` matching `applyPreHashCleanup` output
      (Req: core:storage/Artifact status derivation)

## 3. Documentation

- [x] 3.1 Update core storage and validation concepts documentation
      `docs/core/use-cases.md`: document post-cleanup whitespace normalization for `validatedHash`
      Approach: explain the two-step pre-hash cleanup pipeline and whitespace invariance
      (Req: default:\_global/docs)
