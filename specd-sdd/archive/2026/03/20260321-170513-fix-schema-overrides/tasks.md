# Tasks: fix-schema-overrides

## 1. Fix override hook normalization

- [x] 1.1 Add `normalizeOverrideHooks` to `ResolveSchema`
      `packages/core/src/application/use-cases/resolve-schema.ts`:
      new private function — walks `SchemaOperations` and transforms
      `{ id, run }` → `{ id, type: 'run', command }` and
      `{ id, instruction }` → `{ id, type: 'instruction', text }`
      in all workflow hook arrays across all operation keys
      Approach: iterate append/prepend/create/set, for each workflow entry
      transform hooks.pre and hooks.post arrays
      (Req: Resolution pipeline step 5)

- [x] 1.2 Call normalization before building override layer
      `packages/core/src/application/use-cases/resolve-schema.ts`:
      line ~64 — call `normalizeOverrideHooks(this._schemaOverrides)` before
      pushing the override layer
      (Req: Resolution pipeline step 5)

## 2. Remove top-level workflow from config

- [x] 2.1 Remove `workflow` field and types from `SpecdConfig`
      `packages/core/src/application/specd-config.ts`:
      remove `SpecdWorkflowStep`, `SpecdWorkflowHook` types and `workflow` field
      (Req: config — remove workflow)

- [x] 2.2 Remove `workflow` parsing from config loader
      `packages/core/src/infrastructure/fs/config-loader.ts`:
      remove `workflow` from Zod schema and construction logic
      (Req: config — remove workflow)

- [x] 2.3 Remove `projectWorkflowHooks` from `RunStepHooks`
      `packages/core/src/application/use-cases/run-step-hooks.ts`:
      remove constructor param, field, and `_collectHooks` project-level logic
      (Req: Ports and constructor, Hook collection)

- [x] 2.4 Remove `projectWorkflowHooks` from `GetHookInstructions`
      `packages/core/src/application/use-cases/get-hook-instructions.ts`:
      remove constructor param, field, and project-level instruction collection
      (Req: Ports and constructor, Instruction collection)

- [x] 2.5 Update kernel wiring
      `packages/core/src/composition/kernel.ts`:
      remove `projectWorkflowHooks` variable and stop passing it to use cases
      (Req: createKernel constructs shared adapters once)

- [x] 2.6 Update composition factories
      `packages/core/src/composition/use-cases/transition-change.ts` and
      `packages/core/src/composition/use-cases/archive-change.ts`:
      remove `projectWorkflowHooks` from `RunStepHooks` construction

## 3. Migrate config

- [x] 3.1 Migrate `specd.local.yaml`
      Move `workflow` entries to `schemaOverrides.append.workflow`

## 4. Tests

- [x] 4.1 Add override hook normalization tests
      `packages/core/test/application/use-cases/resolve-schema.spec.ts`:
      test that YAML-format hooks in overrides are normalized to domain format

- [x] 4.2 Update `RunStepHooks` tests
      `packages/core/test/application/use-cases/run-step-hooks.spec.ts`:
      remove project hook scenarios, update constructor calls

- [x] 4.3 Update `GetHookInstructions` tests
      `packages/core/test/application/use-cases/get-hook-instructions.spec.ts`:
      same as 4.2

- [x] 4.4 Build and run full test suite
      `pnpm build && pnpm test`

## 5. E2E verification

- [x] 5.1 Verify schemaOverrides hooks work end-to-end
      Add `schemaOverrides.append.workflow` to `specd.local.yaml`, run hooks,
      verify they execute
