# Proposal: extract-fs-config-loader

## Motivation

The filesystem configuration loader adapter [config-loader.ts](file:///Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/config-loader.ts) grew past 1,500 lines by mixing domain Zod schemas, cascade loading, and the `FsConfigLoader` adapter. Compliance review of that extract also surfaced cross-spec drift and a behavioural gap: explicit `specs` `metadataPath` is resolved then discarded, so repositories never honor the configured path.

## Current behaviour

Config loading already works via `createDefaultConfigLoader()` → `ConfigLoader` (abstract class with `load()` + `resolvePath()`), with Zod schemas in ports and cascade helpers in infrastructure. Remaining issues:

- Purpose prose still names `createConfigLoader` while requirements use `createDefaultConfigLoader`
- For `fs` adapters, `resolveAdapterBinding` drops a declared `metadataPath` after resolving it; composition always re-derives via `resolveMetadataPathForWorkspace`
- Prior drift (`.specd/schemas`, absent-`metadataPath` ownership, factory naming in composition/architecture) is already aligned in deltas

## Proposed solution

1. Keep the completed extract layout (ports schema module, FS cascade module, slim `FsConfigLoader`).
2. Keep aligned drift wording (`.specd/schemas`, absent `metadataPath` owned by composition, `createDefaultConfigLoader`).
3. Fix Purpose naming leftover and make explicit `metadataPath` end-to-end:
   - Loader retains resolved absolute `metadataPath` on the specs adapter binding
   - Composition prefers that value when wiring `SpecRepository`; derives only when absent
4. Add loader (+ composition) tests covering the explicit path

## Specs affected

### New specs

- none

### Modified specs

- `core:config-loader`: Purpose rename; Path resolution retains explicit `metadataPath` on the fs binding; keep `.specd/schemas` defaults.
  - Depends on (added): none
  - Depends on (removed): none
- `core:config`: Absent-`metadataPath` ownership remains kernel/composition; explicit path still resolved by the loader.
  - Depends on (added): none
  - Depends on (removed): none
- `core:composition`: Prefer explicit specs `metadataPath` from loaded adapter config when constructing repositories; keep `createDefaultConfigLoader` naming.
  - Depends on (added): none
  - Depends on (removed): none
- `default:_global/architecture`: Keep `createDefaultConfigLoader` references (no further change expected unless review finds leftovers).
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- Spec/verify deltas for Purpose + explicit `metadataPath` contract
- Code: `resolveAdapterBinding` (fs normalize) and `resolveMetadataPathForWorkspace` / SpecRepository wiring (CRITICAL blast radius on composition-resolver)
- Tests: `config-loader.spec.ts` (+ composition coverage as needed)

## Technical context

- User chose **Both** after full verify: update specs and fix implementation.
- Paragraph `value`-only deltas can silently no-op when `_inlines` are retained; use `removed`+`added` or full section `content` and confirm with `spec-preview`.
- Overlap remains accepted with `implementation-snapshot` (`core:composition`) and `deprecate-ladybug-store` (`core:config`).

## Open questions

none
