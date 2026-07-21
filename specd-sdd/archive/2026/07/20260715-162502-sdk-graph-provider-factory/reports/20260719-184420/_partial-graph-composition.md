# Partial compliance audit — code-graph composition

**Scope.** Change `sdk-graph-provider-factory`; assigned merged change specs: `code-graph:composition`, `code-graph:index-project-graph`, and `code-graph:get-graph-health`. Direct dependencies considered: `code-graph:graph-store`, `code-graph:indexer`, `code-graph:staleness-detection`, `code-graph:traversal`, `code-graph:symbol-model`, `core:config`, and `core:list-workspaces`. Project-wide constraints considered: architecture, conventions, ESLint, error handling, testing, docs, and spec layout. Graph status was fresh (`2026-07-19T16:45:02Z`, 926 files, 4,102 symbols; no fingerprint mismatch).

## Evidence and requirement coverage

| Spec                             | Requirement/scenario coverage                                                                                                                         | Implementation evidence                                                                                                                                                                                                                 | Result                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `code-graph:composition`         | Provider facade, sync registry factory, curated exports, lifecycle, core runtime dependency, host-use-case exports; 19 merged verification scenarios  | `src/composition/code-graph-provider.ts`, `create-code-graph-provider.ts`, `public.ts`, `package.json`; tests `test/composition/code-graph-provider.spec.ts`, `test/barrel.spec.ts`, `test/composition/host-use-case-factories.spec.ts` | Mostly conforms; findings C-02, C-03, C-04.                                         |
| `code-graph:index-project-graph` | Index options forwarding, provider-owned force reset, prepared/open input, stateless factory; 6 merged scenarios                                      | `src/application/use-cases/index-project-graph.ts`; unit/integration tests in matching `test/application/use-cases/` files                                                                                                              | Code conforms to merged `spec.md`; artifact conflict C-01 and testing finding C-03. |
| `code-graph:get-graph-health`    | health result, provider-owned busy/stale propagation, VCS staleness, fingerprint mismatch, prepared/open input, stateless factory; 9 merged scenarios | `src/application/use-cases/get-graph-health.ts`; `test/application/use-cases/get-graph-health.spec.ts`                                                                                                                                  | Core functional behavior conforms; architecture and test gaps C-03/C-04.            |

`CodeGraphProvider` is HIGH graph-impact: 12 affected files / 13 transitive dependents, including SDK host composition and CLI `with-provider`; this supports treating the public-facade issues as release-significant.

## Detailed findings

### C-01 — High: merged verification scenarios contradict the merged force-index contract

`code-graph:index-project-graph/spec.md` now requires that `force: true` is forwarded to `provider.index(...)` and that the use case **MUST NOT** call `provider.recreate()` directly. The merged `verify.md` remains unchanged (`status: no-op`) and still requires both `provider.recreate()` before `provider.index()` and no recreation when false. Those two scenarios are incompatible with the merged requirement.

The implementation is aligned with the new requirement: `IndexProjectGraph.execute()` forwards `{ force: true }` to the host port; `CodeGraphProvider.index()` owns `store.recreate()` under its lock. The current unit test also correctly tests forwarding, so the artifact—not this implementation—appears stale. Update the verify artifact’s force scenarios before treating this change as verified.

### C-02 — Medium: public barrel exceeds the explicitly curated composition surface

The merged composition spec says the `"."` barrel “SHALL export only” the enumerated surface. `src/public.ts` additionally exports `normalizeFileSelectorPath`, which is not enumerated. This is an observable public-API discrepancy. Either remove/relegate this symbol to `./internal`, or add it deliberately to the composition specification with its compatibility intent.

The public root correctly avoids concrete store, adapter-registry, and indexer exports; `package.json` maps `.` to `public` and `./internal` to the full barrel. `createSqliteGraphStoreFactory`, required by the changed spec, is exported.

### C-03 — Medium: application-layer dependency injection and typed-port mock rules are not met

