# Design: config-cascade-variants

## Non-goals

- Support repeated `--config` flags or multi-entrypoint explicit composition.
- Introduce AST-wide selector syntax for config removal.
- Change plugin-management semantics beyond keeping `plugins.agents` removable by `name`.
- Rework schema override behavior; `schemaOverrides` remains separate from config cascade.

## Affected areas

- `packages/core/src/infrastructure/fs/config-loader.ts`
  Change: replace single-winner discovery (`findConfigFile`) with layered candidate discovery plus closed-chain explicit resolution; extend parsing, validation, and merge logic for `extends`, `remove`, `context.id`, and variant ordering.
  Callers/dependents: `FsConfigLoader.load()`, `resolvePath()`, `createKernel()`, and `FsChangeRepository.delete()` are on the impact path. Graph impact shows 3 direct dependents and 3 transitive dependents for `findConfigFile`, `load`, and `resolvePath`. Risk: MEDIUM.
  Note: this is the main integration hotspot because kernel composition and repository wiring consume the resolved `SpecdConfig`.

- `packages/core/src/application/specd-config.ts`
  Change: extend `SpecdContextEntry` and related config types to represent optional `id`, parsed inheritance metadata, and normalized removal structures without leaking YAML details into callers.
  Callers/dependents: `SpecdConfig`, `SpecdWorkspaceConfig`, and `SpecdStorageConfig` flow into `createKernel()` and `isSpecdConfig()`. Graph impact shows `SpecdConfig` and `SpecdStorageConfig` as MEDIUM-risk shared types.
  Note: keep the externally consumed `SpecdConfig` stable enough that CLI and kernel callers do not need widespread rewrites.

- `packages/core/src/application/ports/config-loader.ts`
  Change: refresh doc comments to describe layered discovery and closed-chain forced mode so port-level behavior matches the implementation and updated specs.
  Callers/dependents: imported by composition and all delivery adapters via `createConfigLoader`. Risk: LOW for code, MEDIUM for contract clarity.

- `packages/core/src/application/ports/config-writer.ts`
  Change: update the `initProject` contract comments to require both `specd.local.yaml` and `specd.local.*.yaml` gitignore entries.
  Callers/dependents: direct dependents include CLI plugin commands and `InitProject`. Spec metadata shows downstream dependents in `cli:plugins-install`, `cli:plugins-list`, `cli:plugins-uninstall`, and `cli:plugins-update`. Risk: LOW.

- `packages/core/src/infrastructure/fs/config-writer.ts`
  Change: append both local gitignore entries, and likely generalize `appendToGitignore()` so one init flow can register multiple lines deterministically.
  Callers/dependents: `InitProject` plus `config-writer.spec.ts`. Graph impact shows this file in the affected file set from the config change. Risk: MEDIUM.

- `packages/core/test/infrastructure/fs/config-loader.spec.ts`
  Change: replace exclusive `specd.local.yaml` tests with cascade-order, `extends: true`, explicit-base attach/skip, closed-chain `--config`, remove validation, and merge semantics coverage.
  Callers/dependents: test-only. Risk: LOW, but coverage is broad and will be the main executable proof of the design.

- `packages/core/test/infrastructure/fs/config-writer.spec.ts`
  Change: assert `.gitignore` contains both `specd.local.yaml` and `specd.local.*.yaml`, and remains idempotent.
  Callers/dependents: test-only. Risk: LOW.

- `packages/core/test/application/use-cases/init-project.spec.ts`
  Change: keep delegation assertions but update expectations for the broader init side effects described by the port/spec pair.
  Callers/dependents: test-only. Risk: LOW.

- `packages/core/test/application/use-cases/compile-context.spec.ts`
  Change: add at least one scenario proving `context` entries with `id` remain valid and do not change emitted content order.
  Callers/dependents: test-only. Risk: LOW.

- `docs/adr/0012-config-file-strategy.md` or the closest user-facing config docs under `docs/`
  Change: document the new layered discovery model, `extends` forms, closed-chain `--config`, and the gitignored local-variant convention.
  Callers/dependents: human-facing only. Risk: LOW, but required so docs do not contradict the new runtime behavior.

## New constructs

- `ConfigCascadeLayer` in `packages/core/src/infrastructure/fs/config-loader.ts`
  Shape:

  ```ts
  interface ConfigCascadeLayer {
    readonly path: string
    readonly dir: string
    readonly raw: Record<string, unknown>
    readonly extendsMode: 'standalone' | 'previous' | 'explicit'
    readonly extendsPath?: string
  }
  ```

  Responsibility: represent one parsed config candidate before final merge; it does not expose kernel-facing resolved config.
  Relationships: created by loader-internal discovery helpers; consumed only by the cascade resolver and merge pipeline.

