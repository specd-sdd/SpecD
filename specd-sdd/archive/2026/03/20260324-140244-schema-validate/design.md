# Design: schema-validate

## Non-goals

- **No changes to `ResolveSchema`** — the project-resolved mode delegates to it as-is.
- **No new ports** — `SchemaRegistry` already handles all schema resolution I/O.
- **No schema repair or fix suggestions** — the command reports errors, it does not fix them.

## Affected areas

### `packages/core/src/application/use-cases/` — new file

New `validate-schema.ts` containing the `ValidateSchema` use case.

### `packages/core/src/composition/kernel.ts` — add validateSchema to specs group

Wire `ValidateSchema` in the `specs` group of the kernel, passing `i.schemas` (SchemaRegistry), the `buildSchema` function, and the existing `resolveSchema` instance.

### `packages/core/src/composition/kernel.ts` — Kernel interface

Add `validateSchema: ValidateSchema` to the `specs` group in the `Kernel` interface.

### `packages/core/src/composition/index.ts` — revert parseSchemaYaml export

Remove the `parseSchemaYaml` re-export that was incorrectly added in the previous implementation round.

### `packages/cli/src/commands/schema/validate.ts` — rewrite

Replace the current implementation (which imports domain/infrastructure directly) with a thin adapter that calls `kernel.specs.validateSchema.execute(...)`.

### `packages/cli/src/index.ts` — already registered

`registerSchemaValidate` is already imported and registered — no change needed.

### `packages/cli/test/commands/schema-validate.spec.ts` — rewrite

Replace tests to mock the kernel's `validateSchema.execute` instead of mocking `parseSchemaYaml`/`buildSchema`.

## New constructs

### `ValidateSchema` (use case)

- **Location:** `packages/core/src/application/use-cases/validate-schema.ts`
- **Shape:**

  ```typescript
  interface ValidateSchemaInput =
    | { mode: 'project'; schemaRef: string; schemaPlugins: readonly string[]; schemaOverrides: SchemaOperations | undefined }
    | { mode: 'project-raw'; schemaRef: string }
    | { mode: 'file'; filePath: string }

  type ValidateSchemaResult =
    | { valid: true; schema: Schema; warnings: string[] }
    | { valid: false; errors: string[]; warnings: string[] }

  class ValidateSchema {
    constructor(
      schemas: SchemaRegistry,
      buildSchemaFn: (ref: string, data: SchemaYamlData, templates: ReadonlyMap<string, string>) => Schema,
      resolveSchema: ResolveSchema,
    )
    async execute(input: ValidateSchemaInput): Promise<ValidateSchemaResult>
  }
  ```

- **Responsibility:** Validates a schema via one of three modes. Returns structured results — never throws for validation failures.
- **Relationships:** Depends on `SchemaRegistry` port, `buildSchema` domain service (injected as function), and `ResolveSchema` use case. Wired by the kernel. CLI imports only the kernel.

### `registerSchemaValidate` (CLI command — rewritten)

- **Location:** `packages/cli/src/commands/schema/validate.ts`
- **Shape:** `export function registerSchemaValidate(parent: Command): void`
- **Responsibility:** Thin adapter. Parses CLI flags, calls `kernel.specs.validateSchema.execute(input)`, formats the result. Contains zero validation logic.
- **Relationships:** Imports `resolveCliContext` and formatter utilities only.

## Approach

### Core: `ValidateSchema` use case

Three modes, dispatched by `input.mode`:

**`project` mode:**

1. Construct a temporary `ResolveSchema` with the provided params — actually, the kernel already has a pre-wired `ResolveSchema`. But `ValidateSchema` receives it via constructor, so it just calls `this._resolveSchema.execute()`.
2. Catch `SchemaValidationError`/`SchemaNotFoundError` → return `{ valid: false, errors: [err.message], warnings: [] }`.
3. On success → return `{ valid: true, schema, warnings: [] }`.

Wait — the pre-wired `ResolveSchema` in the kernel already has the project's plugins/overrides baked in. So for `project` mode, the use case can just call `resolveSchema.execute()` directly. But the input provides `schemaRef`, `schemaPlugins`, `schemaOverrides` — this is because the CLI reads these from config. Actually, the simpler design: since the kernel already wires `ResolveSchema` with the right config, `project` mode just delegates to the existing `resolveSchema` instance. The input for project mode needs no parameters beyond `mode: 'project'`.

Revised input:

```typescript
type ValidateSchemaInput =
  | { mode: 'project' }
  | { mode: 'project-raw' }
  | { mode: 'file'; filePath: string }
```

