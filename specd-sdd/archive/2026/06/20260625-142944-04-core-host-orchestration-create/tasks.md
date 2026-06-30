# Tasks: 04-core-host-orchestration-create

## 1. CreateChange input and result types

- [x] 1.1 Make schema fields optional on input
      `packages/core/src/application/use-cases/create-change.ts`: `CreateChangeInput` — make `schemaName` and `schemaVersion` optional; add `includeOverlapCheck?: boolean`
      Approach: update interface and JSDoc; import `OverlapReport` for result typing
      (Req: Input contract)

- [x] 1.2 Extend result type with optional overlap report
      `packages/core/src/application/use-cases/create-change.ts`: `CreateChangeResult` — add `overlapReport?: OverlapReport`
      Approach: optional field only when detection succeeds
      (Req: Persistence and scaffolding, Optional overlap check)

- [x] 1.3 Add partial schema override validation error
      `packages/core/src/application/use-cases/create-change.ts`: new error class or inline guard in `_resolveSchemaIdentity`
      Approach: when exactly one of `schemaName` / `schemaVersion` is defined, throw before persistence; extend `SpecdError` with stable code
      (Req: Input contract)

## 2. CreateChange orchestration

- [x] 2.1 Add constructor dependencies
      `packages/core/src/application/use-cases/create-change.ts`: `CreateChange` constructor — inject `GetActiveSchema` and `DetectOverlap`
      Approach: store as `_getActiveSchema` and `_detectOverlap`; update `@param` JSDoc
      (Req: Dependencies)

- [x] 2.2 Add private schema identity resolver
      `packages/core/src/application/use-cases/create-change.ts`: `_resolveSchemaIdentity(input)` — delegate to `GetActiveSchema` when fields absent; use override when both provided
      Approach: `const result = await this._getActiveSchema.execute()`; reject `result.raw`; return `name()` / `version()`
      (Req: Active schema resolution)

- [x] 2.3 Resolve schema at start of execute
      `packages/core/src/application/use-cases/create-change.ts`: `execute()` — call `_resolveSchemaIdentity` before building `created` event
      Approach: replace direct `input.schemaName` / `input.schemaVersion` reads with resolved locals
      (Req: Initial history contains a single created event)

- [x] 2.4 Add optional overlap check after scaffold
      `packages/core/src/application/use-cases/create-change.ts`: `execute()` — when `includeOverlapCheck && specIds.length > 0`, try `DetectOverlap.execute({ name })`; attach `overlapReport` on success; swallow errors
      Approach: mirror current CLI try/catch semantics; return spread only when defined
      (Req: Optional overlap check)

## 3. Composition and kernel wiring

- [x] 3.1 Wire new deps in createCreateChange (SpecdConfig overload)
      `packages/core/src/composition/use-cases/create-change.ts`: `createCreateChange` — construct `GetActiveSchema` and `DetectOverlap` from config; pass to `CreateChange`
      Approach: `createGetActiveSchema(config)` + `createDetectOverlap(config)` alongside existing repos
      (Req: Dependencies)

- [x] 3.2 Extend FsCreateChangeOptions for context overload
      `packages/core/src/composition/use-cases/create-change.ts`: `FsCreateChangeOptions` — add `getActiveSchema` and `detectOverlap` fields for context overload path
      Approach: thread required deps through inner overload; update call sites in tests if any use context overload
      (Req: Dependencies)

- [x] 3.3 Update kernel CreateChange construction
      `packages/core/src/composition/kernel.ts` / `kernel-internals.ts`: `new CreateChange(...)` — pass `i.getActiveSchema` and `i.detectOverlap`
      Approach: align argument order with updated constructor signature
      (Req: Dependencies)

## 4. CLI thinning

