# SDK Compliance Audit: Host Context and Graph Provider Lifecycle

## Scope

- Change: `sdk-graph-provider-factory`
- Assigned changed specs: `sdk:host-context`, `sdk:with-open-graph-provider`
- Direct dependencies reviewed: `sdk:composition`, `core:kernel`, `core:composition`, `code-graph:composition`, `default:_global/architecture`, `default:_global/testing`
- Code graph status: fresh at `2026-07-19T16:22:04.269Z`; `openSpecdHost` has CRITICAL blast radius (120 affected files), so lifecycle behavior is high-impact.

## Requirements Summary

### `sdk:host-context`

- `SdkHostContext` exposes only `kernel` and a synchronous provider factory; it retains no duplicate config.
- `createSdkContext` must use one config reference for kernel creation and every fresh graph provider, with SDK-owned `kernel` and `graph` composition options.
- `openSpecdHost` must distinguish forced and discovery modes, reject mixed bootstrap inputs, forward shared options, and keep warnings exclusively on `config.warnings`.
- Bootstrap must not expose config mutation methods.

### `sdk:with-open-graph-provider`

- The helper creates, opens, invokes, and closes a graph provider, with optional `beforeOpen` and `afterClose` hooks.
- Cleanup must preserve the operation error, including when `open()` fails after setup.
- `afterClose` must run after the close path for successful and error-cleanup paths; SDK code must not terminate the process.

## Findings

### F1 - Medium: `open()` failures without `beforeOpen` skip required cleanup

**Evidence:** [`packages/sdk/src/composition/with-open-graph-provider.ts:26`](/Users/monki/Documents/Proyectos/specd/packages/sdk/src/composition/with-open-graph-provider.ts:26) sets `beforeOpenCompleted` only after awaiting the optional hook. If no hook is passed and `provider.open()` rejects, the catch at [line 36](/Users/monki/Documents/Proyectos/specd/packages/sdk/src/composition/with-open-graph-provider.ts:36) immediately rethrows. It does not attempt `provider.close()` or call `afterClose`.

**Why this conflicts:** The merged `sdk:with-open-graph-provider` requirement defines `afterClose` as running after the helper's close path on error cleanup paths and requires cleanup when an `open()` failure follows setup. An omitted `beforeOpen` is the standard path, and does not remove the provider resource that was already created. The current implementation creates a cleanup asymmetry: `open()` failure after a supplied hook cleans up, but the same failure in the default path does not.

**Impact:** A partially opened provider, native database handle, or host-local resource can remain unclosed in the default SDK use case. The graph impact analysis reports this lifecycle code as a direct dependency of high-fan-out host bootstrap and graph command flows.

**Resolution options:**

- Implementation bug: make the error cleanup path attempt close and run `afterClose` after _any_ post-provider-creation failure (while still preserving the original error).
- Spec interpretation alternative: if opening without a setup hook intentionally requires no cleanup, clarify that exception explicitly. This is inconsistent with the stated general cleanup semantics and is not recommended.

### F2 - Medium: Verification artifact omits newly merged lifecycle scenarios

**Evidence:** The merged `sdk:with-open-graph-provider` spec adds `afterClose` and open-failure cleanup requirements, but its merged `verify.md` remains `no-op` and contains only the original `beforeOpen` scenario. The source tests cover the hook-present case at [`packages/sdk/test/composition/with-open-graph-provider.spec.ts:100`](/Users/monki/Documents/Proyectos/specd/packages/sdk/test/composition/with-open-graph-provider.spec.ts:100), but do not cover `open()` failure with no `beforeOpen` option.

**Why this matters:** The changed behavior is not represented in the change's verification scenarios. This allowed F1 to pass the focused suite. Add explicit scenarios/tests for:

- `open()` rejection with no hooks: `close()` is attempted and `afterClose` is invoked when supplied.
- callback rejection: cleanup and `afterClose` run, with the callback error preserved.
- close or `afterClose` failure after a successful callback: document and test the permitted terminal error behavior.

