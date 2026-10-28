# Partial audit — host-lifecycle-dispose (6 specs, audited inline)

Scope: `core:kernel`, `core:kernel-builder`, `sdk:host-context`, `cli:host-context`, `cli:entrypoint`, `default:_global/conventions` (merged with the change deltas), plus direct dependencies and global specs (`architecture`, `conventions`, `error-handling-conventions`, `testing`, `continuous-integration`).

Method: merged specs via `changes context`/`spec-preview`; code read directly; scenarios exercised through the automated suite (core 3316, cli 1191, sdk 84, code-graph 799 tests green) and through the built artifacts (CLI exit codes, SIGINT/SIGTERM, SDK `await using`). Graph state is `unknown` (uncommitted tree), so graph-based symbol resolution was not usable; code was navigated by reading.

## core:kernel

| Requirement                                                                                                                                                                                                           | Implementation                                                                                   | Tests                                                                    | Status |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------ |
| Kernel is a plain object (rewritten: only `dispose` as lifecycle, immutable use-case set)                                                                                                                             | `Kernel extends AsyncDisposable`, `dispose` + `[Symbol.asyncDispose]` in `composition/kernel.ts` | `kernel.spec.ts` "exposes dispose as its only lifecycle operation"       | OK     |
| Kernel disposal: alias, reverse order, idempotent shared promise, failure isolation (`AggregateError` of `DisposerFailedError`), 5000 ms timeout with warning and abandon, unref'd timer, closed state, no sync throw | `composition/kernel-disposal.ts` (`runDisposers`, `runOne`, `createDispose`)                     | `kernel-disposal.spec.ts` (14), `kernel.spec.ts` "createKernel disposal" | OK     |
| KernelOptions accepts named disposers (non-empty name, duplicate → `RegistryConflictError('disposers')`)                                                                                                              | `validateDisposers`, `KernelOptions.disposers`                                                   | disposal + kernel specs                                                  | OK     |
| Failed construction releases disposers, original error kept, conflicting entries still release well-formed ones                                                                                                       | `createKernel` wrapper + `releaseAfterFailedConstruction`                                        | `kernel.spec.ts` (3 scenarios), `kernel-disposal.spec.ts`                | OK     |

Notes: warnings go through the global `Logger` (no-op until `buildKernel` installs the default logger), matching the "when a logger is available" rule. Behaviour after `dispose()` is intentionally unspecified and unguarded.

## core:kernel-builder

`registerDisposer(name, fn)` implemented next to `registerCheck`; state/clone/`toKernelOptions` forward `disposers`; `build()` unchanged (equivalence with `createKernel` preserved). Tests: chainable, call order reaches kernel, empty name, duplicate name keeps first, kernel runs them / builder does not, failed build releases, builder-vs-options parity. Status: OK.

## sdk:host-context

