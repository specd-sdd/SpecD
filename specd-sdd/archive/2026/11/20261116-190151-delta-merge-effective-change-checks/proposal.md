# Proposal: delta-merge-effective-change-checks

## Motivation

During change authoring and validation, `op: modified` delta entries can pass `changes validate` cleanly yet leave the merged artifact completely unchanged in `changes spec-preview` and `archive`. Across the built-in `ArtifactParser` adapters, cached raw/inline metadata survives `applyDelta` and takes precedence during `serialize()`, while `validateRename` accepts `rename` on nodes that have no `label`, and neither `applyDelta` nor `ValidateArtifacts` verifies that non-`no-op` operations actually modify the serialized output.

## Current behaviour

1. **Markdown (`MarkdownParser`):**
   - `convertBlockNode` stores `_inlines` (and `_blockquoteChildren` for blockquotes) on `paragraph` nodes alongside `value`. When `applyDelta` applies `op: modified` with `value`, it preserves all non-`value`/`non-children` fields, keeping the stale `_inlines`. `nodeToMdastNodes` prioritizes `_inlines` over `value`, so `serialize()` emits the original text unchanged.
   - `convertListItem` stores `_inlines` on `list-item` nodes. Applying `op: modified` with `rename` updates `label` while keeping `_inlines`, and `nodeToMdastNodes` prioritizes `_inlines` over `label`, so `rename` on `list-item` is silently ignored.
   - `paragraph` declares `identifiedBy: ['contains']`, so `validateRename` (`hasLabel = descriptor.identifiedBy.length > 0`) accepts `rename` on `paragraph` with only a warning, even though `paragraph` has no `label` and `nodeToMdastNodes` ignores it.
2. **YAML (`YamlParser`):**
   - `documentToArtifactAST` stores `_yaml: originalContent` on `ast.root`. `applyDelta` mutates the root via `setChildren(root, ...)`, which copies `_yaml` onto the new root. `YamlParser.serialize()` returns `ast.root._yaml` whenever it is a string, causing any YAML delta (`added`, `modified`, `removed`) to serialize back to the unmodified original YAML.
3. **Plaintext (`PlaintextParser`):**
   - `paragraph` is declared with `identifiedBy: ['contains']`, `isContainer: false`, `isLeaf: false`, and `isCollection: true`, causing `validateValue` to reject `paragraph` + `value` (`use rename`), while `rename` sets `label`, which `_serializeParagraph` never reads.
4. **Validation (`applyDelta` and `ValidateArtifacts`):**
   - `op: modified` does not require any of `content`, `value`, or `rename` (unlike `added`, which requires `content` or `value`).
   - `ValidateArtifacts` does not check in memory whether each non-`no-op` delta operation produces an effective change in the serialized output relative to the previous state.

## Proposed solution

1. **Invalidate stale parser cache metadata on delta mutation:**
   - In `MarkdownParser` / `applyDelta`, clear `_inlines` and `_blockquoteChildren` when a `paragraph` or `list-item` is modified via `value` or `rename` (while preserving `_inlines` on untouched sibling/ancestor nodes per `core:delta-format`).
   - In `YamlParser` / `applyDelta`, clear `_yaml` on mutated nodes (including `ast.root` when its children change) so `serialize()` reflects the applied delta.
   - In `PlaintextParser`, align `paragraph` / `line` descriptors and `valueToNode` / `_serializeParagraph` so `paragraph` modifications via `value` (and/or `content`) serialize the updated text.
2. **Fix `rename` and `modified` structural validation:**
   - In `validateRename` (`packages/core/src/application/ports/artifact-parser.ts`), require a name/label-based identifier (`identifiedBy.includes('matches')`) rather than `identifiedBy.length > 0`, rejecting `rename` on `contains`-only nodes such as `paragraph` and `line`.
   - In `applyDelta`, reject `op: modified` entries that specify none of `content`, `value`, or `rename`.
3. **In-memory per-operation effective-change check during validation:**
   - In `ValidateArtifacts`, when applying a non-`no-op` delta, evaluate operations sequentially in memory and verify that each non-`no-op` operation changes the serialized artifact state relative to the previous step, reporting a validation failure if an operation is a silent no-op.

## Specs affected

### New specs

- None.

### Modified specs

- `core:delta-format`: Clarify that `modified` operations invalidate cached inline/raw metadata on the targeted node and mutated ancestors (while preserving untouched siblings), require `modified` entries to provide at least one of `content`, `value`, or `rename`, and reject `rename` on nodes without a name/label identifier.
  - Depends on (added): none
  - Depends on (removed): none
- `core:artifact-parser-port`: Align `validateRename` / `NodeTypeDescriptor` semantics so `rename` is only valid on `matches`-identified nodes (not `contains`-only nodes like `paragraph`/`line`), and ensure adapters (`MarkdownParser`, `YamlParser`, `PlaintextParser`) serialize mutated nodes accurately without stale cache precedence.
  - Depends on (added): none
  - Depends on (removed): none
- `core:validate-artifacts`: Require `ValidateArtifacts` to verify in memory that every non-`no-op` delta operation produces an effective change in the serialized output compared to the previous state, failing validation when an operation produces no serialized diff.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **`packages/core/src/infrastructure/artifact-parser/markdown-parser.ts`** (`riskLevel: CRITICAL` per `specd graph impact`, 13 dependent files in `core`): update `apply` / `nodeToMdastNodes` / metadata cleanup for `paragraph` and `list-item`.
- **`packages/core/src/infrastructure/artifact-parser/yaml-parser.ts`**: invalidate `_yaml` on mutated AST nodes/root so `serialize()` reflects delta operations.
- **`packages/core/src/infrastructure/artifact-parser/plaintext-parser.ts`**: fix `paragraph` descriptor flags and `value` serialization.
- **`packages/core/src/infrastructure/artifact-parser/_shared/apply-delta.ts`**: validate that `modified` entries include at least one of `content`, `value`, or `rename`, and avoid preserving stale parser-internal cache keys on mutated nodes.
- **`packages/core/src/application/ports/artifact-parser.ts`**: update `validateRename` (and any affected `validateValue` warning logic) to distinguish `matches` vs `contains` identifiers.
- **`packages/core/src/application/use-cases/validate-artifacts.ts`**: add in-memory sequential serialized-state comparison per non-`no-op` delta operation.

## Technical context

- `JsonParser` (`packages/core/src/infrastructure/artifact-parser/json-parser.ts`) was audited and confirmed to work properly because it does not attach raw serialization caches to AST nodes.
- Ambiguous and duplicate-target selectors for `modified` and `removed` are already rejected with `DeltaApplicationError` in `apply-delta.ts`.
- All effective-change validation runs strictly in memory using `parser.apply` and `parser.serialize` without writing to `specs/`.

## Open questions

- None.
