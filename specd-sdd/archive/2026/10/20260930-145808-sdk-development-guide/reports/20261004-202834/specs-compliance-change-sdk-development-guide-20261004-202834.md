# Specs compliance audit — `sdk-development-guide`

**Mode:** specific change, full verification  
**Audited:** CLI command/delivery adapter, guide model, bundling, composition, errors, guide queries, search, slicing, and related documentation/global constraints.

## Result

Implementation gates passed: the full repository test hook, lint, and typecheck succeeded. The focused guide suite passed 132 tests; the focused guide-sdk CLI suite passed 72 tests. Runtime probes verified bounded structured listing, generated-topic metadata with an actionable import and no source path, and collection-scoped search.

The audit found no CLI architecture or package-export violation. In particular, the merged architecture requirement now permits the thin direct `@specd/guide` delivery-adapter dependency, and `createGuideSdkEngine` is exposed only through `@specd/guide/sdk`.

## Findings

| ID        | Severity | Classification           | Evidence and disposition                                                                                                                                                                                                                                                                                                                                                                                           |
| --------- | -------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GCORE-001 | Medium   | Spec/code decision       | `GuideTopicNotFoundError` requires structured collection-qualified candidates, while its literal lookup-boundary wording forbids the `getAllTopics()` read needed to construct them after a failed lookup. Clarify the spec to permit the bounded in-memory candidate read, or redesign the port so candidate identities are part of collection resolution.                                                        |
| F1        | Medium   | Spec/documentation drift | `GetGuideQuery` intentionally offers a non-resolving cross-collection title suggestion on a qualified miss, tests it, and documents it. The merged `guide:get-guide` requirement says alternatives must remain collection-local. Decide whether to amend the spec (and inherited outline/section behavior) or remove the cross-collection suggestion.                                                              |
| F2        | Medium   | Implementation/test gap  | `MiniSearchGuideEngineAdapter` prioritizes an exact full query when selecting a snippet line, but preserves raw MiniSearch/BM25 order for hits. The merged search requirement requires exact-substring hits to precede partial-only hits. Stably partition filtered hits by exact case-insensitive substring before applying the limit, and add a competing-hit regression test; otherwise revise the requirement. |

## Coverage notes

Recommended non-blocking additions: built-export coverage for `./internal` versus `./sdk`; CRLF offsets and line-count equivalence; malformed multi-colon identity coverage; README/catalog two-way parity; the chosen unknown-topic lookup policy; cross-collection suggestion propagation through outline and section queries; and a documentation-envelope synchronization test.

## Partial reports

The complete batch evidence and requirement-by-requirement findings are retained without deletion in:

- `_partial-cli.md` — CLI, entrypoint, and architecture (no discrepancies).
- `_partial-guide-core.md` — model, bundling, composition, conventions, and errors (GCORE-001).
- `_partial-guide-queries.md` — query APIs, search, slicing, and documentation (F1 and F2).
