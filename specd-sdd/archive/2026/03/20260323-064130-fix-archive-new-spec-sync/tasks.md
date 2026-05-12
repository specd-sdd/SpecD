# Tasks: fix-archive-new-spec-sync

## 1. Fix archive delta fallback

- [x] 1.1 Extract \_copyPrimaryFile private method and restructure delta branch
      `packages/core/src/application/use-cases/archive-change.ts`: extract shared copy logic to `_copyPrimaryFile`, restructure delta branch to `if (deltaFile !== null) { merge } else { _copyPrimaryFile }`, update non-delta branch to use `_copyPrimaryFile`

## 2. Tests

- [x] 2.1 Test new spec with delta:true artifact copies primary file
      `packages/core/test/application/use-cases/archive-change.spec.ts`: add test for new spec fallback

- [x] 2.2 Test delta file takes precedence over primary file
      `packages/core/test/application/use-cases/archive-change.spec.ts`: add test confirming delta merge is used when delta file exists
