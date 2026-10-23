# Compliance Audit Partial: Resolver and Index Orchestration

Change: `code-graph-package-resolution-hardening`  
Scope: `code-graph:resolve-symbol-reference`, `code-graph:index-project-graph`  
Mode: change-scoped, merged specs and verification artifacts  
Graph state: current (`knownStaleSinceLastIndex: false`, `contentFresh: true`, `coverageComplete: true`)

## Requirements Summary

### `code-graph:resolve-symbol-reference`

The merged spec contains ten requirement groups:

1. Structured reference input, including stored-only `qualified_name` equality, `::` normalization, adapter selection from proven context, and no generic/default parser fallback.
2. Logical canonical targets that unify declaration occurrences without collapsing competing logical symbols.
3. A discriminated logical/declaration/public-binding result model with complete declaration evidence.
4. Independently addressable public and local binding identities.
5. Deterministic precedence from canonical ID through hierarchy traversal.
6. Language-independent package-import binding traversal with ordered `import:package` provenance and no same-name guessing.
7. Exactly four conservative outcomes with stable reason codes and deterministic candidates/evidence.
8. Batch resource freshness and coverage gating without repository/filesystem logic in the resolver.
9. Hierarchy-aware member resolution with deterministic precedence and cycle safety.
10. Batch, indexed, backend-independent resolution.

### `code-graph:index-project-graph`

The merged spec contains four requirement groups:

1. Forward prepared project inputs to `provider.index()` once and return its `IndexResult` unchanged.
2. Forward `force` as a logical full-reindex request without calling `recreate()`.
3. Accept an already-open provider and avoid all provider/storage/lock/process lifecycle ownership.
4. Expose a stateless `createIndexProjectGraph()` composition factory.

## Implementation Status

### `code-graph:resolve-symbol-reference`

| Requirement                                     | Status                | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structured reference input                      | **Partial**           | `ResolveSymbolReference.executeBatch()` batches structured logical/public/local/qualified lookups and `resolveQualifiedMember()` compares `target.qualifiedName` directly. Adapter selection is explicit language, then anchored extension, with no adapter borrowing. However, `SessionReferenceStore.findLogicalSymbolsByQualifiedNames()` synthesizes a missing value from `ownerId` and `name`, contradicting the merged stored-only lookup rule. |
| Logical canonical targets                       | Implemented           | Resolution operates on `LogicalSymbol`, groups deterministic declaration occurrences, and emits ambiguity only across distinct target IDs. Tests cover multiple declarations on one logical target and competing logical targets.                                                                                                                                                                                                                     |
| Resolution target kind and declaration evidence | Implemented           | `ResolvedSymbolTarget` is a discriminated union of `logical-target`, `declaration`, and `public-binding`; exact symbol/position selectors retain physical identity and mapped logical identity. Tests cover logical, public-binding, mapped declaration, and physical-only declaration results.                                                                                                                                                       |
| Public and local binding identity               | Implemented           | Binding IDs include public slot/target or local scope/range. Resolver loads public/local bindings separately and follows stored resolution steps. Tests cover competing export routes and scoped local aliases.                                                                                                                                                                                                                                       |
| Deterministic resolution precedence             | Implemented           | Canonical IDs are normalized before semantic lookup; qualified-name resolution precedes exact/public/local/hierarchy lanes; owner paths are resolved before members; file-only requests do not select public bindings. Tests cover canonical and legacy IDs, owner-first lookup, value/type ambiguity, file-vs-surface selection, and no same-name guessing.                                                                                          |
| Package import bindings                         | Implemented           | The shared step traversal is language-neutral and treats persisted `import:package` steps as graph provenance. `index-code-graph.language-independence.spec.ts` verifies a cross-workspace target and verifies an unresolved import does not guess.                                                                                                                                                                                                   |
| Resolution outcomes                             | Implemented           | Results use the four declared statuses, null target on non-resolved outcomes, deterministic sorting, and stable upper-snake reason codes.                                                                                                                                                                                                                                                                                                             |
| Freshness and coverage gate                     | Implemented           | One health read is shared per batch; addressed resources and candidate declaration files are deduplicated and assessed in one batch. Exact resource freshness/coverage gates resolution and missing outcomes. Tests cover dirty, stale, unknown, partial, and current public-surface absence.                                                                                                                                                         |
| Hierarchy-aware members                         | Implemented           | Bounded/cycle-safe path tracing resolves the member under reached ancestors, applies nearest-depth and adapter precedence, and preserves equal-depth ambiguity. Tests cover ancestor-member selection and ambiguity.                                                                                                                                                                                                                                  |
| Batch/backend independence                      | **Partial assurance** | Batching, bounded traversal, one shared health read, and deterministic ordering are implemented. The session-store qualified-name fallback creates observable backend divergence from persisted SQLite lookup for symbols lacking stored `qualifiedName`; no parity test compares full resolver outcomes across those stores.                                                                                                                         |

