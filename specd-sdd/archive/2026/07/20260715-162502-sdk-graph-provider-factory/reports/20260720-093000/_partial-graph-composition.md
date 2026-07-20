# Compliance audit — graph composition and VCS

Change: `sdk-graph-provider-factory`  
Scope reviewed: `code-graph:composition`, `code-graph:index-project-graph`, `code-graph:get-graph-health`, `core:vcs-adapter-port`, and `core:vcs-adapter`.

## Result

**No implementation/spec discrepancy found in this scope.** The reviewed implementation satisfies the merged requirements and scenarios. One non-blocking test-runner warning and several coverage gaps are recorded below.

## Evidence and scenario verification

| Spec                             | Scenarios evaluated | Result | Evidence                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------- | ------------------: | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `code-graph:composition`         |                  20 | Pass   | `CodeGraphProvider` is an interface; `CodeGraphProviderImpl` receives `GraphStore` and `IndexCodeGraph` only inside composition; the factory creates the provider and public barrel re-exports the interface with `type`. `barrel.spec.ts` confirms the runtime export is absent. Provider lifecycle, selector, clear, factory and host-use-case tests pass. |
| `code-graph:index-project-graph` |                   6 | Pass   | `IndexProjectGraph.execute()` receives an already-open `CodeGraphHostPort`, only forwards normalized options to `provider.index`, and has no config/lock access. `index-project-graph.spec.ts` covers incremental, force, and progress forwarding; its integration test passes.                                                                              |
| `code-graph:get-graph-health`    |                   8 | Pass   | `GetGraphHealth` reads statistics from the supplied provider, resolves VCS through injected `createVcsAdapter`, preserves provider failures, and calculates staleness/fingerprint diagnostics. `get-graph-health.spec.ts` covers match, no ref, drift, fingerprint match/mismatch, missing workspaces, unavailable VCS and lifecycle non-ownership.          |
| `core:vcs-adapter-port`          |                  22 | Pass   | The public core barrel exports the abstract `VcsAdapter`; base `VcsAdapter.detect(cwd)` resolves `null`; Git and Null implementations meet the port contract. `vcs-adapter.spec.ts` specifically exercises the corrected base-detect behavior.                                                                                                               |
| `core:vcs-adapter`               |                  11 | Pass   | `createVcsAdapter` probes supplied/external providers before built-ins, then Git/Hg/Svn, falls back to `NullVcsAdapter`, and defaults `cwd`. `vcs-adapter.spec.ts` verifies external precedence and factory Git detection from this repository.                                                                                                              |

Total: **67 merged verification scenarios evaluated; 67 passed by implementation inspection.**

## Requirement and dependency compliance

- The provider is factory-only on the curated `@specd/code-graph` root: `public.ts` uses `export { type CodeGraphProvider }`; `package.json` maps `.` to that curated barrel. The concrete class is not exported by either the root or `./internal` barrel. This meets the composition requirement and the global architecture rule against exporting concrete adapters from public entry points.
- Manual DI and layer direction are preserved: the provider factory is the composition-only site importing infrastructure; `IndexProjectGraph` and `GetGraphHealth` depend on `CodeGraphHostPort`, not concrete stores/providers. `GetGraphHealth` receives a VCS factory constructor dependency, and its composition factory wires `createVcsAdapter`.
- `VcsAdapter` remains the required abstract port with the invariant `cwd` constructor, while the composition factory—not the port static base method—selects concrete VCS implementations. The public core barrel exports `VcsAdapter` and `createVcsAdapter`, not concrete adapters.
- The reviewed use cases comply with the direct graph-store/indexer/staleness and global architecture dependencies: no backend-specific storage API or direct infrastructure import is present in application use cases.

## Test execution

- `pnpm --filter @specd/code-graph test`: all displayed suites passed, including composition (12), health (8), index-project-graph (3), integration (1), barrel (3), SQLite store (87), and Ladybug coverage. After the successful test output Vitest emitted an unhandled `ERR_IPC_CHANNEL_CLOSED` / `Channel closed` warning from its worker pool. The chained command continued and completed; record this as test-runner hygiene, not a scenario failure.
- `pnpm --filter @specd/core test`: completed successfully; `test/composition/vcs-adapter.spec.ts` passed 3/3 and the full suite reported no failing test entries.

## Coverage gaps / residual risk

These are **coverage gaps, not demonstrated spec failures**:

1. `core:vcs-adapter` scenarios for Hg/Svn detection, Git-over-Hg priority, unmatched external-provider fall-through, non-VCS fallback, and omitted/explicit `cwd` are not all directly exercised in `test/composition/vcs-adapter.spec.ts`. The factory code is consistent with them, but targeted tests would reduce regression risk.
2. `code-graph:composition` has a runtime barrel assertion that `CodeGraphProvider` is absent and a type import that compiles, but no explicit compile-fixture containing an expected direct-construction error. Type-only export plus package typecheck establishes the surface; a fixture would make the compile-time scenario more explicit.
3. `IndexProjectGraph` proves normal option forwarding but does not assert lock/config functions are absent via spies; the source has no such imports, which satisfies the scenario by inspection.
4. The `Channel closed` Vitest worker warning makes the code-graph package test output noisier than a clean zero-warning run. It did not cause a failing scenario in this execution.

## Conclusion

The audited graph-composition and VCS scope is compliant with the merged change artifacts. No spec update or implementation fix is required from this partial audit.
