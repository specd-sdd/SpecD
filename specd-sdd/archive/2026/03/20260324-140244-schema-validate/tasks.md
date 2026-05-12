# Tasks: schema-validate

## 1. Core: extract extends chain resolution

- [x] 1.1 Extract `resolveExtendsChain` shared function
      `packages/core/src/application/use-cases/resolve-extends-chain.ts`: new file
      Approach: extract the extends-walking + cascade logic from
      `ResolveSchema._resolveAndCascadeExtends` into a standalone async function:
      `resolveExtendsChain(schemas: SchemaRegistry, baseRaw: SchemaRawResult): Promise<{ cascadedData: SchemaYamlData; templates: Map<string, string> }>`.
      Copy the cycle detection (visited paths set), the chain walking loop, and
      the `_overlayData`/`_mergeArtifactArrays`/`_mergeWorkflowArrays` helpers.
      Export the function.
      (Req: ValidateSchema — Project mode raw, File mode)

- [x] 1.2 Refactor `ResolveSchema` to use `resolveExtendsChain`
      `packages/core/src/application/use-cases/resolve-schema.ts`:
      `_resolveAndCascadeExtends` — replace private method body with a call to
      `resolveExtendsChain`, remove the now-unused private helpers
      Approach: import `resolveExtendsChain`, call it in `_resolveAndCascadeExtends`,
      return its result. Remove `_overlayData`, `_mergeArtifactArrays`,
      `_mergeWorkflowArrays` from the class. Existing tests must still pass.
      (Req: ResolveSchema — no behavioral change, pure refactor)

- [x] 1.3 Test `resolveExtendsChain`
      `packages/core/test/application/use-cases/resolve-extends-chain.spec.ts`: new file
      Approach: mock `SchemaRegistry.resolveRaw`. Test cases: no extends returns
      base data, single extends level cascades, multi-level chain, cycle detected
      (throws `SchemaValidationError`), parent not found (throws `SchemaNotFoundError`).
      (Req: ValidateSchema — extends chain resolution)

## 2. Core: ValidateSchema use case

- [x] 2.1 Create `ValidateSchema` use case
      `packages/core/src/application/use-cases/validate-schema.ts`: new file
      Approach: class with constructor receiving `schemas: SchemaRegistry`,
      `schemaRef: string`, `buildSchemaFn: typeof buildSchema`,
      `resolveSchema: ResolveSchema`. Three-mode `execute(input)` method.
      Project mode: delegate to `resolveSchema.execute()`, catch errors → result.
      Project-raw mode: `schemas.resolveRaw(schemaRef)` → `resolveExtendsChain` →
      `buildSchemaFn` → result.
      File mode: `schemas.resolveRaw(filePath)` → `resolveExtendsChain` →
      `buildSchemaFn` → result + extends warnings.
      Export `ValidateSchemaInput`, `ValidateSchemaResult` types.
      (Req: Construction dependencies, Project mode resolved, Project mode raw, File mode, Result type, Extends chain warnings)

- [x] 2.2 Export from application barrel
      `packages/core/src/application/use-cases/index.ts` and
      `packages/core/src/composition/use-cases/index.ts`: add export for
      `ValidateSchema`, `ValidateSchemaInput`, `ValidateSchemaResult`
      Approach: add export line.
      (Req: Construction dependencies)

- [x] 2.3 Wire in kernel
      `packages/core/src/composition/kernel.ts`: add `validateSchema` to `specs` group
      Approach: import `ValidateSchema`. In `Kernel` interface add
      `validateSchema: ValidateSchema` to `specs`. In `createKernel`, construct:
      `validateSchema: new ValidateSchema(i.schemas, i.schemaRef, buildSchema, resolveSchema)`.
      Import `buildSchema` from domain services.
      (Req: Construction dependencies)

- [x] 2.4 Test `ValidateSchema`
      `packages/core/test/application/use-cases/validate-schema.spec.ts`: new file
      Approach: mock `SchemaRegistry`, `buildSchema`, `ResolveSchema.execute`.
      Test all 14 scenarios from the design testing table.
      (Req: all ValidateSchema requirements)

## 3. Core: cleanup

- [x] 3.1 Revert `parseSchemaYaml` export from composition
      `packages/core/src/composition/index.ts`: remove the
      `export { parseSchemaYaml } from '../infrastructure/schema-yaml-parser.js'` line
      Approach: delete the line added in the previous implementation round.
      (Req: architecture compliance — no infrastructure exports from composition)

- [x] 3.2 Build core and run existing tests
      Approach: `pnpm --filter @specd/core build && pnpm --filter @specd/core test`.
      Existing `ResolveSchema` tests must still pass after refactor.

## 4. CLI: rewrite command

- [x] 4.1 Rewrite `registerSchemaValidate`
      `packages/cli/src/commands/schema/validate.ts`: rewrite
      Approach: remove all imports of `parseSchemaYaml`, `buildSchema`,
      `readFile`, `path`. Import only `resolveCliContext`, `output`, `parseFormat`,
      `cliError`, `handleError`. Parse `--file`, `--raw`, `--format`, `--config`.
      Check mutual exclusivity of `--file` and `--raw`.
      Build input: `{ mode: 'project' }`, `{ mode: 'project-raw' }`, or
      `{ mode: 'file', filePath: resolve(opts.file) }`.
      Call `kernel.specs.validateSchema.execute(input)`.
      Format result using existing `formatSuccess`/`formatFailure` helpers
      (updated for new mode labels: `project` → no suffix, `project-raw` → `[raw]`,
      `file` → `[file]`).
      (Req: Command signature, all CLI requirements)

- [x] 4.2 Build CLI
      Approach: `pnpm --filter @specd/cli build && node packages/cli/dist/index.js schema validate --help`

## 5. CLI: rewrite tests

- [x] 5.1 Rewrite `schema-validate.spec.ts`
      `packages/cli/test/commands/schema-validate.spec.ts`: rewrite
      Approach: mock `resolveCliContext` returning a kernel with
      `validateSchema.execute` mock. Remove `parseSchemaYaml`/`buildSchema`/`readFile`
      mocks. Test all 11 CLI scenarios from the design testing table.
      (Req: all CLI spec requirements)

- [x] 5.2 Update mock kernel helper
      `packages/cli/test/commands/helpers.ts`: add `validateSchema: { execute: vi.fn() }`
      to `makeMockKernel` specs group.
      Approach: add one line in `makeMockKernel`.

## 6. Manual E2E verification

- [x] 6.1 Project resolved mode
      `node packages/cli/dist/index.js schema validate` — expect success, exit 0
- [x] 6.2 Project raw mode
      `node packages/cli/dist/index.js schema validate --raw` — expect `[raw]`, exit 0
- [x] 6.3 File mode with schema-std
      `node packages/cli/dist/index.js schema validate --file packages/schema-std/schema.yaml` — expect `[file]`, exit 0
- [x] 6.4 File mode invalid
      `echo "name: bad" > /tmp/bad.yaml && node packages/cli/dist/index.js schema validate --file /tmp/bad.yaml` — exit 1
- [x] 6.5 File not found
      `node packages/cli/dist/index.js schema validate --file ./nonexistent.yaml` — exit 1
- [x] 6.6 Mutually exclusive flags
      `node packages/cli/dist/index.js schema validate --file x --raw` — exit 1
