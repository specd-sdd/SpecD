# Design: extract-fs-config-loader

## Non-goals

- No change to cascade discovery / merge semantics beyond retaining `metadataPath`.
- No rename of the public factory (already `createDefaultConfigLoader`).
- No dedicated follow-up change for accepted overlap with `implementation-snapshot` / `deprecate-ladybug-store`.

## Affected areas

### Already implemented (extract + prior drift alignment)

- `packages/core/src/application/ports/config-schema.ts` — Zod schemas + pattern helpers.
- `packages/core/src/infrastructure/fs/config-cascade.ts` — discovery / merge / env.
- `packages/core/src/infrastructure/fs/config-loader.ts` — `FsConfigLoader` + `resolveAdapterBinding`.
- `packages/core/src/composition/config-loader.ts` — `createDefaultConfigLoader`.
- Public barrels export factory + options only (not `FsConfigLoader`).

### This pass (explicit metadataPath + Purpose)

| File                                                                      | Change                                                                                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `infrastructure/fs/config-loader.ts` → `resolveAdapterBinding`            | For `fs`, copy resolved absolute `metadataPath` into `normalizedConfig` (alongside `path` / optional `pattern`).                |
| `composition/composition-resolver.ts` → `resolveMetadataPathForWorkspace` | If `workspace.specsAdapter.config.metadataPath` is a non-empty string, return it; else keep existing VCS / fallback derivation. |
| `test/infrastructure/fs/config-loader.spec.ts`                            | Assert explicit `metadataPath` survives `load()` on the specs adapter binding.                                                  |
| Composition / resolver tests (as needed)                                  | Assert SpecRepository wiring prefers explicit path.                                                                             |

**Blast radius:** `resolveMetadataPathForWorkspace` is **CRITICAL** (kernel, SpecRepository factories, archive/get-spec paths). Keep behaviour identical when `metadataPath` is absent.

## Approach

1. **Loader retain:** In `resolveAdapterBinding` `fs` branch, after resolving relative `metadataPath`, set `normalizedConfig.metadataPath = absolutePath` when present.
2. **Composition prefer:** At start of `resolveMetadataPathForWorkspace`, read `workspace.specsAdapter.config.metadataPath`; if `typeof === 'string'` and non-empty, use it (optionally `path.resolve` if somehow relative — should already be absolute from loader).
3. **Specs:** Purpose uses `createDefaultConfigLoader`; Path resolution requires retention; composition requires preference; `core:config` Workspaces paragraph updated.
4. **Verify:** Strengthen Explicit metadataPath scenario; add composition preference scenarios.

## Key decisions

- **Fix code to match specs** (user chose Both) — retain + prefer explicit path. **Rejected:** weakening specs to match drop behaviour.
- **Prefer in composition-resolver** rather than only in call sites — single gate for SpecRepository + validation caches that share the helper.
- **Absent path unchanged** — still composition-owned derivation.

## Trade-offs

- CRITICAL blast radius on `resolveMetadataPathForWorkspace` → require green core tests + targeted new cases before verify.
- Overlap with other designing changes → narrow deltas; coordinate at archive.

## Spec impact

- `core:config-loader` / `core:config` / `core:composition` — explicit path is now end-to-end normative.
- Dependents of SpecRepository metadata roots gain correct honouring of declared paths.

## Dependency map

```mermaid
graph LR
  createDefaultConfigLoader --> FsConfigLoader
  FsConfigLoader --> resolveAdapterBinding
  resolveAdapterBinding -->|retain metadataPath| SpecdConfig
  SpecdConfig --> resolveMetadataPathForWorkspace
  resolveMetadataPathForWorkspace -->|prefer explicit else derive| SpecRepository
```

## Testing

- Unit/integration: explicit `metadataPath` on `load()` binding; composition prefers it; absent still derives `.specd/metadata` under VCS root.
- Regression: existing `config-loader.spec.ts` suite (124+) remains green.
- Hooks: `pnpm test` / `lint` / `typecheck` on implementing/verifying.

## Open questions

None.