`SdkHostContext extends AsyncDisposable` with `dispose`; `createSdkContext` returns the members delegating to `kernel.dispose()`; `openSpecdHost` carries them through the spread (symbol-keyed property survives, proven by test and by running the built SDK). Graph providers are not closed by `dispose`. No API wraps a foreign kernel (barrel scan). Status: OK. `KernelDisposer` is intentionally not re-exported from the SDK (consistent with `sdk:composition`'s explicit export list).

## cli:host-context

| Requirement                                                                                         | Evidence                                                                     | Status     |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------- |
| resolveCliContext via helper, returns host as `CliContext`                                          | `helpers/cli-context.ts`, `cli-context.spec.ts`                              | OK         |
| Host bootstrap entry point (no direct `openSpecdHost`/`createSdkContext` outside helper and worker) | source-scan test; `sdk-host.ts` deleted                                      | OK         |
| CLI host-opening helper registers disposal; covers both forms; no hand-built host                   | `helpers/cli-host.ts`, `cli-host.spec.ts`, scan test                         | OK, see F1 |
| CliContext extends SdkHostContext                                                                   | `cli-context-types.ts`                                                       | OK         |
| Cleanup registry (reverse, idempotent, isolated, `warning:` lines, never changes exit code)         | `helpers/cli-cleanup.ts`, `cli-cleanup.spec.ts` (5)                          | OK         |
| Graph index worker disposes in `finally`                                                            | `graph-index-task.ts`, `graph-index-task.spec.ts`, real run of the built CLI | OK         |

**F1 (low, spec/implementation mismatch).** The spec says the helper "SHALL always pass the CLI kernel options". The helper does not; every caller passes `buildCliKernelOptions()` explicitly (checked: `cli-context.ts`, `status.ts`, `dashboard.ts` ×2, `with-provider.ts`). This was a deliberate design choice (avoids an import cycle with `cli-context.ts`) but the spec text was not adjusted. Either amend the spec ("callers pass the CLI kernel options") or move `buildCliKernelOptions` so the helper can apply it. Not a behavioural defect today.

## cli:entrypoint

| Requirement                                                                          | Evidence                                                                                                                        | Status     |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Exit codes table with 130/143                                                        | `run.ts`, `cli-signals.ts`; built CLI exited 130 on SIGINT and 143 on SIGTERM                                                   | OK         |
| Only the entrypoint terminates the process; helpers throw `CliExitError`             | scan test; `handle-error.ts`; 21 sites converted; `handleError` rethrows `CliExitError` first                                   | OK         |
| Cleanup awaited on every exit path                                                   | `run.ts`; `run.spec.ts` (normal, CliExitError 1 and 0, unexpected error, `process.exitCode`)                                    | OK, see F2 |
| Commands must not swallow `CliExitError`                                             | scan guards (catch audit + try/catch reclassification guard); the guard caught a real bug during implementation (`graph index`) | OK, see F3 |
| Signal handling (first/second signal, no handlers from `createProgram`, coexistence) | `cli-signals.spec.ts`; manual SIGINT/SIGTERM                                                                                    | OK         |

**F2 (low/medium, robustness).** In `run()`, `toExitCode(error)` rethrows anything `handleError` throws other than `CliExitError`. If that ever happens (for example an I/O failure while writing the structured error), `run()` rejects, `void run(process.argv)` becomes an unhandled rejection, cleanup is skipped and the exit code is not mapped (Node ends with 1). The spec requires cleanup to be awaited on "any other rejection". Fix: wrap the call so a non-`CliExitError` falls back to exit code 3 and still reaches `runCliCleanup()`. Not reachable with the current `handleError`, which only throws `CliExitError`.

## default:\_global/conventions (Node.js engine floor)

15 published manifests declare `engines.node: ">=22"`; `apps/public-web` (private) does not; CI installs Node 22. `dev/scripts/check-engines.js` passes and was shown to fail (exit 1) when one manifest lacked the field; wired into `preflight:check`. Status: OK.

## Consistency with global and dependency specs

- architecture: disposal logic lives in the core composition layer; SDK/CLI only delegate; CLI still reaches platform code only through `@specd/sdk`. No violation.
- conventions / error-handling-conventions: new errors extend `SpecdError` (core) or `SpecdCliError` (`CliExitError`); named exports only; no `any`; explicit return types; lint clean.
- testing: unit tests with mocked ports and fake timers; CLI tests mock `process.exit` through shared helpers.
- continuous-integration: no matrix change; floor equals CI Node version.
- No contradiction found between the change's specs and global/dependency specs.

## Test coverage gaps (non-blocking)

- **F3a.** The "commands do not swallow `CliExitError`" requirement is enforced by source-scan guards, not by a behavioural test running real commands through `run()`.
- **F3b.** `run()` has no test for the path where `handleError` throws something other than `CliExitError` (see F2).
- **F3c.** SIGINT/SIGTERM exit codes are verified end-to-end only manually; automated tests use mocked `process.exit`.
- **F3d.** The engines script is verified manually and by `preflight:check`, with no unit test.

## Other observations

- **F4 (info).** `packages/guide/src/infrastructure/generated/guides.ts` bundles `docs/`; it was restored to HEAD after builds (about 10k lines of churn) and will refresh on the next build. The new docs content therefore reaches the in-CLI guides only after a rebuild.
- **F5 (info).** `changes context` warned that `core:get-status` and `core:change` drifted since their last LLM optimization. They are outside this change and were not refreshed here.

## Summary counts

- Specs audited: 6; requirements checked: 21; scenarios exercised: all, none failing.
- Findings: 2 actionable (F1 low, F2 low/medium), 4 coverage gaps (F3a–d), 2 informational (F4, F5).
