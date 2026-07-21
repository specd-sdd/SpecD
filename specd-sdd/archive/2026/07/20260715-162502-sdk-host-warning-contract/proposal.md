# Proposal: sdk-host-warning-contract

## Motivation

Host bootstrap already loads configuration that may include non-fatal warnings, but there is no single SDK contract that tells hosts how those warnings should be propagated. This needs to be clarified now because CLI already consumes the warnings implicitly and additional hosts need a stable, non-duplicating bootstrap surface.

## Current behaviour

`SpecdConfig` already exposes optional `warnings`, and `openSpecdHost` returns the loaded config as part of the host result. CLI currently reads `host.config.warnings` inside `resolveCliContext` and emits each warning with `console.warn(...)`, but the SDK host contract does not explicitly define whether hosts should consume warnings from `config`, from a normalized host result field, or from some other surface. That leaves room for silent drops, duplicated emission, or host-specific divergence.

## Proposed solution

Define one SDK-owned host-bootstrap contract for configuration warnings and make CLI align with it. The contract will preserve two existing constraints: warnings remain non-fatal diagnostics originating from config loading, and the SDK itself performs no stdout/stderr I/O while hosts remain responsible for formatting and emitting warnings exactly once.

## Specs affected

### New specs

None.

### Modified specs

- `sdk:host-context`: clarify how `openSpecdHost` exposes configuration warnings to host consumers and which bootstrap surface is canonical.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:host-context`: align `resolveCliContext` with the SDK warning-propagation contract so CLI remains the host responsible for warning emission.
  - Depends on (added): none
  - Depends on (removed): none
- `core:config`: clarify that configuration warnings originate from config loading and remain stable host-consumable diagnostics.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

Affected code areas include `packages/sdk/src/composition/host-context.ts` and `packages/cli/src/helpers/cli-context.ts`, plus tests that verify bootstrap warning propagation and single-emission behavior. The public host-bootstrap API may gain or formalize a warning field, so downstream hosts that use `openSpecdHost` are part of the contract surface even if only CLI is updated immediately.

## Technical context

- `SpecdConfig` already contains `warnings?: readonly string[]`.
- `openSpecdHost` currently returns `{ config, configFilePath, ...ctx }` and does not expose a separate normalized warning field.
- `resolveCliContext` currently consumes `host.config.warnings` and prints each warning once.
- `OpenSpecdHostResult` is treated as a thin bootstrap wrapper rather than a separate diagnostics model, so this change should keep `config.warnings` as the canonical warning surface instead of introducing a duplicate host-result field.
- `MAIN_FOLLOW_UPS.md` requires SDK to avoid direct console I/O, so warning formatting and emission must remain a host concern.
- This change was intentionally split from other SDK host-context follow-ups because it is primarily a contract and ownership clarification rather than a broader bootstrap refactor.

## Open questions

None. The warning contract direction is settled: `config.warnings` remains the canonical source, `OpenSpecdHostResult` does not grow a separate `warnings` field, and hosts such as CLI continue consuming the warnings from `config` while remaining responsible for emitting them exactly once.
