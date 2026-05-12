# Tasks: schema-ref-resolution

## 1. Core use cases

- [x] 1.1 Add `ref` mode to `ValidateSchema`
      `packages/core/src/application/use-cases/validate-schema.ts`:
      `ValidateSchemaInput` — add `| { readonly mode: 'ref'; readonly ref: string }` to union
      `ValidateSchema.execute()` — add `case 'ref'` to switch dispatching to `_validateRef()`
      Approach: implement `_validateRef(ref)` following the same pattern as `_validateFile()`:
      `resolveRaw(ref)` → null check ("schema '${ref}' not found") → `resolveExtendsChain` →
      extends warnings → merge templates → `buildSchemaFn` → return result.
      (Req: Ref mode, Extends chain warnings in file and ref modes)

- [x] 1.2 Extend `GetActiveSchema` with optional input
      `packages/core/src/application/use-cases/get-active-schema.ts`:
      Add `GetActiveSchemaInput` type export. Add `schemas: SchemaRegistry` and
      `buildSchemaFn` constructor parameters. Change `execute()` to `execute(input?: GetActiveSchemaInput)`.
      Approach: when input is undefined, delegate to `resolveSchema.execute()` (unchanged).
      When `mode: 'ref'`, call `_resolveByRef(ref)`: `resolveRaw` → `SchemaNotFoundError` if null →
      `resolveExtendsChain` → merge templates → `buildSchemaFn`. Same for `mode: 'file'` with filePath.
      Import `resolveExtendsChain` and `SchemaNotFoundError`.
      (Req: Optional input, Delegates to ResolveSchema, Construction dependencies)

- [x] 1.3 Update kernel composition to pass new dependencies
      `packages/core/src/composition/kernel.ts` (line 262):
      Change `new GetActiveSchema(resolveSchema)` to `new GetActiveSchema(resolveSchema, i.schemas, buildSchema)`.
      `packages/core/src/composition/use-cases/get-active-schema.ts`:
      Update both overloads of `createGetActiveSchema` to pass `schemas` and `buildSchema` to the constructor.
      (Req: Construction dependencies)

- [x] 1.4 Update core exports
      `packages/core/src/application/use-cases/index.ts`:
      Add `GetActiveSchemaInput` to the exports from `get-active-schema.ts`.
      (Req: Optional input)

## 2. CLI commands

- [x] 2.1 Update `schema show` command
      `packages/cli/src/commands/schema/show.ts`:
      Add `.argument('[ref]', 'schema reference to show')` and `.option('--file <path>', 'show a schema from a file')`.
      Add mutual exclusivity check: if both ref and file provided, `cliError('[ref] and --file are mutually exclusive', ...)`.
      Dispatch: no ref/file → `execute()`, ref → `execute({ mode: 'ref', ref })`,
      file → `execute({ mode: 'file', filePath: resolve(opts.file) })`.
      Determine `mode` string (`'project'`, `'ref'`, `'file'`) and add to JSON output.
      In text mode, only show `plugins:` line when mode is `project`.
      (Req: Command signature, Output format, Error cases)

- [x] 2.2 Update `schema validate` command
      `packages/cli/src/commands/schema/validate.ts`:
      Add `.argument('[ref]', 'schema reference to validate')`.
      Expand mutual exclusivity: check ref+file (`[ref] and --file are mutually exclusive`),
      ref+raw (`[ref] and --raw are mutually exclusive`).
      Dispatch: ref → `{ mode: 'ref' as const, ref }`.
      Update `modeLabel`: add `'ref'` case. Add `[ref]` suffix in text output.
      (Req: Command signature, Ref mode, Text output — success, JSON output, Mutually exclusive flags)

## 3. Tests

- [x] 3.1 Add `ValidateSchema` ref mode tests
      `packages/core/test/application/use-cases/validate-schema.spec.ts`:
      New `describe('ref mode')` block with scenarios: valid ref, ref not found, ref with extends + warnings,
      ref with circular extends, ref with invalid content, no plugins/overrides applied.
      (Req: Ref mode, Extends chain warnings in file and ref modes)

- [x] 3.2 Add `GetActiveSchema` ref/file mode tests
      `packages/core/test/application/use-cases/get-active-schema.spec.ts`:
      New `describe('ref mode')` and `describe('file mode')` blocks.
      Ref scenarios: valid ref resolves with extends, ref not found throws `SchemaNotFoundError`,
      circular extends throws, no plugins/overrides applied.
      File scenarios: valid file resolves, file not found throws.
      Existing project-mode tests must remain unchanged.
      (Req: Optional input, Delegates to ResolveSchema)

- [x] 3.3 Add CLI `schema show` ref/file tests
      `packages/cli/test/commands/schema-show.spec.ts`:
      Test `[ref]` argument dispatches to `execute({ mode: 'ref', ref })`.
      Test `--file` dispatches to `execute({ mode: 'file', filePath })`.
      Test mutual exclusivity error. Test `mode` field in JSON output.
      Test ref not found exits with code 3. Test file not found exits with code 3.
      (Req: Command signature, Output format, Error cases)

- [x] 3.4 Add CLI `schema validate` ref tests
      `packages/cli/test/commands/schema-validate.spec.ts`:
      Test `[ref]` argument dispatches to ref mode.
      Test mutual exclusivity: ref+file, ref+raw.
      Test `[ref]` suffix in text output. Test `"ref"` mode in JSON output.
      Test ref not found exits with code 1.
      (Req: Command signature, Ref mode, Mutually exclusive flags, Error — ref not found)

## 4. Build and manual verification

- [x] 4.1 Build and run all tests
      Run `pnpm build && pnpm test && pnpm lint` to verify no regressions.

- [x] 4.2 Manual end-to-end verification
      Run the manual verification commands from design.md:
      `schema show @specd/schema-std`, `schema show --file packages/schema-std/schema.yaml`,
      `schema validate @specd/schema-std`, mutual exclusivity errors, ref not found errors.
      Verify output format matches spec expectations.
