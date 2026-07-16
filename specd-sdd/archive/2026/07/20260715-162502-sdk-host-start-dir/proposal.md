# Proposal: sdk-host-start-dir

## Motivation

Non-CLI hosts need to bootstrap specd from a project selected at runtime without mutating `process.cwd()` or reimplementing config loading. The current SDK host API only exposes forced-file bootstrap (`configPath`) or implicit discovery from the process working directory, which leaves a gap in the public host contract.

## Current behaviour

`openSpecdHost` currently maps `input.configPath` to forced config loading and otherwise falls back to discovery from `process.cwd()`. This means a host that knows the directory it wants to discover from, but not an exact `specd.yaml` path, cannot use the SDK surface directly and must either fake process state or duplicate bootstrap logic around `createDefaultConfigLoader`, config resolution, and kernel creation.

The underlying config loader already supports both `{ configPath }` and `{ startDir }`, so the limitation is in the SDK bootstrap contract rather than in the config-loading subsystem itself. The current API also does not explicitly reject mixed bootstrap inputs, leaving the intended precedence ambiguous at the public boundary.

## Proposed solution

Extend `OpenSpecdHostInput` with an optional `startDir` field and make `openSpecdHost` support three explicit bootstrap modes:

- forced mode via `configPath`
- discovery mode via `startDir`
- default discovery mode via `process.cwd()` when neither input is provided

The SDK host contract will also reject calls that provide both `configPath` and `startDir`, so hosts must choose one bootstrap mode intentionally. This keeps discovery semantics available through the public SDK without changing the meaning of existing `configPath` callers or broadening this change into unrelated bootstrap concerns.

## Specs affected

### New specs

None.

### Modified specs

- `sdk:host-context`: expand the public host bootstrap contract so `OpenSpecdHostInput` accepts explicit discovery roots and `openSpecdHost` rejects mixed bootstrap inputs while preserving the current `process.cwd()` fallback.
  - Depends on (added): none
  - Depends on (removed): none

- `core:config-loader`: clarify that SDK hosts may pass discovery mode through `startDir` intentionally, and that this remains semantically distinct from forced-file bootstrap through `configPath`.
  - Depends on (added): none
  - Depends on (removed): none

- `core:config`: tighten the project-configuration discovery requirements that matter to host bootstrap so the public configuration contract remains aligned with the new SDK entrypoint semantics.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

Affected code areas are centered on SDK bootstrap and its tests:

- `packages/sdk/src/composition/host-context.ts`
- `packages/sdk/test/composition/host-context.spec.ts`
- potentially CLI-facing bootstrap tests that exercise `openSpecdHost` indirectly through `resolveCliContext`

The runtime API surface of `OpenSpecdHostInput` changes, but in a backward-compatible way for existing callers that provide only `configPath` or no input. The main behavioral risk is bootstrap regression because `openSpecdHost` sits on a critical path used across CLI and SDK orchestration; graph impact shows a broad dependent surface, so the change must stay narrow and preserve default behavior for existing consumers.

## Technical context

The codebase already contains the core building block this change needs: `createDefaultConfigLoader` accepts a discriminated union of `{ startDir }` or `{ configPath }`. Today `openSpecdHost` in `packages/sdk/src/composition/host-context.ts` only forwards `{ configPath }` when present and otherwise hardcodes `{ startDir: process.cwd() }`.

This change intentionally does not introduce new warning plumbing, graph-provider customization, or other host bootstrap extensions. It is limited to exposing discovery-root selection through the SDK contract and making invalid mixed input explicit. This preserves the architectural boundary where hosts use the SDK composition surface instead of rebuilding config-loader and kernel wiring themselves.

Alternatives considered and rejected during exploration:

- telling callers to pass a discovered `specd.yaml` as `configPath`
  - rejected because forced mode is not equivalent to discovery mode and does not express “start searching from here”
- grouping this with other SDK bootstrap follow-ups
  - rejected to keep review scope tight and avoid mixing API-shape, provider wiring, and diagnostic concerns in one change

## Open questions

None at proposal stage. The scope is fixed: `startDir` is the explicit discovery input, `configPath` remains the explicit forced-file input, and supplying both is invalid. The design artifact can refine the exact error shape and test matrix without changing that direction.
