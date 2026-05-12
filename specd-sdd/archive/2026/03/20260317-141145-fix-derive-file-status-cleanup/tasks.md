# Tasks: Fix \_deriveFileStatus to apply preHashCleanup

## 1. Core fix

- [x] 1.1 Add imports for PreHashCleanup and safeRegex
      `packages/core/src/infrastructure/fs/change-repository.ts`:
      Import `PreHashCleanup` from `../../domain/value-objects/validation-rule.js` and `safeRegex` from `../../domain/services/safe-regex.js`
      (Req: Artifact status derivation — cleaned hash)

- [x] 1.2 Add preHashCleanup parameter to \_deriveFileStatus
      `packages/core/src/infrastructure/fs/change-repository.ts`:
      `_deriveFileStatus` — add 4th parameter `preHashCleanup: readonly PreHashCleanup[]`, apply cleanup loop before `sha256(content)` at line 725
      (Req: Artifact status derivation — step 3 "cleaned hash")

- [x] 1.3 Thread preHashCleanup through \_manifestToChange call sites
      `packages/core/src/infrastructure/fs/change-repository.ts`:
      `_manifestToChange` — pass `artType?.preHashCleanup ?? []` to all 4 `_deriveFileStatus` calls (lines 537, 548, 614, 628)
      (Req: Artifact status derivation — cleaned hash)

## 2. Tests

- [x] 2.1 Test preHashCleanup-normalized edit preserves complete status
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`:
      new test — artifact with checkbox cleanup rule, file changes `- [x]` → `- [x]`, status stays `complete`
      (Verify: preHashCleanup normalized edit preserves complete status)

- [x] 2.2 Test non-normalized edit triggers in-progress
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`:
      new test — same cleanup rule, but file adds new content, status becomes `in-progress`
      (Verify: Non-normalized edit still triggers in-progress)

- [x] 2.3 Test no preHashCleanup rules hashes raw content
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`:
      new test — artifact type with empty preHashCleanup, verify raw hash comparison works (existing behaviour)
      (Verify: No preHashCleanup rules hashes raw content)
