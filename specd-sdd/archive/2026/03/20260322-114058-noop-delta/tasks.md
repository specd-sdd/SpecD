# Tasks: noop-delta

## 1. Domain types

- [x] 1.1 Add `'no-op'` to `DeltaEntry.op` union and add `description` field
      `packages/core/src/application/ports/artifact-parser.ts`:
      `DeltaEntry` — change `op` from `'added' | 'modified' | 'removed'` to
      `'added' | 'modified' | 'removed' | 'no-op'`, add `description?: string`
      Approach: purely additive type change; no runtime impact
      (Req: DeltaEntry shape, Delta file format)

## 2. Parsing and validation

- [x] 2.1 Update Zod schema to accept `no-op` and `description`
      `packages/core/src/infrastructure/artifact-parser/yaml-parser.ts`:
      `deltaEntrySchema` — add `'no-op'` to `op` enum, add `description: z.string().optional()`
      Approach: extend the existing `z.enum()` and add the optional field
      (Req: Delta file format, DeltaEntry shape)

- [x] 2.2 Add `no-op` exclusivity validation in `deltaArraySchema`
      `packages/core/src/infrastructure/artifact-parser/yaml-parser.ts`:
      `deltaArraySchema` — add `.superRefine()` that rejects arrays where a `no-op`
      entry coexists with other entries
      Approach: `superRefine((arr, ctx) => { ... })` — if any entry has `op === 'no-op'`
      and `arr.length > 1`, add a Zod issue explaining `no-op` cannot be mixed with
      other operations. This integrates with the existing `SchemaValidationError`
      thrown by `parseDelta`
      (Req: Delta file format — no-op exclusivity, ParseDelta contract)

- [x] 2.3 Add `no-op` field restrictions in Zod schema
      `packages/core/src/infrastructure/artifact-parser/yaml-parser.ts`:
      `deltaEntrySchema` or `deltaArraySchema` — reject `no-op` entries that contain
      `selector`, `position`, `rename`, `content`, `value`, `strategy`, or `mergeKey`
      Approach: add a `.superRefine()` on the entry schema that checks if `op === 'no-op'`
      and any forbidden field is present, adding a Zod issue for each
      (Req: Delta file format, Delta conflict detection)

## 3. Delta application (defensive)

- [x] 3.1 Add defensive `no-op` guard in `applyDelta`
      `packages/core/src/infrastructure/artifact-parser/_shared/apply-delta.ts`:
      `applyDelta` — at the top of the function, if all entries are `no-op`, return
      a deep clone of the input AST without resolving selectors or applying operations
      Approach: `if (delta.every(e => e.op === 'no-op')) return { root: deepCloneNode(ast.root) }`
      before the existing validation/application logic
      (Req: Delta application — defensive guard)

## 4. ValidateArtifacts bypass

- [x] 4.1 Add `no-op` early return in delta processing
      `packages/core/src/application/use-cases/validate-artifacts.ts`:
      delta processing block (~line 270) — after `parseDelta` returns entries,
      check if all are `no-op`; if so, skip `deltaValidations`, skip loading
      base spec, skip `parser.apply()`, skip `validations[]`, go directly to
      hash computation + `markComplete`
      Approach: after `const deltaEntries = yamlParser.parseDelta(deltaFile.content)`,
      add `const isNoOp = deltaEntries.length > 0 && deltaEntries.every(e => e.op === 'no-op')`.
      If `isNoOp`, read raw delta file, apply `preHashCleanup`, compute SHA-256,
      call `changeArtifact.markComplete(fileKey, hash)`, then `continue` to next artifact
      (Req: Delta validation — no-op bypass, Delta application preview — no-op bypass,
      Structural validation — no-op bypass, Hash computation and markComplete)

## 5. Instructions

- [x] 5.1 Update markdown parser `deltaInstructions()`
      `packages/core/src/infrastructure/artifact-parser/markdown-parser.ts`:
      `deltaInstructions()` — add "Description Field" section and "No-op Operation" section
      Approach: append two new `###` blocks to the returned template string,
      with `description` as general field and `no-op` as separate operation
      (Req: DeltaInstructions contract)

