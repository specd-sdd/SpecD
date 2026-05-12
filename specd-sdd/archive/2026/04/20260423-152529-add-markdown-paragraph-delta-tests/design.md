# Design: add-markdown-paragraph-delta-tests

## Non-goals

- Refactoring parser AST models or changing the global selector model.
- Creating individual parser specs (deferred to a future change).

## Affected areas

- `packages/core/src/application/ports/artifact-parser.ts`
  Change: add `isCollection`, `isSequence`, `isSequenceItem`, `isContainer`, `isLeaf` to `NodeTypeDescriptor`. Add `DeltaApplicationResult` wrapper. Add `validateContent`, `validateValue`, `validateRename` helper functions.
  Risk: HIGH (port interface change, 15 direct dependents).

- `packages/core/src/infrastructure/artifact-parser/_shared/apply-delta.ts`
  Change: descriptor-based lookups, remove ALL hardcoded type vectors, add operation semantic validation.
  Risk: CRITICAL (15 direct dependents, 9 indirect, 7 transitive).

- All four parser adapters (markdown, json, yaml, plaintext)
  Change: update `nodeTypes()` with nature flags, pass descriptor map to `applyDelta`, extract `.ast` from result.
  Risk: MEDIUM.

- Use cases that call `parser.apply()`:
  - `validate-artifacts.ts` — extract `.ast` from `DeltaApplicationResult`
  - `archive-change.ts` — extract `.ast` from `DeltaApplicationResult`
  - `preview-spec.ts` — extract `.ast` from `DeltaApplicationResult`
    Risk: MEDIUM (3 files, straightforward change).

## Impact analysis (code graph)

| Symbol               | Direct | Indirect | Transitive | Risk     |
| -------------------- | ------ | -------- | ---------- | -------- |
| `applyDelta`         | 15     | 9        | 7          | CRITICAL |
| `NodeTypeDescriptor` | 27     | 125      | 153        | CRITICAL |

**Key affected downstream symbols:**

- `ArtifactParser` interface (the `.apply()` method)
- `ArtifactNode`, `ArtifactAST`, `DeltaEntry` types
- `selector-matching.ts`: `findNodes`, `NodeMatch`
- Delta application error types

## New constructs

- `NodeTypeDescriptor.isCollection`, `isSequence`, `isSequenceItem`, `isContainer`, `isLeaf` — boolean flags for node nature.
- `DeltaApplicationResult` wrapper — returns AST plus warnings array. `applyDelta` returns this instead of `ArtifactAST`.
- `validateContent`, `validateValue`, `validateRename` — exported helper functions on the port that implement the semantic validation matrix.
- Operation semantic validation in `applyDelta` Phase 1 — evaluates all conditions and returns errors/warnings.

## Flag semantics

| Flag             | Meaning                                                                 | Replaces hardcoded                                 |
| ---------------- | ----------------------------------------------------------------------- | -------------------------------------------------- |
| `isCollection`   | Children are uniform items of one type                                  | `collectionTypes` in unwrap logic                  |
| `isSequence`     | Ordered sequential collection (list/array/sequence, NOT object/mapping) | `arrayTypes` in `isArrayLike`, `getInnerArrayNode` |
| `isSequenceItem` | Item within a sequential collection                                     | `itemTypes` in `isArrayLike`                       |
| `isContainer`    | Can have children                                                       | —                                                  |
| `isLeaf`         | Can have scalar value                                                   | —                                                  |

Flags are NOT mutually exclusive. Hybrid types (e.g. JSON `property`) set both `isContainer: true` AND `isLeaf: true`.

## Approach

1. Add nature flags to `NodeTypeDescriptor`.
2. Update all adapters' `nodeTypes()` to include flags.
3. Parameterize `applyDelta` with descriptor map.
4. Replace ALL hardcoded type vectors (`collectionTypes`, `arrayTypes`, `itemTypes`) with descriptor flag lookups.
5. Add operation semantic validation in Phase 1 using the complete matrix, implemented via exported helper functions on the port:
   - `validateContent(descriptors, entry, nodeType, warnings)` — returns error string or undefined
   - `validateValue(descriptors, entry, nodeType, warnings)` — returns error string or undefined
   - `validateRename(descriptors, entry, nodeType, warnings)` — returns error string or undefined
   - Each function appends warning messages to the `warnings` array for hybrid nodes.
   - `value` on `isSequence` nodes is always valid (default strategy is `replace`).
6. Preserve existing bug fixes (same-type unwrap in modified/added, type-check in value).

## Key decisions

- **Decision**: add `isSequence` and `isSequenceItem` flags to distinguish ordered sequential collections from keyed collections. The original three flags (`isCollection`, `isContainer`, `isLeaf`) were insufficient to replace all hardcoded type vectors.
- **Decision**: validate all conditions (`isContainer`, `isLeaf`, `hasLabel`) for every operation and return contextual error/warning messages. The `hasLabel` check is derived from `identifiedBy.length > 0`.
- **Decision**: add nature flags to existing `nodeTypes()` rather than a separate method.
- **Decision**: validation runs in Phase 1 (before any application) to guarantee atomic semantics.
- **Decision**: validation helpers are exported from the port so they can be tested independently.

## Testing

- Existing cross-parser test matrix (1597 tests) validates core behavior.
- New tests for semantic validation (error cases, warning cases, alternatives suggested).
- **All 114+ tests calling `.apply()` must be updated** to handle `DeltaApplicationResult` return type:
  - Direct `applyDelta` calls: extract `.ast` from result
  - `parser.apply()` calls: extract `.ast` from result
  - Direct AST assertions become `result.ast`
  - Test files: `apply-delta.spec.ts`, `markdown-parser.spec.ts`, `json-parser.spec.ts`, `yaml-parser.spec.ts`
- Use case callers (3): extract `.ast` from `parser.apply()` result
- Full core test suite after refactoring.
