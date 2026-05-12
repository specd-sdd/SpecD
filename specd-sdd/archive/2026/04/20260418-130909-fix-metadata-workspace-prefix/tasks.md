# Tasks: fix-metadata-workspace-prefix

## 1. Fix metadata path construction

- [x] 1.1 Modify `_metadataFilePath()` to include workspace name
      `packages/core/src/infrastructure/fs/spec-repository.ts`:
      `_metadataFilePath()` at line 434 — add workspace name to path
      Approach: change `return path.join(this._metadataPath, name.toFsPath(path.sep), 'metadata.json')`
      to `return path.join(this._metadataPath, this.workspace(), name.toFsPath(path.sep), 'metadata.json')`
      (Req: File location and naming)

## 2. Tests

- [x] 2.1 Add unit test for metadata path with workspace
      `packages/core/test/infrastructure/fs/spec-repository.spec.ts`:
      new test case — verify metadata path includes workspace name
      Approach: create a mock workspace with name "skills" (no prefix), call metadata path construction,
      assert the path is `.specd/metadata/skills/get-skill/metadata.json`
      (Req: File location and naming, scenario: Workspace without prefix stores metadata correctly)

- [x] 2.2 Add unit test for metadata path with prefix
      `packages/core/test/infrastructure/fs/spec-repository.spec.ts`:
      new test case — verify metadata path includes workspace AND prefix
      Approach: create a mock workspace "core" with prefix "core", call metadata path construction,
      assert the path is `.specd/metadata/core/core/config/metadata.json`
      (Req: File location and naming, scenario: Workspace with prefix stores metadata correctly)

## 3. Verification

- [x] 3.1 Run manual verification
      Approach: run `specd spec generate-metadata --all --write --force` and verify: - `.specd/metadata/skills/get-skill/metadata.json` exists (was `.specd/metadata/get-skill/metadata.json`) - `.specd/metadata/plugin-manager/agent-plugin-type/metadata.json` exists
      (Req: File location and naming, scenario: Workspace without prefix stores metadata correctly)
