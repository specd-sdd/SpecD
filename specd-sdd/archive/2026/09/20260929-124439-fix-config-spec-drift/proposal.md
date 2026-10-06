# Proposal: fix-config-spec-drift

## Motivation

Fix three spec drift discrepancies identified in GitHub Issue #57 where the normative specifications in `@specd/core` drifted from the actual production implementation during earlier config refactorings (`config-cascade-variants`). Aligning specs to code ensures specifications remain the authoritative source of truth without requiring unnecessary runtime code changes.

## Current behaviour

1. `specs/core/config/spec.md` documents `ConfigWriter.initProject(configPath: string, options: InitProjectOptions)` with two parameters, while the actual port interface and implementation take a single parameter `(options: InitProjectOptions)` where `projectRoot` is provided inside `options`.
2. `specs/core/config/spec.md` (and its verification scenario in `verify.md`) documents `ConfigWriter.listPlugins(configPath: string, type: string)` with `type` required, whereas the actual port interface and implementation define `type?: string` as optional (returning all declared plugins across types when omitted).
3. `specs/core/config-loader/verify.md` still contains obsolete scenarios asserting that `ConfigLoader.load()` maps raw workflow step hooks (`hooks.post: [{ run: 'make test' }]` and `hooks.pre: [{ instruction: 'Check coverage' }]`) to typed forms (`type: 'run'` and `type: 'instruction'`), and `specs/core/config-loader/spec.md` retains the section heading `### Requirement: Workflow and context entry mapping`. In reality, `ConfigLoader` preserves raw `schemaOverrides`, while hook normalization is properly handled during schema resolution as specified in `core:resolve-schema`.

## Proposed solution

Update the affected specs to match the current implementation:

1. In `specs/core/config/spec.md`, update `ConfigWriter.initProject` to specify the single-parameter signature `initProject(options: InitProjectOptions): Promise<InitProjectResult>`.
2. In `specs/core/config/spec.md` and `specs/core/config/verify.md`, update `ConfigWriter.listPlugins` to specify `type?: string` as optional.
3. In `specs/core/config-writer-port/spec.md`, clarify that `listPlugins(configPath: string, type?: string)` supports an optional `type` filter.
4. In `specs/core/config-loader/verify.md`, remove the two obsolete hook mapping scenarios (`Scenario: Run hook mapped to typed form` and `Scenario: Instruction hook mapped to typed form`).
5. In `specs/core/config-loader/spec.md`, update the heading `### Requirement: Workflow and context entry mapping` to `### Requirement: Schema plugins, schema overrides, and context entry mapping`.

## Specs affected

### New specs

None.

### Modified specs

- `core:config`: Update `ConfigWriter` port requirement for `initProject` (single parameter) and `listPlugins` (`type` optional).
  - Depends on (added): none
  - Depends on (removed): none
- `core:config-loader`: Remove obsolete hook mapping verification scenarios and update the section heading to reflect schema plugins, overrides, and context mapping.
  - Depends on (added): none
  - Depends on (removed): none
- `core:config-writer-port`: Clarify that `listPlugins` accepts an optional `type?: string` filter parameter.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- Specifications:
  - `specs/core/config/spec.md` and `specs/core/config/verify.md`
  - `specs/core/config-loader/spec.md` and `specs/core/config-loader/verify.md`
  - `specs/core/config-writer-port/spec.md` and `specs/core/config-writer-port/verify.md`
- Codebase impact:
  - Zero code modifications required. `packages/core/src/application/ports/config-writer.ts`, `packages/core/src/infrastructure/fs/config-writer.ts`, `packages/core/src/infrastructure/fs/config-loader.ts`, and `packages/core/src/infrastructure/schema-yaml-parser.ts` already implement and test this exact behavior.

## Technical context

- Audit origin: The discrepancies were discovered during the spec-compliance audit `20260520-095622` for the `config-cascade-variants` change.
- In `core:config-writer-port/spec.md`, the `initProject` single-parameter requirement was already documented, but `core:config/spec.md` had not been synchronized.
- In `packages/core/test/infrastructure/fs/config-writer.spec.ts`, tests already invoke `writer.listPlugins(configPath)` without a `type` parameter and verify that an empty array or all plugin entries are returned.
- In `specs/core/resolve-schema/spec.md` (line 31), the transformation of hook entries (`{ id, run }` → `{ id, type: 'run', command }`) is already specified as part of building the schema override layer. Removing the obsolete test scenarios from `core:config-loader` eliminates false spec-compliance expectations.

## Open questions

None.
