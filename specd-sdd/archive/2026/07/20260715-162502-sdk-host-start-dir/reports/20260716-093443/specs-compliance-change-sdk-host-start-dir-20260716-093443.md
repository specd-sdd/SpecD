# Spec Compliance Report

Mode: `--change sdk-host-start-dir`
Generated at: `2026-07-16 09:34:43`
Change path: `/Users/monki/Documents/Proyectos/specd/specd-sdd/changes/20260715-162502-sdk-host-start-dir`
Graph freshness: `stale=false`, `lastIndexedAt=2026-07-15T16:21:15.779Z`

## Scope

- `sdk:host-context`
- `core:config-loader`
- `core:config`

Included dependency and global context reviewed during the audit:

- `default:_global/architecture`
- `default:_global/conventions`
- `default:_global/docs`
- `default:_global/eslint`
- `default:_global/testing`

## Summary

- Specs audited: `3`
- Requirements checked: `3` primary changed requirement groups
- Scenario groups reviewed: `16`
- Findings: `0`
- Test coverage gaps: `0`
- Spec/code drift detected: `0`

## Verification Evidence

### `sdk:host-context`

Status: `pass`

Evidence:

- `OpenSpecdHostInput` now exposes `configPath?`, `startDir?`, and `kernelOptions?` in `packages/sdk/src/composition/host-context.ts`.
- `openSpecdHost` rejects mixed `configPath + startDir` input before loader creation.
- Loader selection order is implemented exactly as specified:
  - `{ configPath }`
  - `{ startDir }`
  - `{ startDir: process.cwd() }`
- `createSdkContext` still awaits `createKernel(config, options)` and returns a fresh `createGraphProvider()` factory that closes over the same config reference.
- `SdkHostContext` still exposes only `kernel` and `createGraphProvider`, with no config-write surface.

Test coverage:

- `packages/sdk/test/composition/host-context.spec.ts`
  - verifies same-config forwarding
  - verifies fresh provider instances
  - verifies default cwd discovery
  - verifies forced config path
  - verifies explicit `startDir`
  - verifies mixed-input rejection before loader creation
  - verifies `kernelOptions` forwarding
- `pnpm test --filter @specd/sdk` passed on `2026-07-16`.

Assessment:

- Code conforms to the changed spec.
- The changed spec remains consistent with the implementation and with the SDK host facade design.

### `core:config-loader`

Status: `pass`

Evidence:

- `createDefaultConfigLoader` still accepts the discriminated union `FsConfigLoaderOptions`.
- Composition code in `packages/core/src/composition/config-loader.ts` preserves the semantic split between:
  - discovery mode via `{ startDir }`
  - forced mode via `{ configPath }`
- The loader adapter contract in `packages/core/src/infrastructure/fs/config-loader.ts` still documents and implements distinct discovery and forced behaviors, including `resolvePath()`.

Test coverage:

- `packages/core/test/infrastructure/fs/config-loader.spec.ts` already covers discovery and forced behaviors extensively.
- Full hook run `pnpm test` passed on `2026-07-16`, including `config-loader.spec.ts`.

Assessment:

- The change does not introduce contract drift in the loader.
- The updated change spec is conformant with the existing loader implementation.

### `core:config`

Status: `pass`

Evidence:

- The changed requirement only clarifies that host-provided discovery roots must preserve the same discovery semantics as cwd-based bootstrap while remaining distinct from explicit file bootstrap.
- This remains consistent with:
  - `createDefaultConfigLoader({ startDir })` discovery semantics
  - `openSpecdHost({ startDir })` public SDK surface
  - `openSpecdHost({ configPath })` forced-file semantics
- Documentation in `docs/sdk/index.md` and `docs/core/examples/implementing-a-port.md` now matches the distinction precisely.

Assessment:

- No contradiction found between the change spec and the global configuration spec.
- No implementation drift found.

## Cross-Spec Consistency

Checked consistency between:

- `sdk:host-context`
- `core:config-loader`
- `core:config`
- global architecture and documentation constraints

Result:

- The three changed specs are internally aligned.
- No contradiction found between the SDK public contract and the core config-loader/config semantics.
- The docs added in this change reinforce, rather than weaken, the forced-vs-discovery distinction.

## Findings

No findings.

## Residual Risks

- `openSpecdHost` remains a critical bootstrap surface with broad downstream usage, so future changes around host bootstrap should continue to keep the implementation localized and fully covered by SDK + CLI regression tests.

## Final Assessment

This change is compliant.

- Implementation matches the changed specs.
- Changed specs remain compatible with the underlying core loader and project configuration specs.
- Test coverage is adequate for the introduced bootstrap branch and the mixed-input guard.
