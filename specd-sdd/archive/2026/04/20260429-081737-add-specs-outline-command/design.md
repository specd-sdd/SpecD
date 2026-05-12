# Design: add-specs-outline-command

## Affected areas

- **`packages/core/src/application/use-cases/get-spec-outline.ts` (NEW)**
  - A new use case to handle the retrieval of an artifact and generate its outline.
- **`packages/core/src/composition/kernel.ts`**
  - The `Kernel` interface and `createKernel` function will be updated to expose `changes.getSpecOutline` (or perhaps it belongs in `specs.getOutline` since it operates on specs, not a specific change). I will place it in `specs.getOutline`.
  - Impact: Moderate. All CLI commands consuming `kernel.specs` could see it, but no existing command behavior changes.
- **`packages/cli/src/commands/spec/outline.ts` (NEW)**
  - New CLI subcommand implementation.
- **`packages/cli/src/index.ts`**
  - Register the `specs outline` command.
  - Impact: Low.
- **`docs/cli/cli-reference.md`**
  - CLI reference documentation must be updated to include the new command and its usage.

## New constructs

### `GetSpecOutline` (Use Case)

- **Location**: `packages/core/src/application/use-cases/get-spec-outline.ts`
- **Shape**:

  ```typescript
  export interface GetSpecOutlineInput {
    readonly workspace: string
    readonly specPath: string
    readonly artifactId?: string
    readonly filename?: string
  }

  export interface SpecOutlineResult {
    readonly filename: string
    readonly outline: readonly OutlineEntry[]
  }

  export class GetSpecOutline {
    constructor(
      private readonly specs: ReadonlyMap<string, SpecRepository>,
      private readonly schemaProvider: LazySchemaProvider,
      private readonly parsers: ArtifactParserRegistry,
    ) {}

    async execute(input: GetSpecOutlineInput): Promise<readonly SpecOutlineResult[]>
  }
  ```

- **Responsibility**: Resolves target artifacts from input flags, reads their content, parses them, and returns their hierarchical outline.
- **Relationships**: Depends on `SpecRepository` (for reading files), `LazySchemaProvider` (to resolve `artifactId` to filenames), and `ArtifactParserRegistry` (to parse and generate the outline).

## Approach

1.  **Core Use Case (`GetSpecOutline`)**:
    - Resolve target filenames. If neither `artifactId` nor `filename` is provided, default to `spec.md`.
    - If `artifactId` is provided, use `schemaProvider.get()` to find the artifact definition. Validate that the artifact definition has `scope === 'spec'`. If not, throw a validation error (e.g. `DomainError`). Use its `output` basename as the filename.
    - If both are provided and resolve to the same filename, deduplicate the targets.
    - For each target filename, use the `SpecRepository` for the given workspace to read the file. If a file is not found, throw a `CoreError`.
    - Determine the appropriate `ArtifactParser` from the `ArtifactParserRegistry` based on the file extension.
    - Parse the content into an `ArtifactAST`.
    - Call `parser.outline(ast)` to get the `OutlineEntry[]`.
    - Return an array of `SpecOutlineResult`.

2.  **Kernel Integration**:
    - Add `getOutline: GetSpecOutline` to `Kernel['specs']`.
    - Instantiate it in `createKernel` passing `i.specs`, `schemaProvider`, and `i.parsers`.

3.  **CLI Command (`specs outline`)**:
    - Create a command mirroring the structure of `spec show`.
    - Use `parseSpecId` to split the positional `<specPath>` argument into workspace and capability path.
    - Call `kernel.specs.getOutline.execute(...)` with the parsed ID and flags (`--artifact`, `--file`).
    - Format output:
      - If `--format` is `text` or `json`, output `JSON.stringify(result, null, 2)`.
      - If `--format` is `toon`, use the `output(result, 'toon')` formatter.
    - Handle domain errors gracefully using `cliError`.

## Testing

**Automated tests**:

- `packages/core/test/application/use-cases/get-spec-outline.spec.ts`: Unit tests covering:
  - All scenarios defined in `verify.md` (resolution, deduplication, parsers).
  - Additional edge cases and error paths (unknown artifact ID, file not found, non-spec scope validation).
- `packages/cli/test/commands/spec/outline.spec.ts`: Unit tests covering:
  - All scenarios defined in `verify.md` (flag combinations, output formats, deduplication).
  - Additional edge cases and CLI-specific error mapping (domain errors to CLI errors).

**Manual / E2E verification**:

- Run `specd specs outline core:core/get-spec-outline --format toon` -> should display the outline for `spec.md` in toon format.
- Run `specd specs outline core:core/get-spec-outline --artifact verify` -> should display the outline for `verify.md`.
- Run `specd specs outline core:core/get-spec-outline --artifact design` -> should show a clear CLI error about invalid scope.
- Run `specd specs outline core:core/get-spec-outline --artifact specs --file spec.md` -> should display the outline only once.
- Run `specd specs outline core:core/get-spec-outline --artifact nonexistent` -> should show a clear CLI error.
