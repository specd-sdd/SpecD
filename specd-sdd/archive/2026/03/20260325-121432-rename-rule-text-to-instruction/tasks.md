# Tasks: rename-rule-text-to-instruction

## 1. Core: rename field

- [x] 1.1 Rename in Zod schema
      `packages/core/src/infrastructure/schema-yaml-parser.ts`: `RuleEntryZodSchema` —
      rename `text: z.string()` → `instruction: z.string()`
      Approach: single-line edit at line 103
      (Req: Zod structural validation)

- [x] 1.2 Rename in domain raw type (build-schema)
      `packages/core/src/domain/services/build-schema.ts`: `RuleEntryRaw` —
      rename `text: string` → `instruction: string`
      Approach: single-line edit at line 109
      (Req: buildArtifactType sub-function)

- [x] 1.3 Rename in domain value object
      `packages/core/src/domain/value-objects/artifact-type.ts`: `RuleEntry` —
      rename `text: string` → `instruction: string`
      Approach: single-line edit at line 10

- [x] 1.4 Rename in GetArtifactInstruction consumer
      `packages/core/src/application/use-cases/get-artifact-instruction.ts`:
      `r.text` → `r.instruction` at lines 118 and 170
      Approach: two occurrences, search and replace

- [x] 1.5 Keep merge-layer intermediate data aligned
      `packages/core/src/domain/services/merge-schema-layers.ts`: ensure append/prepend/set
      paths and related fixtures use the renamed `{ id, instruction }` rule-entry shape
      Approach: update merge-layer fixtures and examples alongside `RuleEntryRaw`

## 2. Schema-std: rename in YAML

- [x] 2.1 Rename text → instruction in schema.yaml
      `packages/schema-std/schema.yaml`: all `text:` entries under artifact rules
      Approach: search for rule entries with `text: |` under `rules:` sections,
      rename to `instruction: |`

- [x] 2.2 Update affected spec deltas
      Change deltas for `core:core/schema-format` and `core:core/schema-merge` must cover
      every spec/verify occurrence that still uses `{ id, text }`
      Approach: replace stale no-op or missing coverage with explicit delta operations

## 3. Project config rollout

- [x] 3.1 Update `specd.yaml` schemaOverrides
      `specd.yaml`: any artifact rule entries under `schemaOverrides` still using `text:`
      must be renamed to `instruction:`
      Approach: update project-local overrides in the same implementation so config and schema stay aligned

## 4. Documentation rollout

- [x] 4.1 Update docs and JSDocs
      `docs/` and relevant source comments/JSDoc: any examples or prose describing
      artifact rule entries must be updated from `text:` to `instruction:`
      Approach: search docs and source comments for artifact-rule examples and fix every stale reference

## 5. Build and test

- [x] 5.1 Update tests that reference `text` field
      Search all test files for `text:` or `.text` in rule entry contexts and
      rename to `instruction`

- [x] 5.2 Build core and run tests
      `pnpm --filter @specd/core build && pnpm --filter @specd/core test`

- [x] 5.3 Build CLI and run tests
      `pnpm --filter @specd/cli build && pnpm --filter @specd/cli test`

- [x] 5.4 Run full lint
      `pnpm lint`

## 6. Manual verification

- [x] 6.1 Verify schema validate passes
      `node packages/cli/dist/index.js schema validate`

- [x] 6.2 Verify artifact-instruction works
      `node packages/cli/dist/index.js change artifact-instruction rename-rule-text-to-instruction --format json`
