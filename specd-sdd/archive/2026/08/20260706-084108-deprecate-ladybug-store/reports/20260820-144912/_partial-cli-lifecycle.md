# CLI lifecycle verification — graph context and stats

## Scope and method

Read-only audit of the effective change previews for `cli:graph-cli-context` and
`cli:graph-stats`, their direct spec dependencies, and the relevant CLI source and
tests. The code graph was fresh at audit start. Graph impact identifies
`resolveGraphCliContext` as a critical shared surface with 11 direct dependents;
`withProvider` has 9 direct dependents. The inspected consumer set is `search`,
`hotspots`, `impact`, `stats`, and `index-graph` plus their command tests.

Direct dependency chain reviewed:

```text
cli:entrypoint / core:config
  -> cli:graph-cli-context
  -> cli:graph-stats
sdk:composition -> sdk:with-open-graph-provider -> withProvider
code-graph:get-graph-health / staleness-detection / core:list-workspaces
  -> provider.getGraphHealth() -> graph stats
```

`cli:entrypoint` provides the CLI error boundary; `core:config` permits a valid
configured project outside VCS; the SDK lifecycle owns provider open/close. The
implementation uses `handleError` at the `withProvider` boundary and uses the
provider health operation rather than a CLI-side health calculation.

## Requirement assessment

| Spec              | Requirement                                         | Status           | Evidence                                                                                                                                                                                                                                                                                                                       |
| ----------------- | --------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| graph-cli-context | `resolveGraphCliContext` uses SDK imports           | Pass             | `resolve-graph-cli-context.ts` resolves explicit and discovered configuration through `resolveCliContext`, never probes VCS in configured mode, returns `vcsRoot: null`, and creates a VCS-rooted synthetic workspace only in bootstrap mode. Unit tests cover explicit and discovered non-VCS configs plus bootstrap failure. |
| graph-cli-context | `withProvider` delegates to `withOpenGraphProvider` | Partial          | `with-provider.ts` delegates open/close and no longer installs signals or calls `process.exit(0)`. It does not receive/use the resolved `kernel`, despite the requirement that the SDK host context be built from the resolved config and kernel when available.                                                               |
| graph-cli-context | Graph command platform imports                      | Pass             | `search`, `hotspots`, `impact`, and now `stats` resolve through the shared context and use `withProvider`. `index-graph.ts` uses `runIndexProjectGraph` and does not open a long-lived provider.                                                                                                                               |
| graph-cli-context | Lock helpers via SDK barrel                         | Pass             | Read-only handlers have no pre-open lock probe. Index's parent/worker lock is indexing orchestration, not a read-handler pre-open availability probe.                                                                                                                                                                          |
| graph-stats       | Command signature                                   | Pass             | `stats` exposes `--config`, `--path`, and `--format`; rejects the two context flags together before context/provider use. Configured non-VCS context is accepted by the resolver.                                                                                                                                              |
| graph-stats       | Statistics retrieval                                | Partial          | Stats calls `resolveGraphCliContext`, `withProvider`, and `provider.getGraphHealth()` once. The resolved `kernel` is discarded, so configured workspace/kernel context is rebuilt rather than propagated as required.                                                                                                          |
| graph-stats       | Concurrent indexing guard                           | Pass             | No host-managed pre-open lock probe is present; provider failures flow through `withProvider`/`handleError`.                                                                                                                                                                                                                   |
| graph-stats       | Output format                                       | Partial          | Text emits counts, health state, coverage, compatibility, non-current workspaces, and reason codes; zero relation counts are omitted. JSON/TOON are based on the health object, but missing canonical fields are replaced with presenter defaults, rather than preserving the provider result unchanged.                       |
| graph-stats       | Error cases                                         | Pass (unit-path) | Provider/open errors are caught by the common CLI error path. No code path converts provider availability errors into a successful exit. Dedicated busy/stale error integration coverage is absent.                                                                                                                            |
| graph-stats       | Content freshness and coverage diagnostics          | Partial          | The output distinguishes several diagnostic dimensions and avoids an unqualified fresh label. It emits reason codes but does not explicitly explain in text why a dirty/partial/unknown graph cannot prove symbol absence.                                                                                                     |

## Discrepancies

1. **Resolved kernel is lost before the provider lifecycle (medium/high).**
   `resolveGraphCliContext` returns `kernel`, but all read handlers destructure it only for unrelated staleness warnings or discard it (`stats`). `withProvider(config, ...)` creates a new SDK context with `buildCliKernelOptions()` rather than receiving the resolved host/kernel. This conflicts with the effective `graph-cli-context` requirement and means stats does not demonstrably use the configuration-resolved kernel/workspace definitions.
2. **Structured health is not byte-for-byte/canonically preserved (medium).**
   `stats.ts` substitutes defaults for absent `coverage`, `workspaces`, `state`, and related health fields. The spec requires JSON/TOON to expose the complete structured `getGraphHealth` result without presenter-side health recomputation or reinterpretation.
3. **Text diagnostics lack the required proof-limit explanation (medium).**
   Reason codes and coverage counts are printed, but no text states that exclusions, unsupported inputs, parse failures, or partial coverage prevent proving symbol absence.

## Test coverage and gaps

Executed successfully:

- `pnpm --filter @specd/cli test -- graph-cli-context.spec.ts graph-stats.spec.ts graph-search.spec.ts graph-hotspots.spec.ts graph-impact.spec.ts graph-index.spec.ts` — 79 files, 861 tests passed.
- `pnpm --filter @specd/cli typecheck` — passed (the RTK wrapper reported that its filter optimization was ignored; TypeScript reported no errors).
- `pnpm --filter @specd/cli lint` — passed.

Covered by the changed/new tests: configured explicit and discovered non-VCS resolution (mocked), bootstrap VCS behavior, lifecycle delegation/no CLI signal listeners, normal return after cleanup, stats context-flag routing, one health call, and basic health output fields.

Missing or insufficient coverage:

- A non-mocked integration test running `graph stats --config <valid non-VCS config>` against an opened provider and asserting VCS-unavailable health is retained.
- A test that proves the resolved kernel/host is passed into the provider lifecycle for configured stats (and the other shared read handlers).
- Provider `GRAPH_BUSY` and `GRAPH_PROVIDER_STALE` integration/error-path tests asserting `fatal:` output and exit code 3.
- Text tests for dirty, excluded, unsupported, parse-failed, partial, unknown, incompatible, and non-current-workspace diagnostics, including the required symbol-absence proof-limit wording.
- JSON and TOON tests asserting an intentionally sparse or extended canonical health payload is preserved unchanged rather than defaulted/reconstructed.

## Count summary

- Requirements assessed: 10
- Pass: 5
- Partial: 4
- Pass with test-scope caveat: 1
- Fail: 0
- Implementation discrepancies: 3
- Test gaps: 5

## Audit conclusion

The change substantially completes the removal of Ladybug-specific CLI exit/signal handling and correctly enables configured execution outside VCS. It is not fully compliant with the two effective specs until resolved kernel context is carried into the shared provider lifecycle and stats preserves/explains canonical health diagnostics as required.
