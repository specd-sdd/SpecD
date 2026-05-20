# Tasks: config-cascade-variants

## 1. Config model and contracts

- [x] 1.1 Extend config types for cascade metadata and removals
      `packages/core/src/application/specd-config.ts`: `SpecdContextEntry`, `SpecdConfig`, and new removal helper types — add optional `id` on context entries and define normalized removal shapes used by the loader.
      Approach: keep the public kernel-facing config stable; add only the minimum exposed fields needed for `context.id` and deterministic removal, as described in `SpecdConfigRemoval` from the design.
      (Req: Cascade identity and removal model, Project context instructions)

- [x] 1.2 Update loader port comments to match layered semantics
      `packages/core/src/application/ports/config-loader.ts`: `ConfigLoader` docs — describe layered discovery, active-chain resolution, and closed-chain forced mode.
      Approach: refresh contract comments only; do not change the port signature, so callers continue using `load()` and `resolvePath()` unchanged.
      (Req: Config file location and format, Forced mode)

- [x] 1.3 Update config-writer port comments for broader gitignore behavior
      `packages/core/src/application/ports/config-writer.ts`: `ConfigWriter.initProject` docs — require both `specd.local.yaml` and `specd.local.*.yaml` gitignore entries.
      Approach: keep the interface shape unchanged; only broaden the documented init side effects.
      (Req: InitProject behaviour, Side effects performed by the port)

## 2. Cascade resolution in the loader

- [x] 2.1 Add raw schema support for `extends`, `remove`, and `context.id`
      `packages/core/src/infrastructure/fs/config-loader.ts`: raw Zod schemas and parse helpers — accept `extends: true | string`, structural `remove`, and context entries with optional `id`.
      Approach: extend the raw parsing layer first so every cascade error still exits through `ConfigValidationError` before path resolution builds the final config.
      (Req: Cascade identity and removal model, Project context instructions)

- [x] 2.2 Replace single-file discovery with ordered candidate collection
      `packages/core/src/infrastructure/fs/config-loader.ts`: replace `findConfigFile()` with candidate discovery that collects `specd.yaml`, `specd.*.yaml`, `specd.local.yaml`, and `specd.local.*.yaml` in the required order.
      Approach: split the current helper into "find nearest directory with candidates" and "collect ordered candidates from that directory" so walk-up and per-directory ordering stay testable.
      (Req: Config file location and format, Discovery mode)

- [x] 2.3 Implement active-chain resolution for normal and forced modes
      `packages/core/src/infrastructure/fs/config-loader.ts`: new `ConfigCascadeLayer` / `ResolvedConfigCascade` helpers plus `load()` / `resolvePath()` integration — attach `extends: true` to the previous active layer, attach `extends: <path>` only when its base is active, and resolve forced mode as a closed chain.
      Approach: model layers explicitly and share one resolver between `load()` and `resolvePath()`; `resolvePath()` should return the active root config path, not a later overlay.
      (Req: Config file location and format, Local config override, Cascade identity and removal model, Path probe, Discovery mode, Forced mode)

- [x] 2.4 Implement layer merge and structural removal semantics
      `packages/core/src/infrastructure/fs/config-loader.ts`: merge helpers used by `load()` — deep-merge objects, append arrays, apply `remove.root`, keyed-map removals, and array removals by local identity.
      Approach: keep merge logic local to the loader; apply each layer in order and run removals immediately after merging that layer so standalone roots can reset prior state cleanly.
      (Req: Local config override, Cascade identity and removal model, Layer merge semantics)

- [x] 2.5 Enforce cascade-specific validation failures as `ConfigValidationError`
      `packages/core/src/infrastructure/fs/config-loader.ts`: validation branch in `load()` — reject `remove` without `extends`, invalid `extends` forms, explicit bases outside the active chain, required-root removal, unknown map keys, and unresolved array removals.
      Approach: perform structural Zod validation first, then do inheritance-aware validation once the active base is known; convert every failure to `ConfigValidationError` so it remains on the `SpecdError` path.
      (Req: Startup validation, All errors are ConfigValidationError)

- [x] 2.6 Preserve final path/defaulting behavior after cascade resolution
      `packages/core/src/infrastructure/fs/config-loader.ts`: resolved path/defaulting branch — keep `projectRoot`, workspace defaults, storage containment, approvals defaults, and plugin/context mapping correct after the merged raw config is finalized.
      Approach: reuse the current normalization pipeline after cascade merge rather than duplicating it; the only semantic change is the source raw config object.
      (Req: Path resolution relative to config directory, Storage path containment, isExternal inference for workspaces, Default values for workspace fields, Approvals default to false, Workflow and context entry mapping)

