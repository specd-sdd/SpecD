# SDK Composition Compliance Audit

Scope: `sdk:composition` in change `centralize-graph-index-worker`, plus its direct
consumer (`cli`) and relevant global architecture/conventions constraints. This was a
read-only audit against the merged change preview, the current Code Graph (fresh at
2026-08-25T07:13:17Z), source, declarations-by-source, and SDK tests.

## Requirements Summary

1. SDK is a thin `packages/sdk` composition package whose only platform runtime
   dependencies are Core and Code Graph.
2. The public barrel is curated: it exposes SDK composition/orchestration/presentation,
   selected Core APIs, and selected Code Graph host APIs, without direct Core export-star
   or graph lock/IPC internals.
3. The new isolated graph-index API must be available from SDK with its host contracts
   and typed failures, so delivery hosts need not import Code Graph or coordinate locks.
4. Hosts using both Core and Code Graph must use SDK only. SDK must publish the current
   version and expose implementation-review orchestration and its graph result types.

## Implementation Status

| Requirement                         | Status                  | Evidence                                                                                                                                                                                                 |
| ----------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package identity/dependencies       | Pass                    | `packages/sdk/package.json` names `@specd/sdk`; only `@specd/core` and `@specd/code-graph` are runtime platform dependencies. `package-boundary.spec.ts` asserts this.                                   |
| Curated public exports              | Pass with coverage gaps | `packages/sdk/src/index.ts` explicitly exports Core via `./core-reexports.js`, SDK layers, and selected Code Graph symbols; it has no `export * from '@specd/core'`.                                     |
| Isolated worker host surface        | Pass                    | `index.ts` exports `runIsolatedGraphIndex`, JSON/task/input contracts, `IsolatedGraphIndexRunner`, and all six public worker/task failure classes. It does not export listed lock/IPC/runtime internals. |
| Integrator import policy            | Pass for CLI            | `packages/cli/package.json` has `@specd/sdk` and no direct `@specd/core`/`@specd/code-graph`; all current CLI source matches import SDK.                                                                 |
| Version constant                    | Pass                    | `SDK_VERSION` reads SDK `package.json`; the barrel test compares it. `codeGraphVersion` delegates to `CODE_GRAPH_VERSION`.                                                                               |
| Implementation-review orchestration | Pass                    | `buildImplementationReview` and input/result/review-symbol types are exported from SDK; the orchestration composes Core tracking and Code Graph resolution through `withOpenGraphProvider`.              |

## Discrepancies

### Medium — merged layer-structure rule is violated and internally inconsistent

- **Spec evidence:** `sdk:composition` says `src/shared/` is internal and "MUST NOT be
  re-exported from `src/index.ts`". The same merged spec later requires public
  `codeGraphVersion` and `getCodeGraphVersion` as SDK-owned aliases.
- **Code evidence:** `packages/sdk/src/index.ts` directly exports both aliases from
  `./shared/code-graph-version.js`; `packages/sdk/src/shared/code-graph-version.ts`
  implements them. The tree also contains `src/domain/errors/`, although the listed
  allowed SDK layers omit `domain/`.
- **Possibilities:** (a) the spec is stale/overly literal: a small public version helper
  and an existing SDK-specific error are intentional; or (b) the implementation should
  relocate/public-wrap these modules to satisfy the declared layer list and retain
  `shared` as truly private. The two requirements cannot both be satisfied by a direct
  re-export from `shared` without a design clarification.

### Low — public contract verification is narrower than the merged scenarios

- **Spec evidence:** the worker scenario requires all host-facing input, progress,
  result, and typed worker failure contracts from `@specd/sdk`; the no-raw-lock scenario
  also calls for inspecting generated declarations.
- **Code evidence:** the barrel exports the contracts visible in
  `packages/sdk/src/index.ts`; however `packages/sdk/test/barrel.spec.ts` checks only
  `runIsolatedGraphIndex` at runtime and a partial list of prohibited internals/source
  strings. It does not compile-import every required type/error, nor inspect generated
  `dist/index.d.ts`.
- **Possibilities:** code is likely correct (the named exports are present) but tests do
  not protect against a type-only re-export regression or declaration leakage; or the
  spec expects publish-shape verification that is currently missing from SDK tests.

### Low — package-export wording does not match publish-shaped package metadata

- **Spec evidence:** the public-barrel rule says package `exports` must map `"."` to
  `src/index.ts`.
- **Code evidence:** `packages/sdk/package.json` correctly maps `"."` to
  `./dist/index.js` / `./dist/index.d.ts`; source is built by tsup. This is expected for
  a package publishing `files: ["dist/"]`.
- **Possibilities:** the wording means the logical source barrel, in which case the spec
  should say so; if literal, the implementation violates it but changing to `src/` would
  break the published package. Treat as specification drift, not a code defect.

## Test Coverage

- `pnpm --filter @specd/sdk test`: **9 files, 64 tests passed**.
- `pnpm --filter @specd/sdk typecheck`: **passed**.
- `test/barrel.spec.ts` covers SDK version, bootstrap/orchestration exports, absence of
  Core export-star, selected metadata exports/exclusions, worker function exposure,
  several lock/IPC exclusions, version aliases, and `/ports` and `/extensions`.
- `test/composition/package-boundary.spec.ts` verifies SDK runtime platform dependencies.
- Existing SDK orchestration tests cover `runIndexProjectGraph` provider/lifecycle,
  progress and version forwarding; `build-implementation-review.spec.ts` covers the
  Core + Code Graph orchestration.
- Graph impact for `sdk:src/index.ts` is LOW and identifies
  `packages/sdk/test/barrel.spec.ts` as its direct dependent/covering test; it is the
  correct focused regression surface for these re-exports.

## Missing Tests

1. A compile-time/publish-shaped SDK barrel test importing every required isolated-worker
   type and failure (`RunIsolatedGraphIndexInput`, JSON/progress/task types,
   `GraphIndexWorkerStartError`, `GraphIndexTaskContractError`,
   `GraphIndexTaskExecutionError`, `GraphIndexWorkerProtocolError`,
   `GraphIndexWorkerExitError`, `GraphIndexWorkerSignalError`, and
   `GraphIndexProgressHandlerError`) from built `@specd/sdk` declarations.
2. A generated-declaration negative test proving no lock-path helper, release callback,
   lock token, or raw worker protocol type is exported. Current runtime/source checks
   are helpful but do not cover declaration-only leakage.
3. A package-boundary consumer fixture that imports the isolated worker contracts from
   SDK while declaring SDK as its sole Core/Code Graph platform dependency. CLI coverage
   demonstrates the dependency migration, but not the full public type contract in a
   publish-shaped consumer.
4. A structural test or revised spec resolving whether `src/domain/` and public aliases
   sourced from `src/shared/` are allowed.

## Spec Dependency Chain

`default:_global/architecture` and `default:_global/conventions`
→ `core:composition` / `code-graph:composition`
→ `code-graph:isolated-index-worker` (public isolated execution contracts)
→ `sdk:composition` (curated host-facing re-export)
→ `cli:host-context` / CLI graph-index consumer.

The current CLI migration follows that chain: its package dependency and source imports
use `@specd/sdk`, while the worker implementation remains owned by Code Graph.

## Summary counts

- Requirements assessed: 7
- Fully conformant: 5
- Conformant with incomplete automated coverage: 2
- Implementation defects confirmed: 0
- Spec/design discrepancies: 1 medium, 1 low
- Test-coverage gaps: 4 low
