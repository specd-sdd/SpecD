# Tasks: plugin-manifest-version

## 1. Manifest sync script

- [x] 1.1 Create `dev/scripts/sync-plugin-manifests.ts`
      `dev/scripts/sync-plugin-manifests.ts`: new file
      Approach: script iterates over plugin package directories, reads `package.json#version`, reads `specd-plugin.json`, sets `version` field, writes back. Uses `node:fs/promises` for I/O. Plugin package list: `plugin-agent-claude`, `plugin-agent-copilot`, `plugin-agent-codex`, `plugin-agent-opencode`.
      (Req: Manifest sync script)

## 2. Plugin manager — manifest schema

- [x] 2.1 Add `version` to manifest Zod schema
      `packages/plugin-manager/src/infrastructure/loader/plugin-loader.ts`: `manifestSchema` — add `version: z.string().min(1)` between `name` and `pluginType`
      Approach: add the field to the Zod object, no other changes needed
      (Req: Manifest schema)

- [x] 2.2 Add test for manifest missing version
      `packages/plugin-manager/test/infrastructure/loader/plugin-loader.spec.ts`: new test case
      Approach: create a manifest fixture without `version`, verify `PluginValidationError` is thrown
      (Req: Manifest schema, scenario: Manifest missing version)

- [x] 2.3 Add test for manifest with version
      `packages/plugin-manager/test/infrastructure/loader/plugin-loader.spec.ts`: new test case
      Approach: create a manifest fixture with valid `version`, verify loading succeeds
      (Req: Load workflow, scenario: Package available)

## 3. Plugin agent claude — manifest reading

- [x] 3.1 Update `ClaudeAgentPlugin` constructor to accept `name` and `version`
      `packages/plugin-agent-claude/src/domain/types/claude-plugin.ts`: `ClaudeAgentPlugin` — add `pluginName: string` and `pluginVersion: string` as first two constructor parameters, update `get name()` and `get version()` getters to return them
      Approach: `name` and `version` come from constructor; `type` stays hardcoded as `'agent'`
      (Req: Domain layer)

- [x] 3.2 Update `create()` factory to read manifest
      `packages/plugin-agent-claude/src/index.ts`: `create()` — add `readManifest()` helper that searches for `specd-plugin.json` in own dir then parent, reads it, returns `{ name, version }`. Call `readManifest()` in `create()` and pass results to constructor.
      Approach: use `node:fs/promises.readFile`, `node:url.fileURLToPath`, `node:path.dirname` and `join`. Throw `PluginValidationError` from `@specd/plugin-manager` if manifest not found.
      (Req: Factory export)

- [x] 3.3 Add `specd-plugin.json` to `files` in package.json
      `packages/plugin-agent-claude/package.json`: `files` array — add `"specd-plugin.json"`
      Approach: ensures npm publishes the manifest alongside dist
      (Req: Factory export)

- [x] 3.4 Chain sync script in build script
      `packages/plugin-agent-claude/package.json`: `scripts.build` — prepend `node --import tsx ../../dev/scripts/sync-plugin-manifests.ts && ` before the tsup command
      Approach: ensures manifest version is synced before build runs
      (Req: Factory export)

- [x] 3.5 Add `version` field to `specd-plugin.json`
      `packages/plugin-agent-claude/specd-plugin.json`: add `"version": "0.0.1"`
      Approach: bootstrap the version field so the manifest is valid before the sync script runs
      (Req: Manifest schema)

- [x] 3.6 Add test for manifest-sourced name and version
      `packages/plugin-agent-claude/test/domain/types/claude-plugin.spec.ts`: new test case
      Approach: instantiate `ClaudeAgentPlugin` with name/version via constructor, verify getters return the passed values and `type` is `'agent'`
      (Req: Factory export, scenario: Factory reads manifest for name and version)

## 4. Plugin agent copilot — manifest reading