- [x] 5.2 Update YAML parser `deltaInstructions()`
      `packages/core/src/infrastructure/artifact-parser/yaml-parser.ts`:
      `deltaInstructions()` — same two sections as 5.1
      (Req: DeltaInstructions contract)

- [x] 5.3 Update JSON parser `deltaInstructions()`
      `packages/core/src/infrastructure/artifact-parser/json-parser.ts`:
      `deltaInstructions()` — same two sections as 5.1
      (Req: DeltaInstructions contract)

- [x] 5.4 Update plaintext parser `deltaInstructions()`
      `packages/core/src/infrastructure/artifact-parser/plaintext-parser.ts`:
      `deltaInstructions()` — same two sections as 5.1
      (Req: DeltaInstructions contract)

- [x] 5.5 Update `schema-std` delta instructions
      `packages/schema-std/schema.yaml`:
      `deltaInstruction` fields for `spec.md` and `verify.md` artifacts —
      add guidance that `no-op` is available when a spec doesn't need changes
      Approach: append a paragraph to each `deltaInstruction` explaining when
      and how to use `no-op` deltas
      (Req: Delta file format)

## 6. Tests — yaml-parser

- [x] 6.1 Test `parseDelta` with valid `no-op` entry
      `packages/core/test/infrastructure/artifact-parser/yaml-parser.spec.ts`:
      new tests — `[{ op: "no-op" }]` returns one entry; with `description` returns both fields
      (Verify: DeltaEntry with no-op op, no-op as sole entry — accepted)

- [x] 6.2 Test `parseDelta` rejects `no-op` mixed with other entries
      `packages/core/test/infrastructure/artifact-parser/yaml-parser.spec.ts`:
      new test — `[{ op: "no-op" }, { op: "modified", ... }]` throws `SchemaValidationError`
      (Verify: no-op mixed with other entries — parseDelta rejects)

- [x] 6.3 Test `parseDelta` rejects `no-op` with invalid fields
      `packages/core/test/infrastructure/artifact-parser/yaml-parser.spec.ts`:
      new tests — `no-op` with `selector`, `content`, `value`, `position`, `rename`,
      `strategy`, `mergeKey` each throw `SchemaValidationError`
      (Verify: no-op with selector/content/value — parseDelta rejects)

- [x] 6.4 Test `description` on regular delta entry
      `packages/core/test/infrastructure/artifact-parser/yaml-parser.spec.ts`:
      new test — `[{ op: "modified", description: "...", ... }]` parses normally
      (Verify: DeltaEntry with description field, description on regular delta entry)

## 7. Tests — applyDelta

- [x] 7.1 Test `applyDelta` defensive guard for `no-op`
      `packages/core/test/infrastructure/artifact-parser/apply-delta.spec.ts`:
      new test — `applyDelta(ast, [{ op: "no-op" }], ...)` returns deep clone of input AST
      (Verify: no-op delta is never passed to apply — defensive guard)

## 8. Tests — ValidateArtifacts

- [x] 8.1 Test `no-op` delta bypasses `deltaValidations`
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`:
      new test — artifact with `required: true` deltaValidation, no-op delta → `passed: true`,
      `markComplete` called
      (Verify: no-op delta bypasses deltaValidations entirely)

- [x] 8.2 Test `no-op` delta bypasses application preview
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`:
      new test — no-op delta → `parser.apply()` not called, base spec not loaded
      (Verify: no-op delta skips application preview)

- [x] 8.3 Test `no-op` delta bypasses structural validation
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`:
      new test — artifact with `required: true` validation rule, no-op delta →
      `passed: true`, `markComplete` called
      (Verify: no-op delta skips structural validation)

- [x] 8.4 Test `no-op` delta `markComplete` uses raw delta hash
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`:
      new test — verify `markComplete` is called with SHA-256 of the raw delta file
      content (after `preHashCleanup`)
      (Verify: no-op delta — markComplete called with hash)

## 9. Manual verification

- [x] 9.1 E2E: create change with multiple specs, use `no-op` delta, verify DAG unblocked
      Steps from design.md Testing > Manual / E2E verification section
