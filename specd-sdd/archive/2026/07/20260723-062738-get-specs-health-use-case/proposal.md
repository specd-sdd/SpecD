# Proposal: get-specs-health-use-case

## Motivation

When validating specs in a large codebase, the existing `ValidateSpecs` use case returns a complete list of all validation entries, even for successful specs. This results in unnecessary payload size and complexity when clients only need a quick health overview of the specifications (total verified, number of passes, number of failures, number of warnings) and details of only the failing/warned specs.

## Current behaviour

Currently, `ValidateSpecs` validates all specs and returns a `ValidateSpecsResult` containing a list of `SpecValidationEntry` for _every_ spec. There is no lightweight, aggregate-only use case that filters out successful validations and returns a clean, actionable health diagnostic report.

## Proposed solution

Introduce a new usecase `GetSpecsHealth` that invokes `ValidateSpecs.execute()` internally, aggregates overall health metrics (total verified, passed, failed, and warned), and filters individual entries to return only the list of specs with failures or warnings, omitting successful ones.

We will create the following constructs:

### 1. Interfaces & Signatures

#### Input Signature: `GetSpecsHealthInput`

```typescript
export interface GetSpecsHealthInput {
  /** Optional workspace name to filter the health check. */
  readonly workspace?: string
}
```

#### Output Signature: `GetSpecsHealthResult`

A spec can be in one of three mutually exclusive states:

1. **failed**: Has 1 or more failures (even if it also has warnings).
2. **warned**: Has 0 failures and 1 or more warnings.
3. **passed**: Has 0 failures and 0 warnings (passed cleanly).

Therefore, `totalSpecs = passed + failed + warned`.

To prevent clients from looking in two separate arrays for a single spec containing both failures and warnings, all diagnostics are consolidated into a single `issues` array containing only the specs that did not pass cleanly.

```typescript
export interface GetSpecsHealthResult {
  /** Total number of specs validated. */
  readonly totalSpecs: number
  /** Number of specs that passed cleanly (0 failures, 0 warnings). */
  readonly passed: number
  /** Number of specs that failed (>= 1 failure). */
  readonly failed: number
  /** Number of specs that contain warnings but no failures (0 failures, >= 1 warning). */
  readonly warned: number
  /**
   * Consolidated list of specs that contain failures and/or warnings.
   * Specs that passed cleanly are excluded.
   */
  readonly issues: readonly {
    readonly spec: string
    readonly passed: boolean // false if the spec has failures, true if it only has warnings
    readonly failures: readonly { readonly artifactId: string; readonly description: string }[]
    readonly warnings: readonly { readonly artifactId: string; readonly description: string }[]
  }[]
}
```

### 2. Use Case Class: `GetSpecsHealth`

Located in `packages/core/src/application/use-cases/get-specs-health.ts`:

```typescript
export class GetSpecsHealth {
  private readonly _validateSpecs: ValidateSpecs

  constructor(validateSpecs: ValidateSpecs) {
    this._validateSpecs = validateSpecs
  }

  async execute(input: GetSpecsHealthInput): Promise<GetSpecsHealthResult>
}
```

### 3. Composition Layer

Located in `packages/core/src/composition/use-cases/get-specs-health.ts`:
Following the convention of the codebase (e.g. `createValidateSpecs`), we will use a single overloaded function signature for the use case factory, rather than separate named factories.

#### Explicit Dependencies: `GetSpecsHealthDeps`

```typescript
export interface GetSpecsHealthDeps {
  readonly validateSpecs: ValidateSpecs
}
```

#### Dependency Resolution: `resolveGetSpecsHealthDeps`

```typescript
export function resolveGetSpecsHealthDeps(resolver: CompositionResolver): GetSpecsHealthDeps
```

#### Factory Overloads: `createGetSpecsHealth`

```typescript
// Overload 1: From explicit dependencies
export function createGetSpecsHealth(deps: GetSpecsHealthDeps): GetSpecsHealth

// Overload 2: From project configuration
export function createGetSpecsHealth(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetSpecsHealth
```

## Specs affected

### New specs

- `core:get-specs-health`: Specification for the `GetSpecsHealth` usecase and its output result structure.
  - Depends on: `core:validate-specs`

### Modified specs

- `core:kernel`: Expose `getHealth: GetSpecsHealth` use case in the kernel's specs group.
  - Depends on (added): `core:get-specs-health`
  - Depends on (removed): none
- `default:_global/docs`: Existing specification for documentation conventions.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- `@specd/core`: A new usecase `GetSpecsHealth` and its corresponding composition factory will be added.
- Testing: Unit and integration tests in `packages/core/test/` to verify filtering and aggregation.
- Documentation: Update `docs/core/use-cases.md` to document the new `GetSpecsHealth` usecase.

## Technical context

- The new usecase `GetSpecsHealth` will accept an optional `workspace` parameter just like `ValidateSpecs`.
- It will depend on the existing `ValidateSpecs` usecase, allowing it to leverage cached validation results transparently without recalculating hashes or validation rules.
- Results will group errors and warnings by spec ID to make the payload compact and easily digestible.

## Open questions

_none_
