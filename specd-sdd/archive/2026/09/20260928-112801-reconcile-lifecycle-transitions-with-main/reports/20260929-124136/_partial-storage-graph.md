# Partial compliance audit — storage and code graph

Delegated verification attempt: `verification-attempt-2`

Scope:

- `core:fs-change-repository`
- `code-graph:indexer`
- `code-graph:index-project-graph`

Merged artifacts were read with `changes spec-preview`; implementation discovery used the current code graph (`stale: false`). Direct dependencies and the global architecture/testing constraints were reviewed. No verification attempt command was run by this audit.

## Requirements summary

| Spec                             | Requirements | Verification scenarios | Implemented |                    Discrepancies |
| -------------------------------- | -----------: | ---------------------: | ----------: | -------------------------------: |
| `core:fs-change-repository`      |           11 |                     29 |          11 |                                0 |
| `code-graph:indexer`             |           24 |                     97 |          24 |                                0 |
| `code-graph:index-project-graph` |            4 |                      7 |           4 |                                0 |
| **Total**                        |       **39** |                **133** |      **39** | **0 product/spec discrepancies** |

## Detailed findings

### `core:fs-change-repository`

Implementation status: compliant.

- **Validate options at construction** — implemented by the filesystem repository/config boundary; constructor validation and missing-directory behavior are covered by repository/config tests.
- **Storage factory registration** — the factory forwards context and config into `FsChangeRepository`; covered by composition/repository tests.
- **FsChangeIndexCache helper** — bucket-specific caches own active/draft/discarded list, count and rebuild behavior with canonical ordering; covered by change-repository and cache tests.
- **Revision timestamp serialization and backward compatibility** — manifest serialization and legacy history-derived timestamps are covered by manifest/repository tests.
- **Index helper mutate and lock** — `FsIndexCache.mutate()` serializes writers and releases its mutex in `finally`; atomic publishing uses temp files and rename. The new fault-injection test proves that failure during the second (meta) publish surfaces the original error, leaves no temp files, permits a coherent rebuild, and releases the lock for a following upsert.
- **Index freshness model** — invalidation, mtime mismatch and age-independent freshness paths are explicitly covered in `fs-index-cache-base.spec.ts`.
- **Write-path index maintenance** — upsert/remove/no-op projection behavior and list-index maintenance are covered by cache and repository integration tests.
- **create delegates to internal first persist** — cross-bucket collision and first-persist behavior are covered by repository tests.
- **mutate and mutateDraft reconcile after persist** — post-write hydration/reconciliation is exercised by repository mutation tests.
- **saveArtifact requires mutate window and does not touch Change** — rejection outside the window and byte-only writes inside it are covered by repository tests.
- **Windows path containment and rename recovery** — `isPathInside()` applies Windows path semantics and rejects prefix collisions; `moveDir()` falls back on `EPERM`/`EXDEV`; `retryOnLock()` retries `EPERM`, `EBUSY`, and `EACCES` exactly five attempts and rethrows the original object. The new parameterized test closes the previous error-code evidence gap.

Relevant evidence:

- `packages/core/src/infrastructure/fs/fs-index-cache-base.ts`
- `packages/core/src/infrastructure/fs/path-platform.ts`
- `packages/core/src/infrastructure/fs/move-dir.ts`
- `packages/core/test/infrastructure/fs/fs-index-cache-base.spec.ts`
- `packages/core/test/infrastructure/fs/path-platform.spec.ts`
- `packages/core/test/infrastructure/fs/move-dir.spec.ts`
- broader `change-repository.spec.ts` and manifest/config suites

No contradiction was found with `core:storage`, `core:change-list-entry`, `core:change-repository-port`, or `default:_global/architecture`. The generic cache remains infrastructure-level and the repository/port boundary is preserved.

### `code-graph:indexer`

Implementation status: compliant.

The 24 merged requirements were each traced to `IndexCodeGraph`, its adapter/store ports, SQLite integration, and the existing indexer suite:

1. **IndexCodeGraph use case** — the application use case owns discover/diff/extract/spec/store/clean/ref orchestration through ports.
2. **Incremental indexing** — content and graph fingerprints select new/changed/deleted/skipped work and full rebuild escalation.
3. **Deterministic implementation coverage projection** — repository-backed implementation facts create deterministic file/symbol coverage without guessed symbol links.
4. **Discovery fingerprint uses effective config** — effective include/exclude/workspace inputs participate in derivation freshness.
5. **Adapter-sourced resolution fingerprint** — adapter-provided resolution manifests are included without indexer-owned manifest parsing.
6. **Multi-workspace file discovery** — workspace ownership and project-global discovery are normalized and deduplicated.
7. **Portable graph paths** — persisted graph identities use workspace-prefixed portable paths.
8. **Binary file filtering** — unsupported binary/NUL content is excluded while supported textual encodings become documents.
9. **Bounded analysis memory** — extraction is chunked and session indexes avoid per-relation corpus scans.
10. **Two-pass extraction with in-memory index** — declaration facts precede reference/relation resolution.
11. **Shared indexing session** — file, relation, spec and freshness writes participate in one bulk generation.
12. **Scoped binding environment resolution** — lexical/import/re-export binding facts come from adapter payloads and indexed lookup.
13. **Chunked processing** — persistence and relation writes remain chunked/deduplicated.
14. **Progress reporting** — discovery/index/spec progress includes known totals.
15. **Phase execution timing logging** — returned phase metrics separate semantic phases, persistence and search rebuilding.
16. **Cross-workspace package resolution** — adapter identities and public bindings drive package resolution across workspaces.
17. **Error isolation** — the new integration test injects an adapter parse failure: the valid file is committed, the failed file appears in `errors`, and `filesIndexed` is `1`. A second new test makes `writeFiles()` reject: the exact infrastructure error aborts the run and SQLite remains at `fileCount: 0`, proving transaction rollback rather than per-file collection.
18. **Index result** — fingerprint/rebuild reason, discovery exclusions, namespace deduplication and document encoding outcomes are covered by indexer/integration tests.
19. **Spec dependency indexing** — normalized metadata, aggregate persisted state, dependency and coverage relations are repository-driven.
20. **Prefer LLM-optimized description** — optimized metadata description wins when present.
21. **Reference fact indexing** — logical bindings, hierarchy, source ranges/content and unambiguous coverage are committed atomically.
22. **Incompatible derivation rebuild** — incompatibility rotates the logical generation and rebuilds search indexes after bulk commit.
23. **Indexed-input observation capture** — successful commits persist observations and clear workspace/aggregate stale latches.
24. **Bounded incremental relation construction** — affected-closure processing, conservative repair for newly available targets, unchanged fast paths and disjoint timing are implemented and exercised by the extensive indexer/SQLite suites.