## 3. Init, writer, and documentation

- [x] 3.1 Generalize gitignore writing for multiple local entries
      `packages/core/src/infrastructure/fs/config-writer.ts`: `FsConfigWriter.initProject()` and helper replacement for `appendToGitignore()` — register both local gitignore entries idempotently.
      Approach: replace the single-entry helper call with `appendGitignoreEntries()` so one init flow can append multiple lines without duplication.
      (Req: Local config override, InitProject behaviour, Side effects performed by the port)

- [x] 3.2 Keep `InitProject` use case behavior aligned with the widened port contract
      `packages/core/src/application/use-cases/init-project.ts`: `execute()` — preserve thin delegation while ensuring returned expectations still match the broadened `ConfigWriter` side effects.
      Approach: no new business logic; verify delegation remains a straight pass-through after the writer changes.
      (Req: Delegates entirely to ConfigWriter, Throws AlreadyInitialisedError when config exists, Returns InitProjectResult on success)

- [x] 3.3 Update user-facing config documentation
      `docs/adr/0012-config-file-strategy.md` or the nearest config docs under `docs/`: explain layered discovery order, `extends: true`, `extends: <path>`, closed-chain `--config`, and gitignored local variants.
      Approach: document the final runtime model, not intermediate alternatives; keep examples aligned with the proposal/spec wording.
      (Req: Config file location and format, Local config override)

## 4. Tests and verification

- [x] 4.1 Rewrite loader integration tests around cascade behavior
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`: `FsConfigLoader` discovery/forced-mode suites — replace exclusive-local assertions with chain resolution, standalone fallback, explicit-base skip/attach, scalar/object/array merge, and removal validation cases.
      Approach: preserve the current temp-repo style but add focused fixtures per scenario so each verify requirement maps cleanly to one describe/it block.
      (Req: Config file location and format, Local config override, Cascade identity and removal model, Startup validation, Path probe, Discovery mode, Forced mode, Layer merge semantics, All errors are ConfigValidationError)

- [x] 4.2 Extend compile-context coverage for `context.id`
      `packages/core/test/application/use-cases/compile-context.spec.ts`: context-entry scenarios — prove `id` is accepted without changing emitted context content or ordering.
      Approach: reuse existing context-entry fixtures and add one id-bearing variant, asserting output stays identical aside from internal identity availability.
      (Req: Project context instructions)

- [x] 4.3 Extend init/config-writer tests for local variant gitignore behavior
      `packages/core/test/infrastructure/fs/config-writer.spec.ts` and `packages/core/test/application/use-cases/init-project.spec.ts`: init side-effect tests — assert both gitignore entries are written and not duplicated across reruns.
      Approach: keep one infrastructure assertion for file contents and one use-case assertion for delegation/contract-level expectations.
      (Req: InitProject behaviour, Side effects performed by the port)

- [x] 4.4 Run end-to-end manual verification of both discovery modes
      temp repo fixture + `node packages/cli/dist/index.js` commands: manual validation of normal discovery, explicit closed-chain `--config`, standalone local fallback, and invalid cascade errors.
      Approach: create one temp repo with shared, local, named, and explicit-base variant files; exercise `config show`, `project status`, and a kernel-loading command to confirm the full behavior outside unit tests.
      (Req: Config file location and format, Local config override, Forced mode, Startup validation)

## 5. Audit-gap fixes

- [x] 5.1 Add forced-mode missing-extends-target tests
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`: scenarios for forced mode `extends: <path>` where target does not exist, forced mode `extends: true` where no previous candidate exists, forced mode walks `extends: true` backwards through candidates, forced mode with mixed explicit + `extends: true` chain, and circular extends chain detection.
      (Req: Forced mode, All errors are ConfigValidationError)

- [x] 5.2 Add init-project use-case AlreadyInitialisedError propagation test
      `packages/core/test/application/use-cases/init-project.spec.ts`: mock port to throw `AlreadyInitialisedError`, assert `execute` propagates it.
      (Req: Throws AlreadyInitialisedError when config exists)

- [x] 5.3 Add missing cascade validation edge-case tests
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`: ambiguous context removal (multiple entries matching), unknown context removal target (no matching entry).
      (Req: Startup validation, All errors are ConfigValidationError)

## 6. Forced-mode extends:true backwards walk

- [x] 6.1 Fix resolveForcedCascade to walk candidates backward instead of always resolving to specd.yaml
      `packages/core/src/infrastructure/fs/config-loader.ts`: `resolveForcedCascade` — when `extends: true`, discover candidates in the same directory, find the current file's position, and walk to the previous non-visited candidate.
      (Req: Forced mode)
