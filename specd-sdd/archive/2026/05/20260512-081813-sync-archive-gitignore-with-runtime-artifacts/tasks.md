# Tasks: sync-archive-gitignore-with-runtime-artifacts

## 1. Archive runtime ownership

- [x] 1.1 Add archive-local gitignore helper to `FsArchiveRepository`
      `packages/core/src/infrastructure/fs/archive-repository.ts`: `FsArchiveRepository._ensureArchiveRuntimeGitignore()` — create the private runtime helper that owns archive-local ignore hygiene for `.specd-index.jsonl` and `.staging`.
      Approach: add an idempotent private helper plus a local append-if-missing helper so repeated runtime calls preserve stable file content without duplicate lines.
      (Req: Archive runtime ignore hygiene, fs implementation maintains archive runtime ignore rules)
- [x] 1.2 Invoke runtime helper from archive creation and rebuild paths
      `packages/core/src/infrastructure/fs/archive-repository.ts`: `archive()`, `reindex()` — ensure committed archive creation and archive index rebuild both call the runtime gitignore helper before exposing maintained archive state.
      Approach: keep the helper private to `FsArchiveRepository` and wire it into the exact runtime paths agreed in design so ownership does not leak back into bootstrap code.
      (Req: Archive runtime ignore hygiene, fs implementation maintains archive runtime ignore rules)
- [x] 1.3 Cover recovery and append maintenance through the shared append path
      `packages/core/src/infrastructure/fs/archive-repository.ts`: `_appendIndex()` — ensure runtime index recovery or append behavior also preserves archive-local ignore rules.
      Approach: attach the guarantee to `_appendIndex()` so normal archive append and recovery append share the same idempotent behavior.
      (Req: Archive runtime ignore hygiene, fs implementation maintains archive runtime ignore rules)

## 2. Init bootstrap cleanup

- [x] 2.1 Remove archive-local ignore bootstrap from config writer
      `packages/core/src/infrastructure/fs/config-writer.ts`: `FsConfigWriter.initProject()` — stop writing `archive/.gitignore` for `.specd-index.jsonl` during init while preserving archive directory creation and project `.gitignore` updates.
      Approach: delete only the archive-local ignore side effect; leave directory creation and `specd.local.yaml` behavior unchanged.
      (Req: Side effects performed by the port)
- [x] 2.2 Verify init-project orchestration still matches the narrowed contract
      `packages/core/src/application/use-cases/init-project.ts` and composition callers — confirm no orchestration code or assumptions still depend on archive-local ignore creation.
      Approach: treat this as a contract check rather than a behavioral rewrite; only adjust code if an init-specific assumption remains after removing the config-writer side effect.
      (Req: Delegates entirely to ConfigWriter, Side effects performed by the port)

## 3. Automated coverage

- [x] 3.1 Add archive repository tests for runtime gitignore creation and repair
      `packages/core/test/infrastructure/fs/archive-repository.spec.ts`: new archive repository scenarios — prove `archive()`, `reindex()`, and recovery or append paths create or repair `archive/.gitignore` with `.specd-index.jsonl` and `.staging`.
      Approach: use temporary archive fixtures with missing or incomplete `.gitignore`, then assert both entries exist exactly once after each runtime path.
      (Req: Archive runtime ignore hygiene, fs implementation maintains archive runtime ignore rules)
- [x] 3.2 Update config-writer tests for removed archive-local side effect
      `packages/core/test/infrastructure/fs/config-writer.spec.ts`: existing init assertions — remove expectations that init creates `archive/.gitignore` and keep coverage for storage directory creation and project `.gitignore` updates.
      Approach: narrow assertions instead of replacing the whole test shape so the change stays focused on the removed side effect.
      (Req: Side effects performed by the port)
- [x] 3.3 Update init-project use-case tests for the new bootstrap boundary
      `packages/core/test/application/use-cases/init-project.spec.ts`: init-project scenarios — align orchestration-level expectations with the updated config-writer responsibility.
      Approach: keep `InitProject` as a pass-through to the port and update only the assertions affected by archive-local ignore ownership moving to runtime storage.
      (Req: Delegates entirely to ConfigWriter, Side effects performed by the port)

## 4. Verification and documentation checks

- [x] 4.1 Run targeted verification for archive repository and init bootstrap behavior
      `packages/core/test/infrastructure/fs/archive-repository.spec.ts`, `packages/core/test/infrastructure/fs/config-writer.spec.ts`, `packages/core/test/application/use-cases/init-project.spec.ts` — execute the targeted tests that map directly to the updated verify scenarios.
      Approach: use the verify-to-test mapping from design.md so every changed requirement and scenario has executable coverage before implementation is considered complete.
      (Req: Archive runtime ignore hygiene, Side effects performed by the port, fs implementation maintains archive runtime ignore rules)
- [x] 4.2 Confirm docs and JSDoc obligations after implementation
      `packages/core/src/infrastructure/fs/archive-repository.ts`, `packages/core/src/infrastructure/fs/config-writer.ts`, and any touched docs under `docs/` if public references are found — ensure new helpers have JSDoc and update docs only if a public-facing reference actually exists.
      Approach: treat docs updates as conditional; no `docs/` edit is expected unless implementation uncovers a published init or archive-storage description that would otherwise go stale.
      (Req: Storage debug logging, Side effects performed by the port)
