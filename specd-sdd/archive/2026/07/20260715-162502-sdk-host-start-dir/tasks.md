# Tasks: sdk-host-start-dir

## 1. SDK bootstrap contract

- [x] 1.1 Add `startDir` to the public host input type
      `packages/sdk/src/composition/host-context.ts`: `OpenSpecdHostInput` — expand the SDK bootstrap input so hosts can request discovery from an explicit directory.
      Approach: add `readonly startDir?: string` alongside `configPath?` and `kernelOptions?`, and update the JSDoc to describe `configPath` as forced-file mode and `startDir` as discovery-root mode.
      (Req: openSpecdHost)

- [x] 1.2 Reject mixed bootstrap inputs before loader creation
      `packages/sdk/src/composition/host-context.ts`: `openSpecdHost` — prevent ambiguous bootstrap mode selection when callers provide both `configPath` and `startDir`.
      Approach: add an early guard before `createDefaultConfigLoader()` that throws a plain actionable `Error` if both fields are defined, so no VCS or filesystem probing happens on invalid input.
      (Req: openSpecdHost, scenario: Mixed bootstrap inputs are rejected)

- [x] 1.3 Route loader mode by explicit priority
      `packages/sdk/src/composition/host-context.ts`: `openSpecdHost` — preserve current behavior while exposing explicit discovery-root bootstrap.
      Approach: choose loader input in this order: `{ configPath }`, then `{ startDir }`, then `{ startDir: process.cwd() }`; keep `Promise.all([load(), resolvePath()])`, `createSdkContext`, and return shape unchanged.
      (Req: openSpecdHost, scenario: Discovery mode loads config from cwd, scenario: Discovery mode can start from explicit startDir, scenario: Forced config path)

- [x] 1.4 Refresh public host bootstrap JSDoc
      `packages/sdk/src/composition/host-context.ts`: `OpenSpecdHostInput`, `openSpecdHost` — make the exported SDK contract self-describing for generated typings and readers.
      Approach: document the three supported bootstrap paths and the invalid mixed-input combination directly on the exported type and function comments.
      (Req: openSpecdHost)

## 2. Automated verification

- [x] 2.1 Add unit test for explicit `startDir` discovery mode
      `packages/sdk/test/composition/host-context.spec.ts`: `describe('openSpecdHost')` — prove the SDK forwards `{ startDir }` to `createDefaultConfigLoader`.
      Approach: call `openSpecdHost({ startDir: '/selected/project/subdir' })` and assert the mocked loader factory receives `{ startDir: '/selected/project/subdir' }`.
      (Req: openSpecdHost, scenario: Discovery mode can start from explicit startDir)

- [x] 2.2 Add unit test for mixed-input rejection
      `packages/sdk/test/composition/host-context.spec.ts`: `describe('openSpecdHost')` — prove invalid mixed bootstrap input fails before bootstrap work starts.
      Approach: call `openSpecdHost({ configPath: '/forced/specd.yaml', startDir: '/selected/project' })`, assert rejection with the chosen message, and assert `createDefaultConfigLoader` was not called.
      (Req: openSpecdHost, scenario: Mixed bootstrap inputs are rejected)

- [x] 2.3 Preserve existing no-input and forced-path coverage
      `packages/sdk/test/composition/host-context.spec.ts`: existing discovery/forced-mode tests — keep current compatibility guarantees explicit after the new branch is added.
      Approach: retain the current no-input test for `process.cwd()` fallback and the current forced-path test for `{ configPath }`; update only assertions that need to distinguish the new branch.
      (Req: openSpecdHost, scenario: Discovery mode loads config from cwd, scenario: Forced config path)

- [x] 2.4 Keep kernel-options forwarding covered
      `packages/sdk/test/composition/host-context.spec.ts`: `describe('openSpecdHost')` — confirm bootstrap-mode additions do not alter kernel construction wiring.
      Approach: keep the existing `kernelOptions` test and ensure the new branching leaves the `createKernel(sampleConfig, kernelOptions)` assertion intact.
      (Req: openSpecdHost, scenario: Kernel options forwarded)

- [x] 2.5 Add CLI guard test for unchanged helper behavior
      `packages/cli/test/helpers/cli-context.spec.ts`: `describe('resolveCliContext')` — ensure CLI continues to own its bootstrap inputs and does not begin sending `startDir`.
      Approach: inspect the mocked `openSpecdHost` call and assert `kernelOptions` is still present while `startDir` is `undefined`.
      (Req: openSpecdHost)

- [x] 2.6 Revalidate barrel/export surface
      `packages/sdk/test/barrel.spec.ts`: SDK barrel tests — ensure the expanded input type does not break curated exports.
      Approach: run the existing barrel assertions unchanged as regression coverage for the public SDK entrypoints.
      (Req: openSpecdHost)

## 3. Documentation and release safety

- [x] 3.1 Update SDK bootstrap documentation
      `docs/sdk/index.md`: SDK bootstrap examples — document the new discovery-root option for host integrators.
      Approach: keep the existing `configPath` example, add a `startDir` example, and add a short rule that callers must choose one of `configPath` or `startDir`, never both.
      (Req: openSpecdHost)

- [x] 3.2 Update the core host-integration example
      `docs/core/examples/implementing-a-port.md`: “Loading the config” guidance — show when a host can use the SDK discovery-root contract instead of manually rebuilding bootstrap around the core loader.
      Approach: add a short note after the loader examples pointing host-style integrators to `openSpecdHost({ startDir })` when they want directory-based discovery with a selected runtime root.
      (Req: openSpecdHost)

- [x] 3.3 Run focused SDK and CLI verification commands
      `packages/sdk/test/composition/host-context.spec.ts`, `packages/cli/test/helpers/cli-context.spec.ts`, `packages/sdk/test/barrel.spec.ts` — confirm the changed contract and unchanged dependents pass their intended checks.
      Approach: run `pnpm test --filter @specd/sdk` and the focused CLI helper test path from the design, then review failures specifically for bootstrap branching, mixed-input rejection, and export-surface regressions.
      (Req: openSpecdHost)

- [x] 3.4 Manually verify the published contract
      `packages/sdk/src/composition/host-context.ts`, `docs/sdk/index.md`, `docs/core/examples/implementing-a-port.md` — ensure code comments, examples, and exported typings all say the same thing.
      Approach: inspect the final type surface and docs together; confirm they all describe `configPath?`, `startDir?`, `kernelOptions?`, the `process.cwd()` fallback, and the “never both” rule.
      (Req: openSpecdHost)
