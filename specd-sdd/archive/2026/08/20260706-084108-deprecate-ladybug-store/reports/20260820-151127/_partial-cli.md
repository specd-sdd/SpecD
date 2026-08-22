# CLI compliance audit — deprecate-ladybug-store

Scope: `cli:graph-cli-context`, `cli:graph-stats`, `cli:graph-impact`, `cli:graph-hotspots`, and `cli:graph-search`.

## Result

**PASS — 0 findings.** The five merged CLI specs and their merged verification scenarios are implemented consistently with the Ladybug deprecation design.

## Evidence reviewed

- Change state was `verifying`; all spec and verify artifacts were `complete`, with 57/57 tasks complete and no reported blockers or review requirement.
- Graph index was current (`stale: false`, `knownStaleSinceLastIndex: false`, complete indexed coverage), so graph-first symbol discovery was authoritative.
- Reviewed merged `spec.md` and `verify.md` artifacts for all five owned CLI spec IDs, including the change deltas that replace graph-store-specific cleanup/host bootstrap paths.
- Inspected the graph-discovered implementation entry points:
  - `packages/cli/src/commands/graph/resolve-graph-cli-context.ts`
  - `packages/cli/src/commands/graph/with-provider.ts`
  - `packages/cli/src/commands/graph/stats.ts`
  - `packages/cli/src/commands/graph/impact.ts`
  - `packages/cli/src/commands/graph/hotspots.ts`
  - `packages/cli/src/commands/graph/search.ts`

## Requirement / scenario assessment

| Spec                    | Assessment                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli:graph-cli-context` | PASS. Configured contexts retain a resolved kernel and project root without VCS validation; bootstrap contexts require a VCS root and build the synthetic workspace. `withProvider` delegates lifecycle to SDK `withOpenGraphProvider`, reuses an available resolved kernel, has no graph-store signal handlers, and does not call `process.exit(0)`. |
| `cli:graph-stats`       | PASS. Stats resolves the shared graph context, calls `withProvider`, invokes `provider.getGraphHealth()` once, and renders the returned structured health unchanged for JSON/TOON. It performs no lock probe or presenter-side health recomputation.                                                                                                  |
| `cli:graph-impact`      | PASS. Impact validates inputs before context creation, resolves the common context, uses `withProvider`, and delegates traversal/selector operations to the open provider. No Ladybug/native store ownership remains in the handler.                                                                                                                  |
| `cli:graph-hotspots`    | PASS. Hotspots resolves the common context, opens through `withProvider`, obtains stale diagnostics from the provider-side lifecycle, and delegates ranking/querying to `getHotspots`.                                                                                                                                                                |
| `cli:graph-search`      | PASS. Search resolves the common context and opens through `withProvider`; it passes categories, limits, filters, snippets, and workspace selectors to the unified provider search instead of rebuilding cross-category behavior in the CLI. Rendering preserves the provider projection and only controls presentation fields.                       |

## Dependency and global consistency

- The shared CLI commands import platform/provider types and orchestration from `@specd/sdk`; CLI delivery code remains an adapter and does not depend on Ladybug implementation details.
- The implementation follows the merged `code-graph:composition` constraint that provider construction/lifecycle are SDK-owned and the `cli:entrypoint` error/output conventions: availability failures flow through the standard handler rather than a host-owned pre-open lock check.
- Search, impact, and hotspots retain only command-specific presentation/argument parsing; the Code Graph provider owns semantic graph operations, satisfying the architecture boundary.

## Tests

Focused suite executed successfully:

```text
pnpm --filter @specd/cli test -- graph-cli-context graph-stats graph-impact graph-hotspots graph-search

Test Files  79 passed (79)
Tests       861 passed (861)
```

The command emitted expected fixture/error-path console output, but exited successfully.

## Findings

None. No remediation is required for this audit scope.