- [x] 4.1 Remove getActiveSchema prelude from change create
      `packages/cli/src/commands/change/create.ts`: action handler — delete `kernel.specs.getActiveSchema.execute()` block and schema fields on `create.execute` input
      Approach: pass `name`, `specIds`, optional `description`, `invalidationPolicy`, and `includeOverlapCheck` only
      (Req: Schema name and version)

- [x] 4.2 Delegate overlap check to CreateChange result
      `packages/cli/src/commands/change/create.ts`: action handler — pass `includeOverlapCheck: true` when `specIds.length > 0`; format stderr from `overlapReport`; remove `detectOverlap.execute` call
      Approach: reuse existing warning string template; guard on `overlapReport?.hasOverlap`
      (Req: Overlap warning delegation)

## 5. Tests

- [x] 5.1 Unit test active schema resolution
      `packages/core/test/application/use-cases/create-change.spec.ts`: new cases — `GetActiveSchema` called when schema fields omitted; skipped when both provided; partial override throws
      Approach: mock `GetActiveSchema.execute` returning `{ raw: false, schema }`; assert `created` event schema fields
      (Req: Active schema resolution, Input contract)

- [x] 5.2 Unit test overlap orchestration
      `packages/core/test/application/use-cases/create-change.spec.ts`: new cases — `includeOverlapCheck` invokes `DetectOverlap`; failure omits report; absent flag skips call
      Approach: mock `DetectOverlap.execute` throw and success paths
      (Req: Optional overlap check)

- [x] 5.3 Update create-change constructor mocks in existing tests
      `packages/core/test/application/use-cases/create-change.spec.ts`: `makeSut` / setup — pass mock `GetActiveSchema` and `DetectOverlap`
      Approach: default mocks: getActiveSchema returns fixed schema; detectOverlap returns empty report
      (Req: Dependencies)

- [x] 5.4 CLI test schema prelude removed
      `packages/cli/test/commands/change-create.spec.ts`: assert `getActiveSchema` not called; `create.execute` input lacks `schemaName`/`schemaVersion`
      Approach: spy on kernel methods; inspect execute payload
      (Req: Schema name and version)

- [x] 5.5 CLI test overlap delegation
      `packages/cli/test/commands/change-create.spec.ts`: mock `create.execute` returning `overlapReport` with `hasOverlap: true`; assert stderr warning; assert `detectOverlap` not called on kernel
      Approach: stub execute return value; capture stderr
      (Req: Overlap warning delegation)

- [x] 5.6 Adjust shared change command tests if needed
      `packages/cli/test/commands/change.spec.ts`: update create-path setup spies for new execute signature
      Approach: only touch tests that fail after CLI thinning
      (Req: Schema name and version)

## 6. Documentation

- [x] 6.1 Update core docs for CreateChange host contract
      `docs/core/use-cases.md` (or existing CreateChange page): document optional schema fields, internal resolution, and `includeOverlapCheck`
      Approach: note CLI no longer passes schema identity; programmatic callers may still override
      (Req: Input contract, Overlap warning delegation)

## 7. Compliance follow-up (20260626-091825)

- [x] 7.1 Test GetActiveSchema error propagation
      `packages/core/test/application/use-cases/create-change.spec.ts`: assert `SchemaNotFoundError` propagates and no persist
      (Finding F1)

- [x] 7.2 Document InvalidCreateChangeInputError
      `docs/core/errors.md`: section + reference table row
      (Finding F2)

- [x] 7.3 Fix stale CreateChange examples
      `docs/core/examples/implementing-a-port.md`: context options + 5-arg constructor
      (Findings F3–F4)

## 8. Compliance follow-up (20260626-094031)

- [x] 8.1 Integration test: manifest schema identity via real kernel
      `packages/cli/test/commands/change-create.spec.ts`: fs fixture + manifest assertion
      (Finding F5)

- [x] 8.2 Integration test: overlap warning via real DetectOverlap
      `packages/cli/test/commands/change-create.spec.ts`: seed existing change + stderr warning
      (Finding F6)
