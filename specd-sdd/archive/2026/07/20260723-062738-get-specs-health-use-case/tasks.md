# Tasks: get-specs-health-use-case

## 1. Application Layer

- [x] 1.1 Create GetSpecsHealth usecase class
      `packages/core/src/application/use-cases/get-specs-health.ts`: `GetSpecsHealth` — implement usecase logic, inputs, and outputs.
      Approach: constructor inject `ValidateSpecs`. In `execute()`, call `_validateSpecs.execute()`, loop over validation entries, increment counters mutually exclusively (`passed`, `failed`, `warned`), and push non-clean spec details to the `issues` array.
      (Req: Filter successful validations, Health statistics aggregation, Consolidated diagnostics, Workspace filtering)

## 2. Composition Layer

- [x] 2.1 Create GetSpecsHealth composition factory
      `packages/core/src/composition/use-cases/get-specs-health.ts`: `createGetSpecsHealth` — factory for instantiating the usecase.
      Approach: define overloaded signatures for explicit dependencies and config bootstrap. Under config bootstrap, construct the composition resolver, instantiate `ValidateSpecs` via `createValidateSpecs`, and instantiate `GetSpecsHealth`.
      (Req: Composition Layer)
- [x] 2.2 Integrate GetSpecsHealth in the Kernel
      `packages/core/src/composition/kernel.ts`: `Kernel` / `createKernel` — expose the usecase through the main kernel.
      Approach: Add `getHealth: GetSpecsHealth` property to the `Kernel['specs']` interface and instantiate/expose it inside `createKernel` using `createGetSpecsHealth({ validateSpecs })`.
      (Req: Kernel integration)

## 3. Automated Tests

- [x] 3.1 Create GetSpecsHealth unit tests
      `packages/core/test/application/use-cases/get-specs-health.spec.ts`: unit tests — verify filtering and aggregation.
      Approach: use a stub of `ValidateSpecs` to verify empty, passed, failed, warned, and combined states, ensuring counts sum to total and details are consolidated correctly under `issues`.
      (Req: Testing)
- [x] 3.2 Add kernel integration test
      `packages/core/test/composition/kernel.spec.ts`: integration test — verify resolution.
      Approach: assert that `kernel.specs.getHealth` is an instance of `GetSpecsHealth`.
      (Req: Testing)

## 4. Documentation & Manual Verification

- [x] 4.1 Update usecase documentation
      `docs/core/use-cases.md`: documentation — document the new usecase.
      Approach: Add `### GetSpecsHealth` section outlining its purpose, constructor, input/output structures, and exceptions.
      (Req: Documentation)
- [x] 4.2 Run manual verification script
      `/Users/monki/.gemini/antigravity-cli/brain/7f5063a2-c68b-40e5-a7a6-2ff5c73faa29/scratch/test-health.js`: scratch script — E2E check.
      Approach: import `createConfigLoader` and `createKernel`, run `kernel.specs.getHealth.execute()`, and verify structured console output.
      (Req: Testing)
