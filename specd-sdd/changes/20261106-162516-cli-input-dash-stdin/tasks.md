# Tasks: cli-input-dash-stdin

## 1. Core FileDeleter port

- [ ] 1.1 Add `FileDeleter` port interface
      `packages/core/src/application/ports/file-deleter.ts`: `FileDeleter` — new port with `delete(path): Promise<boolean>`
      Approach: return `true` when deleted, `false` when already absent; do not extend `FileWriter`
      (Req: Delete project-metadata.json)

- [ ] 1.2 Export `FileDeleter` from ports barrel
      `packages/core/src/application/ports/index.ts` (and any public re-export path used by other ports) — export the new interface
      Approach: mirror how `FileWriter` is exported

- [ ] 1.3 Implement `FsFileDeleter`
      `packages/core/src/infrastructure/fs/file-deleter.ts`: `FsFileDeleter` — `fs.unlink` with ENOENT → `false`
      Approach: rethrow non-ENOENT errors; no force-rm of directories
      (Req: Idempotent when absent)

- [ ] 1.4 Unit-test `FsFileDeleter`
      `packages/core/test/infrastructure/fs/file-deleter.spec.ts` — present file / missing file / other error
      Approach: temp filesystem per testing conventions

## 2. Core ClearProjectMetadata

- [ ] 2.1 Implement `ClearProjectMetadata` use case
      `packages/core/src/application/use-cases/clear-project-metadata.ts`: class + `ClearProjectMetadataResult`
      Approach: `join(config.configPath, 'project-metadata.json')` then `_fileDeleter.delete`; return `{ path, cleared }`
      (Req: Delete project-metadata.json, Result contract, Idempotent when absent)

- [ ] 2.2 Add composition factory and deps resolver
      `packages/core/src/composition/use-cases/clear-project-metadata.ts`: `ClearProjectMetadataDeps`, `resolveClearProjectMetadataDeps`, overloaded `createClearProjectMetadata`
      Approach: mirror `update-project-metadata` factory pattern; construct `FsFileDeleter` in resolver
      (Req: Config-based factory through composition resolver)

- [ ] 2.3 Export use case from application / composition barrels
      `packages/core/src/application/use-cases/index.ts`, `packages/core/src/composition/use-cases/index.ts` — export types and factories
      Approach: same style as `UpdateProjectMetadata` exports

- [ ] 2.4 Wire `clearMetadata` on Kernel.project
      `packages/core/src/composition/kernel.ts`: `Kernel['project']` + `buildKernel` wiring
      Approach: `clearMetadata: createClearProjectMetadata(resolveClearProjectMetadataDeps(resolver))`
      (Req: Clear subcommand)

- [ ] 2.5 Re-export from core public / SDK
      `packages/core/src/public.ts`, `packages/sdk/src/core-reexports.ts` — export Clear types/factories as needed by consumers
      Approach: follow existing `UpdateProjectMetadata` export set

- [ ] 2.6 Unit-test `ClearProjectMetadata`
      `packages/core/test/application/use-cases/clear-project-metadata.spec.ts` — delete / idempotent / result shape / factory deps path
      Approach: mock `FileDeleter`; assert path uses `configPath`
      (Req: all ClearProjectMetadata requirements)

## 3. Shared CLI readInput helper

- [ ] 3.1 Add `readInput` helper
      `packages/cli/src/helpers/read-input.ts`: `readInput(path)` — `-` → `readStdin()`, else `readFile`
      Approach: exact shared helper from design; UTF-8
      (Req: Set subcommand)

- [ ] 3.2 Refactor specs optimizations to shared helper
      `packages/cli/src/commands/spec/optimizations.ts` — delete local `readInput`; import shared
      Approach: behavior unchanged; keep `--input <path|->`
      (Req: Set subcommand / shared input convention)

## 4. CLI project optimized-context command

- [ ] 4.1 Implement `registerProjectOptimizedContext`
      `packages/cli/src/commands/project/optimized-context.ts` — group `optimized-context` with `get`/`set`/`clear`
      Approach: Commander nested commands; `.allowExcessArguments(false)` on leaves; `--format`/`--config` everywhere
      (Req: Command signature)

- [ ] 4.2 Implement get handler
      same file: `get` action — `kernel.project.getMetadata.execute()`; absent vs present formatting
      Approach: text prints context or absence; json/toon structured per design
      (Req: Get subcommand)

- [ ] 4.3 Implement set handler
      same file: mutual exclusion `--text`/`--input`; `readInput`; empty guard; `updateMetadata.execute({ payload: { optimizedContext } })`
      Approach: no YAML/JSON envelope; raw string only
      (Req: Set subcommand)

- [ ] 4.4 Implement clear handler
      same file: `kernel.project.clearMetadata.execute()`; format `cleared` true/false
      Approach: success both when deleted and when already absent
      (Req: Clear subcommand)

- [ ] 4.5 Register in program; remove update-metadata
      `packages/cli/src/program.ts` — swap import/call; delete `packages/cli/src/commands/project/update-metadata.ts`
      Approach: no alias for `update-metadata`
      (Req: Command signature; project update-metadata is removed)

- [ ] 4.6 Keep project metadata inspection-only
      `packages/cli/src/commands/project/metadata.ts` — confirm no payload flags; optional help pointer
      Approach: do not add `--input`/`--text`/`--file`
      (Req: Inspection only)

## 5. Skills template

- [ ] 5.1 Update project-context-optimizer template
      `packages/skills/templates/agents/specd-project-context-optimizer/SPECD-AGENT.md.tpl` — command line to `project optimized-context set --text "..."`
      Approach: do not edit `.claude/agents/*`
      (Req: Set subcommand / removed update-metadata)

- [ ] 5.2 Update template workflow test
      `packages/skills/test/template-workflow.spec.ts` — expect new command string
      Approach: replace `project update-metadata --optimized-context` assertion

## 6. CLI / Core tests

- [ ] 6.1 Add CLI command tests for optimized-context
      `packages/cli/test/commands/project-optimized-context.spec.ts` — register group; no update-metadata; set/get/clear cases; reject missing/combined input; mock Kernel + `readStdin`
      Approach: follow `spec-optimizations.spec.ts` patterns
      (Req: all cli:project-optimized-context scenarios)

- [ ] 6.2 Ensure optimizations tests still pass after helper extract
      `packages/cli/test/commands/spec-optimizations.spec.ts` — run/adjust mocks if import path for stdin changes
      Approach: keep `--input -` coverage

## 7. Documentation

- [ ] 7.1 Replace project-update-metadata CLI doc
      `docs/cli/project-update-metadata.md` → `docs/cli/project-optimized-context.md` (or rewrite + rename)
      Approach: document get/set/clear, `--input`/`-`, `--text`; note post-ship `project update` for agents

- [ ] 7.2 Update project CLI index / guide references
      `docs/cli/project.md`, `docs/guide/cli.md`, `docs/cli/cli-reference.md` — remove update-metadata; add optimized-context
      Approach: keep `project metadata` as full dump

- [ ] 7.3 Fix documentation-coverage / help drift
      Any CLI doc-coverage tests failing on old command names — update expected strings
      Approach: run package tests after docs change

## 8. Manual verification

- [ ] 8.1 Manual E2E smoke of get/set/clear
      Local CLI against a temp or this repo — commands from design Testing section
      Approach: set --text; get; metadata dump; set --input -; clear twice; `project --help` has no update-metadata