### `code-graph:index-project-graph`

| Requirement                           | Status      | Evidence                                                                                                                                                                                                                                                                          |
| ------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Executes project indexing             | Implemented | `IndexProjectGraph.execute()` calls only `input.provider.index(...)` and returns the promise/result directly. Required fields, VCS fields, progress, and configured workspaces are forwarded. Unit tests assert one call and identity preservation of the returned `IndexResult`. |
| Supports forced logical reindex       | Implemented | `force: true` is forwarded to `provider.index`; no `recreate()` call exists in the use case. The integration test verifies `fullRebuild: true` while storage generation remains unchanged and compares incremental/forced semantic snapshots.                                     |
| Accepts open provider/prepared inputs | Implemented | The input type requires the provider and prepared fields; execution contains no open, close, clear, recreate, lock, or process operation. `vcsRoot`, optional `vcsRef`, callbacks, and configured workspaces are forwarded.                                                       |
| Factory wires dependencies            | Implemented | `createIndexProjectGraph()` returns a new parameterless `IndexProjectGraph`; the factory test asserts new stateless instances.                                                                                                                                                    |

Overall implementation status: **13 of 14 requirement groups conform; 1 is partial due to one backend/session fallback.**

## Discrepancies

### D1 — Session-backed qualified-name lookup derives an unstored name

- Severity: **MEDIUM**
- Classification: implementation/spec discrepancy; also undermines backend-independent behavior.
- Spec evidence: the merged `Structured reference input` requirement states that dotted/`::` equality uses only the graph's stored `qualified_name` and explicitly says the resolver **MUST NOT derive** a qualified name from owner/member fields to extend equality.
- Code evidence: `packages/code-graph/src/application/services/session-reference-store.ts:55-71` documents “stored or derived qualified spelling” and evaluates:

  ```ts
  const spelling = symbol.qualifiedName ?? deriveQualifiedName(symbol, byId)
  ```

  It may then return a copied symbol with the synthesized `qualifiedName`.

- Flow evidence: graph impact shows `SessionReferenceStore` is directly constructed by `IndexCodeGraph.execute()` and adapted to `GraphStore`, so this is an exercised implementation path, not dead utility code.
- Contrasting conformant path: `packages/code-graph/src/application/use-cases/resolve-symbol-reference.ts:1034-1039` itself compares only `target.qualifiedName`; persisted SQLite lookup likewise filters stored `qualified_name`. The discrepancy is introduced by the session-backed store before the resolver receives candidates.
- Behavioral risk: an internal/session resolution can resolve `Owner.member` even when that spelling was never stored, while the persisted store returns unresolved. This violates both the explicit stored-only rule and equivalent-backend outcome requirement.
- Test evidence: `resolve-symbol-reference.spec.ts:1573-1609` verifies a **different stored** name (`Custom.different`) is not replaced by a derived one, but does not cover an absent `qualifiedName` through `SessionReferenceStore`. All targeted tests therefore pass without detecting this path.
- Spec-correct/code-wrong possibility: remove the `deriveQualifiedName` fallback from the session lookup and compare only `symbol.qualifiedName`, making session behavior match SQLite and the merged change intent.
- Code-correct/spec-wrong possibility: if the session view intentionally represents pre-persistence facts where `qualifiedName` has not yet been materialized, the spec would need to explicitly allow derivation for that lifecycle phase and define why backend parity is not required there. That would weaken the newly added hardening language and is not supported by the current merged dependency contract, which describes `qualified_name` as persisted/indexed identity evidence.

### D2 — Relevant unit test uses the globally forbidden partial-port cast pattern

- Severity: **LOW**
- Classification: global testing-spec compliance issue, not a product behavior failure.
- Global rule: `default:_global/testing` requires full typed port mocks and expressly forbids partial mocks cast with `as unknown as Port`.
- Code evidence: `packages/code-graph/test/application/use-cases/index-project-graph.spec.ts:53-56` returns only `{ index: vi.fn() } as unknown as CodeGraphHostPort`.
- Risk: this makes the “does not open, close, clear, recreate, lock, or spawn” scenario impossible to assert through the mock interface and allows future port additions to evade test compilation.
- Spec-correct/code-wrong possibility: implement the full `CodeGraphHostPort` test double with unused methods that throw and spies for lifecycle methods relevant to the negative assertion.
- Code-correct/spec-wrong possibility: the narrow cast keeps the forwarding test concise and the use case statically calls only `index`; if this pattern is considered acceptable for focused orchestration tests, the global testing spec would need a documented exception. No such exception currently exists.

No contradiction was found between the merged change specs and `default:_global/architecture`, `default:_global/conventions`, or `default:_global/error-handling-conventions`: the resolver remains application orchestration over ports, contains no infrastructure I/O, uses named exports and explicit types, and returns domain outcomes rather than throwing expected generic errors. The `IndexProjectGraph` factory remains in composition and the use case owns no infrastructure lifecycle.