- [x] 4.1 Update `CopilotAgentPlugin` constructor to accept `name` and `version`
      `packages/plugin-agent-copilot/src/domain/types/copilot-plugin.ts`: `CopilotAgentPlugin` — same pattern as claude
      Approach: add `pluginName` and `pluginVersion` constructor params, update getters
      (Req: Plugin runtime contract)

- [x] 4.2 Update `create()` factory to read manifest
      `packages/plugin-agent-copilot/src/index.ts`: `create()` — same `readManifest()` pattern as claude
      Approach: identical manifest reader, different package name in error
      (Req: Factory export)

- [x] 4.3 Add `specd-plugin.json` to `files` and chain sync in build
      `packages/plugin-agent-copilot/package.json`: `files` + `scripts.build`
      Approach: same as claude
      (Req: Factory export)

- [x] 4.4 Add `version` field to `specd-plugin.json`
      `packages/plugin-agent-copilot/specd-plugin.json`: add `"version": "0.0.1"`
      Approach: bootstrap version field
      (Req: Manifest schema)

- [x] 4.5 Add test for manifest-sourced name and version
      `packages/plugin-agent-copilot/test/domain/types/copilot-plugin.spec.ts`: new test case
      Approach: same pattern as claude test
      (Req: Factory export, scenario: Factory reads manifest for name and version)

## 5. Plugin agent codex — manifest reading

- [x] 5.1 Update `CodexAgentPlugin` constructor to accept `name` and `version`
      `packages/plugin-agent-codex/src/domain/types/codex-plugin.ts`: `CodexAgentPlugin` — same pattern as claude
      Approach: add `pluginName` and `pluginVersion` constructor params, update getters
      (Req: Plugin runtime contract)

- [x] 5.2 Update `create()` factory to read manifest
      `packages/plugin-agent-codex/src/index.ts`: `create()` — same `readManifest()` pattern as claude
      Approach: identical manifest reader, different package name in error
      (Req: Factory export)

- [x] 5.3 Add `specd-plugin.json` to `files` and chain sync in build
      `packages/plugin-agent-codex/package.json`: `files` + `scripts.build`
      Approach: same as claude
      (Req: Factory export)

- [x] 5.4 Add `version` field to `specd-plugin.json`
      `packages/plugin-agent-codex/specd-plugin.json`: add `"version": "0.0.1"`
      Approach: bootstrap version field
      (Req: Manifest schema)

- [x] 5.5 Add test for manifest-sourced name and version
      `packages/plugin-agent-codex/test/domain/types/codex-plugin.spec.ts`: new test case
      Approach: same pattern as claude test
      (Req: Factory export, scenario: Factory reads manifest for name and version)

## 6. Plugin agent opencode — manifest reading

- [x] 6.1 Update `OpenCodeAgentPlugin` constructor to accept `name` and `version`
      `packages/plugin-agent-opencode/src/domain/types/opencode-plugin.ts`: `OpenCodeAgentPlugin` — same pattern as claude
      Approach: add `pluginName` and `pluginVersion` constructor params, update getters
      (Req: Domain layer)

- [x] 6.2 Update `create()` factory to read manifest
      `packages/plugin-agent-opencode/src/index.ts`: `create()` — same `readManifest()` pattern as claude
      Approach: identical manifest reader, different package name in error
      (Req: Factory export)

- [x] 6.3 Add `specd-plugin.json` to `files` and chain sync in build
      `packages/plugin-agent-opencode/package.json`: `files` + `scripts.build`
      Approach: same as claude
      (Req: Factory export)

- [x] 6.4 Add `version` field to `specd-plugin.json`
      `packages/plugin-agent-opencode/specd-plugin.json`: add `"version": "0.0.1"`
      Approach: bootstrap version field
      (Req: Manifest schema)

- [x] 6.5 Add test for manifest-sourced name and version
      `packages/plugin-agent-opencode/test/domain/types/opencode-plugin.spec.ts`: new test case
      Approach: same pattern as claude test
      (Req: Factory export, scenario: Factory reads manifest for name and version)
