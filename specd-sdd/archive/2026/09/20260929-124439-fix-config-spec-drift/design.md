# Design: fix-config-spec-drift

## Context & scope

This design addresses the spec-code discrepancies documented in GitHub Issue #57. During the `config-cascade-variants` audit (`20260520-095622`), three areas of spec drift were identified across `@specd/core` specifications (`core:config`, `core:config-loader`, `core:config-writer-port`).

The scope of this design is purely synchronizing the specifications and verification scenarios to match existing code contracts and architectural boundaries in `@specd/core`. No application, domain, or infrastructure production code modifications are required.

## Affected areas

### Specifications

- `specs/core/config/spec.md`:
  - Update `ConfigWriter` port interface requirement to document `initProject(options: InitProjectOptions)` (single parameter).
  - Update `listPlugins(configPath: string, type?: string)` (optional `type` filter).
- `specs/core/config/verify.md`:
  - Update `Scenario: ConfigWriter port defines listPlugins method` to include optional parameter `type?`.
- `specs/core/config-loader/spec.md`:
  - Rename `### Requirement: Workflow and context entry mapping` to `### Requirement: Schema plugins, schema overrides, and context entry mapping`.
- `specs/core/config-loader/verify.md`:
  - Rename requirement heading to `### Requirement: Schema plugins, schema overrides, and context entry mapping`.
  - Remove obsolete scenarios `Scenario: Run hook mapped to typed form` and `Scenario: Instruction hook mapped to typed form`.
- `specs/core/config-writer-port/spec.md`:
  - Add `### Requirement: ListPlugins` detailing optional `type?: string` filter and fallback to returning all declared plugins.
- `specs/core/config-writer-port/verify.md`:
  - Add `### Requirement: ListPlugins` with `Scenario: ListPlugins filters by type or returns all plugins`.

### Production Code (Audited & Confirmed Unchanged)

- `packages/core/src/application/ports/config-writer.ts`: Already declares single-parameter `initProject` and optional `type?: string` in `listPlugins`.
- `packages/core/src/infrastructure/fs/config-writer.ts`: Implements `initProject(options)` and `listPlugins(configPath, type?)`.
- `packages/core/src/infrastructure/fs/config-loader.ts`: Preserves raw `schemaOverrides` without transforming workflow hooks.
- `packages/core/src/infrastructure/schema-yaml-parser.ts`: Correctly handles hook transformation at schema resolution time.

## Approach & architecture

1. **Hexagonal Architecture Preservation**:
   - `ConfigWriter` in `application/ports/config-writer.ts` defines the port contract.
   - `FsConfigWriter` in `infrastructure/fs/config-writer.ts` implements the port.
   - `initProject` uses `InitProjectOptions` which packages `projectRoot` alongside other setup parameters, avoiding redundant `(configPath, options)` parameters.
   - `listPlugins` provides an optional filter `type?: string`. When omitted, it returns all plugins across all types.

2. **Separation of Concerns for Schema Hook Normalization**:
   - `ConfigLoader` is responsible for discovery, cascade loading, and shallow structural validation of `specd.yaml` layers. It preserves raw `schemaOverrides`.
   - `ResolveSchema` and `schema-yaml-parser` are responsible for domain parsing and normalization, converting `{ id, run }` to `{ id, type: 'run', command }` and `{ id, instruction }` to `{ id, type: 'instruction', text }`.
   - Removing the obsolete hook mapping verification scenarios from `core:config-loader` eliminates false verification obligations and aligns with the authoritative specification in `core:resolve-schema`.

3. **Code Graph Blast Radius**:
   - `ConfigWriter` has direct dependents in `packages/core/src/composition/config-writer.ts` and `packages/core/src/infrastructure/fs/config-writer.ts`.
   - Because no runtime code signatures or behaviors are modified, the blast radius risk to dependent runtime consumers is negligible (risk: LOW).

## Implementation details

### `ConfigWriter` Port Contract

```ts
export interface ConfigWriter {
  initProject(options: InitProjectOptions): Promise<InitProjectResult>
  addPlugin(
    configPath: string,
    type: string,
    name: string,
    config?: Record<string, unknown>,
  ): Promise<void>
  removePlugin(configPath: string, type: string, name: string): Promise<void>
  listPlugins(
    configPath: string,
    type?: string,
  ): Promise<Array<{ name: string; config?: Record<string, unknown> }>>
}
```

### Spec Deltas

- `deltas/core/config/spec.md.delta.yaml` and `deltas/core/config/verify.md.delta.yaml`
- `deltas/core/config-loader/spec.md.delta.yaml` and `deltas/core/config-loader/verify.md.delta.yaml`
- `deltas/core/config-writer-port/spec.md.delta.yaml` and `deltas/core/config-writer-port/verify.md.delta.yaml`

## Testing strategy

All existing unit tests in `@specd/core` must pass without regressions:

- `packages/core/test/infrastructure/fs/config-writer.spec.ts`: Tests `initProject(defaultOptions())`, `addPlugin`, `removePlugin`, and `listPlugins(configPath)` (both with and without `type`).
- `packages/core/test/infrastructure/fs/config-loader.spec.ts`: Tests config loading and cascade merging.
- `packages/core/test/application/use-cases/resolve-schema.spec.ts`: Tests hook normalization during schema resolution.

Run full test suite:

```bash
pnpm --filter @specd/core test
```

## Documentation

No user-facing guide updates under `docs/` are required:

- `docs/guide/configuration.md` already references the cascade configuration model and schema overrides accurately.
- `docs/adr/0012-config-file-strategy.md` describes high-level file layout and remains accurate.

## Open questions

None.
