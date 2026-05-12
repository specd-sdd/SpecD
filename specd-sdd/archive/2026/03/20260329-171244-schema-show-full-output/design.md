# Design: schema-show-full-output

## Approach

Three independent changes, each building on the previous:

1. **Full output** — serialize all `Schema` entity fields in the CLI command (currently only a subset is serialized). Requires adding a `templateRef` field to `ArtifactType` so the original path reference is preserved alongside the resolved content.
2. **`--templates` flag** — switch between showing the template path reference (default) and the resolved content.
3. **`--raw` flag** — add a raw mode to `GetActiveSchema` that returns `SchemaYamlData` without resolving extends/plugins/overrides, and a corresponding CLI code path.

## Affected areas

### `packages/core/src/domain/value-objects/artifact-type.ts`

**Problem:** `ArtifactType.template` currently holds the **resolved file content** (set by `buildSchema()`), but the JSDoc says "Path to a template file". The original path reference from the schema YAML (e.g. `templates/proposal.md`) is lost after `buildSchema()`.

**Change:** Add a `templateRef` property to `ArtifactTypeProps` and `ArtifactType`:

```typescript
// In ArtifactTypeProps:
/** Resolved template file content. */
readonly template?: string
/** Original template path reference as declared in the schema YAML. */
readonly templateRef?: string
```

Update the JSDoc on `template` to say "Resolved template file content" (fixing the current misleading JSDoc).

Add getter:

```typescript
get templateRef(): string | undefined {
  return this._templateRef
}
```

### `packages/core/src/domain/services/build-schema.ts`

**Change in `buildArtifactType()`:** Pass both the raw path and the resolved content:

```typescript
function buildArtifactType(
  raw: ArtifactYamlData,
  templateContent: string | undefined,
): ArtifactType {
  // ...existing code...
  return new ArtifactType({
    // ...existing fields...
    template: templateContent, // resolved content (unchanged)
    templateRef: raw.template, // original path reference (new)
  })
}
```

### `packages/core/src/application/use-cases/get-active-schema.ts`

**Change:** Add `GetActiveSchemaOptions` and modify `execute()` signature:

```typescript
export interface GetActiveSchemaOptions {
  readonly raw?: boolean
  readonly resolveTemplates?: boolean
}

export type GetActiveSchemaResult =
  | { readonly raw: false; readonly schema: Schema }
  | {
      readonly raw: true
      readonly data: SchemaYamlData
      readonly templates: ReadonlyMap<string, string>
    }
```

Modify `execute()`:

```typescript
async execute(input?: GetActiveSchemaInput, options?: GetActiveSchemaOptions): Promise<GetActiveSchemaResult> {
  if (options?.raw) {
    return this._executeRaw(input, options.resolveTemplates ?? false)
  }
  // ...existing logic, wrapped in { raw: false, schema: ... }
}
```

Add `_executeRaw()`:

```typescript
private async _executeRaw(
  input: GetActiveSchemaInput | undefined,
  resolveTemplates: boolean,
): Promise<GetActiveSchemaResult> {
  const ref = input === undefined
    ? this._schemaRef          // project mode — need access to schema ref
    : input.mode === 'ref' ? input.ref : input.filePath

  const raw = await this._schemas.resolveRaw(ref)
  if (raw === null) {
    throw new SchemaNotFoundError(ref)
  }

  const templates = resolveTemplates ? raw.templates : new Map<string, string>()
  return { raw: true, data: raw.data, templates }
}
```

**Construction change:** `GetActiveSchema` needs access to the schema ref string for raw project mode. Currently the ref is only available inside `ResolveSchema`. Options:

- Pass the schema ref as a constructor argument (simplest — it's already available in the composition factory from `config.schema`)
- Store it as `_schemaRef: string`

Add `schemaRef` to the constructor:

```typescript
constructor(
  resolveSchema: ResolveSchema,
  schemas: SchemaRegistry,
  buildSchemaFn: (...) => Schema,
  schemaRef: string,                    // new
)
```

### `packages/core/src/composition/use-cases/get-active-schema.ts`

**Change:** Pass `config.schema` (the schema ref string) as the fourth constructor argument:

```typescript
return new GetActiveSchema(resolveSchema, schemas, buildSchema, schemaRef)
```

The `schemaRef` is already available in the factory — it's extracted from `config.schema`.

### `packages/cli/src/commands/schema/show.ts`

**New options:**

```typescript
.option('--raw', 'show raw schema without resolving extends, plugins, or overrides')
.option('--templates', 'resolve template references and show file content')
```

**Full output (default mode):** Replace the current shallow serialization with a faithful serialization of the `Schema` entity. Use the entity's public API to serialize all fields:

- Each `ArtifactType`: all getters (`id`, `scope`, `output`, `description`, `templateRef` (default) or `template` (with `--templates`), `instruction`, `requires`, `optional`, `format`, `delta`, `deltaInstruction`, `validations`, `deltaValidations`, `preHashCleanup`, `taskCompletionCheck`, `rules`)
- Each `WorkflowStep`: `step`, `requires`, `requiresTaskCompletion`, `hooks` (pre/post with id, type, command/text)
- `metadataExtraction()`: serialize the full object if present

For JSON, create a `serializeSchema(schema, includeTemplates)` helper function. For text, create a `formatSchemaText(schema, includeTemplates)` helper.

**Template handling in JSON:**

- Without `--templates`: `"template": "templates/proposal.md"` (from `templateRef`)
- With `--templates`: `"template": "<full file content>"` (from `template`)

**Raw mode:** When `--raw` is passed, call `execute(input, { raw: true, resolveTemplates: opts.templates })`. The result's `data` field is `SchemaYamlData` — serialize it directly. In JSON, output the `SchemaYamlData` object as-is (no `mode`/`plugins` envelope). In text, format it readably.

**Text format:** Not prescribing exact layout. Each artifact shows all its fields indented under the artifact line. Long values (instructions, validations) can be truncated with `...` in text mode — JSON always shows full values.

## New constructs

| Construct                | Location                             | Kind                         |
| ------------------------ | ------------------------------------ | ---------------------------- |
| `templateRef` property   | `ArtifactTypeProps` / `ArtifactType` | New property + getter        |
| `GetActiveSchemaOptions` | `get-active-schema.ts`               | New interface                |
| `GetActiveSchemaResult`  | `get-active-schema.ts`               | New discriminated union type |
| `_executeRaw()`          | `GetActiveSchema`                    | New private method           |
| `_schemaRef`             | `GetActiveSchema`                    | New private field            |
| `serializeSchema()`      | `show.ts` (or helper file)           | New function                 |

## Testing

- **`ArtifactType`**: Update existing unit tests to verify `templateRef` is preserved alongside `template`.
- **`GetActiveSchema`**: Add unit tests for raw mode — mock `SchemaRegistry.resolveRaw()`, verify it returns `SchemaYamlData` without calling `buildSchema`. Test with and without `resolveTemplates`. Test project, ref, and file modes.
- **`buildSchema`**: Update existing tests to verify `templateRef` is passed through from raw data.
- **CLI `show.ts`**: No existing tests. Add integration tests covering: full output includes all fields, `--templates` resolves content, `--raw` returns unresolved data, `--raw --templates` combines both.

## Documentation

- Update `docs/cli/cli-reference.md` — the `### schema show` section (around line 714) needs the new `--raw` and `--templates` flags added to the options table and examples.

## Open questions

None.