- `ResolvedConfigCascade` in `packages/core/src/infrastructure/fs/config-loader.ts`
  Shape:

  ```ts
  interface ResolvedConfigCascade {
    readonly rootPath: string
    readonly activeLayers: readonly ConfigCascadeLayer[]
  }
  ```

  Responsibility: carry the resolved active chain used by both `load()` and `resolvePath()`.
  Relationships: returned by a new internal resolver; `load()` consumes `activeLayers`, `resolvePath()` returns `rootPath`.

- `SpecdConfigRemoval` and typed removal helpers in `packages/core/src/application/specd-config.ts`
  Shape:

  ```ts
  export interface SpecdConfigRemoval {
    readonly root?: readonly string[]
    readonly workspaces?: readonly string[]
    readonly storage?: readonly string[]
    readonly context?: readonly Array<{
      readonly id?: string
      readonly file?: string
      readonly instruction?: string
    }>
    readonly plugins?: {
      readonly agents?: readonly Array<{ readonly name: string }>
    }
  }
  ```

  Responsibility: normalize the authored `remove` block into a kernel-facing shape that the loader can validate and apply deterministically.
  Relationships: parsed in `FsConfigLoader`, carried only as an intermediate config construct unless later code needs provenance/debugging.

- `appendGitignoreEntries()` helper in `packages/core/src/infrastructure/fs/config-writer.ts`
  Shape:
  ```ts
  async function appendGitignoreEntries(
    gitignorePath: string,
    entries: readonly string[],
  ): Promise<void>
  ```
  Responsibility: add multiple gitignore entries idempotently while preserving existing file content and line endings behavior.
  Relationships: called only by `FsConfigWriter.initProject`; replaces single-entry helper usage.

## Approach

1. Extend the raw config model before touching discovery.
   Add raw Zod support for:
   - `extends?: true | string`
   - `remove?: { root?: string[]; workspaces?: string[]; storage?: string[]; context?: matcher[]; plugins?: { agents?: { name: string }[] } }`
   - `context[]` entries with optional `id`
     This keeps all cascade-specific failures on the `ConfigValidationError` path required by `core:config` and `core:config-loader`.

2. Replace `findConfigFile()` with two internal phases:
   - candidate discovery for one directory: collect `specd.yaml`, `specd.*.yaml`, `specd.local.yaml`, and `specd.local.*.yaml` in the required order
   - chain resolution: walk those candidates left-to-right, deciding whether each candidate becomes a new standalone root, attaches to the previous active layer, or is skipped because its explicit base is inactive
     Forced mode bypasses candidate discovery entirely and resolves the selected file plus its explicit `extends` chain as a closed set.

3. Merge active layers into one raw config object before building `SpecdConfig`.
   The merge pipeline should stay in `config-loader.ts` rather than leaking into domain services because the semantics are specific to project config, not generic schema merge.
   Merge order:
   - start from the first active root
   - for each later active layer, deep-merge objects and append arrays
   - apply `remove.root`, keyed-map removals, and array removals against the accumulated result immediately after merging that layer

4. Validate removal targets after inheritance context is known.
   Structural Zod validation alone is not enough for:
   - `remove` without `extends`
   - `remove.root` targeting `schema`
   - missing `workspaces` / `storage` keys
   - non-resolvable `context` or `plugins.agents` removal targets
     These checks belong in loader runtime validation after the active base is known but before the final `SpecdConfig` is returned.

5. Keep `SpecdConfig` kernel-facing and path-resolved.
   After the raw merged config is finalized:
   - resolve paths relative to the active root config directory
   - keep `projectRoot` equal to the active root config directory
   - preserve current workspace/storage/defaulting behavior
   - expose optional `id` on context entries and continue exposing plugin `name` + `config`
     This preserves compatibility for `createKernel()` and `FsChangeRepository`.

6. Update init/config-writer and user-facing docs last.
   `FsConfigWriter.initProject()` only needs broader gitignore behavior, but docs must also explain why committed/shared files and local variants are now distinct.

## Key decisions

- **Decision**: `extends` stays a scalar field with two legal forms: `true` and `<path>`.
  **Rationale**: `extends: true` is the cleanest UX for “previous active layer”; a path string keeps explicit-base variants concise.
  **Alternatives rejected**: `extends: {}` is technically regular but poor UX; `extends.from` adds syntax noise without more capability.

