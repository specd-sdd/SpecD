# Spec-compliance audit — code-graph batch

- Change: `sdk-graph-provider-factory`
- Mode: change audit batch = `code-graph`
- Specs audited: `code-graph:composition`, `code-graph:index-project-graph`, `code-graph:get-graph-health`, `code-graph:graph-store`, `code-graph:ladybug-graph-store`, `code-graph:sqlite-graph-store`
- Graph: fresh (`lastIndexedAt 2026-07-19T17:45:36.355Z`, `stale: false`, no fingerprint mismatch)
- Method: merged `changes spec-preview`, graph search/impact, source + tests under `packages/code-graph`
- Prior finding context: report `20260720-160631` raised **CG-01** (`vcsRoot` missing from merged `index-project-graph` contract). This batch re-checks remediation.

## Requirements summary and implementation status

| Spec                             | Status                                                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code-graph:index-project-graph` | **Compliant (CG-01 remediated)**                             | Merged preview requires `vcsRoot: string \| null` on `IndexProjectGraphInput`, lists `vcsRoot` in the forwarded `IndexOptions` fields, and requires unchanged forwarding. Code matches: `IndexProjectGraphInput.vcsRoot` + `execute()` forwards `vcsRoot: input.vcsRoot`. `IndexOptions` also requires `vcsRoot: string \| null`. Unit tests cover null and non-null forwarding; integration test passes a non-null root under force recreate. |
| `code-graph:composition`         | Compliant, with one verify-name drift                        | `createCodeGraphProvider` merges built-in `ladybug`/`sqlite` factories, defaults to `sqlite`, registers four adapters, returns type-only `CodeGraphProvider`, defers native store readiness to `open()`. Public barrel + `package.json` exports `.` / `./internal`. Merged `spec.md` correctly uses `CodeGraphCompositionOptions`; merged `verify.md` still names `CodeGraphFactoryOptions` in one scenario.                                   |
| `code-graph:get-graph-health`    | Compliant, busy/stale propagation undertested                | `GetGraphHealth` calls `provider.getStatistics()` first (errors propagate), resolves VCS via injected `createVcsAdapter`, uses `isGraphStale`, computes fingerprint mismatch only when workspaces + stored fingerprint allow it, never opens/closes the provider. Factory `createGetGraphHealth()` is stateless w.r.t. config.                                                                                                                 |
| `code-graph:graph-store`         | Compliant; shared contract + both backends                   | Abstract `GraphStore` in `domain/ports/` with `storagePath`, lifecycle, mutations, queries, search, stats, documents, `recreate()`, storage-generation snapshot helpers. Contract suite exercised by in-memory/SQLite/Ladybug.                                                                                                                                                                                                                 |
| `code-graph:ladybug-graph-store` | Compliant in code; relation-table catalog incomplete in spec | Backend id `ladybug`; `open()` dynamically `import('lbug')`; layout under `{storagePath}/graph` + `tmp`; schema includes CONSTRUCTS/USES_TYPE; recreate rotates `graph/storage.epoch`; prepared-statement helpers used for parameterized Cypher. Merged relationship-table catalog still omits CONSTRUCTS/USES_TYPE even though DDL and callers implement them.                                                                                |
| `code-graph:sqlite-graph-store`  | Compliant                                                    | Backend id `sqlite` is composition default; `open()` dynamically imports `better-sqlite3`; layout under `graph/` + `tmp`; transactions wrap file/spec mutations; recreate + storage-generation sidecar covered by dedicated tests + shared contract.                                                                                                                                                                                           |

## Priority confirmation: CG-01 remediation

### Verdict: **REMEDIATED**

| Check                                                       | Spec (merged preview)                     | Code                                        | Tests                                                                   |
| ----------------------------------------------------------- | ----------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| `IndexProjectGraphInput` requires `vcsRoot: string \| null` | Yes                                       | Yes (`index-project-graph.ts` L16)          | Required by TypeScript in all call sites; unit tests pass null/non-null |
| Forwarded unchanged to `provider.index(...)`                | Yes                                       | Yes (`vcsRoot: input.vcsRoot` in `execute`) | `forwards a non-null vcsRoot…`, `forwards null vcsRoot…`                |
| `IndexOptions` includes required `vcsRoot`                  | Implied by forwarding into `IndexOptions` | Yes (`index-options.ts` L106)               | Provider index calls in composition/integration pass `vcsRoot`          |
| Verify scenario “VCS root is forwarded”                     | Present in merged verify                  | Covered                                     | Explicit unit cases for both null and non-null                          |

Supporting evidence:

- Delta: `deltas/code-graph/index-project-graph/spec.md.delta.yaml` + `verify.md.delta.yaml` add `vcsRoot` to the execute field list, input contract, and verify scenario.
- Tasks: `tasks.md` 12.1 marked done for forwarding + tests.
- Focused run (this audit): `index-project-graph.spec.ts` **5/5 passed**, including both vcsRoot cases.

Residual note (not a regression of CG-01): application typing uses `CodeGraphHostPort` for `provider`, while the merged spec names `CodeGraphProvider`. Behaviorally compatible (`CodeGraphProvider` satisfies the host surface); this is hexagonal layering, not a missing `vcsRoot` issue.

## Detailed findings

### CG-01 — IndexProjectGraph `vcsRoot` contract (prior medium) — **closed**

- Previous evidence: merged input/`IndexOptions` field lists omitted `vcsRoot` while code required and forwarded it.
- Current evidence: merged preview, implementation, and tests are aligned.
- Interpretation: remediation complete for the stated CG-01 scope.
- Recommendation: keep the null + non-null forwarding tests as regression guards.

### CG-02 — Composition verify still names `CodeGraphFactoryOptions`

- Severity: low (verify artifact drift; runtime/API already renamed).
- Spec evidence: merged `code-graph:composition` `spec.md` requires/export `CodeGraphCompositionOptions`. Merged verify scenario “Graph-store composition types are exported” still says `CodeGraphFactoryOptions` are available as imports.
- Code evidence: `public.ts` / `graph-store-factory.ts` export `CodeGraphCompositionOptions`; no `CodeGraphFactoryOptions` symbol.
- Workspace note: archived base `specs/code-graph/composition/verify.md` still has the old name; the change delta updates `spec.md` but not that verify scenario line.
- Interpretation: verify is stale relative to the renamed composition options type.
- Recommendation: delta the verify scenario to `CodeGraphCompositionOptions` (and ensure archive merges that rename).

### CG-03 — Ladybug relationship-table catalog omits CONSTRUCTS / USES_TYPE

- Severity: low–medium (spec incompleteness vs abstract store + implementation).
- Spec evidence: merged `code-graph:ladybug-graph-store` “Relationship tables” lists IMPORTS, DEFINES, CALLS, EXPORTS, DEPENDS*ON, COVERS*\*, EXTENDS, IMPLEMENTS, OVERRIDES — **not** CONSTRUCTS / USES_TYPE. Abstract `code-graph:graph-store` requires those families; Ladybug verify even mentions `CALLS|CONSTRUCTS|USES_TYPE` in prepared-statement scenarios.
- Code evidence: `packages/code-graph/src/infrastructure/ladybug/schema.ts` creates CONSTRUCTS and USES_TYPE rel tables; store query/create paths include them; shared contract has `persists and queries CONSTRUCTS and USES_TYPE…`.
- Interpretation: implementation and abstract contract are aligned; Ladybug catalog table is incomplete documentation.
- Recommendation: add CONSTRUCTS and USES_TYPE rows to the Ladybug relationship-table requirement (spec drift fix; code already correct).

### CG-04 — GetGraphHealth busy/stale provider error scenarios lack direct tests

- Severity: low (behavior likely correct by fall-through; verify scenarios unproven).
- Spec evidence: verify requires GRAPH_BUSY and GRAPH_PROVIDER_STALE from `getStatistics()` to propagate unchanged.
- Code evidence: `execute()` awaits `input.provider.getStatistics()` with no catch around that call — provider errors propagate.
- Test evidence: `get-graph-health.spec.ts` covers stale/fingerprint/lifecycle/VCS-unavailable; **no** tests inject `GraphBusyError` / `GraphProviderStaleError` from the provider mock. Provider-level stale detection is covered in `code-graph-provider.spec.ts`, but not through `GetGraphHealth`.
- Recommendation: add two unit tests that reject `getStatistics()` with busy/stale errors and assert identity propagation.

## Test coverage

### Confirmed covered (relative to this batch)

- **IndexProjectGraph**: force forwarding, onProgress, null/non-null `vcsRoot`, force recreate integration without leaving store closed, factory returns distinct instances.
- **GetGraphHealth**: matching/mismatching fingerprint, unknown/true/false stale, no open/close, VCS unavailable → `currentRef`/`stale` null, factory instances.
- **Composition**: default sqlite, explicit ladybug/sqlite, custom factory, SpecdConfig path, StoreNotOpenError before open, close idempotence, clear-while-open, storage-generation stale provider error, async dispose, barrel type-only `CodeGraphProvider`, `InMemoryIndexSession` internal-only.
- **GraphStore / backends**: shared contract (upsert/remove/search/stats/documents/CONSTRUCTS+USES_TYPE/COVERS_SYMBOL metadata, etc.); Ladybug + SQLite recreate + `storage.epoch`; SQLite FTS/hyphen/operator sanitization suites present in dedicated specs.

### Missing or weak tests

1. **GetGraphHealth** GRAPH_BUSY / GRAPH_PROVIDER_STALE propagation (CG-04).
2. **Induced transaction rollback** for failed `upsertFile` / bulk batch on both SQLite and Ladybug (verify scenarios exist; shared contract checks replacement semantics, not injected mid-transaction failure). No matches for rollback/failed-upsert fixtures under `packages/code-graph/test`.
3. **Ladybug prepared-statement usage** has implementation helpers (`execPrepared` / `runPrepared`) but no focused test asserting `conn.prepare` + bound params for a user-supplied path (verify scenarios exist).
4. **Composition verify rename** has no assertion that `CodeGraphCompositionOptions` is the exported name (barrel tests cover provider type-only / internal session, not the options rename).

### Focused test execution (this audit)

```text
✓ test/application/use-cases/index-project-graph.spec.ts (5)
✓ test/application/use-cases/get-graph-health.spec.ts (8)
✓ test/composition/host-use-case-factories.spec.ts (4)
Test Files  3 passed | Tests 17 passed
```

Exit code 0 via `packages/code-graph/test/run-vitest.sh`.

### Vitest IPC / worker shutdown

- Package script wraps Vitest in `test/run-vitest.sh` specifically to tolerate tinypool `ERR_IPC_CHANNEL_CLOSED` after LadybugDB native addon keeps handles open post-`close()`.
- Wrapper comment: all tests may pass while process exit would otherwise be 1; script treats a completed summary with no FAIL markers as success, and may force-kill lingering workers.
- Prior full-package run (`20260720-160631`) observed unhandled `ERR_IPC_CHANNEL_CLOSED` and marked broad suite **inconclusive**.
- This batch’s **focused** unit run completed cleanly (no IPC error observed). Broad native-store suites remain the risk surface for IPC flakiness; do not treat a raw `vitest run` exit code as authoritative without the wrapper or a clean summary.

## Dependency / global-spec conformance (depth 1)

- Hexagonal layout preserved: `GraphStore` port in domain; Ladybug/SQLite in infrastructure; composition wires factories; host use cases depend on `CodeGraphHostPort`.
- No contradiction found between these change specs and `_global/architecture` layering for the audited symbols.
- `IndexProjectGraph` / `GetGraphHealth` constraints (no lock, no open/close, no workspace resolution from yaml) hold in implementation.
- Composition public surface remains curated; concrete stores stay on `./internal`.

## Summary counts

- Specs audited: 6
- Confirmed discrepancies: **2 open** (CG-02 verify rename drift; CG-03 Ladybug relation catalog omission) + **1 coverage gap finding** (CG-04)
- CG-01: **remediated / closed**
- Global/dependency contradictions: 0
- Test-coverage gaps called out: 4
- Test execution blockers in focused run: 0; package-level Vitest IPC risk: **still present** (wrapper mitigates; broad runs can still look inconclusive)

## Recommendation for change owners

1. Treat CG-01 as done; keep dual null/non-null forwarding tests.
2. Patch composition verify to say `CodeGraphCompositionOptions`.
3. Add CONSTRUCTS / USES_TYPE to Ladybug relationship-table catalog.
4. Add GetGraphHealth busy/stale propagation unit tests.
5. Keep using `test/run-vitest.sh` for package CI; document IPC caveat in release evidence if full-suite exit is still noisy.