`GetGraphHealth` is in `src/application/use-cases/` but imports and invokes `createVcsAdapter` directly from `@specd/core`. The global architecture spec requires application code to use ports only and receive dependencies via construction; this is direct adapter/factory acquisition inside the use case. A VCS/ref port (injected through the factory) would satisfy the global constraint while retaining current behavior.

Related test mocks violate the global testing requirement for complete typed port mocks. Examples include `makeProvider()` in `index-project-graph.spec.ts` and `get-graph-health.spec.ts`, both casting partial objects through `as unknown as CodeGraphHostPort`; `host-use-case-factories.spec.ts` has the same pattern. The rule explicitly forbids partial mocks and that cast. These are specification compliance gaps even where runtime tests pass.

### C-04 — Medium: changed-scenario test coverage is incomplete

`get-graph-health.spec.ts` covers VCS/ref and fingerprint paths, and the provider test exercises stale generation. It does not test the two newly merged `GetGraphHealth` verification scenarios that require unchanged propagation of provider `GRAPH_BUSY` and `GRAPH_PROVIDER_STALE` errors. Add direct rejection/identity tests at the use-case boundary.

Composition test coverage also does not prove the complete public-root exclusion list required by the merged scenarios (concrete stores, `AdapterRegistry`, built-in adapters, and `IndexCodeGraph`); the barrel test currently checks only `InMemoryIndexSession`. The export contract is high risk because hosts in CLI and SDK depend on the provider facade.

## Dependency and project-wide consistency

- **Provider-owned lifecycle/force semantics:** consistent among the changed composition and index specs and code: synchronous factory, `open()` as async boundary, idempotent `close()`, force recreation and locking in `CodeGraphProvider.index()`.
- **Graph-store/indexer contracts:** the implementation constructs exactly one selected store, defaults to `sqlite`, retains explicit `ladybug`, builds the four built-in language adapters, and forwards force through the index use case. This is consistent with the direct composition dependencies.
- **Health/staleness contracts:** `GetGraphHealth` delegates availability to `provider.getStatistics()`, propagates provider errors naturally, computes `stale` via `isGraphStale`, and uses fingerprint helpers when prerequisites exist. No direct conflict with the changed health spec was found.
- **Global architecture:** C-03 is a direct conflict; public concrete adapters remain hidden, satisfying the curated-entry-point portion.
- **Global testing:** C-03 typed mocks and C-04 coverage gaps are direct conflicts/shortfalls. Test placement and Vitest usage conform. No snapshot use observed in the audited tests.
- **Conventions/ESLint/docs/spec-layout/error handling:** no additional discrepancy found in this scope. No documentation change is required by the assigned specs.

## Test execution

Ran the package test script while auditing. Relevant suites reported passing: composition provider **12**, `IndexProjectGraph` unit **3**, `IndexProjectGraph` integration **1**, and `GetGraphHealth` **7** tests. The wrapper ignored the requested file filter and ran the broader code-graph suite; its output ended with an unhandled `ERR_IPC_CHANNEL_CLOSED` after many passing suites, so it is not clean proof of a full-package green run. The four relevant suites above did report pass results.

## Counts

- Specs audited: **3** change specs; **7** direct dependency specs considered; **8** project-wide specs considered.
- Merged verification scenarios examined: **34** (composition 19, index-project-graph 6, get-graph-health 9).
- Findings: **4** total — **1 high**, **3 medium**, **0 low**.
- Implementation requirements assessed: **20** (composition 6, index-project-graph 4, get-graph-health 6, plus cross-cutting package/dependency constraints 4): **16 conforming**, **4 with discrepancy or unproven coverage**.

## Audit conclusion

Do not proceed on a “clean” compliance basis. C-01 requires artifact correction/review; C-03 requires an architecture/test-conventions decision; C-04 requires targeted tests. C-02 is a public API contract decision that should be resolved before release.
