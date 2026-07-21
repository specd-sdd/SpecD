# CLI Compliance Audit: `sdk-graph-provider-factory`

## Scope

- Assigned changed specs: `cli:graph-stats`, `cli:graph-impact`, `cli:graph-search`, and `cli:graph-hotspots`.
- Direct dependencies reviewed: `cli:graph-cli-context`, `cli:entrypoint`, `core:config`, `code-graph:composition`, `code-graph:get-graph-health`, `code-graph:traversal`, `code-graph:workspace-integration`, `code-graph:staleness-detection`, `core:list-workspaces`, `sdk:host-context`, and `sdk:with-open-graph-provider`.
- Review mode: read-only implementation/spec/test audit against the merged change artifacts.

## Result

**PASS: no compliance findings in the assigned CLI scope.**

## Requirement Traceability

| Spec                 | Verified implementation evidence                                                                                                                                                                                                                                                                                                    | Test / runtime evidence                                                                                                                                                        | Result |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `cli:graph-stats`    | `registerGraphStats` validates config/path exclusivity, resolves `resolveGraphCliContext`, constructs SDK host context, runs `GetGraphHealth` through `withProvider`, passes configured `ListWorkspaces` results, and renders the required text/structured health fields.                                                           | `graph-stats.spec.ts` verifies context precedence, SDK wrapper use, stale/fresh/null-ref results, document count, structured fields, and fingerprint mismatch reporting.       | PASS   |
| `cli:graph-impact`   | `registerGraphImpact` requires exactly one selector, normalizes directions, validates positive depth before provider access, resolves file/symbol/spec selectors with provider APIs, delegates traversal/aggregation to the provider, and preserves the global error path for missing specs and infrastructure failures.            | `graph-impact.spec.ts` verifies aliases, selector validation, canonical/ambiguous selector handling, multi-file aggregation delegation, symbol/spec paths, output, and errors. | PASS   |
| `cli:graph-search`   | `registerGraphSearch` validates format, limit, context flags, and kinds before opening; it delegates category queries and all filters via `SearchOptions`, supports documents/snippets/spec-content output, and uses the shared context/provider lifecycle.                                                                         | `graph-search.spec.ts` verifies context modes, kinds, category routing, filter forwarding, snippets, structured output, and provider-result ordering.                          | PASS   |
| `cli:graph-hotspots` | `registerGraphHotspots` applies the required default kind set, validates comma-separated kind lists, fully replaces default kinds when explicit, forwards requested filters, delegates ranking to `getHotspots`, and renders the required table/structured entries. Help and CLI reference describe the default/widening semantics. | `graph-hotspots.spec.ts` verifies defaults, individual overrides, kind validation, context flags, provider filter forwarding, help text, and reference documentation.          | PASS   |

## Lifecycle, Host, and Availability Consistency

- `resolveGraphCliContext` implements configured discovery, explicit `--config`, explicit `--path`, and no-config bootstrap fallback. Configured context calls `resolveCliContext`, which calls SDK `openSpecdHost`.
- `withProvider` delegates provider creation/open/close to SDK `createSdkContext` and `withOpenGraphProvider`, retains CLI-only signal/error/explicit-exit behavior, and uses the configured host when supplied by graph stats.
- The merged change moves busy/stale availability ownership to the provider. The commands do not retain a host-managed pre-open lock probe; provider-originated availability failures flow through the common infrastructure error path.
- Stats delegates health/staleness/fingerprint orchestration to `GetGraphHealth`; search, impact, and hotspots use the existing warning helper for non-blocking stale/fingerprint warnings before their delegated query.

## Dependency and Global Checks

- Graph status was fresh before inspection (`926` files, `4,102` symbols); graph-first symbol/impact queries were used to locate command handlers and trace host-context dependencies.
- CLI imports platform types/factories from `@specd/sdk`, matching the dependency direction and the changed SDK composition boundary.
- `docs/cli/cli-reference.md` contains graph search, hotspots, stats, and impact sections; the hotspots documentation covers default kinds, explicit replacement, importer-only widening, bootstrap behavior, and filter independence.
- No code or specification files were modified by this audit.

## Verification Executed

```text
pnpm --filter @specd/cli test -- graph-stats.spec.ts graph-impact.spec.ts graph-search.spec.ts graph-hotspots.spec.ts graph-cli-context.spec.ts
```

The CLI test command completed successfully: `73` files passed, `804` tests passed.

## Residual Risk

- The command-level tests mock the provider wrapper for most scenarios; the existing real bootstrap integration covers index rather than each read command against both concrete backends. This is a coverage limitation, not a detected compliance defect.