- **Decision**: normal discovery is chain-aware, not purely presence-driven.
  **Rationale**: a discoverable file such as `specd.local.experimental.yaml` must remain inactive unless its explicit base is already active.
  **Alternatives rejected**: `autoload: false` adds a second activation mechanism; pure presence-driven loading would make `.local.*` variants impossible to keep opt-in.

- **Decision**: forced `--config` mode is a closed chain with one entrypoint.
  **Rationale**: this keeps `--config` exact and prevents surprise layering from unrelated discovered files.
  **Alternatives rejected**: repeated `--config` and “discovery continues after explicit file” both create ambiguous precedence rules and broader CLI-surface change.

- **Decision**: config removal is structural and container-scoped.
  **Rationale**: it matches the user’s mental model and the existing `schemaOverrides` style better than AST selectors.
  **Alternatives rejected**: reusing `core:selector-model` directly would force users to target YAML structure instead of config concepts.

- **Decision**: `context[]` gains optional `id`; `plugins.agents[]` continues to use `name`.
  **Rationale**: `context` needs a stable removable identity; plugins already have a natural stable key.
  **Alternatives rejected**: arbitrary field-combination matching is harder to validate and can produce ambiguous removals.

## Trade-offs

- `[Loader complexity]` → Keep cascade resolution in small internal helpers (`discoverCandidates`, `resolveActiveChain`, `mergeLayerIntoRawConfig`) instead of growing `load()` into one monolith.
- `[Backward-compat risk for local configs]` → Preserve the no-`extends` standalone fallback exactly, and prove it with dedicated regression tests.
- `[Type-surface growth in SpecdConfig]` → Add only the minimum new exposed shape (`context.id` and normalized removal intermediates where needed) so downstream callers are not forced to understand cascade internals.
- `[Docs drift]` → Update `docs/adr/0012-config-file-strategy.md` or equivalent config docs in the same implementation so user guidance matches runtime behavior.

## Spec impact

### `core:config`

- Direct dependents from metadata: `core:config-loader`, `core:init-project`, `core:config-writer-port`, `core:workspace`, `core:compile-context`, `core:get-project-context`, `core:get-spec-context`, `core:get-hook-instructions`, `core:get-active-schema`, `core:resolve-schema`, `core:run-step-hooks`, `core:invalidate-change`, `core:record-skill-install`, `core:get-skills-manifest`, plus many CLI/plugin-manager/plugin-agent specs.
- Transitive dependents: `cli:entrypoint`, `cli:project-init`, `cli:config-show`, graph commands, plugin-manager use cases, and plugin-agent specs through `core:config`.
- Assessment: no additional spec deltas are required now because dependent specs consume `core:config` at a higher-level contract boundary and their requirements remain satisfied if the loader and writer uphold the new config semantics. The biggest risk is runtime behavior, not wording mismatch.

### `core:config-loader`

- Direct dependents from metadata and graph: composition/kernel and CLI entrypoint code paths rely on loader behavior.
- Transitive dependents: commands that resolve kernel/context/config.
- Assessment: no separate spec additions are needed because `core:config-loader` already owns the loading contract; downstream specs do not define the local precedence algorithm themselves.

### `core:init-project`

- Direct dependent from metadata: `core:kernel`.
- Transitive practical dependents: `cli:project-init`.
- Assessment: only the gitignore side effect changes; no downstream spec wording appears invalidated.

### `core:config-writer-port`

- Direct dependents from metadata: `cli:plugins-install`, `cli:plugins-list`, `cli:plugins-uninstall`, `cli:plugins-update`.
- Assessment: plugin methods are unchanged; only `initProject` side effects broaden. No downstream spec ripple requires new deltas.

## Dependency map

```mermaid
graph LR
  proposal[proposal/specs/verify]
  cfgspec[core:config]
  loaderSpec[core:config-loader]
  writerSpec[core:config-writer-port]
  initSpec[core:init-project]
  rawTypes[specd-config.ts]
  loader[config-loader.ts]
  writer[config-writer.ts]
  kernel[createKernel()]
  repo[FsChangeRepository]
  loaderTests[config-loader.spec.ts]
  writerTests[config-writer.spec.ts]
  initTests[init-project.spec.ts]

  proposal --> cfgspec
  proposal --> loaderSpec
  proposal --> writerSpec
  proposal --> initSpec
  cfgspec -.depends on.-> loaderSpec
  cfgspec -.depends on.-> writerSpec
  rawTypes --> loader
  loader --> kernel
  loader --> repo
  writer --> initSpec
  loader --> loaderTests
  writer --> writerTests
  writer --> initTests
```

