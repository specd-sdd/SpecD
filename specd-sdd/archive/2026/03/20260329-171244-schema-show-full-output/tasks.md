# Tasks: schema-show-full-output

## 1. Add `templateRef` to ArtifactType

- [x] 1.1 Add `templateRef` property to `ArtifactTypeProps` and `ArtifactType`
      `packages/core/src/domain/value-objects/artifact-type.ts`: `ArtifactTypeProps`, `ArtifactType` — add `templateRef?: string` property and getter. Fix JSDoc on `template` to say "Resolved template file content" instead of "Path to a template file".
      Approach: Add `readonly templateRef?: string` to `ArtifactTypeProps`, add `_templateRef` private field, assign in constructor, add `get templateRef()` getter.
      (Req: Output format)

- [x] 1.2 Pass `templateRef` through `buildSchema()`
      `packages/core/src/domain/services/build-schema.ts`: `buildArtifactType()` — pass `raw.template` as `templateRef` alongside the resolved content.
      Approach: Add `templateRef: raw.template` to the `ArtifactTypeProps` object in `buildArtifactType()`.
      (Req: Output format)

- [x] 1.3 Unit tests for `templateRef`
      `packages/core/src/domain/value-objects/artifact-type.test.ts`: verify `templateRef` is preserved when set, and `undefined` when not set.
      `packages/core/src/domain/services/build-schema.test.ts`: verify `templateRef` is passed through from raw data.
      (Req: Output format)

## 2. Add raw mode to `GetActiveSchema`

- [x] 2.1 Define `GetActiveSchemaOptions` and `GetActiveSchemaResult` types
      `packages/core/src/application/use-cases/get-active-schema.ts`: add the options interface and discriminated union result type.
      Approach: `GetActiveSchemaOptions { raw?: boolean; resolveTemplates?: boolean }` and `GetActiveSchemaResult` as union of `{ raw: false; schema: Schema }` | `{ raw: true; data: SchemaYamlData; templates: ReadonlyMap<string, string> }`.
      (Req: Optional input, Returns the resolved Schema on success)

- [x] 2.2 Add `_schemaRef` to constructor
      `packages/core/src/application/use-cases/get-active-schema.ts`: add `schemaRef: string` as fourth constructor argument, store as `_schemaRef`.
      (Req: Construction dependencies)

- [x] 2.3 Implement `_executeRaw()` private method
      `packages/core/src/application/use-cases/get-active-schema.ts`: add method that calls `_schemas.resolveRaw(ref)` and returns `SchemaYamlData` + templates without resolving extends or calling `buildSchema`.
      Approach: For project mode use `_schemaRef`, for ref/file use the input value. Call `resolveRaw()`, throw `SchemaNotFoundError` if null. Return `{ raw: true, data: raw.data, templates: resolveTemplates ? raw.templates : new Map() }`.
      (Req: Optional input)

- [x] 2.4 Modify `execute()` to support options and return `GetActiveSchemaResult`
      `packages/core/src/application/use-cases/get-active-schema.ts`: add `options?` parameter, dispatch to `_executeRaw()` when `raw: true`, wrap existing return in `{ raw: false, schema }`.
      (Req: Returns the resolved Schema on success)

- [x] 2.5 Update composition factory
      `packages/core/src/composition/use-cases/get-active-schema.ts`: pass `schemaRef` string as fourth argument to `GetActiveSchema` constructor.
      Approach: The ref is already available in the factory from `config.schema` or the explicit options.
      (Req: Construction dependencies)

- [x] 2.6 Update exports if needed
      `packages/core/src/index.ts`: ensure `GetActiveSchemaOptions` and `GetActiveSchemaResult` are exported.
      (Req: Construction dependencies)

- [x] 2.7 Unit tests for raw mode
      `packages/core/src/application/use-cases/get-active-schema.test.ts`: test raw mode for project, ref, and file inputs. Verify `resolveRaw()` is called, `buildSchema` is NOT called, `SchemaYamlData` is returned. Test `resolveTemplates` flag. Test `SchemaNotFoundError` on null result.
      (Req: Optional input, Returns the resolved Schema on success)

## 3. Update CLI `schema show` command

- [x] 3.1 Add `--raw` and `--templates` options
      `packages/cli/src/commands/schema/show.ts`: add `.option('--raw', ...)` and `.option('--templates', ...)` to the command definition.
      (Req: Command signature)

- [x] 3.2 Implement full JSON serialization
      `packages/cli/src/commands/schema/show.ts`: replace the current shallow artifact/workflow mapping with a faithful serialization of all `Schema` entity fields. Show `templateRef` by default, show `template` (content) when `--templates` is passed. Include `metadataExtraction`.
      Approach: Create a `serializeSchema(schema, includeTemplates)` helper. Iterate `schema.artifacts()` and serialize all getters. Iterate `schema.workflow()` with hooks. Serialize `schema.metadataExtraction()`.
      (Req: Output format)

- [x] 3.3 Implement full text serialization
      `packages/cli/src/commands/schema/show.ts`: replace the current compact text format with a detailed layout showing all artifact fields and workflow hooks.
      Approach: Create a `formatSchemaText(schema, includeTemplates)` helper. Long values (instructions) can be truncated in text mode.
      (Req: Output format)

- [x] 3.4 Implement raw mode code path
      `packages/cli/src/commands/schema/show.ts`: when `--raw` is passed, call `execute(input, { raw: true, resolveTemplates: opts.templates })` and serialize the `SchemaYamlData` directly (no `mode`/`plugins` envelope).
      (Req: Output format — Raw mode)

- [x] 3.5 Update help text
      `packages/cli/src/commands/schema/show.ts`: update `addHelpText` JSON schema to reflect the new output structure.
      (Req: Command signature)

## 4. Update documentation

- [x] 4.1 Update CLI reference
      `docs/cli/cli-reference.md`: update `### schema show` section — add `--raw` and `--templates` to the options table and add examples.
      (Req: Command signature)

## 5. Integration tests

- [x] 5.1 CLI integration tests for full output
      Add tests verifying: JSON output includes all schema fields (instruction, rules, validations, hooks, metadataExtraction), template shows reference path by default, `--templates` shows resolved content.
      (Req: Output format)

- [x] 5.2 CLI integration tests for raw mode
      Add tests verifying: `--raw` returns SchemaYamlData without extends resolution, `--raw --templates` resolves template content, raw mode works with `[ref]` and `--file`.
      (Req: Output format — Raw mode)
