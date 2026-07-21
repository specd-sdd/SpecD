# Tasks: sdk-host-warning-contract

## 1. SDK contract alignment

- [x] 1.1 Clarify `OpenSpecdHostResult` warning contract in source
      `packages/sdk/src/composition/host-context.ts`: `OpenSpecdHostResult` / `openSpecdHost` — document that bootstrap warnings remain on `config.warnings` and that the host result stays a thin wrapper
      Approach: tighten JSDoc only; preserve the runtime return shape `{ config, configFilePath, ...ctx }` and do not add any top-level `warnings` field
      (Req: openSpecdHost)

- [x] 1.2 Prove SDK preserves loader warnings on the returned config
      `packages/sdk/test/composition/host-context.spec.ts`: `openSpecdHost` describe block — add a test that mocked loader warnings are exposed unchanged through `result.config.warnings`
      Approach: have the mocked `load()` return a `SpecdConfig` carrying warnings, call `openSpecdHost()`, and assert the warning array is preserved without transformation
      (Req: openSpecdHost, scenario: Config warnings remain on returned config)

- [x] 1.3 Prove SDK does not expose duplicate host-result warnings
      `packages/sdk/test/composition/host-context.spec.ts`: `openSpecdHost` describe block — add a shape-focused test that callers rely on `config.warnings`, not a duplicate top-level warning field
      Approach: assert the result exposes `config`, `configFilePath`, `kernel`, and `createGraphProvider`; do not change the interface to add `warnings`
      (Req: openSpecdHost, scenario: Host result does not duplicate warnings)

## 2. CLI host behavior

- [x] 2.1 Keep CLI warning consumption bound to `config.warnings`
      `packages/cli/src/helpers/cli-context.ts`: `resolveCliContext` — preserve the existing warning loop as the canonical CLI bootstrap consumption path
      Approach: continue iterating `host.config.warnings` after successful `openSpecdHost()` resolution, with no alternate warning source and no return-shape changes
      (Req: resolveCliContext delegates to openSpecdHost)

- [x] 2.2 Document single-emission behavior at the CLI boundary
      `packages/cli/src/helpers/cli-context.ts`: `resolveCliContext` — make the one-emission-per-bootstrap rule explicit in local comments/JSDoc if needed
      Approach: clarify behavior without moving I/O into SDK; CLI remains the only layer that formats warnings with `console.warn`
      (Req: resolveCliContext delegates to openSpecdHost)

- [x] 2.3 Add test for canonical warning source in CLI bootstrap
      `packages/cli/test/helpers/cli-context.spec.ts`: `resolveCliContext` describe block — verify CLI reads warnings from `config.warnings`
      Approach: mock `openSpecdHost` to return a config carrying warnings, spy on `console.warn`, and assert the bootstrap does not require a top-level `warnings` field
      (Req: resolveCliContext delegates to openSpecdHost, scenario: CLI reads bootstrap warnings from config)

- [x] 2.4 Add test for single warning emission per bootstrap call
      `packages/cli/test/helpers/cli-context.spec.ts`: `resolveCliContext` describe block — verify one `console.warn` per warning string for one invocation
      Approach: return multiple warnings from mocked `openSpecdHost`, run `resolveCliContext()`, and assert call count and formatted messages match the source array exactly once
      (Req: resolveCliContext delegates to openSpecdHost, scenario: CLI emits each warning once per bootstrap)

- [x] 2.5 Add test for silent bootstrap when warnings are absent
      `packages/cli/test/helpers/cli-context.spec.ts`: `resolveCliContext` describe block — verify no warning output when `config.warnings` is missing or empty
      Approach: cover both `undefined` and `[]` inputs so the guard condition remains stable while the CLI return value stays `{ config, configFilePath, kernel }`
      (Req: resolveCliContext delegates to openSpecdHost)

## 3. Core contract confirmation

- [x] 3.1 Confirm core warning type comments match the host contract
      `packages/core/src/application/specd-config.ts`: `SpecdConfig.warnings` — align the field comment with the final contract wording if the current comment is too weak or ambiguous
      Approach: comment-only clarification; keep `readonly warnings?: readonly string[]` unchanged
      (Req: Legacy configuration warnings)

- [x] 3.2 Confirm loader comments describe warnings as non-fatal diagnostics
      `packages/core/src/infrastructure/fs/config-loader.ts`: warning collection path — update comments only if needed so they explicitly describe warnings as successful-load diagnostics preserved for host consumers
      Approach: do not change warning production logic unless implementation reveals an actual mismatch; preserve the existing `warnings` array pipeline
      (Req: Legacy configuration warnings)

- [x] 3.3 Extend core loader tests only if current assertions are insufficient
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`: legacy-warning coverage — add one assertion proving warning-bearing configs still load successfully and expose `config.warnings`, but only if the existing tests do not already make that behavior explicit enough
      Approach: prefer minimal test additions; do not duplicate existing coverage for legacy warning generation and omitted-storage no-warning behavior
      (Req: Legacy configuration warnings, scenario: Warning-bearing config remains non-fatal, scenario: Hosts can consume warnings from resolved config)

## 4. Docs and verification

- [x] 4.1 Check `docs/` for host-bootstrap warning references
      `docs/`: host-bootstrap API documentation — update any user-facing docs only if they currently imply a separate SDK host-result warning field
      Approach: search for `openSpecdHost` or bootstrap warning documentation, align any mismatch to `config.warnings`, and leave `docs/` untouched if no such references exist
      (Req: openSpecdHost, Req: resolveCliContext delegates to openSpecdHost)

- [x] 4.2 Run targeted SDK and CLI tests
      `packages/sdk/test/composition/host-context.spec.ts`, `packages/cli/test/helpers/cli-context.spec.ts`: targeted validation — prove the new contract and single-emission behavior hold
      Approach: run package-filtered tests first; include the core config-loader spec only if task 3.3 changed it
      (Req: openSpecdHost, Req: resolveCliContext delegates to openSpecdHost, Req: Legacy configuration warnings)

- [x] 4.3 Perform manual CLI bootstrap verification with a warning-producing config
      `packages/cli/src/helpers/cli-context.ts`: `resolveCliContext` integration path — confirm end-to-end behavior from real bootstrap
      Approach: execute a CLI command that uses `resolveCliContext`, verify success plus exactly one `warning: ...` line per config warning, and confirm no duplicated host-result warning surface appears
      (Req: resolveCliContext delegates to openSpecdHost, Req: Legacy configuration warnings)