### F3 - Low: `sdk:host-context` verification artifact retains obsolete option terminology

**Evidence:** The merged host-context spec replaces the old direct `KernelOptions` input with `SdkContextOptions`, and `openSpecdHost` now accepts `input.options`. Its `verify.md` still says `openSpecdHost({ kernelOptions: { ... } })` and verifies only forwarding kernel options, not graph options.

**Status:** Implementation conforms: [`packages/sdk/src/composition/host-context.ts:71`](/Users/monki/Documents/Proyectos/specd/packages/sdk/src/composition/host-context.ts:71) forwards `options?.kernel` and `options?.graph`; focused tests verify both at [`packages/sdk/test/composition/host-context.spec.ts:111`](/Users/monki/Documents/Proyectos/specd/packages/sdk/test/composition/host-context.spec.ts:111). The verification artifact, however, no longer describes the public input shape accurately.

**Resolution:** Update the merged verification scenario to use `options: { kernel, graph }`, then assert both composition option paths. This is spec/verification drift, not a code defect.

## Confirmed Conformance

- `SdkHostContext` contains only `kernel` and `createGraphProvider`; it retains no config field. [`host-context.ts:17`](/Users/monki/Documents/Proyectos/specd/packages/sdk/src/composition/host-context.ts:17)
- The provider factory is synchronous, captures the same config reference, forwards graph composition options, and returns a new provider per call. [`host-context.ts:71`](/Users/monki/Documents/Proyectos/specd/packages/sdk/src/composition/host-context.ts:71)
- `openSpecdHost` rejects mixed `configPath`/`startDir`, maps paths to the correct loader modes, defaults discovery to `process.cwd()`, forwards SDK options, and does not duplicate warnings. [`host-context.ts:95`](/Users/monki/Documents/Proyectos/specd/packages/sdk/src/composition/host-context.ts:95)
- Host bootstrap exposes no config writer functionality; no `initProject`, `addPlugin`, or `removePlugin` members were introduced.
- The SDK root barrel explicitly exposes the host functions and relevant public types without leaking infrastructure; the package architecture remains compliant with `sdk:composition` and `default:_global/architecture`.
- CLI call sites use the new nested `options.kernel` shape. [`packages/cli/src/helpers/cli-context.ts:89`](/Users/monki/Documents/Proyectos/specd/packages/cli/src/helpers/cli-context.ts:89)
- `withOpenGraphProvider` has no `process.exit` side effect, and preserves callback errors when cleanup itself throws.

## Test Coverage

- Executed: `pnpm --filter @specd/sdk test -- --run test/composition/host-context.spec.ts test/composition/with-open-graph-provider.spec.ts`
- Result: 6 test files passed, 36 tests passed.
- Strong coverage: config/graph option forwarding, fresh provider construction, config mode selection, warning ownership, mixed-input rejection, successful lifecycle ordering, callback-error preservation, and `open()` failure after an explicit `beforeOpen` hook.
- Missing coverage: default-path `open()` failure cleanup (F1), `afterClose` after callback failure, and the changed host option surface in the verification artifact (F2/F3).

## Dependency and Global Consistency

- `sdk:host-context` correctly depends on the `core` composition/kernel contracts and on `code-graph:composition`; its SDK-owned option wrapper respects the adapter/composition boundary.
- `sdk:with-open-graph-provider` uses `CodeGraphProvider` only through its public lifecycle contract and retains process/signal handling in CLI, consistent with `default:_global/architecture`.
- Tests use Vitest and live under `packages/sdk/test/composition/`, which satisfies the global testing structure. The added lifecycle branch remains insufficiently covered as noted above.

## Summary

- Findings: 3
- Implementation defects: 1 (F1)
- Spec/verification drift: 2 (F2, F3)
- Focused SDK test suite: passing, but it does not exercise the default open-failure cleanup path.
