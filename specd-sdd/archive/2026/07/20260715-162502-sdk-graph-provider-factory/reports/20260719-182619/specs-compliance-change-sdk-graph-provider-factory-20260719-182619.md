# Spec Compliance Audit: sdk-graph-provider-factory

**Mode:** specific change  
**Scope:** 12 changed specs, direct dependencies (depth 1), and applicable project-wide constraints.  
**Graph:** fresh.  
**Overall:** 2 medium implementation findings, 1 medium verification-gap finding, 1 low verification-drift finding; CLI scope has no findings.

## Summary

- **F1 Medium, implementation:** `withOpenGraphProvider` skips `close()` and `afterClose()` when `open()` fails without a `beforeOpen` hook.
- **F2 Medium, verification gap:** lifecycle scenarios/tests omit default-path `open()` failure cleanup and `afterClose` error-path coverage.
- **F3 Low, verification drift:** host-context verification still refers to obsolete `kernelOptions` rather than `options: { kernel, graph }`.
- **F4 Medium, implementation:** `CodeGraphProvider` is a type-only public export, not the required runtime export.
- **CLI:** compliant for graph stats, impact, search, and hotspots.

## Detailed Findings

The complete batch reports are retained alongside this report for audit traceability:

- [\_partial-sdk.md](_partial-sdk.md)
- [\_partial-graph.md](_partial-graph.md)
- [\_partial-cli.md](_partial-cli.md)

### SDK

`withOpenGraphProvider` marks cleanup eligibility only after an optional `beforeOpen` hook completes. When no hook is supplied and `provider.open()` rejects, it rethrows without attempting `provider.close()` or invoking `afterClose`. This conflicts with the merged lifecycle cleanup requirement and can leave a partially-opened provider resource unclosed. Add coverage for default-path open rejection, callback rejection cleanup, and terminal close/afterClose errors. The merged verification scenario also retains obsolete `kernelOptions` terminology even though implementation correctly forwards `options.kernel` and `options.graph`.

### Code Graph

The public barrel exports `CodeGraphProvider` with `export type`, removing the runtime class from emitted JavaScript despite the composition specification requiring it in the public composition surface. Export the class as a value and add a runtime public-barrel regression test. The focused composition, health, index, and SQLite checks passed; full Ladybug execution was limited by a repeated Vitest/Tinypool `ERR_IPC_CHANNEL_CLOSED` worker failure.

### CLI

No discrepancies found. Graph stats, impact, search, and hotspots correctly use the SDK host/provider lifecycle and delegate health, traversal, search, and availability behavior to the intended code-graph components. The focused CLI suite passed 73 files and 804 tests.

## Verification Evidence

- Verification entry hooks passed: `pnpm test`, `pnpm lint`, `pnpm typecheck`.
- SDK suite passed: 6 files, 36 tests.
- CLI suite passed: 73 files, 804 tests.
- The code-graph audit completed focused composition, health, index, host-factory, and SQLite checks; the separate Ladybug runner limitation remains.

## Conclusion

The change is not ready to transition while F1 and F4 remain. F2 and F3 require verification artifact updates; fix artifacts before considering the implementation verified.