Relevant evidence:

- `packages/code-graph/src/application/use-cases/index-code-graph.ts`
- graph-store/index-session ports and SQLite bulk-session implementation
- adapter registry and TypeScript/Go adapters
- `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts`
- the existing indexer, reference-fact, incremental, SQLite and staleness suites

No contradiction was found with `code-graph:graph-store`, `code-graph:language-adapter`, `code-graph:symbol-model`, `code-graph:workspace-integration`, `code-graph:sqlite-graph-store`, or the Core metadata/config dependencies. Parse failures remain adapter/file outcomes; store failures retain infrastructure-error identity and abort the atomic session.

### `code-graph:index-project-graph`

Implementation status: compliant.

- **Executes project indexing** — `execute()` calls the supplied open provider once and returns its `IndexResult` unchanged.
- **Supports forced logical reindex** — `force: true` is forwarded to `provider.index()`; the use case has no recreate path. Integration coverage confirms a logical full rebuild without changing healthy storage generation.
- **Accepts open provider and prepared inputs** — the new consolidated unit test asserts forwarding of `projectRoot`, `workspaces`, `graphConfig`, `codeGraphVersion`, `vcsRoot`, `force`, progress and materialized metadata inputs. Inspection confirms no resolution, process, lock, open/close, clear or recreate ownership in the use case.
- **Factory wires dependencies** — `createIndexProjectGraph()` returns a fresh stateless instance with no captured configuration.

Relevant evidence:

- `packages/code-graph/src/application/use-cases/index-project-graph.ts`
- `packages/code-graph/src/composition/use-cases/index-project-graph.ts`
- `packages/code-graph/test/application/use-cases/index-project-graph.spec.ts`
- `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts`

The application-layer class imports only ports/value objects and therefore conforms to `default:_global/architecture`. Its lifecycle boundaries agree with `code-graph:composition`, `code-graph:indexer`, and `code-graph:graph-store`.

## Test coverage and execution

Targeted execution performed during this audit:

- Core filesystem batch: **3 files, 21 tests passed**.
- Code-graph project/indexer batch: **2 files, 18 tests passed**.

The repaired evidence specifically covers all four prior advisory areas: lock error variants, failure between JSONL and metadata publication, parse-vs-infrastructure isolation, and complete prepared-input forwarding.

### Cross-cutting test-convention advisory

`packages/code-graph/test/application/use-cases/index-project-graph.spec.ts` constructs a partial provider and coerces it with `as unknown as CodeGraphHostPort`. `default:_global/testing` says port mocks must implement their port interface fully and forbids partial `as unknown as Port` mocks. This does not indicate a product/spec behavior mismatch and does not weaken the assertions for the four requirements above, but it is a literal test-convention violation. Recommended follow-up: replace `makeProvider()` with the repository's full typed host-port test double (unused methods may throw `new Error('not implemented')`).

## Discrepancies

### Product/spec discrepancies

None.

### Test/spec discrepancy

1. **Low — partial `CodeGraphHostPort` mock**
   - Spec side: `default:_global/testing` requires complete typed port mocks and explicitly rejects `as unknown as Port` partials.
   - Code side: `makeProvider()` supplies only `index` and casts through `unknown`.
   - Interpretation: the production implementation and scenario outcomes are correct; the test fixture should be made conformant. If the project intentionally permits focused structural mocks for broad host facades, the global testing spec would instead need narrowing.

## Missing tests

No missing behavioral scenario tests were identified for the three audited specs after the new coverage. The only remaining issue is the mock-shape convention above.

## Spec dependency chain

- `core:fs-change-repository` → `default:_global/architecture`, `core:composition`, `core:storage`, `core:change-list-entry`, `core:change-repository-port`: conformant.
- `code-graph:indexer` → graph-store/language/symbol/workspace/SQLite contracts plus Core config/spec metadata/list-workspaces: conformant.
- `code-graph:index-project-graph` → composition/indexer/graph-store/Core config: conformant.
- `default:_global/testing`: behavioral coverage, runner, layout, temp-directory cleanup and portability are conformant; one typed-mock-shape advisory remains.

## Summary counts

- Specs audited: **3**
- Requirements audited: **39**
- Verification scenarios audited: **133**
- Requirements implemented: **39**
- Product/spec discrepancies: **0**
- Test/spec discrepancies: **1 low-severity**
- Missing behavioral tests: **0**
- Targeted tests: **39 passed, 0 failed**
