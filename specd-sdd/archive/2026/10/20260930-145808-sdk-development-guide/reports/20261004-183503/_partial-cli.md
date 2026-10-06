# CLI compliance audit — `sdk-development-guide`

## Scope and evidence

Audited the merged change specs `cli:guide-sdk`, `cli:entrypoint`, and `cli:guide`, plus their direct/global consistency constraints: `default:_global/docs`, `default:_global/architecture`, `core:config`, and `default:_global/error-handling-conventions`. The graph was current (`1207` source files, `42,496` symbols) at audit time. Graph impact identifies `guideSdkCmd` as CRITICAL-risk (15 affected files) and `registerGuideSdkCommand` as MEDIUM-risk (4 affected files); its direct consumers are `createProgram`, the CLI entrypoint, and focused tests.

Primary implementation evidence:

- `packages/cli/src/commands/guide-sdk/index.ts`: command parser, scope/collection validation, listing/index/topic/search delegation, help schemas, and standard error mapping.
- `packages/cli/src/program.ts:267-269`: top-level registration and lazy dynamic import of `@specd/guide/sdk`.
- `packages/cli/src/commands/guide/index.ts` and `formatters.ts`: additive SDK discovery field, matching pagination envelope, and user-guide help pointer.
- `packages/cli/test/commands/guide-sdk/guide-sdk.spec.ts`: focused adapter suite.

## Requirements summary

### `cli:guide-sdk`

The merged spec requires a registered, lazy `guide-sdk` adapter over the SDK guide engine. It defines bounded, grouped listings; independent `--scope`/`--collection` filtering and validation; an index under `--meta`; topic inspection/slicing/search; output envelopes; short actionable unknown-topic errors; and an additive discovery route from `guide`.

### `cli:entrypoint`

The changed entrypoint requirement applies the standard config, stdout/stderr, exit-code, typed-error, `--format`/help-schema, config-override, and excess-argument contracts to the new command. It also requires the SDK catalog to remain lazy and the existing command set to remain behaviorally unchanged.

### `cli:guide`

The merged guide spec makes the discovery field and help pointer additive, aligns its catalog envelope/pagination/index/body-flag behavior with the sibling SDK command, and retains the existing thin-adapter contract.

## Implementation status

| Area                                           | Status      | Evidence                                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root registration and lazy SDK load            | Implemented | `program.ts:267-269` registers the command and memoizes a dynamic `import('@specd/guide/sdk')`; the focused suite verifies help does not resolve the engine.                                                                                                                     |
| Listing, filters, pagination, metadata index   | Implemented | `guide-sdk/index.ts` combines validated scope and collection predicates, delegates to `GuideEngine.listGuides`, and uses the shared listing/index formatters. Runtime JSON smoke checks returned the specified envelope, collection ranges, scope, and `hiddenByDefault` notice. |
| Inspection, slicing, search, structured output | Implemented | The adapter delegates `getGuide`, outline/section/window behavior, and `searchGuides`; all output is rendered through the shared formatter layer. The 72 focused tests cover these paths.                                                                                        |
| Validation and standard error route            | Implemented | Invalid scope/collection use typed CLI errors; guide domain errors map to stable `UNKNOWN_GUIDE_*` / `AMBIGUOUS_GUIDE_SECTION` codes via `cliError`. A runtime extra-positional smoke check exited 1.                                                                            |
| Existing `guide` discovery and envelope        | Implemented | `SDK_GUIDE_DISCOVERY` is emitted by the shared formatter path; `guide --format json` runtime output contained structured `sdkGuide`; `guide --help` names the SDK command and purpose.                                                                                           |
| Documentation convention                       | Implemented | The supplied collections are package-reference/docs collections (`sdk`, `core`, `code-graph`, `skills`, `schemas`), consistent with the docs convention’s integrator/package-reference routing.                                                                                  |

## Discrepancies

### D1 — direct `@specd/guide` dependency is inconsistent with the global package-direction constraint (high)

`default:_global/architecture` requires the package direction `cli -> sdk` and says delivery hosts are adapters that delegate to the supported facade. `packages/cli/package.json` declares both `@specd/sdk` and direct `@specd/guide`; the implementation also imports `GuideEngine` and guide errors from `@specd/guide` in both `commands/guide-sdk/index.ts` and `commands/guide/index.ts`. The change’s merged `cli:guide-sdk` requirement explicitly requires an `@specd/guide/sdk` backing engine, so the change specification itself normalizes the direct dependency rather than reconciling it with the global architecture constraint.

Possible interpretations:

- **Spec drift / missing architectural exception:** the global dependency diagram may need to allow `cli -> guide` (and define its facade boundary), because the existing guide adapter is intentionally delivery-only and the new subpath must be loaded directly.
- **Implementation / change-spec defect:** `@specd/sdk` should expose the required guide-facing contracts/factory (or another approved facade should exist), after which CLI should remove the direct `@specd/guide` dependency/imports.

This is not a functional failure of the command; it is a cross-spec architecture conflict that should be resolved before the change is declared fully compliant.

No other CLI-side nonconformity was found in the reviewed scope.

## Test coverage

- `pnpm --filter @specd/cli exec vitest run test/commands/guide-sdk/guide-sdk.spec.ts` — **PASS**, 1 file / **72 tests**. Covers listings, filters, pagination/grouping, withheld API notice, index/meta, help, topic normalization, errors/suggestions, generated-topic rendering, slicing, search, output formats, lazy registration.
- Runtime smoke checks — **PASS**:
  - `node packages/cli/dist/index.js guide-sdk --format json --page-size 2`
  - `node packages/cli/dist/index.js guide-sdk --scope api --collection code-graph --page-size 2 --format json`
  - `node packages/cli/dist/index.js guide-sdk core:ports --meta --format json`
  - `node packages/cli/dist/index.js guide-sdk core:ports unexpected` (expected exit `1`)
  - `node packages/cli/dist/index.js guide --format json`
  - help output for both commands.

## Missing tests

- Add a black-box spawned-process test for global and local `--config` placements on `guide-sdk`, including stdout/stderr separation on structured errors. The focused suite uses an in-process Commander program and does not independently demonstrate the root pre-action propagation in the built CLI.
- Add a dependency-boundary test (or update the architecture spec with a tested exception) that asserts the approved host-to-guide dependency shape. This directly protects D1.
- Add a regression test invoking an ordinary `guide` operation and asserting the SDK dynamic module is not evaluated in the fully assembled program; the unit-level lazy-registration test is good but does not exercise the root entrypoint path.

## Dependency chain

`CLI process -> createProgram -> registerGuideSdkCommand -> lazy import('@specd/guide/sdk') -> createGuideSdkEngine -> GuideEngine -> prebundled SDK catalog/search adapter -> shared CLI formatters/error/config loader`.

The sibling path is `CLI process -> registerGuideCommand -> createGuideEngine -> shared formatter with sdkGuide discovery`. The change specs depend on `cli:entrypoint`, `cli:guide`, `guide:composition`, `guide:guide-model`, `guide:bundle-guides`, and `default:_global/docs`; entrypoint additionally depends on `core:config` and the global error contract.

## Summary counts

- Change specs reviewed: **3**
- Direct/global dependency specs checked: **4**
- Functional implementation findings: **0**
- Cross-spec architecture discrepancies: **1 high** (D1)
- Focused tests run: **72 passed**
- Recommended missing/regression tests: **3**