## Test Coverage

Executed independently:

```text
pnpm --filter @specd/code-graph exec vitest run \
  test/application/use-cases/resolve-symbol-reference.spec.ts \
  test/application/use-cases/index-project-graph.spec.ts \
  test/application/use-cases/index-project-graph-integration.spec.ts \
  test/application/use-cases/index-code-graph.language-independence.spec.ts \
  test/domain/value-objects/symbol-reference.spec.ts

Test Files  5 passed (5)
Tests      100 passed (100)
```

Also executed:

```text
pnpm --filter @specd/code-graph exec vitest run \
  test/composition/host-use-case-factories.spec.ts

Test Files  1 passed (1)
Tests      4 passed (4)
```

Coverage is strong for:

- direct/public/local/hierarchy/canonical/exact selector lanes;
- typed logical, declaration, and public-binding targets;
- deterministic ambiguity and absence outcomes;
- resource freshness and coverage gating;
- qualified-name and adapter-selection happy/negative paths on the persisted test store;
- language-independent package provenance;
- forced logical reindex without storage recreation;
- factory statelessness.

## Missing Tests

1. **Session store stored-only regression test (high priority):** create an `IndexSession` logical member with `ownerId` but no `qualifiedName`, query `SessionReferenceStore.findLogicalSymbolsByQualifiedNames(['Owner.member'])`, and assert no match. This would currently fail and directly expose D1.
2. **Resolver backend parity test (high priority):** seed equivalent session-backed and SQLite facts, including a missing stored `qualifiedName`, and assert identical status, reason, candidates, and evidence order.
3. **Positive anchored duplicate filter:** seed two targets with the same stored qualified name in different files, anchor one file, and assert exactly that target resolves. Current tests cover all-equal unanchored ambiguity and an anchor with no visible target, but not the exact positive merged scenario.
4. **Provider lifecycle negative test:** use a complete typed `CodeGraphHostPort` mock with `open`/`close`/`recreate`-equivalent lifecycle spies (as exposed by the actual port), execute `IndexProjectGraph`, and assert only `index` is called. The implementation is visibly compliant, but the merged negative scenario is only indirectly covered.
5. **Resolver-level case test:** resolve two identifiers differing only by case under an addressed adapter and assert no lowercase normalization. Domain identity tests cover case preservation, but the complete resolver scenario is not isolated.

## Spec Dependency Chain

### `code-graph:resolve-symbol-reference`

- `code-graph:symbol-model`: supplies logical IDs, declarations, public/local bindings, member semantics, provenance steps, stored `qualified_name`, and immutability. The implementation's discriminated target model and stable IDs conform. D1 conflicts with the dependency's stored/indexed qualified-name semantics.
- `code-graph:graph-store`: supplies backend-neutral batch queries, index coverage, declarations, bindings, and resolution steps. SQLite implements stored qualified-name equality; the session adapter does not currently preserve parity.
- `code-graph:language-adapter`: supplies capability/facet-based parsing and language precedence. The resolver selects one proven adapter and does not borrow another parser.
- `code-graph:workspace-integration`: defines workspace-prefixed paths and package boundaries. Cross-workspace package targets are followed only through persisted binding/provenance facts.
- Relevant globals: architecture (application over ports, no I/O), conventions (strict ESM/named exports/readonly inputs), testing (Vitest, mirrored tests, typed full mocks), and error handling (stable machine-readable result reasons; infrastructure failures remain errors).

### `code-graph:index-project-graph`

- `code-graph:composition`: supplies the open host/provider port and stateless factory boundary.
- `code-graph:indexer`: owns incremental/forced indexing semantics behind `provider.index()`.
- `code-graph:graph-store`: owns physical persistence/recreate semantics; `IndexProjectGraph` correctly avoids them.
- `core:config`: supplies prepared workspace and project configuration types; the use case forwards prepared values rather than resolving config itself.
- Relevant globals: architecture requires composition to wire infrastructure and application use cases to depend on ports; conventions require explicit/named ESM APIs; testing requires complete typed mocks, which is the basis of D2.

## Summary Counts

| Category                                | Count |
| --------------------------------------- | ----: |
| Specs audited                           |     2 |
| Requirement groups audited              |    14 |
| Fully conformant requirement groups     |    13 |
| Partially conformant requirement groups |     1 |
| Critical discrepancies                  |     0 |
| High discrepancies                      |     0 |
| Medium discrepancies                    |     1 |
| Low discrepancies                       |     1 |
| Missing/insufficient targeted tests     |     5 |
| Targeted test files passed              |     6 |
| Targeted tests passed                   |   104 |

**Batch conclusion:** `code-graph:index-project-graph` conforms to its merged spec. `code-graph:resolve-symbol-reference` is broadly implemented and tested, but full compliance is blocked by the session-backed qualified-name derivation fallback; the passing suite does not exercise the failing backend/session case.