The `ResolveSchema` instance already knows the schemaRef, plugins, and overrides. For `project-raw`, the use case uses the `SchemaRegistry` and `buildSchema` directly (the registry's ref comes from the same config the kernel used).

But the use case needs to know the `schemaRef` for `project-raw` mode. It can receive it at construction time alongside `ResolveSchema`.

Final constructor:

```typescript
constructor(
  schemas: SchemaRegistry,
  schemaRef: string,
  buildSchemaFn: typeof buildSchema,
  resolveSchema: ResolveSchema,
)
```

**`project` mode:**

1. Call `this._resolveSchema.execute()`.
2. Catch errors → structured failure result.
3. Success → structured success result.

**`project-raw` mode:**

1. Call `this._schemas.resolveRaw(this._schemaRef)` to get raw data + templates.
2. If null → failure with "not found".
3. If `data.extends` is defined, resolve the extends chain: walk `resolveRaw` calls, detect cycles by tracking resolved paths, cascade data using child-overrides-parent semantics (reuse the same overlay logic as `ResolveSchema._resolveAndCascadeExtends`, but extracted or duplicated — see Key Decisions).
4. Call `this._buildSchema(ref, cascadedData, mergedTemplates)`.
5. Catch errors → structured failure result.

**`file` mode:**

1. Call `this._schemas.resolveRaw(filePath)` — the registry accepts absolute/relative paths.
2. If null → failure with "file not found".
3. If `data.extends` is defined, resolve extends chain (same as project-raw). Add warnings for each resolved parent: `extends '<ref>' resolved from <resolvedPath>`.
4. Call `this._buildSchema(ref, cascadedData, mergedTemplates)`.
5. Catch errors → structured failure result.

### Extends chain resolution

Both `project-raw` and `file` modes need extends chain resolution. `ResolveSchema` already has this logic in `_resolveAndCascadeExtends`, but it's a private method. Options:

1. **Extract to a shared function** — pull the extends cascade logic into a domain service or a standalone function in the application layer.
2. **Duplicate** — reimplement the ~40 lines of extends walking in `ValidateSchema`.

Decision: **Extract** a shared `resolveExtendsChain` function. See Key Decisions.

### CLI: thin adapter

1. Parse flags: `--file`, `--raw`, `--format`, `--config`.
2. If `--file` and `--raw` both present → `cliError('--file and --raw are mutually exclusive')`.
3. Resolve CLI context (for project modes) or just build input (for file mode).
4. For `--file` mode: the CLI still needs the kernel for `SchemaRegistry` access. So it always calls `resolveCliContext` — even for file mode, the kernel provides `validateSchema`.
5. Call `kernel.specs.validateSchema.execute(input)`.
6. Format result based on `valid`/`invalid` and `--format`.

### Output formatting

**Text — success:**

- Project: `schema valid: <name> v<version> (<N> artifacts, <M> workflow steps)`
- Project raw: same with `[raw]` suffix
- File: same with `[file]` suffix
- Warnings appended as `  warning: <text>`

**Text — failure:** `schema validation failed:` + indented error lines.

**JSON/toon:** Structured objects as specified in the CLI spec.

**Exit codes:** 0 on valid, 1 on invalid. Config-not-found errors for project modes go through `handleError` (exit 1).

## Key decisions

**Decision: Extract extends chain resolution from `ResolveSchema`** → Both `ResolveSchema` and `ValidateSchema` need to resolve extends chains. Rather than duplicating the logic, extract a `resolveExtendsChain(schemas: SchemaRegistry, baseRaw: SchemaRawResult): Promise<{ cascadedData: SchemaYamlData; templates: Map<string, string> }>` function. This can live in `application/use-cases/resolve-extends-chain.ts` as a shared helper (not a use case class — it's a pure async function that uses the `SchemaRegistry` port). `ResolveSchema` and `ValidateSchema` both call it.

**Alternatives rejected:** Duplicating ~40 lines — would drift. Making `ValidateSchema` extend or compose `ResolveSchema` — `ResolveSchema` does too much (plugins, overrides, merge) for raw/file modes.

**Decision: `ValidateSchema` receives `ResolveSchema` for project mode** → The kernel already wires `ResolveSchema` with the right config. Rather than passing all config params through, `ValidateSchema` receives the pre-wired instance and delegates `project` mode to it. For `project-raw` and `file` modes it uses `SchemaRegistry` + `buildSchema` directly.

**Decision: File mode requires `resolveCliContext`** → Even though file mode doesn't use `specd.yaml` for plugins/overrides, the `ValidateSchema` use case needs a `SchemaRegistry` to resolve extends refs (which may point to npm packages or workspace schemas). The kernel provides this. If the user runs `--file` without a project, config discovery fails — this is acceptable because extends resolution needs the registry.

**Alternatives rejected:** Creating a standalone registry for file mode — over-engineering. Making file mode work without config — extends refs like `@specd/schema-std` need npm resolution, which requires a configured registry.

**Decision: `buildSchema` injected as function parameter** → Rather than importing the domain service module directly (which would work architecturally — application CAN import domain), injection makes the use case testable with a mock.

## Trade-offs

**[Risk: File mode requires a project context]** → If a user runs `--file` on a schema outside a project, config discovery fails. Mitigation: the error message is clear (standard config-not-found). A future enhancement could support a `--no-config` flag that creates a minimal registry for npm-only resolution.

**[Risk: Extracting `resolveExtendsChain` changes `ResolveSchema`]** → Mitigation: the extraction is a pure refactor — `ResolveSchema` calls the new function instead of its private method. Behavior is identical. Covered by existing tests.

## Testing

### Automated tests — core

**File:** `packages/core/test/application/use-cases/validate-schema.spec.ts`

| Scenario                             | Assertion                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| Project mode valid                   | Mock `resolveSchema.execute()` returning Schema → `{ valid: true }`                |
| Project mode with missing plugin     | Mock `resolveSchema.execute()` throwing `SchemaNotFoundError` → `{ valid: false }` |
| Project mode with validation error   | Mock throwing `SchemaValidationError` → `{ valid: false }`                         |
| Project-raw mode valid               | Mock `resolveRaw` returning valid data → `{ valid: true }`                         |
| Project-raw mode with extends        | Mock chain of `resolveRaw` calls → cascaded data → `{ valid: true }`               |
| Project-raw mode not found           | Mock `resolveRaw` returning null → `{ valid: false }`                              |
| Project-raw mode with semantic error | Mock `buildSchema` throwing → `{ valid: false }`                                   |
| File mode valid                      | Mock `resolveRaw` for file path → `{ valid: true }`                                |
| File mode with extends               | Mock chain → `{ valid: true }` + warnings                                          |
| File mode not found                  | Mock `resolveRaw` returning null → `{ valid: false }`                              |
| File mode with invalid artifact ID   | Mock `buildSchema` throwing → `{ valid: false }`                                   |
| File mode with circular extends      | Mock cycle → `{ valid: false }`                                                    |
| File mode with unresolvable extends  | Mock null for parent → `{ valid: false }`                                          |
| File mode extends warning            | Assert warning string format                                                       |

**File:** `packages/core/test/application/use-cases/resolve-extends-chain.spec.ts`

| Scenario                     | Assertion                                                |
| ---------------------------- | -------------------------------------------------------- |
| No extends returns base data | Input with no extends → same data returned               |
| Single extends level         | Parent resolved → data cascaded                          |
| Multi-level extends chain    | Root → parent → child cascaded in order                  |
| Cycle detected               | Same path seen twice → `SchemaValidationError` thrown    |
| Parent not found             | `resolveRaw` returns null → `SchemaNotFoundError` thrown |

### Automated tests — CLI

**File:** `packages/cli/test/commands/schema-validate.spec.ts`

| Scenario                        | Assertion                                                                   |
| ------------------------------- | --------------------------------------------------------------------------- |
| No flags → project mode         | `validateSchema.execute` called with `{ mode: 'project' }`                  |
| `--raw` → project-raw mode      | Called with `{ mode: 'project-raw' }`                                       |
| `--file` → file mode            | Called with `{ mode: 'file', filePath }`                                    |
| `--file` + `--raw` → error      | stderr contains "mutually exclusive", exit 1                                |
| Valid → exit 0 + success text   | Assert format                                                               |
| Invalid → exit 1 + failure text | Assert format                                                               |
| JSON success keys               | Assert `result`, `schema`, `artifacts`, `workflowSteps`, `mode`, `warnings` |
| JSON failure keys               | Assert `result: "error"`, `errors`, `mode`                                  |
| `[raw]` suffix in raw mode      | Assert text output                                                          |
| `[file]` suffix in file mode    | Assert text output                                                          |
| No config → config-not-found    | Assert handleError called                                                   |

### Manual / E2E verification

1. `node packages/cli/dist/index.js schema validate` — project resolved mode
2. `node packages/cli/dist/index.js schema validate --raw` — project raw mode
3. `node packages/cli/dist/index.js schema validate --file packages/schema-std/schema.yaml` — file mode
4. `node packages/cli/dist/index.js schema validate --file /tmp/bad.yaml` — invalid file
5. `node packages/cli/dist/index.js schema validate --file ./nonexistent.yaml` — not found
6. `node packages/cli/dist/index.js schema validate --file --raw` — mutually exclusive error

## Open questions

None.