```text
┌────────────────────┐      ┌──────────────────────────────┐
│ core:config        │─────▶│ config-loader.ts            │
│ core:config-loader │      │  - discoverCandidates()     │
│ core:init-project  │      │  - resolveActiveChain()     │
│ core:config-writer │      │  - mergeLayerIntoRawConfig()│
└─────────┬──────────┘      └──────────────┬───────────────┘
          │                                │
          │                                ├──────────────▶┌──────────────────┐
          │                                │               │ createKernel()   │
          │                                └──────────────▶│ FsChangeRepo     │
          ▼                                                └──────────────────┘
┌────────────────────┐
│ specd-config.ts    │
│  - SpecdConfig     │
│  - SpecdContextEntry
│  - removal helpers │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐      ┌──────────────────────────────┐
│ config-writer.ts   │─────▶│ .gitignore + initProject     │
│ appendGitignore... │      │ specd.local.yaml             │
└─────────┬──────────┘      │ specd.local.*.yaml           │
          │                 └──────────────────────────────┘
          ▼
┌───────────────────────────────────────────────────────────┐
│ Tests: config-loader.spec.ts · config-writer.spec.ts     │
│        init-project.spec.ts · compile-context.spec.ts    │
└───────────────────────────────────────────────────────────┘
```

## Migration / Rollback

- Migration is code-only plus docs: existing projects keep working because `specd.local.yaml` without `extends` remains standalone.
- Rollback is safe if needed: reverting the loader/writer/type changes restores the old exclusive-local behavior; no persistent data migration is involved.
- The only user-visible persisted output is `.gitignore`, which can harmlessly keep the broader local-variant pattern even after rollback.

## Testing

**Automated tests**

- `packages/core/test/infrastructure/fs/config-loader.spec.ts`
  Add coverage for:
  - discovery order across `specd.yaml`, `specd.*.yaml`, `specd.local.yaml`, `specd.local.*.yaml`
  - `extends: true` inheriting previous layer
  - `extends: <path>` attaching only when explicit base is active
  - explicit `--config` closed-chain behavior with no extra discovered layers
  - standalone local fallback with no `extends`
  - scalar/object/array merge semantics
  - `remove.root`, `remove.workspaces`, `remove.storage`, `remove.context`
  - `remove` without `extends` and invalid explicit-base errors as `ConfigValidationError`

- `packages/core/test/infrastructure/fs/config-writer.spec.ts`
  Add/adjust scenarios for:
  - `.gitignore` containing both `specd.local.yaml` and `specd.local.*.yaml`
  - idempotent re-run of `initProject` not duplicating either entry

- `packages/core/test/application/use-cases/init-project.spec.ts`
  Keep delegation assertions and update any expected side-effect language to mention the broader local-variant gitignore convention.

- `packages/core/test/application/use-cases/compile-context.spec.ts`
  Add a scenario showing `context` entries with `id` remain valid and still emit identical compiled content ordering.

- If `specd-config.ts` grows non-trivial normalization helpers, add focused unit coverage in the closest existing config-loader test file instead of introducing a new isolated test file.

**Manual / E2E verification**

- Create a temp repo with:
  - `specd.yaml`
  - `specd.local.yaml` both with and without `extends: true`
  - named shared variants and named local variants
  - one explicit-base pair: `specd.experimental.yaml` + `specd.local.experimental.yaml`
- Run:
  - `node packages/cli/dist/index.js config show --format text`
  - `node packages/cli/dist/index.js project status --format toon`
  - any command that loads the kernel with `--config`
- Confirm:
  - normal discovery loads the expected chain
  - explicit mode loads only the selected chain
  - invalid cascade instructions surface as structured `SpecdError`/`ConfigValidationError`
  - `specd init` writes both local gitignore entries

Apply global constraints while implementing:

- architecture: keep parsing/merge I/O in infrastructure, do not move file access into domain/application
- conventions: ESM, no default exports, no `any`, explicit names
- docs/JSDoc: update comments on port/types/helpers that change contract meaning
- testing: extend existing suites rather than creating ad hoc unscoped tests

## Open questions

None. The proposal already closed the `--config` and explicit-base semantics needed to derive implementation tasks.
