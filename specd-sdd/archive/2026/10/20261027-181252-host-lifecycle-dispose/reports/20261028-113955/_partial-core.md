# Partial audit: core:kernel + core:kernel-builder (disposal), attempt 4

Test run: `pnpm vitest run test/composition` in packages/core -> 54 files, 270 tests, all passed.

## Requirements Summary

core:kernel

- R1 Kernel disposal: dispose()/[Symbol.asyncDispose] identical, never throw sync, reverse order awaited sequentially, idempotent shared promise, failure isolation -> AggregateError of DisposerFailedError (message `Disposer '<name>' failed`, cause), 5000 ms unref'd timeout with Logger warn and not in aggregate, closed state, empty = no work, opaque.
- R2 KernelOptions accepts named disposers: non-empty name + callable -> InvalidDisposerError; dup -> RegistryConflictError('disposers'); before any disposer runs; array order = registration order.
- R3 Failed construction releases disposers: reverse order, same isolation/timeout, malformed/conflicting entries still release well-formed ones once, original error preserved, release failures only warned.
- Kernel "no lifecycle ops besides dispose" wording (Kernel is plain object literal).
  core:kernel-builder
- R4 registerDisposer: chainable, call order, InvalidDisposerError on empty/non-string name or non-callable dispose, RegistryConflictError('disposers') on dup.
- R5 Builder hands disposers to kernel: kernel runs them, builder never; failed build relies on createKernel; builder == options disposal.

## Implementation Status

All implemented.

- kernel-disposal.ts: runOne (Promise.resolve().then converts sync throws; timer.unref; clearTimeout in finally; late rejection swallowed), runDisposers (reverse, sequential, AggregateError of DisposerFailedError, warn on timeout), createDispose (`??=` memoized; async fn so never throws sync), validateDisposers (isWellFormed: string, non-empty, function; dup -> RegistryConflictError('disposers', name)), releaseAfterFailedConstruction (filters well-formed, never throws, warns).
- kernel.ts: Kernel extends AsyncDisposable; `dispose` and `[Symbol.asyncDispose]` are the same function reference; createKernel validates then buildKernel inside try, catch -> release -> rethrow original.
- kernel-builder.ts: registerDisposer checks `typeof name !== 'string' || name === ''` (new non-string check present), typeof dispose, dup; toKernelOptions passes disposers in order; build() = createKernel(config, toKernelOptions).
- errors: InvalidDisposerError (INVALID_DISPOSER), DisposerFailedError (DISPOSER_FAILED, cause, disposerName) exported via application/errors/index.ts -> application/index.ts; KernelDisposer type exported from composition/index.ts.

## Discrepancies

None blocking.

- Minor/spec-doc: the merged preview contains a verify.md only for core:kernel-builder; no core:kernel disposal scenarios appear in the preview (kernel R1-R3 have no verify scenarios in the spec artifact). Tests exist anyway. Consider adding scenarios to kernel verify delta if intended.
- Minor: I did not verify the `@specd/core` package-root re-export chain end to end (src/index.ts grep showed no direct match; exports go through `export *` of application/index.ts). Not confirmed by a build/import check.
- Minor: "closed state" is documentation-only (unspecified behaviour); nothing enforced, consistent with spec.

## Test Coverage

core:kernel (test/composition/kernel.spec.ts `createKernel disposal`, kernel-disposal.spec.ts)

- dispose + asyncDispose present, only lifecycle op: "exposes dispose as its only lifecycle operation"
- alias + await using: "treats Symbol.asyncDispose as an alias and supports await using"
- idempotent/concurrent: "shares one promise across repeated and concurrent dispose calls"; createDispose "shares one promise across repeated and concurrent calls and runs each disposer once"
- reverse order + isolation: "runs the supplied disposers in reverse order and isolates failures"; runDisposers "runs disposers in reverse registration order, awaiting each before the next", "isolates a failing disposer and aggregates DisposerFailedError entries", "converts a synchronous throw into an isolated failure"
- DisposerFailedError message + cause: "reports each failed disposer as a DisposerFailedError with the original failure as cause"
- never throws sync (new): "never throws synchronously, even when a disposer throws synchronously"
- rejected disposal stays rejected, no rerun: "keeps a rejected disposal rejected on later calls without rerunning disposers"
- timeout: "abandons a hanging disposer after the timeout through kernel.dispose and logs a warning"; "abandons a hanging disposer after the timeout, warns, and continues"; "does not report a timeout in the aggregate error and swallows a late rejection"; "unrefs the timeout timer and clears it after a normal disposer"
- no disposers: "resolves dispose for a kernel without disposers"; "resolves without doing any work for an empty list"
- KernelOptions validation: "rejects an empty disposer name", "rejects a non-callable dispose before any disposer runs", "rejects a duplicate disposer name with a RegistryConflictError"; validateDisposers suite (4 tests)
- construction failure: "releases the disposers in reverse order when construction fails", "keeps the original construction error when a disposer also fails", invalid/conflicting-entries test at kernel.spec.ts ~L759 (releases `good` once); releaseAfterFailedConstruction suite (2 tests)
  core:kernel-builder (test/composition/kernel-builder.spec.ts)
- "registerDisposer is chainable"
- "hands registered disposers to the kernel in call order and the builder never runs them" (covers call-order + kernel runs + builder did not run)
- "rejects an empty disposer name"; "rejects a non-string disposer name" (new); "rejects a non-callable dispose"; "rejects a duplicate disposer name and keeps the first registration"
- "releases registered disposers in reverse order when build fails"
- "disposes a builder-built kernel the same way as an options-built kernel"

## Missing Tests

- Builder scenario "Disposers reach the kernel options in call order" is only checked indirectly (via dispose order, reversed), not by inspecting options; acceptable.
- No test that builder dup/invalid error message/category string for RegistryConflictError('disposers') in builder (kernel-disposal.spec checks `'disposers'` message regex only).
- No test for non-string name through createKernel options path (only via builder); isWellFormed handles it.
- No test asserting package-root (`@specd/core`) exports of InvalidDisposerError/DisposerFailedError.

## Counts

Requirements: 5 (3 kernel, 2 builder). Verify scenarios present: 8 builder-side (all covered); 0 kernel-side in preview. Implemented: 5/5. Fully tested: 5/5. Discrepancies: 0 blocking, 3 minor. Core composition tests: 270/270 pass.
